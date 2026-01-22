// Section6.js
// ✅ Handles image picking with validation, progress tracking, and preview

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, Alert, ActivityIndicator, Modal, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { validateImage } from './imageUploadService';

const MAX_IMAGES = 5;
const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const Section6 = ({ formData, onInputChange }) => {
    const [validating, setValidating] = useState(false);
    const [validationErrors, setValidationErrors] = useState([]);
    const [viewingImageUri, setViewingImageUri] = useState(null);

    // Images stored as array of objects: { uri, validated, error? }
    const images = formData.woundImages || [];

    const processResult = async (result) => {
        if (result?.canceled || !result?.assets) return;

        setValidating(true);
        setValidationErrors([]);

        const newErrors = [];
        const validImages = [];

        // Filter and validate selected images
        const selected = result.assets
            .filter(a => a.uri)
            .slice(0, MAX_IMAGES - images.length);

        for (const asset of selected) {
            const validation = await validateImage(asset.uri);
            
            if (validation.valid) {
                validImages.push({
                    uri: asset.uri,
                    validated: true,
                    fileInfo: validation.fileInfo,
                });
            } else {
                newErrors.push({
                    uri: asset.uri,
                    error: validation.error,
                });
            }
        }

        setValidating(false);

        if (newErrors.length > 0) {
            setValidationErrors(newErrors);
            Alert.alert(
                'Some Images Not Added',
                newErrors.map(e => e.error).join('\n'),
                [{ text: 'OK' }]
            );
        }

        if (validImages.length > 0) {
            onInputChange('woundImages', [...images, ...validImages]);
        }
    };

    const pickFromCamera = async () => {
        if (images.length >= MAX_IMAGES) {
            Alert.alert('Limit Reached', `Maximum ${MAX_IMAGES} images allowed.`);
            return;
        }

        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission Required', 'Camera access is needed to take photos.');
            return;
        }

        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: 0.8,
            allowsEditing: false,
        });

        await processResult(result);
    };

    const pickFromLibrary = async () => {
        if (images.length >= MAX_IMAGES) {
            Alert.alert('Limit Reached', `Maximum ${MAX_IMAGES} images allowed.`);
            return;
        }

        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission Required', 'Photo library access is needed.');
            return;
        }

        const remainingSlots = MAX_IMAGES - images.length;

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsMultipleSelection: true,
            selectionLimit: remainingSlots,
            quality: 0.8,
        });

        await processResult(result);
    };

    const removeImage = (uri) => {
        onInputChange('woundImages', images.filter(img => img.uri !== uri));
    };

    const toggleImageViewer = (uri) => {
        if (viewingImageUri === uri) {
            setViewingImageUri(null);
        } else {
            setViewingImageUri(uri);
        }
    };

    const clearAllImages = () => {
        Alert.alert(
            'Clear All Images?',
            'This will remove all selected images.',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Clear', style: 'destructive', onPress: () => onInputChange('woundImages', []) }
            ]
        );
    };

    return (
        <View style={styles.card}>
            <Text style={styles.cardTitle}>UPLOAD WOUND IMAGES</Text>
            <Text style={styles.cardSubtitle}>
                Add photos of the wound for documentation (optional)
            </Text>

            {/* Upload Zone */}
            <View style={styles.uploadZone}>
                <Ionicons name="cloud-upload-outline" size={50} color="#125872" />
                <Text style={styles.dragDropText}>
                    Take a photo or select from gallery
                </Text>

                <View style={styles.buttonRow}>
                    <TouchableOpacity 
                        style={styles.takePhotoButton} 
                        onPress={pickFromCamera}
                        disabled={validating}
                    >
                        <Ionicons name="camera" size={20} color="#fff" />
                        <Text style={styles.takePhotoButtonText}>Take Photo</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                        style={styles.browseButton} 
                        onPress={pickFromLibrary}
                        disabled={validating}
                    >
                        <Ionicons name="image" size={20} color="#125872" />
                        <Text style={styles.browseButtonText}>Browse</Text>
                    </TouchableOpacity>
                </View>

                {validating && (
                    <View style={styles.validatingContainer}>
                        <ActivityIndicator size="small" color="#125872" />
                        <Text style={styles.validatingText}>Validating images...</Text>
                    </View>
                )}
            </View>

            {/* Validation Errors */}
            {validationErrors.length > 0 && (
                <View style={styles.errorContainer}>
                    {validationErrors.map((err, index) => (
                        <View key={index} style={styles.errorItem}>
                            <Ionicons name="alert-circle" size={16} color="#D32F2F" />
                            <Text style={styles.errorText}>{err.error}</Text>
                        </View>
                    ))}
                </View>
            )}

            {/* Image Previews */}
            {images.length > 0 && (
                <View style={styles.previewSection}>
                    <View style={styles.previewHeader}>
                        <Text style={styles.previewTitle}>
                            Selected Images ({images.length}/{MAX_IMAGES})
                        </Text>
                        <TouchableOpacity onPress={clearAllImages}>
                            <Text style={styles.clearAllText}>Clear All</Text>
                        </TouchableOpacity>
                    </View>

                    <ScrollView 
                        horizontal 
                        showsHorizontalScrollIndicator={false}
                        style={styles.previewScroll}
                    >
                        {images.map((img, index) => (
                            <View key={index} style={styles.imageWrapper}>
                                <TouchableOpacity 
                                    onPress={() => toggleImageViewer(img.uri)}
                                    activeOpacity={0.7}
                                >
                                    <Image source={{ uri: img.uri }} style={styles.previewImage} />
                                </TouchableOpacity>
                                
                                {/* Validated badge */}
                                {img.validated && (
                                    <View style={styles.validatedBadge}>
                                        <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                                    </View>
                                )}
                                
                                {/* Remove button */}
                                <TouchableOpacity 
                                    style={styles.removeButton} 
                                    onPress={() => removeImage(img.uri)}
                                >
                                    <Ionicons name="close-circle" size={24} color="#D32F2F" />
                                </TouchableOpacity>
                            </View>
                        ))}
                    </ScrollView>
                </View>
            )}

            {/* Tips */}
            <View style={styles.tipsCard}>
                <Text style={styles.tipsTitle}>📸 Photo Tips</Text>
                <View style={styles.tipItem}>
                    <Text style={styles.bullet}>•</Text>
                    <Text style={styles.tipText}>Ensure good lighting for clear images</Text>
                </View>
                <View style={styles.tipItem}>
                    <Text style={styles.bullet}>•</Text>
                    <Text style={styles.tipText}>Capture the wound from multiple angles</Text>
                </View>
                <View style={styles.tipItem}>
                    <Text style={styles.bullet}>•</Text>
                    <Text style={styles.tipText}>Include a reference for size if possible</Text>
                </View>
            </View>

            <Text style={styles.supportedFormats}>
                Supported: JPG, PNG, WebP • Max 10MB each • Up to {MAX_IMAGES} images
            </Text>

            {/* Full-Screen Image Viewer Modal */}
            <Modal
                visible={viewingImageUri !== null}
                transparent={false}
                animationType="fade"
                onRequestClose={() => setViewingImageUri(null)}
            >
                <TouchableOpacity 
                    style={styles.fullScreenImageContainer}
                    activeOpacity={1}
                    onPress={() => setViewingImageUri(null)}
                >
                    {viewingImageUri && (
                        <Image 
                            source={{ uri: viewingImageUri }} 
                            style={styles.fullScreenImage}
                            resizeMode="contain"
                        />
                    )}
                </TouchableOpacity>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    card: {
        backgroundColor: 'white',
        borderRadius: 10,
        padding: 20,
        marginBottom: 20,
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 5,
        elevation: 2,
    },
    cardTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#125872',
        marginBottom: 5,
    },
    cardSubtitle: {
        fontSize: 14,
        color: '#555',
        marginBottom: 15,
    },
    uploadZone: {
        borderWidth: 2,
        borderColor: '#B0C4DE',
        borderStyle: 'dashed',
        borderRadius: 10,
        backgroundColor: '#F7FCFD',
        minHeight: 180,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        marginBottom: 15,
    },
    dragDropText: {
        marginTop: 10,
        fontSize: 14,
        color: '#888',
        textAlign: 'center',
        marginBottom: 15,
    },
    buttonRow: {
        flexDirection: 'row',
        justifyContent: 'center',
    },
    takePhotoButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 15,
        backgroundColor: '#125872',
        borderRadius: 8,
        marginRight: 10,
    },
    takePhotoButtonText: {
        color: 'white',
        marginLeft: 8,
        fontWeight: 'bold',
        fontSize: 14,
    },
    browseButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 15,
        backgroundColor: '#EAEAEA',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#ccc',
    },
    browseButtonText: {
        color: '#125872',
        marginLeft: 8,
        fontWeight: 'bold',
        fontSize: 14,
    },
    validatingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 15,
    },
    validatingText: {
        marginLeft: 8,
        color: '#125872',
        fontSize: 13,
    },
    errorContainer: {
        backgroundColor: '#FFEBEE',
        borderRadius: 8,
        padding: 10,
        marginBottom: 15,
    },
    errorItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 5,
    },
    errorText: {
        color: '#D32F2F',
        fontSize: 13,
        marginLeft: 8,
        flex: 1,
    },
    previewSection: {
        marginBottom: 15,
    },
    previewHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    previewTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#333',
    },
    clearAllText: {
        color: '#D32F2F',
        fontSize: 13,
        fontWeight: '500',
    },
    previewScroll: {
        flexGrow: 0,
    },
    imageWrapper: {
        width: 100,
        height: 100,
        borderRadius: 8,
        marginRight: 10,
        position: 'relative',
    },
    previewImage: {
        width: '100%',
        height: '100%',
        borderRadius: 8,
        resizeMode: 'cover',
    },
    validatedBadge: {
        position: 'absolute',
        bottom: 5,
        left: 5,
        backgroundColor: 'white',
        borderRadius: 10,
        padding: 2,
    },
    removeButton: {
        position: 'absolute',
        top: -8,
        right: -8,
        backgroundColor: 'white',
        borderRadius: 12,
    },
    tipsCard: {
        backgroundColor: '#E6F4F6',
        borderRadius: 8,
        padding: 15,
        marginBottom: 10,
    },
    tipsTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#125872',
        marginBottom: 8,
    },
    tipItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 4,
    },
    bullet: {
        fontSize: 14,
        marginRight: 8,
        color: '#125872',
        fontWeight: 'bold',
    },
    tipText: {
        flex: 1,
        fontSize: 12,
        color: '#444',
    },
    supportedFormats: {
        fontSize: 11,
        color: '#999',
        textAlign: 'center',
    },
    // Full-Screen Image Viewer
    fullScreenImageContainer: {
        flex: 1,
        backgroundColor: '#000',
        justifyContent: 'center',
        alignItems: 'center',
        width: screenWidth,
        height: screenHeight,
    },
    fullScreenImage: {
        width: screenWidth,
        height: screenHeight,
    },
});

export default Section6;
