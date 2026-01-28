// imageUploadService.js
// Handles image validation, upload to Appwrite Storage, and lifecycle management

import { storage, appwriteConfig, ID } from './appwriteConfig';
import * as FileSystem from 'expo-file-system/legacy';
import NetInfo from '@react-native-community/netinfo';

const APPWRITE_ENDPOINT = process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT;
const APPWRITE_PROJECT_ID = process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds

/**
 * Validate image file before upload
 * @param {string} uri - Local file URI
 * @returns {Promise<{valid: boolean, error?: string, fileInfo?: object}>}
 */
export const validateImage = async (uri) => {
    try {
        const fileInfo = await FileSystem.getInfoAsync(uri, { size: true });
        
        if (!fileInfo.exists) {
            return { valid: false, error: 'File does not exist' };
        }

        // Check file size
        if (fileInfo.size > MAX_FILE_SIZE) {
            const sizeMB = (fileInfo.size / (1024 * 1024)).toFixed(2);
            return { valid: false, error: `Image exceeds 10MB limit (${sizeMB}MB)` };
        }

        // Get MIME type from extension
        const extension = uri.split('.').pop()?.toLowerCase();
        const mimeType = getMimeType(extension);
        
        if (!mimeType || !ALLOWED_MIME_TYPES.includes(mimeType)) {
            return { valid: false, error: `Invalid file type. Allowed: JPG, PNG, WebP` };
        }

        return { 
            valid: true, 
            fileInfo: {
                uri,
                size: fileInfo.size,
                mimeType,
                extension,
                name: `wound_${Date.now()}.${extension}`
            }
        };
    } catch (error) {
        console.error('Validation error:', error);
        return { valid: false, error: 'Failed to validate image' };
    }
};

/**
 * Get MIME type from file extension
 */
const getMimeType = (extension) => {
    const mimeTypes = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'webp': 'image/webp',
    };
    return mimeTypes[extension];
};

/**
 * Check network connectivity
 * @returns {Promise<boolean>}
 */
export const checkNetwork = async () => {
    try {
        const state = await NetInfo.fetch();
        // isInternetReachable can be null/undefined on some devices; treat that as "unknown" not "offline"
        return Boolean(state.isConnected) && state.isInternetReachable !== false;
    } catch {
        return true; // Assume connected if check fails
    }
};

/**
 * Upload a single image to Appwrite Storage with retry logic
 * @param {object} fileInfo - Validated file info
 * @param {string} userId - User ID for permissions (unused in direct API)
 * @param {function} onProgress - Progress callback
 * @returns {Promise<{success: boolean, fileId?: string, url?: string, error?: string}>}
 */
export const uploadImage = async (fileInfo, userId, onProgress = () => {}) => {
    let lastError = null;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            // Check network before upload
            const isConnected = await checkNetwork();
            if (!isConnected) {
                throw new Error('No internet connection');
            }

            onProgress(10);

            // Generate unique file ID
            const fileId = ID.unique();

            onProgress(20);

            // Create FormData with file URI (React Native native support)
            const formData = new FormData();
            formData.append('fileId', fileId);
            formData.append('file', {
                uri: fileInfo.uri,
                type: fileInfo.mimeType,
                name: fileInfo.name,
            });

            onProgress(50);

            // Upload via REST API directly
            const uploadResponse = await fetch(
                `${APPWRITE_ENDPOINT}/storage/buckets/${appwriteConfig.imagesBucketId}/files`,
                {
                    method: 'POST',
                    headers: {
                        'X-Appwrite-Project': APPWRITE_PROJECT_ID,
                    },
                    body: formData,
                }
            );

            if (!uploadResponse.ok) {
                const errorData = await uploadResponse.text();
                throw new Error(errorData || `Upload failed with status ${uploadResponse.status}`);
            }

            onProgress(80);

            const response = await uploadResponse.json();

            onProgress(90);

            // Get file URL
            const fileUrl = `${APPWRITE_ENDPOINT}/storage/buckets/${appwriteConfig.imagesBucketId}/files/${response.$id}/view?project=${APPWRITE_PROJECT_ID}`;

            onProgress(100);

            console.log('✅ Image uploaded successfully:', response.$id);

            return {
                success: true,
                fileId: response.$id,
                url: fileUrl,
            };

        } catch (error) {
            lastError = error;
            console.error(`Upload attempt ${attempt} failed:`, error.message);
            
            if (attempt < MAX_RETRIES) {
                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
            }
        }
    }

    return {
        success: false,
        error: lastError?.message || 'Upload failed after multiple attempts',
    };
};

/**
 * Upload multiple images with progress tracking
 * @param {Array<string>} imageUris - Array of local image URIs
 * @param {string} userId - User ID for permissions
 * @param {function} onTotalProgress - Overall progress callback (0-100)
 * @returns {Promise<{success: boolean, fileIds: Array, failed: number}>}
 */
export const uploadMultipleImages = async (imageUris, userId, onTotalProgress = () => {}) => {
    const fileIds = [];
    let failed = 0;
    const totalImages = imageUris.length;

    if (totalImages === 0) {
        return { success: true, fileIds: [], failed: 0 };
    }

    // First validate all images
    const validationResults = await Promise.all(
        imageUris.map(uri => validateImage(uri))
    );

    // Get valid files only
    const validFiles = [];
    for (let i = 0; i < validationResults.length; i++) {
        if (validationResults[i].valid) {
            validFiles.push(validationResults[i].fileInfo);
        } else {
            failed++;
        }
    }

    // Upload valid files sequentially
    for (let i = 0; i < validFiles.length; i++) {
        const fileInfo = validFiles[i];
        
        const result = await uploadImage(fileInfo, userId, (progress) => {
            // Calculate total progress
            const completedProgress = (i / totalImages) * 100;
            const currentProgress = (progress / totalImages);
            onTotalProgress(Math.round(completedProgress + currentProgress));
        });

        if (result.success) {
            fileIds.push(result.fileId);
        } else {
            failed++;
            console.error(`Failed to upload image ${i + 1}:`, result.error);
        }
    }

    return {
        success: failed === 0,
        fileIds,
        failed,
    };
};

/**
 * Delete uploaded files (cleanup on failure)
 * @param {array} fileIds - File IDs to delete
 */
export const deleteUploadedFiles = async (fileIds) => {
    for (const fileId of fileIds) {
        try {
            await storage.deleteFile(appwriteConfig.imagesBucketId, fileId);
            console.log('✅ Deleted file:', fileId);
        } catch (error) {
            console.error('Failed to delete file:', fileId, error);
        }
    }
};

/**
 * Get file URL on-demand (never stored in DB)
 */
export const getFileUrl = (fileId) => {
    try {
        const url = storage.getFileView(appwriteConfig.imagesBucketId, fileId);
        return url.href || url.toString();
    } catch (error) {
        console.error('Error getting file URL:', error);
        return null;
    }
};

/**
 * Upload queue manager for offline support
 */
class UploadQueue {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
        this.listeners = [];
    }

    addToQueue(imageUri) {
        this.queue.push({
            uri: imageUri,
            status: 'pending',
            retries: 0,
            addedAt: Date.now(),
        });
        this.notifyListeners();
        this.processQueue();
    }

    addListener(callback) {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    }

    notifyListeners() {
        this.listeners.forEach(l => l(this.getStatus()));
    }

    getStatus() {
        return {
            pending: this.queue.filter(i => i.status === 'pending').length,
            uploading: this.queue.filter(i => i.status === 'uploading').length,
            completed: this.queue.filter(i => i.status === 'completed').length,
            failed: this.queue.filter(i => i.status === 'failed').length,
        };
    }

    async processQueue() {
        if (this.isProcessing || this.queue.length === 0) return;

        const isConnected = await checkNetwork();
        if (!isConnected) {
            // Retry later when connected
            setTimeout(() => this.processQueue(), 5000);
            return;
        }

        this.isProcessing = true;

        const pendingItems = this.queue.filter(i => i.status === 'pending');
        
        for (const item of pendingItems) {
            item.status = 'uploading';
            this.notifyListeners();

            const validation = await validateImage(item.uri);
            if (!validation.valid) {
                item.status = 'failed';
                item.error = validation.error;
                continue;
            }

            const result = await uploadImage(validation.fileInfo);
            
            if (result.success) {
                item.status = 'completed';
                item.fileId = result.fileId;
                item.url = result.url;
            } else {
                item.retries++;
                if (item.retries < MAX_RETRIES) {
                    item.status = 'pending'; // Retry
                } else {
                    item.status = 'failed';
                    item.error = result.error;
                }
            }
            
            this.notifyListeners();
        }

        this.isProcessing = false;

        // Check if there are more pending items
        if (this.queue.some(i => i.status === 'pending')) {
            setTimeout(() => this.processQueue(), 1000);
        }
    }

    clear() {
        this.queue = [];
        this.notifyListeners();
    }
}

export const uploadQueue = new UploadQueue();

export default {
    validateImage,
    uploadImage,
    uploadMultipleImages,
    deleteUploadedFiles,
    getFileUrl,
    checkNetwork,
    uploadQueue,
};
