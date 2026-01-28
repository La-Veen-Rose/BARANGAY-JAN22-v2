import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as UPNG from 'upng-js';
import * as base64js from 'base64-js';

const BASE64_ENCODING = FileSystem?.EncodingType?.Base64 || 'base64';

async function ensureFileUriAsync(uri) {
    if (!uri) throw new Error('No image URI provided.');

    // Android often returns content:// URIs from the picker/cropper.
    // Some Expo modules behave inconsistently with content URIs, so we copy to cache first.
    if (typeof uri === 'string' && uri.startsWith('content://')) {
        const outUri = `${FileSystem.cacheDirectory}sig_src_${Date.now()}.jpg`;
        await FileSystem.copyAsync({ from: uri, to: outUri });
        return outUri;
    }

    return uri;
}

async function ensureBase64Async(manipResult) {
    if (!manipResult) {
        throw new Error('Image manipulation returned no result.');
    }
    if (manipResult.base64) return manipResult.base64;
    if (!manipResult.uri) {
        throw new Error('Image manipulation returned no uri/base64.');
    }

    // Some Expo/Android combinations may not populate `base64` even when requested.
    // Fallback: read the written file as Base64.
    const b64 = await FileSystem.readAsStringAsync(manipResult.uri, {
        encoding: BASE64_ENCODING,
    });
    if (!b64) throw new Error('Failed to read manipulated image as base64.');
    return b64;
}

function clampByte(n) {
    return Math.max(0, Math.min(255, n));
}

function colorDistance(r1, g1, b1, r2, g2, b2) {
    const dr = r1 - r2;
    const dg = g1 - g2;
    const db = b1 - b2;
    return Math.sqrt(dr * dr + dg * dg + db * db);
}

function estimateBackgroundColorRGBA(rgba, width, height, marginPx) {
    const m = Math.max(1, Math.min(marginPx, Math.floor(Math.min(width, height) / 4)));

    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let count = 0;

    const samplePixel = (x, y) => {
        const idx = (y * width + x) * 4;
        sumR += rgba[idx];
        sumG += rgba[idx + 1];
        sumB += rgba[idx + 2];
        count += 1;
    };

    // Sample 4 corner squares
    for (let y = 0; y < m; y += 1) {
        for (let x = 0; x < m; x += 1) samplePixel(x, y);
        for (let x = width - m; x < width; x += 1) samplePixel(x, y);
    }
    for (let y = height - m; y < height; y += 1) {
        for (let x = 0; x < m; x += 1) samplePixel(x, y);
        for (let x = width - m; x < width; x += 1) samplePixel(x, y);
    }

    if (!count) return { r: 255, g: 255, b: 255 };
    return {
        r: Math.round(sumR / count),
        g: Math.round(sumG / count),
        b: Math.round(sumB / count),
    };
}

/**
 * Converts an image URI into a transparent-background PNG by removing white paper.
 * Works in Expo Go (pure JS), but can be slow for large images.
 */
export async function removeWhitePaperBackgroundAsync(inputUri, options = {}) {
    const {
        maxWidth = 650,
        jpegQuality = 0.9,
        // For photos with shadows/uneven lighting, adaptive thresholding is more reliable.
        adaptiveWindowSize = 35,
        adaptiveC = 12,
        forceInkBelow = 120,
        maxPixels = 1_600_000,
    } = options;

    if (!inputUri) {
        throw new Error('No image provided.');
    }

    const sourceUri = await ensureFileUriAsync(inputUri);

    // 1) Normalize -> PNG + base64 (also optionally downscale for performance)
    // Try to cap pixel count for JS pixel processing.
    const normalizedFirstPass = await ImageManipulator.manipulateAsync(
        sourceUri,
        maxWidth ? [{ resize: { width: maxWidth } }] : [],
        {
            compress: jpegQuality,
            format: ImageManipulator.SaveFormat.PNG,
            base64: true,
        }
    );
    const normalizedFirstBase64 = await ensureBase64Async(normalizedFirstPass);

    // Decode once to know dimensions; if huge, downscale again.
    const firstBytes = base64js.toByteArray(normalizedFirstBase64);
    const firstBuffer = firstBytes.buffer.slice(firstBytes.byteOffset, firstBytes.byteOffset + firstBytes.byteLength);
    const firstDecoded = UPNG.decode(firstBuffer);

    let normalized = normalizedFirstPass;
    let normalizedBase64 = normalizedFirstBase64;
    if (firstDecoded.width * firstDecoded.height > maxPixels) {
        const scale = Math.sqrt(maxPixels / (firstDecoded.width * firstDecoded.height));
        const targetW = Math.max(320, Math.floor(firstDecoded.width * scale));
        normalized = await ImageManipulator.manipulateAsync(
            // Resize the already-normalized first pass (faster, avoids huge originals)
            normalizedFirstPass?.uri || sourceUri,
            [{ resize: { width: targetW } }],
            {
                compress: jpegQuality,
                format: ImageManipulator.SaveFormat.PNG,
                base64: true,
            }
        );
        normalizedBase64 = await ensureBase64Async(normalized);
    }

    // 2) Decode PNG to RGBA
    const pngBytes = base64js.toByteArray(normalizedBase64);
    const pngBuffer = pngBytes.buffer.slice(pngBytes.byteOffset, pngBytes.byteOffset + pngBytes.byteLength);
    const decoded = UPNG.decode(pngBuffer);
    const rgbaFrames = UPNG.toRGBA8(decoded);
    const rgba = new Uint8Array(rgbaFrames[0]);

    const w = decoded.width;
    const h = decoded.height;
    const pixelCount = w * h;

    // 3) Adaptive thresholding (handles gray paper + shadows)
    const gray = new Uint8Array(pixelCount);
    for (let p = 0, i = 0; p < pixelCount; p += 1, i += 4) {
        const r = rgba[i];
        const g = rgba[i + 1];
        const b = rgba[i + 2];
        // Luma approximation
        gray[p] = (0.299 * r + 0.587 * g + 0.114 * b) | 0;
    }

    // Integral image for fast local mean
    const iw = w + 1;
    const ih = h + 1;
    const integral = new Uint32Array(iw * ih);
    for (let y = 1; y <= h; y += 1) {
        let rowSum = 0;
        for (let x = 1; x <= w; x += 1) {
            rowSum += gray[(y - 1) * w + (x - 1)];
            integral[y * iw + x] = integral[(y - 1) * iw + x] + rowSum;
        }
    }

    const win = Math.max(9, adaptiveWindowSize | 0);
    const rWin = Math.floor(win / 2);

    const getSum = (x1, y1, x2, y2) => {
        // inclusive bounds in image coords
        const ax1 = Math.max(0, x1);
        const ay1 = Math.max(0, y1);
        const ax2 = Math.min(w - 1, x2);
        const ay2 = Math.min(h - 1, y2);

        const ix1 = ax1;
        const iy1 = ay1;
        const ix2 = ax2 + 1;
        const iy2 = ay2 + 1;

        return (
            integral[iy2 * iw + ix2] -
            integral[iy1 * iw + ix2] -
            integral[iy2 * iw + ix1] +
            integral[iy1 * iw + ix1]
        );
    };

    for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
            const p = y * w + x;
            const gval = gray[p];

            // Always keep very dark pixels
            let isInk = gval <= forceInkBelow;

            if (!isInk) {
                const sum = getSum(x - rWin, y - rWin, x + rWin, y + rWin);
                const area = (Math.min(w - 1, x + rWin) - Math.max(0, x - rWin) + 1) *
                    (Math.min(h - 1, y + rWin) - Math.max(0, y - rWin) + 1);
                const mean = sum / area;
                // Ink is darker than local mean by C
                isInk = gval < mean - adaptiveC;
            }

            const i = p * 4;
            if (isInk) {
                rgba[i] = 0;
                rgba[i + 1] = 0;
                rgba[i + 2] = 0;
                rgba[i + 3] = 255;
            } else {
                rgba[i + 3] = 0;
            }
        }
    }

    // 4) Re-encode PNG
    const outPng = UPNG.encode([rgba.buffer], decoded.width, decoded.height, 0);
    const outBase64 = base64js.fromByteArray(new Uint8Array(outPng));

    // 5) Save to cache
    const outUri = `${FileSystem.cacheDirectory}signature_${Date.now()}.png`;
    await FileSystem.writeAsStringAsync(outUri, outBase64, {
        encoding: BASE64_ENCODING,
    });

    return outUri;
}

/**
 * Lightweight image validation (Expo-friendly).
 * Returns { valid: boolean, error?: string }
 */
export async function validateSignatureImageAsync(uri, options = {}) {
    const { maxBytes = 10 * 1024 * 1024 } = options; // 10MB default

    if (!uri) return { valid: false, error: 'No image selected.' };

    try {
        const info = await FileSystem.getInfoAsync(uri, { size: true });
        if (!info.exists) return { valid: false, error: 'Image file not found.' };
        if (typeof info.size === 'number' && info.size > maxBytes) {
            return { valid: false, error: 'Image too large. Max 10MB.' };
        }
        return { valid: true };
    } catch (e) {
        return { valid: true };
    }
}
