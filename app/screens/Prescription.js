import React from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Alert,
    TextInput,
    ScrollView,
    Modal,
    Image,
    ActivityIndicator,
    Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState, useEffect, useRef } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import ViewShot from 'react-native-view-shot';
import SignatureScreen from 'react-native-signature-canvas';

import { databases, storage, appwriteConfig, ID } from './appwriteConfig';
import { getCurrentStaffProfile } from './staffProfileService';
import {
    removeWhitePaperBackgroundAsync,
    validateSignatureImageAsync,
} from '../utils/signatureImageService';

// Constants / helpers
const CATEGORY_OPTIONS = ['I', 'II', 'III'];
const BASE64_ENCODING = FileSystem?.EncodingType?.Base64 || 'base64';
const SIGNATURE_CACHE_PREFIX = 'physician_signature';

const getSavedSignaturePath = (physicianKey) => {
    const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory || '';
    return `${baseDir}${SIGNATURE_CACHE_PREFIX}_${physicianKey || 'default'}.png`;
};

const dataUrlToBase64 = (dataUrl) => {
    if (!dataUrl) return null;
    const [, payload] = dataUrl.split(',' );
    return payload || dataUrl;
};

const ensureFileUriAsync = async (uri) => {
    if (!uri) throw new Error('No image URI provided.');
    if (typeof uri === 'string' && uri.startsWith('content://')) {
        const tempTarget = `${FileSystem.cacheDirectory}sig_${Date.now()}.png`;
        await FileSystem.copyAsync({ from: uri, to: tempTarget });
        return tempTarget;
    }
    return uri;
};

const Checkbox = ({ checked, onPress }) => (
    <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.85}
        style={{
            width: 22,
            height: 22,
            borderWidth: 2,
            borderColor: '#125872',
            borderRadius: 4,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: checked ? '#E0F2FE' : '#FFFFFF',
        }}
    >
        {checked ? <Ionicons name="checkmark" size={14} color="#0F172A" /> : null}
    </TouchableOpacity>
);

const formatToday = () => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    return `${mm}/${dd}/${yyyy}`;
};

const getTodayForPrint = () => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    return `${mm}/${dd}/${yyyy}`;
};

const formatMMDDYYYYFromDate = (d) => {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    return `${mm}/${dd}/${yyyy}`;
};

const tryParseDate = (value) => {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
};

// Helper functions
const toTitleCase = (str) => {
    if (!str) return '';
    return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
};

const toIntOrNull = (value) => {
    const num = parseInt(String(value || '').trim(), 10);
    return Number.isNaN(num) ? null : num;
};

function Prescription({ navigation, route }) {
    const { recordId, isViewMode } = route?.params || {};
    const [dateValue, setDateValue] = useState(new Date());
    const [dateText, setDateText] = useState(formatToday());
    const [diagnosis, setDiagnosis] = useState('');
    const [category, setCategory] = useState('');
    const [others, setOthers] = useState('');
    const [bitingAnimal, setBitingAnimal] = useState('');
    const [exposureType, setExposureType] = useState('');
    const [siteInvolved, setSiteInvolved] = useState('');
    
    const [vaccinesChecked, setVaccinesChecked] = useState({
        tt: false,
        htig: false,
        pcec: false,
        erig: false,
        hrig: false,
    });
    
    const [units, setUnits] = useState({
        tt: '',
        htig: '',
        pcec: '',
        erig: '',
        hrig: '',
    });

    const [recordDoc, setRecordDoc] = useState(null);
    const [recordError, setRecordError] = useState(null);
    const [recordLoading, setRecordLoading] = useState(false);
    const [previewVisible, setPreviewVisible] = useState(false);
    const [previewUri, setPreviewUri] = useState(null);
    const [generatingPreview, setGeneratingPreview] = useState(false);
    
    const viewShotRef = useRef(null);
    const signatureRef = useRef(null);

    const [pendingSignatureImageUri, setPendingSignatureImageUri] = useState(null); // awaiting ✓/X
    const [processingEsign, setProcessingEsign] = useState(false);
    
    // Missing state declarations
    const [physicianProfile, setPhysicianProfile] = useState(null);
    const [signatureModalVisible, setSignatureModalVisible] = useState(false);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
    const [signatureImageUri, setSignatureImageUri] = useState(null);
    const [signatureDataUrl, setSignatureDataUrl] = useState(null);
    const [fullName, setFullName] = useState('');
    const [addressLine, setAddressLine] = useState('');
    const [ageValue, setAgeValue] = useState('');
    const [sexValue, setSexValue] = useState('');
    const [physicianNameValue, setPhysicianNameValue] = useState('');
    const [designationValue, setDesignationValue] = useState('');
    const [officeValue, setOfficeValue] = useState('');
    const [licenseNoValue, setLicenseNoValue] = useState('');
    const [sexBoxWidth, setSexBoxWidth] = useState(60);

    const applySexWidth = (value) => {
        if (!value) {
            setSexBoxWidth(60);
            return;
        }
        const target = Math.min(120, Math.max(56, 28 + value.length * 12));
        setSexBoxWidth(target);
    };

    const composeFullName = (payload = {}) => {
        const { lastName, middleName, firstName } = payload;
        const segments = [lastName, firstName, middleName].filter(Boolean);
        if (!segments.length) return '';
        return segments.join(', ').replace(/\s+/g, ' ').trim();
    };

    const composeAddress = (payload = {}) => {
        const segments = [payload.purok, payload.barangay || payload.barangayOfResidence, payload.city || 'Tagum City'];
        return segments.filter(Boolean).join(', ');
    };

    const hydratePatientFromPayload = (payload = {}) => {
        if (!payload) return;
        const name =
            payload.fullName ||
            composeFullName({
                lastName: payload.lastName || payload.patientLastName,
                firstName: payload.firstName || payload.patientFirstName,
                middleName: payload.middleName || payload.patientMiddleName,
            });
        setFullName(name);
        const address = payload.addressLine || composeAddress(payload);
        setAddressLine(address);
        const age = payload.age ?? payload.patientAge ?? payload.ageValue;
        setAgeValue(age ? String(age) : '');
        const sex = (payload.sex || payload.gender || payload.patientSex || '').toString().toUpperCase();
        setSexValue(sex);
        applySexWidth(sex);
        setDiagnosis(payload.assessmentDiagnosis || payload.diagnosis || '');
        setCategory(payload.categoryOfExposure || payload.category || '');
        setSiteInvolved(payload.siteInvolved || '');
        setOthers(payload.others || '');
        if (payload.dateText) setDateText(payload.dateText);
        if (payload.bitingAnimal) setBitingAnimal(payload.bitingAnimal);
        if (payload.exposureType) setExposureType(payload.exposureType);
    };

    const hydrateVaccinesFromRecord = (doc = {}) => {
        setVaccinesChecked({
            tt: !!doc.tt_vaccine,
            htig: !!doc.htig_vaccine,
            pcec: !!doc.pcec_pvrv_vaccine,
            erig: !!doc.erig_vaccine,
            hrig: !!doc.hrig_vaccine,
        });
        setUnits({
            tt: doc.tt_units ? String(doc.tt_units) : '',
            htig: doc.htig_units ? String(doc.htig_units) : '',
            pcec: doc.pcec_pvrv_units ? String(doc.pcec_pvrv_units) : '',
            erig: doc.erig_units ? String(doc.erig_units) : '',
            hrig: doc.hrig_units ? String(doc.hrig_units) : '',
        });
    };

    const hydratePatientFromRecord = (doc = {}) => {
        hydratePatientFromPayload(doc);
        const dateSrc = doc.prescriptionDate || doc.updatedAt;
        if (dateSrc) {
            const parsed = tryParseDate(dateSrc);
            if (parsed) {
                setDateValue(parsed);
                setDateText(formatMMDDYYYYFromDate(parsed));
            }
        }
        setBitingAnimal((doc.animalTypeOther || doc.animalType || '').toString().toUpperCase());
        const exposure = Array.isArray(doc.typeOfExposure) ? doc.typeOfExposure.join(', ') : doc.typeOfExposure;
        setExposureType((exposure || '').toString().toUpperCase());
        hydrateVaccinesFromRecord(doc);
        if (doc.prescription_images_preview) {
            setPreviewUri(doc.prescription_images_preview);
        }
    };

    const hydratePhysicianFields = (profile = {}) => {
        setPhysicianProfile(profile);
        setPhysicianNameValue(
            profile.Physician_Name || profile.physicianName || profile.fullName || profile.name || ''
        );
        setDesignationValue(profile.designation || profile.Designation || '');
        setOfficeValue(profile.office || profile.Office || '');
        setLicenseNoValue(profile.License_No || profile.licenseNo || profile.license || '');
    };

    // Helper functions for vaccine management
    const toggleVaccine = (key) => {
        setVaccinesChecked(prev => ({
            ...prev,
            [key]: !prev[key],
        }));
    };

    const setUnitsFor = (key, value) => {
        setUnits(prev => ({
            ...prev,
            [key]: value,
        }));
    };

    const validateSignatureImageAsyncSafe = async (uri) => {
        try {
            return await validateSignatureImageAsync(uri);
        } catch (e) {
            console.warn('Signature validation failed, continuing anyway:', e?.message || e);
            return { valid: true };
        }
    };

    const physicianStorageKey = useMemo(() => {
        return (
            physicianProfile?.auth_user_id ||
            physicianProfile?.AuthUserId ||
            physicianProfile?.userId ||
            physicianProfile?.$id ||
            'default'
        );
    }, [physicianProfile]);

    const [savedSignatureUri, setSavedSignatureUri] = useState(null);

    useEffect(() => {
        if (route?.params?.patient) {
            hydratePatientFromPayload(route.params.patient);
        }
    }, [route?.params?.patient]);

    useEffect(() => {
        let cancelled = false;
        if (!recordId) {
            setRecordError('Missing patient record ID.');
            setRecordLoading(false);
            return () => {
                cancelled = true;
            };
        }

        (async () => {
            try {
                setRecordLoading(true);
                const doc = await databases.getDocument(
                    appwriteConfig.patientDatabaseId,
                    appwriteConfig.patientRecordsCollectionId,
                    recordId
                );
                if (cancelled) return;
                setRecordDoc(doc);
                hydratePatientFromRecord(doc);
                setRecordError(null);
            } catch (e) {
                if (!cancelled) {
                    console.error('Failed to load record:', e);
                    setRecordError(e?.message || 'Failed to load patient record.');
                }
            } finally {
                if (!cancelled) setRecordLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [recordId]);

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const staff = await getCurrentStaffProfile();
                if (!active) return;
                hydratePhysicianFields(staff?.profile || {});
            } catch (e) {
                if (active) console.warn('Physician profile load failed:', e?.message || e);
            }
        })();
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        applySexWidth(sexValue);
    }, [sexValue]);

    const loadSavedSignatureAsync = async () => {
        const path = getSavedSignaturePath(physicianStorageKey);
        if (!path) return null;
        try {
            const info = await FileSystem.getInfoAsync(path);
            if (info?.exists) {
                setSavedSignatureUri(path);
                return path;
            }
        } catch {
            // ignore
        }
        setSavedSignatureUri(null);
        return null;
    };

    const persistSignatureToDeviceAsync = async ({ dataUrl, imageUri }) => {
        const dest = getSavedSignaturePath(physicianStorageKey);
        if (!dest) throw new Error('No writable directory available for saving signature.');

        if (dataUrl) {
            const base64 = dataUrlToBase64(dataUrl);
            if (!base64) throw new Error('Empty signature data.');
            await FileSystem.writeAsStringAsync(dest, base64, { encoding: BASE64_ENCODING });
            setSavedSignatureUri(dest);
            return dest;
        }

        if (imageUri) {
            const sourceUri = await ensureFileUriAsync(imageUri);
            const result = await ImageManipulator.manipulateAsync(
                sourceUri,
                [],
                { format: ImageManipulator.SaveFormat.PNG, base64: true, compress: 1 }
            );
            const base64 = result?.base64;
            if (!base64) throw new Error('Failed to encode signature image.');
            await FileSystem.writeAsStringAsync(dest, base64, { encoding: BASE64_ENCODING });
            setSavedSignatureUri(dest);
            return dest;
        }

        throw new Error('No signature to save.');
    };

    const useSavedSignature = async () => {
        const uri = savedSignatureUri || (await loadSavedSignatureAsync());
        if (!uri) {
            Alert.alert('Signature', 'No saved signature found yet.');
            return;
        }
        setSignatureImageUri(uri);
        setSignatureDataUrl(null);
        setPendingSignatureImageUri(null);
    };

    useEffect(() => {
        // Load saved signature when physician changes (but do not auto-apply it).
        loadSavedSignatureAsync();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [physicianStorageKey]);

    const onPressSignNow = () => {
        setSignatureModalVisible(true);
    };

    const onPressSignatureCancel = () => {
        setPendingSignatureImageUri(null);
        setSignatureModalVisible(false);
    };

    const onPressSignatureDone = () => {
        // Triggers onOK callback
        signatureRef.current?.readSignature?.();
    };

    const clearSignature = () => {
        signatureRef.current?.clearSignature?.();
        setSignatureDataUrl(null);
        setSignatureImageUri(null);
        setPendingSignatureImageUri(null);
        setProcessingEsign(false);
    };

    const confirmCapturedESign = async () => {
        if (!pendingSignatureImageUri) return;
        try {
            setProcessingEsign(true);
            const sourceUri = await ensureFileUriAsync(pendingSignatureImageUri);
            const cleanedUri = await removeWhitePaperBackgroundAsync(sourceUri, {
                maxWidth: 650,
                adaptiveWindowSize: 41,
                adaptiveC: 10,
                forceInkBelow: 140,
            });
            const toSaveUri = cleanedUri || sourceUri;
            const savedUri = await persistSignatureToDeviceAsync({ imageUri: toSaveUri });
            setSignatureImageUri(savedUri);
            setSignatureDataUrl(null);
            setPendingSignatureImageUri(null);
            setSignatureModalVisible(false);
        } catch (e) {
            const msg = typeof e?.message === 'string' ? e.message : '';
            Alert.alert('Signature', `Failed to save signature.${msg ? `\n\n${msg}` : ''}`);
            // Still apply the picked signature for this prescription (just not saved as default).
            try {
                const sourceUri = await ensureFileUriAsync(pendingSignatureImageUri);
                setSignatureImageUri(sourceUri);
            } catch {
                setSignatureImageUri(pendingSignatureImageUri);
            }
            setSignatureDataUrl(null);
            setPendingSignatureImageUri(null);
            setSignatureModalVisible(false);
        } finally {
            setProcessingEsign(false);
        }
    };

    const cancelCapturedESign = () => {
        setPendingSignatureImageUri(null);
        setSignatureModalVisible(true);
    };

    const captureESign = async () => {
        const openLibrary = async () => {
            // Close the signature modal before opening the system picker/crop UI (more reliable on Android)
            setSignatureModalVisible(false);

            const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) {
                Alert.alert('Permission required', 'Please allow photo library access to select your signature.');
                setSignatureModalVisible(true);
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [4, 2],
                quality: 1,
            });

            const canceled = result?.canceled ?? result?.cancelled;
            if (canceled) {
                setSignatureModalVisible(true);
                return;
            }
            const uri = result?.assets?.[0]?.uri ?? result?.uri;
            if (!uri) {
                setSignatureModalVisible(true);
                return;
            }

            let usableUri = uri;
            try {
                usableUri = await ensureFileUriAsync(uri);
            } catch (e) {
                console.error('Signature image URI conversion failed:', e);
            }

            const validation = await validateSignatureImageAsyncSafe(usableUri);
            if (!validation.valid) {
                Alert.alert('Invalid Image', validation.error || 'Please choose a different image.');
                setSignatureModalVisible(true);
                return;
            }

            // After cropping, show preview with ✓/X
            setPendingSignatureImageUri(usableUri);
        };

        const openCamera = async () => {
            // Close the signature modal before opening the system camera/crop UI
            setSignatureModalVisible(false);

            const perm = await ImagePicker.requestCameraPermissionsAsync();
            if (!perm.granted) {
                Alert.alert('Permission required', 'Please allow camera access to capture your signature.');
                setSignatureModalVisible(true);
                return;
            }

            const result = await ImagePicker.launchCameraAsync({
                allowsEditing: true,
                aspect: [4, 2],
                quality: 1,
            });

            const canceled = result?.canceled ?? result?.cancelled;
            if (canceled) {
                setSignatureModalVisible(true);
                return;
            }
            const uri = result?.assets?.[0]?.uri ?? result?.uri;
            if (!uri) {
                setSignatureModalVisible(true);
                return;
            }

            let usableUri = uri;
            try {
                usableUri = await ensureFileUriAsync(uri);
            } catch (e) {
                console.error('Signature image URI conversion failed:', e);
            }

            const validation = await validateSignatureImageAsyncSafe(usableUri);
            if (!validation.valid) {
                Alert.alert('Invalid Image', validation.error || 'Please choose a different image.');
                setSignatureModalVisible(true);
                return;
            }

            // After cropping, show preview with ✓/X
            setPendingSignatureImageUri(usableUri);
        };

        Alert.alert(
            'Capture e-sign',
            'Choose how you want to add your signature.',
            [
                { text: 'Choose from device', onPress: openLibrary },
                { text: 'Open camera', onPress: openCamera },
                { text: 'Cancel', style: 'cancel' },
            ]
        );
    };

    const capturePrescriptionPng = async (shouldPreview = true) => {
        if (!ViewShot || !viewShotRef.current?.capture) {
            Alert.alert('Prescription', 'Preview rendering is unavailable on this build.');
            return null;
        }
        try {
            setGeneratingPreview(true);
            const uri = await viewShotRef.current.capture();
            if (!uri) throw new Error('Capture returned empty data.');
            if (shouldPreview) {
                setPreviewUri(uri);
                setPreviewVisible(true);
            }
            return uri;
        } catch (e) {
            console.error('Prescription capture failed:', e);
            Alert.alert('Prescription', e?.message || 'Failed to generate the prescription preview.');
            return null;
        } finally {
            setGeneratingPreview(false);
        }
    };

    const uploadPrescriptionPngToStorage = async ({ pngUri, recordId: recordDocumentId }) => {
        if (!pngUri) throw new Error('No prescription image to upload.');
        const bucketId = appwriteConfig.prescriptionBucketId || appwriteConfig.imagesBucketId;
        if (!bucketId) throw new Error('Prescription bucket is not configured.');

        const sourceUri = await ensureFileUriAsync(pngUri);
        const info = await FileSystem.getInfoAsync(sourceUri, { size: true });
        if (!info?.exists) {
            throw new Error('Captured prescription preview is no longer available on disk.');
        }

        const fileName = `prescription_${recordDocumentId || 'temp'}_${Date.now()}.png`;
        const response = await storage.createFile(bucketId, ID.unique(), {
            uri: sourceUri,
            type: 'image/png',
            name: fileName,
            size: info.size || 0,
        });
        return { fileId: response?.$id, response };
    };

    const onPressSave = async () => {
        if (isViewMode) {
            if (navigation?.goBack) navigation.goBack();
            return;
        }

        if (!recordId) {
            Alert.alert('Prescription', 'Missing patient record ID.');
            return;
        }

        // 1) Show PNG overlay (what you requested)
        const pngUri = await capturePrescriptionPng(true);

        if (!pngUri) {
            // If we can't generate the PNG, we shouldn't mark the record as verified.
            return;
        }

        // 2) Persist data back to patient record + store uploaded file id
        let uploadedFileId = '';
        try {
            const uploaded = await uploadPrescriptionPngToStorage({ pngUri, recordId });
            uploadedFileId = uploaded?.fileId || uploaded?.$id || '';
        } catch (e) {
            console.error('Prescription PNG upload error:', e);
            Alert.alert('Prescription', e?.message || 'Failed to upload prescription image to storage.');
            return;
        }

        if (!uploadedFileId) {
            Alert.alert('Prescription', 'Failed to upload prescription image to storage.');
            return;
        }

        const payload = {
            // Mark record as verified when prescription is issued
            status: 'verified',
            assessmentDiagnosis: diagnosis,
            categoryOfExposure: category ? String(category).trim() : '',
            others: others,

            // Store prescription image file id (one record = one prescription)
            prescription_images: uploadedFileId,

            // Vaccines (booleans)
            tt_vaccine: !!vaccinesChecked.tt,
            htig_vaccine: !!vaccinesChecked.htig,
            pcec_pvrv_vaccine: !!vaccinesChecked.pcec,
            erig_vaccine: !!vaccinesChecked.erig,
            hrig_vaccine: !!vaccinesChecked.hrig,

            // Units (integers) - store null when not provided
            tt_units: vaccinesChecked.tt ? toIntOrNull(units?.tt) : null,
            htig_units: vaccinesChecked.htig ? toIntOrNull(units?.htig) : null,
            pcec_pvrv_units: vaccinesChecked.pcec ? toIntOrNull(units?.pcec) : null,
            erig_units: vaccinesChecked.erig ? toIntOrNull(units?.erig) : null,
            hrig_units: vaccinesChecked.hrig ? toIntOrNull(units?.hrig) : null,
        };

        try {
            const updated = await databases.updateDocument(
                appwriteConfig.patientDatabaseId,
                appwriteConfig.patientRecordsCollectionId,
                recordId,
                payload
            );

            // Keep local UI in sync without a refetch.
            setRecordDoc((prev) => ({ ...(prev || {}), ...(updated || payload) }));
        } catch (e) {
                // If Appwrite schema expects a number for categoryOfExposure, retry with int.
                const msg = String(e?.message || '');
                const shouldRetryCategory = /categoryOfExposure/i.test(msg) || /invalid document structure|invalid type/i.test(msg);

                if (shouldRetryCategory) {
                    try {
                        const categoryInt = category ? Number.parseInt(String(category).trim(), 10) : null;
                        const retryPayload = {
                            ...payload,
                            categoryOfExposure: Number.isFinite(categoryInt) ? categoryInt : payload.categoryOfExposure,
                        };
                        const updated2 = await databases.updateDocument(
                            appwriteConfig.patientDatabaseId,
                            appwriteConfig.patientRecordsCollectionId,
                            recordId,
                            retryPayload
                        );
                        setRecordDoc((prev) => ({ ...(prev || {}), ...(updated2 || retryPayload) }));
                        return;
                    } catch (e2) {
                        console.error('Prescription save error (retry):', e2);
                        Alert.alert('Prescription', e2?.message || 'Failed to save prescription.');
                        return;
                    }
                }

                console.error('Prescription save error:', e);
                Alert.alert('Prescription', e?.message || 'Failed to save prescription.');
        }
    };

    const printData = useMemo(() => {
        const unitsDisplay = {
            tt: units.tt || '',
            htig: units.htig || '',
            pcec: units.pcec || '',
            erig: units.erig || '',
            hrig: units.hrig || '',
        };

        return {
            date: dateText || getTodayForPrint(),
            name: fullName,
            address: addressLine,
            age: ageValue,
            sex: sexValue,
            diagnosis: diagnosis || '',
            category: category || '',
            animalExposure: `${toTitleCase(bitingAnimal || '')}, ${toTitleCase(exposureType || '')}`
                .trim()
                .replace(/^,\s*|,\s*$/g, ''),
            siteInvolved: siteInvolved || '',
            checks: {
                tt: !!vaccinesChecked.tt,
                htig: !!vaccinesChecked.htig,
                pcec: !!vaccinesChecked.pcec,
                erig: !!vaccinesChecked.erig,
                hrig: !!vaccinesChecked.hrig,
            },
            units: unitsDisplay,
            others: others || '',
            signatureUri: signatureImageUri || signatureDataUrl || null,
            providerName: physicianNameValue || '',
            providerDesignation: designationValue || '',
            providerOffice: officeValue || '',
            providerLicenseNo: licenseNoValue || '',
        };
    }, [
        dateText,
        fullName,
        addressLine,
        ageValue,
        sexValue,
        diagnosis,
        category,
        bitingAnimal,
        exposureType,
        siteInvolved,
        vaccinesChecked,
        units,
        others,
        signatureImageUri,
        signatureDataUrl,
        physicianNameValue,
        designationValue,
        officeValue,
        licenseNoValue,
    ]);

    return (
        <SafeAreaView style={styles.safeArea} edges={['top']}>


            <View style={styles.body}>
                {recordLoading ? (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                        <ActivityIndicator size="large" color="#125872" />
                    </View>
                ) : recordError ? (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 }}>
                        <Ionicons name="alert-circle" size={52} color="#EF4444" />
                        <Text style={{ marginTop: 10, color: '#EF4444', textAlign: 'center' }}>{recordError}</Text>
                    </View>
                ) : (
                <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Paper-like header to match print preview */}
                    <View style={styles.paperHeader}>
                        <Text style={styles.paperHeaderTitle}>CITY HEALTH OFFICE</Text>
                        <Text style={styles.paperHeaderSubtitle}>Mabini St, Barangay Magsugo South, Tagum City</Text>
                        <Text style={styles.paperHeaderSubtitle}>TEL. #216-7043</Text>
                    </View>

                    {/* Patient Info */}
                    <View style={[styles.sectionCard, styles.patientInfo]}>
                        <Text style={styles.label}>DATE:</Text>
                        <View style={styles.dateRow}>
                            <View style={styles.dateInputWrap}>
                                <TextInput
                                    value={dateText}
                                    onChangeText={isViewMode ? undefined : setDateText}
                                    placeholder="mm/dd/yyyy"
                                    placeholderTextColor="#8E8E8E"
                                    style={styles.dateInput}
                                    editable={!isViewMode}
                                />
                                <TouchableOpacity
                                    onPress={() => {
                                        if (isViewMode) return;
                                        setShowDatePicker(true);
                                    }}
                                    activeOpacity={0.85}
                                    style={styles.calendarButton}
                                >
                                    <Ionicons name="calendar-outline" size={18} color="#125872" />
                                </TouchableOpacity>
                            </View>
                            {!isViewMode ? (
                                <TouchableOpacity
                                    onPress={() => {
                                        const d = new Date();
                                        setDateValue(d);
                                        setDateText(formatMMDDYYYYFromDate(d));
                                    }}
                                    style={styles.todayButton}
                                    activeOpacity={0.85}
                                >
                                    <Text style={styles.todayButtonText}>Today</Text>
                                </TouchableOpacity>
                            ) : null}
                        </View>

                        {!isViewMode && showDatePicker ? (
                            <View style={{ marginTop: 10 }}>
                                <DateTimePicker
                                    value={dateValue}
                                    mode="date"
                                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                    onChange={(event, selectedDate) => {
                                        // Android: closes on select/dismiss
                                        if (Platform.OS !== 'ios') {
                                            setShowDatePicker(false);
                                        }

                                        if (event?.type === 'dismissed') return;
                                        if (!selectedDate) return;

                                        setDateValue(selectedDate);
                                        setDateText(formatMMDDYYYYFromDate(selectedDate));
                                    }}
                                />

                                {Platform.OS === 'ios' ? (
                                    <TouchableOpacity
                                        style={styles.iosDateDoneButton}
                                        onPress={() => setShowDatePicker(false)}
                                        activeOpacity={0.85}
                                    >
                                        <Text style={styles.iosDateDoneText}>Done</Text>
                                    </TouchableOpacity>
                                ) : null}
                            </View>
                        ) : null}

                        <Text style={[styles.label, styles.mt16]}>NAME:</Text>
                        <TextInput
                            value={fullName}
                            editable={false}
                            style={[styles.input, styles.inputReadonly]}
                        />

                        <Text style={[styles.label, styles.mt16]}>ADDRESS:</Text>
                        <TextInput
                            value={addressLine}
                            editable={false}
                            style={[styles.input, styles.inputReadonly]}
                        />

                        <View style={styles.row2}>
                            <View style={styles.colHalf}>
                                <Text style={styles.label}>AGE:</Text>
                                <TextInput value={ageValue} editable={false} style={[styles.input, styles.smallInput, styles.inputReadonly]} />
                            </View>
                            <View style={styles.colHalf}>
                                <Text style={styles.label}>SEX:</Text>
                                <TextInput
                                    value={sexValue}
                                    editable={false}
                                    style={[styles.input, styles.inputReadonly, styles.sexInput, { width: sexBoxWidth }]}
                                />
                            </View>
                        </View>

                        <Text style={[styles.label, styles.mt16]}>DIAGNOSIS:</Text>
                        <TextInput
                            value={diagnosis}
                            onChangeText={isViewMode ? undefined : setDiagnosis}
                            placeholder="Type"
                            placeholderTextColor="#8E8E8E"
                            style={[styles.input, styles.textArea, isViewMode && styles.inputReadonly]}
                            multiline
                            editable={!isViewMode}
                        />

                        {/* CATEGORY + SITE INVOLVED (side-by-side like the screenshot) */}
                        <View style={[styles.row2, styles.mt16]}>
                            <View style={styles.colHalf}>
                                <Text style={styles.label}>CATEGORY:</Text>
                                <TouchableOpacity
                                    style={[styles.selectButton, isViewMode && styles.selectButtonDisabled]}
                                    activeOpacity={0.85}
                                    onPress={() => {
                                        if (isViewMode) return;
                                        setCategoryDropdownOpen((prev) => !prev);
                                    }}
                                >
                                    <Text style={[styles.selectButtonText, !category && styles.selectPlaceholder]}>
                                        {category || 'SELECT'}
                                    </Text>
                                    <Ionicons name={categoryDropdownOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#125872" />
                                </TouchableOpacity>

                                {categoryDropdownOpen && !isViewMode ? (
                                    <View style={styles.dropdownList}>
                                        {CATEGORY_OPTIONS.map((opt, idx) => {
                                            const isSelected = String(category) === String(opt);
                                            return (
                                                <TouchableOpacity
                                                    key={opt}
                                                    style={[
                                                        styles.dropdownItem,
                                                        idx === CATEGORY_OPTIONS.length - 1 && { borderBottomWidth: 0 },
                                                        isSelected && styles.dropdownItemSelected,
                                                    ]}
                                                    activeOpacity={0.85}
                                                    onPress={() => {
                                                        setCategory(opt);
                                                        setCategoryDropdownOpen(false);
                                                    }}
                                                >
                                                    <Text style={[styles.dropdownItemText, isSelected && styles.dropdownItemTextSelected]}>
                                                        {opt}
                                                    </Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                ) : null}
                            </View>

                            <View style={styles.colHalf}>
                                <Text style={styles.label}>SITE INVOLVED:</Text>
                                <TextInput
                                    value={siteInvolved}
                                    onChangeText={isViewMode ? undefined : setSiteInvolved}
                                    placeholder="Type"
                                    placeholderTextColor="#9A9A9A"
                                    style={[styles.siteInput, isViewMode && styles.inputReadonly]}
                                    editable={!isViewMode}
                                />
                            </View>
                        </View>

                        <View style={[styles.row2, styles.mt16]}>
                            <View style={styles.colHalf}>
                                <Text style={styles.label}>TYPE OF BITING ANIMAL:</Text>
                                <TouchableOpacity
                                    style={[styles.pillButton, isViewMode && styles.pillButtonDisabled]}
                                    activeOpacity={0.85}
                                    onPress={() => {
                                        if (isViewMode) return;
                                        setBitingAnimal((prev) => (prev === 'DOG' ? 'CAT' : 'DOG'));
                                    }}
                                >
                                    <Text style={styles.pillButtonText}>{bitingAnimal}</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={styles.colHalf}>
                                <Text style={styles.label}>TYPE OF EXPOSURE:</Text>
                                <TouchableOpacity
                                    style={[styles.pillButton, isViewMode && styles.pillButtonDisabled]}
                                    activeOpacity={0.85}
                                    onPress={() => {
                                        if (isViewMode) return;
                                        setExposureType((prev) => (prev === 'BITE' ? 'SCRATCH' : 'BITE'));
                                    }}
                                >
                                    <Text style={styles.pillButtonText}>{exposureType}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>

                    {/* Vaccines */}
                    <View style={[styles.sectionCard, styles.vaccines]}>
                        <VaccineRow
                            label="TETANUS TOXOID (TT)"
                            checked={vaccinesChecked.tt}
                            units={units.tt}
                            onToggle={() => toggleVaccine('tt')}
                            onUnitsChange={(v) => setUnitsFor('tt', v)}
                            editable={!isViewMode}
                        />
                        <VaccineRow
                            label="HTIG"
                            checked={vaccinesChecked.htig}
                            units={units.htig}
                            onToggle={() => toggleVaccine('htig')}
                            onUnitsChange={(v) => setUnitsFor('htig', v)}
                            editable={!isViewMode}
                        />
                        <VaccineRow
                            label="PCEC/PVRV"
                            checked={vaccinesChecked.pcec}
                            units={units.pcec}
                            onToggle={() => toggleVaccine('pcec')}
                            onUnitsChange={(v) => setUnitsFor('pcec', v)}
                            editable={!isViewMode}
                        />
                        <VaccineRow
                            label="ERIG"
                            checked={vaccinesChecked.erig}
                            units={units.erig}
                            onToggle={() => toggleVaccine('erig')}
                            onUnitsChange={(v) => setUnitsFor('erig', v)}
                            editable={!isViewMode}
                        />
                        <VaccineRow
                            label="HRIG"
                            checked={vaccinesChecked.hrig}
                            units={units.hrig}
                            onToggle={() => toggleVaccine('hrig')}
                            onUnitsChange={(v) => setUnitsFor('hrig', v)}
                            editable={!isViewMode}
                        />

                        <Text style={[styles.label, styles.mt20]}>OTHERS:</Text>
                        <TextInput
                            value={others}
                            onChangeText={isViewMode ? undefined : setOthers}
                            placeholder="Type..."
                            placeholderTextColor="#8E8E8E"
                            style={[styles.input, styles.textArea, styles.othersArea, isViewMode && styles.inputReadonly]}
                            multiline
                            editable={!isViewMode}
                        />
                    </View>

                    {/* Provider Footer */}
                    <View style={[styles.sectionCard, styles.providerFooter]}>
                        <View style={styles.signatureBlock}>
                            {signatureDataUrl || signatureImageUri ? (
                                <>
                                    <Image
                                        source={{ uri: signatureImageUri || signatureDataUrl }}
                                        style={styles.signaturePreview}
                                        resizeMode="contain"
                                    />
                                </>
                            ) : (
                                <Text style={styles.signatureHint}>No signature added</Text>
                            )}
                            {!isViewMode ? (
                                <>
                                    {!signatureDataUrl && !signatureImageUri && savedSignatureUri ? (
                                        <TouchableOpacity
                                            style={[styles.signNowButton, styles.useSavedButton]}
                                            onPress={useSavedSignature}
                                            activeOpacity={0.85}
                                        >
                                            <Ionicons name="refresh" size={16} color="#125872" />
                                            <Text style={styles.signNowText}>USE SAVED SIGNATURE</Text>
                                        </TouchableOpacity>
                                    ) : null}

                                    <TouchableOpacity style={styles.signNowButton} onPress={onPressSignNow} activeOpacity={0.85}>
                                        <Ionicons name="pencil" size={16} color="#125872" />
                                        <Text style={styles.signNowText}>{savedSignatureUri ? 'CHANGE SIGNATURE' : 'SIGN NOW'}</Text>
                                    </TouchableOpacity>
                                </>
                            ) : null}
                        </View>

                        <Text style={styles.providerName}>{physicianNameValue}</Text>
                        <Text style={styles.providerLine}>{designationValue}</Text>
                        <Text style={styles.providerLine}>{officeValue}</Text>
                        <Text style={styles.providerLine}>Lic. No. {licenseNoValue || ''}</Text>
                    </View>
                </ScrollView>

                )}

                {/* Fixed bottom action */}
                {!isViewMode ? (
                    <View style={styles.bottomActionBar}>
                        <TouchableOpacity
                            style={styles.saveButton}
                            onPress={onPressSave}
                            activeOpacity={0.9}
                            disabled={generatingPreview}
                        >
                            {generatingPreview ? (
                                <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                                <Text style={styles.saveButtonText}>PRESCRIBE</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                ) : null}

                {/* Hidden render target for PNG capture */}
                <View style={styles.captureHost} pointerEvents="none">
                    {ViewShot ? (
                        <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1 }} style={styles.captureShot}>
                            <View style={styles.rxPaper}>
                                <View style={styles.rxTop}>
                                    <Text style={styles.rxHeaderTitle}>CITY HEALTH OFFICE</Text>
                                    <Text style={styles.rxHeaderSub}>Mabini St, Barangay Magsugo South, Tagum City</Text>
                                    <Text style={styles.rxHeaderSub}>TEL. #216-7043</Text>

                                    <View style={styles.rxInfoRowTop}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.rxLabel}>NAME:</Text>
                                            <Text style={styles.rxValue}>{printData.name}</Text>
                                        </View>
                                        <View style={{ width: 118, alignItems: 'flex-end' }}>
                                            <Text style={styles.rxLabel}>DATE:</Text>
                                            <Text style={styles.rxValue}>{printData.date}</Text>
                                        </View>
                                    </View>

                                    <View style={styles.rxInfoRow}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.rxLabel}>ADDRESS:</Text>
                                            <Text style={styles.rxValue}>{printData.address}</Text>
                                        </View>
                                    </View>

                                    <View style={styles.rxInfoRow}>
                                        <View style={{ width: 90 }}>
                                            <Text style={styles.rxLabel}>AGE:</Text>
                                            <Text style={styles.rxValue}>{printData.age}</Text>
                                        </View>
                                        <View style={{ width: 90 }}>
                                            <Text style={styles.rxLabel}>SEX:</Text>
                                            <Text style={styles.rxValue}>{printData.sex}</Text>
                                        </View>
                                    </View>

                                    <View style={styles.rxInfoRow}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.rxLabel}>DIAGNOSIS:</Text>
                                            <Text style={styles.rxValue}>{printData.diagnosis}</Text>
                                        </View>
                                    </View>

                                    <View style={styles.rxInfoRow}>
                                        <View style={{ width: 90 }}>
                                            <Text style={styles.rxLabel}>CATEGORY:</Text>
                                            <Text style={styles.rxValue}>{printData.category}</Text>
                                        </View>
                                        <View style={{ flex: 1, paddingLeft: 6 }}>
                                            <Text style={styles.rxLabel}> </Text>
                                            <Text style={styles.rxValue}>{printData.animalExposure}</Text>
                                        </View>
                                        <View style={{ width: 118, alignItems: 'flex-end' }}>
                                            <Text style={styles.rxLabel}> </Text>
                                            <Text style={styles.rxValue}>{printData.siteInvolved}</Text>
                                        </View>
                                    </View>

                                    <Text style={styles.rxSymbol}>℞</Text>

                                    <View style={styles.rxChecks}>
                                        <RxCheckRow label="TETANUS TOXOID" checked={printData.checks.tt} units={printData.units.tt} />
                                        <RxCheckRow label="HTIG" checked={printData.checks.htig} units={printData.units.htig} />
                                        <RxCheckRow label="PCEC/PVRV" checked={printData.checks.pcec} units={printData.units.pcec} />
                                        <RxCheckRow label="ERIG" checked={printData.checks.erig} units={printData.units.erig} />
                                        <RxCheckRow label="HRIG" checked={printData.checks.hrig} units={printData.units.hrig} />
                                    </View>

                                    <View style={styles.rxOthersBox}>
                                        <Text style={styles.rxOthersText}>{printData.others}</Text>
                                    </View>
                                </View>

                                <View style={styles.rxFooter}>
                                    {printData.signatureUri ? (
                                        <Image source={{ uri: printData.signatureUri }} style={styles.rxSignature} resizeMode="contain" />
                                    ) : (
                                        <View style={styles.rxSignaturePlaceholder} />
                                    )}
                                    <Text style={styles.rxDocName}>{printData.providerName}</Text>
                                    <Text style={styles.rxDocLine}>{printData.providerDesignation}</Text>
                                    <Text style={styles.rxDocLine}>{printData.providerOffice}</Text>
                                    <Text style={styles.rxDocLine}>Lic. No. {printData.providerLicenseNo || ''}</Text>
                                </View>
                            </View>
                        </ViewShot>
                    ) : (
                        <View style={[styles.captureShot, { justifyContent: 'center', alignItems: 'center' }]}>
                            <Text style={{ color: '#111827', fontSize: 12 }}>
                                ViewShot unavailable on this build.
                            </Text>
                        </View>
                    )}
                </View>

                {/* PNG overlay modal */}
                <Modal
                    visible={previewVisible}
                    animationType="fade"
                    transparent
                    onRequestClose={() => setPreviewVisible(false)}
                >
                    <View style={styles.previewOverlay}>
                        <TouchableOpacity
                            style={styles.previewCloseButton}
                            onPress={() => setPreviewVisible(false)}
                            activeOpacity={0.9}
                        >
                            <Ionicons name="close" size={18} color="#111827" />
                        </TouchableOpacity>

                        {previewUri ? (
                            <Image source={{ uri: previewUri }} style={styles.previewImage} resizeMode="contain" />
                        ) : (
                            <ActivityIndicator size="large" color="#FFFFFF" />
                        )}
                    </View>
                </Modal>

                {/* Signature Modal */}
                <Modal
                    visible={signatureModalVisible}
                    animationType="fade"
                    transparent
                    onRequestClose={onPressSignatureCancel}
                >
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalCard}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>Sign Prescription</Text>
                                <TouchableOpacity onPress={onPressSignatureCancel} style={styles.modalClose}>
                                    <Ionicons name="close" size={18} color="#111827" />
                                </TouchableOpacity>
                            </View>

                            <Text style={styles.modalSubtitle}>
                                Draw your signature using your finger or stylus
                            </Text>

                            <View style={styles.signaturePadContainer}>
                                {SignatureScreen ? (
                                    <SignatureScreen
                                        ref={signatureRef}
                                        onOK={async (sig) => {
                                            if (!sig) {
                                                Alert.alert('Signature', 'Please sign first.');
                                                return;
                                            }

                                            try {
                                                const savedUri = await persistSignatureToDeviceAsync({ dataUrl: sig });
                                                setSignatureImageUri(savedUri);
                                                setSignatureDataUrl(null);
                                                setPendingSignatureImageUri(null);
                                                setSignatureModalVisible(false);
                                            } catch (e) {
                                                console.error('Signature save error:', e);
                                                Alert.alert('Signature', e?.message || 'Failed to save signature.');
                                                // Allow use for this prescription even if persistence fails.
                                                setSignatureDataUrl(sig);
                                                setSignatureImageUri(null);
                                                setPendingSignatureImageUri(null);
                                                setSignatureModalVisible(false);
                                            }
                                        }}
                                        onEmpty={() => Alert.alert('Signature', 'Please sign first.')}
                                        autoClear={false}
                                        descriptionText=""
                                        clearText=""
                                        confirmText=""
                                        webStyle={`
                                          .m-signature-pad { box-shadow: none; border: none; }
                                          .m-signature-pad--footer { display: none; margin: 0px; }
                                          body, html { width: 100%; height: 100%; }
                                        `}
                                    />
                                ) : (
                                        <View style={{ padding: 16 }}>
                                            <Text style={{ color: '#111827' }}>
                                                Signature pad failed to load on this device/build.
                                            </Text>
                                            <Text style={{ color: '#6B7280', marginTop: 8 }}>
                                                This usually happens when the dev client build is missing a native module or Hermes is incompatible.
                                            </Text>
                                        </View>
                                )}
                            </View>

                            <View style={styles.modalButtonRow}>
                                <TouchableOpacity style={[styles.modalButton, styles.modalButtonCancel]} onPress={onPressSignatureCancel}>
                                    <Text style={[styles.modalButtonText, styles.modalButtonTextCancel]}>Cancel</Text>
                                </TouchableOpacity>

                                {savedSignatureUri ? (
                                    <TouchableOpacity
                                        style={[styles.modalButton, styles.modalButtonUseSaved, pendingSignatureImageUri && styles.modalButtonDisabled]}
                                        onPress={() => {
                                            if (pendingSignatureImageUri) return;
                                            useSavedSignature();
                                            setSignatureModalVisible(false);
                                        }}
                                        disabled={!!pendingSignatureImageUri}
                                    >
                                        <Ionicons name="refresh" size={16} color="#FFFFFF" />
                                        <Text style={styles.modalButtonText}>use saved</Text>
                                    </TouchableOpacity>
                                ) : null}

                                <TouchableOpacity
                                    style={[styles.modalButton, styles.modalButtonDone, pendingSignatureImageUri && styles.modalButtonDisabled]}
                                    onPress={onPressSignatureDone}
                                    disabled={!!pendingSignatureImageUri}
                                >
                                    <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                                    <Text style={styles.modalButtonText}>Done</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.modalButton, styles.modalButtonCapture, pendingSignatureImageUri && styles.modalButtonDisabled]}
                                    onPress={captureESign}
                                    disabled={!!pendingSignatureImageUri}
                                >
                                    <Text style={styles.modalButtonText}>capture e-sign</Text>
                                </TouchableOpacity>
                            </View>

                            <TouchableOpacity style={styles.modalClearButton} onPress={clearSignature}>
                                <Ionicons name="trash-outline" size={16} color="#111827" />
                                <Text style={styles.modalClearText}>Clear</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>

                {/* E-sign Confirm (✓/X) */}
                <Modal
                    visible={!!pendingSignatureImageUri}
                    animationType="fade"
                    transparent
                    onRequestClose={cancelCapturedESign}
                >
                    <View style={styles.modalOverlay}>
                        <View style={styles.confirmCard}>
                            <Text style={styles.confirmTitle}>Use this signature?</Text>
                            <View style={styles.confirmPreviewWrap}>
                                <Image
                                    source={{ uri: pendingSignatureImageUri }}
                                    style={styles.confirmPreviewImage}
                                    resizeMode="contain"
                                />
                            </View>

                            {processingEsign ? (
                                <View style={styles.confirmProcessingRow}>
                                    <ActivityIndicator size="small" color="#125872" />
                                    <Text style={styles.confirmProcessingText}>Removing background...</Text>
                                </View>
                            ) : null}

                            <View style={styles.confirmActionsRow}>
                                <TouchableOpacity
                                    style={[styles.confirmActionButton, styles.confirmActionCancel]}
                                    onPress={cancelCapturedESign}
                                    activeOpacity={0.9}
                                    disabled={processingEsign}
                                >
                                    <Ionicons name="close" size={20} color="#111827" />
                                    <Text style={styles.confirmActionTextDark}>Cancel</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.confirmActionButton, styles.confirmActionConfirm]}
                                    onPress={confirmCapturedESign}
                                    activeOpacity={0.9}
                                    disabled={processingEsign}
                                >
                                    <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                                    <Text style={styles.confirmActionTextLight}>Save</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>
            </View>
        </SafeAreaView>
    );
}

function VaccineRow({ label, checked, units, onToggle, onUnitsChange, editable = true }) {
    const unitsEditable = Boolean(editable && checked);
    const handleUnitsChange = (text) => {
        const digitsOnly = String(text ?? '').replace(/\D+/g, '');
        onUnitsChange?.(digitsOnly);
    };
    return (
        <View style={styles.vaccineRow}>
            <View style={styles.vaccineLeft}>
                <Checkbox checked={checked} onPress={editable ? onToggle : undefined} />
                <Text style={styles.vaccineLabel}>{label}</Text>
            </View>

            <View style={styles.vaccineRight}>
                <Text style={styles.unitsLabel}># OF UNITS:</Text>
                <TextInput
                    value={units}
                    onChangeText={unitsEditable ? handleUnitsChange : undefined}
                    placeholder=""
                    placeholderTextColor="#8E8E8E"
                    style={[styles.input, styles.unitsInput, !unitsEditable && styles.inputReadonly]}
                    editable={unitsEditable}
                    keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
                    inputMode="numeric"
                />
            </View>
        </View>
    );
}

function RxCheckRow({ label, checked, units }) {
    return (
        <View style={styles.rxCheckRow}>
            <View style={styles.rxCheckLeft}>
                <View style={[styles.rxCheckBox, checked && styles.rxCheckBoxChecked]}>
                    {checked ? <Ionicons name="checkmark" size={14} color="#111827" /> : null}
                </View>
                <Text style={styles.rxCheckLabel}>{label}</Text>
            </View>

            <View style={styles.rxCheckRight}>
                <Text style={styles.rxHash}>#</Text>
                <View style={styles.rxUnitsLine}>
                    <Text style={styles.rxUnitsText}>{units || ''}</Text>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    body: {
        flex: 1,
        backgroundColor: 'transparent',
        paddingHorizontal: 20,
        paddingTop: 0,
        paddingBottom: 20,
        
    },
    scrollView: {
        marginTop: -30,
    },
    scrollContent: {
        paddingHorizontal: 18,
        paddingTop: 4,
        paddingBottom: 110,
    },

    paperHeader: {
        alignItems: 'center',
        marginBottom: 14,
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E5E5',
    },
    paperHeaderTitle: {
        color: '#125872',
        fontSize: 16,
        fontWeight: '900',
        letterSpacing: 0.4,
    },
    paperHeaderSubtitle: {
        marginTop: 2,
        color: '#6B7280',
        fontSize: 11,
        fontWeight: '600',
    },

    sectionCard: {
        backgroundColor: '#FFFFFF',
    },

    patientInfo: {
        borderWidth: 2,
        borderColor: '#125872',
        borderRadius: 16,
        paddingHorizontal: 18,
        paddingVertical: 20,
        backgroundColor: '#F8FBFD',
        shadowColor: '#000000',
        shadowOpacity: 0.08,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
        marginBottom: 24,
    },

    label: {
        color: '#000000',
        fontWeight: '900',
        fontSize: 12,
        marginBottom: 6,
    },

    input: {
        borderWidth: 2,
        borderColor: '#125872',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        color: '#125872',
        fontSize: 14,
        backgroundColor: '#FFFFFF',
    },
    inputReadonly: {
        backgroundColor: '#F1F1F1',
    },
    smallInput: {
        width: 60,
        textAlign: 'center',
        paddingVertical: 10,
    },
    sexInput: {
        textAlign: 'center',
        paddingVertical: 10,
    },
    textArea: {
        minHeight: 54,
        textAlignVertical: 'top',
        paddingTop: 10,
    },

    mt16: { marginTop: 16 },
    mt20: { marginTop: 20 },

    dateRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    dateInputWrap: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderWidth: 2,
        borderColor: '#125872',
        borderRadius: 8,
        paddingHorizontal: 12,
        backgroundColor: '#F1F1F1',
        height: 44,
    },
    calendarButton: {
        width: 34,
        height: 34,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dateInput: {
        flex: 1,
        color: '#125872',
        fontSize: 16,
        paddingVertical: 0,
    },
    iosDateDoneButton: {
        alignSelf: 'flex-end',
        marginTop: 10,
        borderWidth: 2,
        borderColor: '#125872',
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 8,
        backgroundColor: '#F1F1F1',
    },
    iosDateDoneText: {
        color: '#125872',
        fontWeight: '900',
        fontSize: 14,
    },
    todayButton: {
        marginLeft: 10,
        borderWidth: 2,
        borderColor: '#125872',
        borderRadius: 8,
        paddingHorizontal: 12,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F1F1F1',
    },
    todayButtonText: {
        color: '#125872',
        fontWeight: '900',
        fontSize: 14,
    },

    row2: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 18,
    },
    colHalf: {
        flex: 1,
    },

    selectButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderWidth: 2,
        borderColor: '#125872',
        borderRadius: 8,
        paddingHorizontal: 12,
        height: 44,
        backgroundColor: '#F1F1F1',
        width: '100%',
    },
    selectButtonDisabled: {
        opacity: 0.65,
    },
    selectButtonText: {
        color: '#125872',
        fontWeight: '900',
    },
    selectPlaceholder: {
        color: '#9A9A9A',
    },

    dropdownList: {
        marginTop: 8,
        borderWidth: 2,
        borderColor: '#125872',
        borderRadius: 10,
        backgroundColor: '#F1F1F1',
        overflow: 'hidden',
        width: '100%',
    },

    siteInput: {
        borderWidth: 2,
        borderColor: '#125872',
        borderRadius: 8,
        paddingHorizontal: 12,
        height: 44,
        color: '#125872',
        fontSize: 14,
        fontWeight: '900',
        backgroundColor: '#F1F1F1',
        paddingVertical: 0,
    },
    dropdownItem: {
        paddingVertical: 12,
        paddingHorizontal: 14,
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(18,88,114,0.25)',
    },
    dropdownItemSelected: {
        backgroundColor: '#EAF6FB',
    },
    dropdownItemText: {
        color: '#125872',
        fontWeight: '900',
        fontSize: 16,
    },
    dropdownItemTextSelected: {
        color: '#125872',
    },

    pillButton: {
        borderWidth: 2,
        borderColor: '#125872',
        borderRadius: 10,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F1F1F1',
    },
    pillButtonDisabled: {
        opacity: 0.65,
    },
    pillButtonText: {
        color: '#125872',
        fontWeight: '900',
    },

    vaccines: {
        marginTop: 22,
        paddingTop: 8,
    },
    vaccineRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
    },
    vaccineLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    vaccineLabel: {
        marginLeft: 10,
        fontSize: 13,
        fontWeight: '900',
        color: '#000000',
    },
    vaccineRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    unitsLabel: {
        fontSize: 12,
        fontWeight: '900',
        color: '#000000',
    },
    unitsInput: {
        width: 80,
        height: 36,
        paddingVertical: 6,
        textAlign: 'center',
        backgroundColor: '#FFFFFF',
    },

    checkboxBox: {
        width: 22,
        height: 22,
        borderWidth: 2,
        borderColor: '#125872',
        borderRadius: 4,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFFFFF',
    },
    checkboxBoxChecked: {
        backgroundColor: '#EAF6FB',
    },

    othersArea: {
        backgroundColor: '#F1F1F1',
        borderColor: '#125872',
    },

    providerFooter: {
        marginTop: 24,
        alignItems: 'center',
        paddingBottom: 10,
    },
    signatureBlock: {
        width: '78%',
        borderWidth: 2,
        borderColor: '#125872',
        borderRadius: 10,
        paddingVertical: 12,
        paddingHorizontal: 12,
        alignItems: 'center',
        backgroundColor: '#F1F1F1',
    },
    signaturePreview: {
        width: '100%',
        height: 80,
        marginBottom: 10,
    },
    signatureHint: {
        color: '#8E8E8E',
        fontSize: 12,
        marginBottom: 8,
    },
    signNowButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderWidth: 2,
        borderColor: '#125872',
        borderRadius: 8,
        backgroundColor: '#FFFFFF',
        minWidth: 140,
    },
    useSavedButton: {
        marginBottom: 10,
    },
    signNowText: {
        color: '#125872',
        fontWeight: '900',
        letterSpacing: 0.4,
    },

    providerName: {
        marginTop: 14,
        fontSize: 20,
        fontWeight: '900',
        color: '#000000',
        textAlign: 'center',
    },
    providerLine: {
        fontSize: 14,
        fontWeight: '600',
        color: '#000000',
        textAlign: 'center',
        marginTop: 2,
    },

    bottomActionBar: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: 18,
        paddingTop: 10,
        paddingBottom: 18,
        backgroundColor: '#FFFFFF',
        borderTopWidth: 1,
        borderTopColor: '#E5E5E5',
    },
    saveButton: {
        backgroundColor: '#31C200',
        height: 56,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    saveButtonText: {
        color: '#FFFFFF',
        fontSize: 20,
        fontWeight: '900',
    },

    // Capture/preview
    captureHost: {
        position: 'absolute',
        left: -9999,
        top: -9999,
        width: 360,
        height: 740,
        opacity: 0,
    },
    captureShot: {
        width: 360,
        height: 740,
        backgroundColor: '#FFFFFF',
    },
    previewOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.75)',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
        paddingVertical: 20,
    },
    previewImage: {
        width: '100%',
        height: '100%',
        maxWidth: 420,
    },
    previewCloseButton: {
        position: 'absolute',
        top: 40,
        right: 20,
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
    },

    // Print-like prescription layout (PNG)
    rxPaper: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 10,
        justifyContent: 'space-between',
    },
    rxTop: {
        flexShrink: 1,
    },
    rxHeaderTitle: {
        textAlign: 'center',
        color: '#125872',
        fontSize: 20,
        fontWeight: '900',
        letterSpacing: 0.4,
    },
    rxHeaderSub: {
        textAlign: 'center',
        color: '#125872',
        fontSize: 10,
        fontWeight: '600',
        marginTop: 1,
    },
    rxInfoRowTop: {
        marginTop: 10,
        flexDirection: 'row',
        gap: 10,
    },
    rxInfoRow: {
        marginTop: 4,
        flexDirection: 'row',
        gap: 12,
        alignItems: 'flex-end',
    },
    rxLabel: {
        color: '#125872',
        fontSize: 10,
        fontWeight: '700',
    },
    rxValue: {
        color: '#111827',
        fontSize: 11,
        fontWeight: '700',
        marginTop: 1,
    },
    rxSymbol: {
        marginTop: 6,
        fontSize: 54,
        fontWeight: '900',
        color: '#111827',
    },
    rxChecks: {
        marginTop: 2,
    },
    rxCheckRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 6,
    },
    rxCheckLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        flex: 1,
    },
    rxCheckBox: {
        width: 18,
        height: 18,
        borderWidth: 1.5,
        borderColor: '#111827',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFFFFF',
    },
    rxCheckBoxChecked: {
        backgroundColor: '#F3F4F6',
    },
    rxCheckLabel: {
        fontSize: 13,
        fontWeight: '900',
        color: '#111827',
    },
    rxCheckRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        width: 90,
        justifyContent: 'flex-end',
    },
    rxHash: {
        fontSize: 18,
        fontWeight: '900',
        color: '#111827',
    },
    rxUnitsLine: {
        width: 44,
        borderBottomWidth: 1.5,
        borderBottomColor: '#111827',
        alignItems: 'center',
        paddingBottom: 1,
    },
    rxUnitsText: {
        fontSize: 14,
        fontWeight: '900',
        color: '#111827',
    },
    rxOthersBox: {
        marginTop: 8,
        borderWidth: 1,
        borderColor: '#D1D5DB',
        borderRadius: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        minHeight: 68,
        justifyContent: 'center',
    },
    rxOthersText: {
        fontSize: 13,
        color: '#111827',
        fontWeight: '500',
    },
    rxFooter: {
        alignItems: 'center',
        paddingTop: 2,
        paddingBottom: 0,
    },
    rxSignature: {
        width: 220,
        height: 56,
        marginBottom: -14,
    },
    rxSignaturePlaceholder: {
        width: 220,
        height: 56,
        marginBottom: -14,
    },
    rxDocName: {
        marginTop: 0,
        fontSize: 22,
        fontWeight: '900',
        color: '#111827',
        lineHeight: 24,
        textTransform: 'uppercase',
    },
    rxDocLine: {
        marginTop: 0,
        fontSize: 13,
        fontWeight: '700',
        color: '#111827',
        textAlign: 'center',
        lineHeight: 15,
    },

    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.45)',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 18,
    },
    modalCard: {
        width: '100%',
        maxWidth: 520,
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        padding: 16,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    modalTitle: {
        fontSize: 16,
        fontWeight: '900',
        color: '#111827',
    },
    modalClose: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F3F4F6',
    },
    modalSubtitle: {
        marginTop: 8,
        marginBottom: 12,
        color: '#6B7280',
        fontSize: 12,
        lineHeight: 16,
    },
    signaturePadContainer: {
        height: 260,
        borderWidth: 2,
        borderColor: '#E5E7EB',
        borderRadius: 10,
        overflow: 'hidden',
        backgroundColor: '#FFFFFF',
    },
    capturePreviewContainer: {
        flex: 1,
        padding: 10,
        justifyContent: 'space-between',
    },
    capturePreviewImage: {
        flex: 1,
        width: '100%',
        borderRadius: 8,
        backgroundColor: '#FFFFFF',
    },
    capturePreviewActions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
        marginTop: 10,
    },
    captureActionButton: {
        flex: 1,
        height: 40,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    captureActionCancel: {
        backgroundColor: '#F3F4F6',
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    captureActionConfirm: {
        backgroundColor: '#31C200',
    },
    modalButtonRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        marginTop: 12,
    },
    modalButton: {
        flex: 1,
        height: 40,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 6,
        paddingHorizontal: 10,
    },
    modalButtonCancel: {
        backgroundColor: '#F3F4F6',
    },
    modalButtonDone: {
        backgroundColor: '#2563EB',
    },
    modalButtonCapture: {
        backgroundColor: '#31C200',
    },
    modalButtonUseSaved: {
        backgroundColor: '#125872',
    },
    modalButtonText: {
        color: '#FFFFFF',
        fontWeight: '900',
        fontSize: 12,
    },
    modalButtonTextCancel: {
        color: '#111827',
    },
    modalButtonDisabled: {
        opacity: 0.55,
    },

    // E-sign confirm modal
    confirmCard: {
        width: '100%',
        maxWidth: 520,
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        padding: 16,
    },
    confirmTitle: {
        fontSize: 16,
        fontWeight: '900',
        color: '#111827',
        marginBottom: 10,
    },
    confirmPreviewWrap: {
        height: 260,
        borderWidth: 2,
        borderColor: '#E5E7EB',
        borderRadius: 10,
        overflow: 'hidden',
        backgroundColor: '#FFFFFF',
    },
    confirmPreviewImage: {
        width: '100%',
        height: '100%',
    },
    confirmProcessingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginTop: 10,
    },
    confirmProcessingText: {
        color: '#125872',
        fontWeight: '700',
        fontSize: 13,
    },
    confirmActionsRow: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 12,
    },
    confirmActionButton: {
        flex: 1,
        height: 44,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 8,
    },
    confirmActionCancel: {
        backgroundColor: '#F3F4F6',
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    confirmActionConfirm: {
        backgroundColor: '#31C200',
    },
    confirmActionTextDark: {
        color: '#111827',
        fontWeight: '900',
    },
    confirmActionTextLight: {
        color: '#FFFFFF',
        fontWeight: '900',
    },
    modalClearButton: {
        marginTop: 10,
        height: 44,
        borderRadius: 10,
        backgroundColor: '#F3F4F6',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 8,
    },
    modalClearText: {
        color: '#111827',
        fontWeight: '900',
    },
});

export default Prescription;