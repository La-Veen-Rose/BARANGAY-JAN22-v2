import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import SignatureScreen from 'react-native-signature-canvas';
import * as ImagePicker from 'expo-image-picker';
// Expo SDK 54+: use legacy FS API for downloadAsync
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { removeWhitePaperBackgroundAsync, validateSignatureImageAsync } from '../utils/signatureImageService';
import { databases, appwriteConfig, account, ID, APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID } from './appwriteConfig';
import ViewShot from 'react-native-view-shot';
import { Query } from 'appwrite';

// Fallback mock data (used when record fetch is unavailable)
const lastName = 'MONTENEGRO';
const firstName = 'JAMES';
const middleName = 'QUIZON';
const age = '44';
const sex = 'F';
const fallbackPhysicianName = 'HAJI RAH, MD';
const fallbackDesignation = 'MEDICAL OFFICER IV';
const fallbackOffice = 'CITY HEALTH OFFICE - TAGUM';
const fallbackLicenseNo = '123456';

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

const CATEGORY_OPTIONS = ['1', '2', '3'];

const BASE64_ENCODING = FileSystem?.EncodingType?.Base64 || 'base64';

const sanitizeStorageKey = (value) => {
    const s = String(value ?? '').trim();
    if (!s) return 'default';
    return s.replace(/[^a-z0-9_-]/gi, '_');
};

const getSavedSignaturePath = (userKey) => {
    const key = sanitizeStorageKey(userKey);
    const base = FileSystem.documentDirectory || FileSystem.cacheDirectory || '';
    return base ? `${base}saved_signature_${key}.png` : '';
};

const ensureFileUriAsync = async (uri) => {
    if (!uri) return '';
    if (typeof uri === 'string' && uri.startsWith('content://')) {
        const outUri = `${FileSystem.cacheDirectory || FileSystem.documentDirectory || ''}sig_src_${Date.now()}.jpg`;
        if (!outUri) return uri;
        await FileSystem.copyAsync({ from: uri, to: outUri });
        return outUri;
    }
    return uri;
};

const dataUrlToBase64 = (dataUrl) => {
    const s = String(dataUrl ?? '').trim();
    if (!s) return '';
    const commaIdx = s.indexOf(',');
    if (commaIdx !== -1 && s.slice(0, commaIdx).includes('base64')) {
        return s.slice(commaIdx + 1);
    }
    return s;
};

const toTitleCase = (value) => {
    const s = String(value ?? '').trim();
    if (!s) return '';
    return s
        .toLowerCase()
        .split(/\s+/g)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
};

function Checkbox({ checked, onPress }) {
    return (
        <TouchableOpacity
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            onPress={onPress}
            style={[styles.checkboxBox, checked && styles.checkboxBoxChecked]}
            activeOpacity={0.85}
        >
            {checked ? <Ionicons name="checkmark" size={16} color="#125872" /> : null}
        </TouchableOpacity>
    );
}

const parseUnitsField = (value) => {
    const empty = { tt: '', htig: '', pcec: '', erig: '', hrig: '' };
    if (!value) return empty;
    if (typeof value === 'object' && !Array.isArray(value)) {
        return { ...empty, ...value };
    }
    if (typeof value !== 'string') return empty;

    const trimmed = value.trim();
    if (!trimmed) return empty;

    try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object') {
            return { ...empty, ...parsed };
        }
    } catch {
        // ignore
    }

    // Fallback: parse "TT:2; PCEC:1; ERIG:2" style
    const out = { ...empty };
    const parts = trimmed.split(/[;\n]/g).map((p) => p.trim()).filter(Boolean);
    for (const part of parts) {
        const [kRaw, vRaw] = part.split(':').map((s) => (s ?? '').trim());
        const k = (kRaw || '').toLowerCase();
        const v = vRaw || '';
        if (k.includes('tt')) out.tt = v;
        else if (k.includes('htig')) out.htig = v;
        else if (k.includes('pcec') || k.includes('pvrv')) out.pcec = v;
        else if (k.includes('erig')) out.erig = v;
        else if (k.includes('hrig')) out.hrig = v;
    }
    return out;
};

const toIntOrNull = (value) => {
    const s = String(value ?? '').trim();
    if (!s) return null;
    const n = Number.parseInt(s, 10);
    return Number.isFinite(n) ? n : null;
};

const uploadPrescriptionPngToStorage = async ({ pngUri, recordId }) => {
    const bucketId = appwriteConfig.prescriptionBucketId || appwriteConfig.imagesBucketId;
    if (!bucketId) throw new Error('Missing prescription bucket ID.');
    if (!APPWRITE_ENDPOINT || !APPWRITE_PROJECT_ID) throw new Error('Missing Appwrite endpoint/project ID.');
    if (!pngUri) throw new Error('Missing PNG URI.');

    const fileId = ID.unique();
    const fileName = `prescription_${recordId}_${Date.now()}.png`;

    // Use JWT to authenticate REST upload reliably in React Native.
    const jwtResp = await account.createJWT();
    const jwt = jwtResp?.jwt;
    if (!jwt) throw new Error('Failed to create Appwrite JWT.');

    const form = new FormData();
    form.append('fileId', fileId);
    form.append('file', {
        uri: pngUri,
        name: fileName,
        type: 'image/png',
    });

    const url = `${APPWRITE_ENDPOINT}/storage/buckets/${bucketId}/files`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'X-Appwrite-Project': APPWRITE_PROJECT_ID,
            'X-Appwrite-JWT': jwt,
        },
        body: form,
    });

    const text = await res.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        data = { message: text };
    }

    if (!res.ok) {
        const message = data?.message || `Upload failed (${res.status})`;
        throw new Error(message);
    }

    return { ...data, fileId: data?.$id || fileId };
};

const downloadPrescriptionPngToCache = async ({ fileId }) => {
    const bucketId = appwriteConfig.prescriptionBucketId || appwriteConfig.imagesBucketId;
    if (!bucketId) throw new Error('Missing prescription bucket ID.');
    if (!APPWRITE_ENDPOINT || !APPWRITE_PROJECT_ID) throw new Error('Missing Appwrite endpoint/project ID.');
    if (!fileId) throw new Error('Missing prescription file id.');

    const jwtResp = await account.createJWT();
    const jwt = jwtResp?.jwt;
    if (!jwt) throw new Error('Failed to create Appwrite JWT.');

    const url = `${APPWRITE_ENDPOINT}/storage/buckets/${bucketId}/files/${fileId}/download?project=${encodeURIComponent(APPWRITE_PROJECT_ID)}`;
    const dest = `${FileSystem.cacheDirectory || FileSystem.documentDirectory || ''}prescription_${fileId}.png`;
    if (!dest) throw new Error('No writable filesystem directory available.');

    const result = await FileSystem.downloadAsync(url, dest, {
        headers: {
            'X-Appwrite-Project': APPWRITE_PROJECT_ID,
            'X-Appwrite-JWT': jwt,
        },
    });

    return result?.uri || dest;
};

function Prescription({ navigation, route }) {
    const mode = route?.params?.mode || 'edit';
    const isViewMode = mode === 'view';
    const recordId = route?.params?.recordId || route?.params?.patient?.id || route?.params?.patient?.$id;

    const [physicianProfile, setPhysicianProfile] = useState(route?.params?.physicianProfile || null);

    const [recordLoading, setRecordLoading] = useState(!!recordId);
    const [recordError, setRecordError] = useState(null);
    const [recordDoc, setRecordDoc] = useState(null);

    const fullName = useMemo(() => {
        const doc = recordDoc;
        const ln = doc?.lastName || lastName;
        const fn = doc?.firstName || firstName;
        const mn = doc?.middleName || middleName;
        return `${ln}, ${fn} ${mn}`.trim();
    }, [recordDoc]);

    const addressLine = useMemo(() => {
        const doc = recordDoc;
        const parts = [doc?.purok, doc?.barangay, doc?.city].filter(Boolean);
        return parts.join(', ');
    }, [recordDoc]);

    const ageValue = useMemo(() => String(recordDoc?.age ?? age), [recordDoc]);
    const sexValue = useMemo(() => String(recordDoc?.sex ?? sex), [recordDoc]);

    const sexBoxWidth = useMemo(() => {
        const s = String(sexValue ?? '').trim();
        // Keep a nice compact pill for short values (e.g., M/F) and expand for MALE/FEMALE.
        // Tuned to match the existing font size and padding.
        const len = s.length || 1;
        return Math.max(60, Math.min(120, 18 + len * 10));
    }, [sexValue]);

    const [dateText, setDateText] = useState('');
    const [dateValue, setDateValue] = useState(() => new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [diagnosis, setDiagnosis] = useState('');
    const [category, setCategory] = useState('');
    const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
    const [bitingAnimal, setBitingAnimal] = useState('DOG');
    const [exposureType, setExposureType] = useState('BITE');
    const [siteInvolved, setSiteInvolved] = useState('');
    const [others, setOthers] = useState('');

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

    // PNG preview
    const viewShotRef = useRef(null);
    const [previewUri, setPreviewUri] = useState(null);
    const [previewVisible, setPreviewVisible] = useState(false);
    const [generatingPreview, setGeneratingPreview] = useState(false);

    useEffect(() => {
        let isMounted = true;
        const loadPhysicianProfile = async () => {
            if (physicianProfile) return;
            try {
                const user = await account.get();

                let profile = null;
                try {
                    const res = await databases.listDocuments(
                        appwriteConfig.staffDatabaseId,
                        appwriteConfig.physicianAccountsCollectionId,
                        [Query.equal('auth_user_id', user.$id), Query.limit(1)]
                    );
                    if (res?.documents?.length) profile = res.documents[0];
                } catch (e) {
                    if (e?.name === 'AppwriteException' && /not authorized/i.test(e?.message || '')) {
                        try {
                            profile = await databases.getDocument(
                                appwriteConfig.staffDatabaseId,
                                appwriteConfig.physicianAccountsCollectionId,
                                user.$id
                            );
                        } catch (_) {
                            // ignore
                        }
                    } else {
                        throw e;
                    }
                }

                if (isMounted && profile) setPhysicianProfile(profile);
            } catch (e) {
                // Don't block prescription UI if physician lookup fails.
                console.warn('Prescription physician profile fetch failed:', e?.message || e);
            }
        };

        loadPhysicianProfile();
        return () => {
            isMounted = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const physicianNameValue = useMemo(() => {
        return (
            physicianProfile?.Physician_Name ||
            physicianProfile?.physicianName ||
            physicianProfile?.PhysicianName ||
            physicianProfile?.name ||
            fallbackPhysicianName
        );
    }, [physicianProfile]);

    const designationValue = useMemo(() => {
        return (
            physicianProfile?.designation ||
            physicianProfile?.Designation ||
            physicianProfile?.DESIGNATION ||
            fallbackDesignation
        );
    }, [physicianProfile]);

    const officeValue = useMemo(() => {
        return (
            physicianProfile?.office ||
            physicianProfile?.Office ||
            physicianProfile?.OFFICE ||
            fallbackOffice
        );
    }, [physicianProfile]);

    const licenseNoValue = useMemo(() => {
        return (
            physicianProfile?.License_No ||
            physicianProfile?.licenseNo ||
            physicianProfile?.LicenseNo ||
            physicianProfile?.license_number ||
            fallbackLicenseNo
        );
    }, [physicianProfile]);

    useEffect(() => {
        let isMounted = true;
        const load = async () => {
            if (!recordId) {
                setRecordLoading(false);
                return;
            }
            try {
                setRecordLoading(true);
                const doc = await databases.getDocument(
                    appwriteConfig.patientDatabaseId,
                    appwriteConfig.patientRecordsCollectionId,
                    recordId
                );

                if (!isMounted) return;
                setRecordDoc(doc);
                setRecordError(null);

                // Prefill from record
                const dateCandidate = doc?.consultationDate || doc?.dateSubmitted || doc?.$createdAt;
                const parsed = tryParseDate(dateCandidate);
                const d = parsed || new Date();
                setDateValue(d);
                setDateText(formatMMDDYYYYFromDate(d));
                setDiagnosis(String(doc?.assessmentDiagnosis || ''));
                setCategory(String(doc?.categoryOfExposure || ''));
                setOthers(String(doc?.others || ''));

                // Animal/exposure
                const animal = Array.isArray(doc?.animalType) ? doc.animalType[0] : doc?.animalType;
                if (animal) setBitingAnimal(String(animal).toUpperCase());
                const exposure = Array.isArray(doc?.typeOfExposure) ? doc.typeOfExposure[0] : doc?.typeOfExposure;
                if (exposure) setExposureType(String(exposure).toUpperCase());

                const site = Array.isArray(doc?.siteInvolved) ? doc.siteInvolved.join(', ') : doc?.siteInvolved;
                if (site) setSiteInvolved(String(site));

                // Vaccines
                const passive = Array.isArray(doc?.passiveVaccine) ? doc.passiveVaccine : (doc?.passiveVaccine ? [doc.passiveVaccine] : []);
                const active = Array.isArray(doc?.activeVaccine) ? doc.activeVaccine : (doc?.activeVaccine ? [doc.activeVaccine] : []);
                const passiveStr = passive.map((x) => String(x).toUpperCase());
                const activeStr = active.map((x) => String(x).toUpperCase());

                setVaccinesChecked({
                    tt: typeof doc?.tt_vaccine === 'boolean'
                        ? doc.tt_vaccine
                        : String(doc?.tetanusImmunization || '').toLowerCase() === 'yes',
                    htig: typeof doc?.htig_vaccine === 'boolean'
                        ? doc.htig_vaccine
                        : String(doc?.HTIG || '').toLowerCase() === 'yes',
                    pcec: typeof doc?.pcec_pvrv_vaccine === 'boolean'
                        ? doc.pcec_pvrv_vaccine
                        : activeStr.join(' ').includes('PCEC') || activeStr.join(' ').includes('PVRV'),
                    erig: typeof doc?.erig_vaccine === 'boolean'
                        ? doc.erig_vaccine
                        : passiveStr.join(' ').includes('ERIG'),
                    hrig: typeof doc?.hrig_vaccine === 'boolean'
                        ? doc.hrig_vaccine
                        : passiveStr.join(' ').includes('HRIG'),
                });

                const hasNewUnits =
                    typeof doc?.tt_units === 'number' ||
                    typeof doc?.htig_units === 'number' ||
                    typeof doc?.pcec_pvrv_units === 'number' ||
                    typeof doc?.erig_units === 'number' ||
                    typeof doc?.hrig_units === 'number';

                if (hasNewUnits) {
                    setUnits({
                        tt: doc?.tt_units != null ? String(doc.tt_units) : '',
                        htig: doc?.htig_units != null ? String(doc.htig_units) : '',
                        pcec: doc?.pcec_pvrv_units != null ? String(doc.pcec_pvrv_units) : '',
                        erig: doc?.erig_units != null ? String(doc.erig_units) : '',
                        hrig: doc?.hrig_units != null ? String(doc.hrig_units) : '',
                    });
                } else {
                    setUnits(parseUnitsField(doc?.passiveVaccineUnits));
                }
            } catch (e) {
                if (!isMounted) return;
                console.error('Prescription load error:', e);
                setRecordError(e?.message || 'Failed to load prescription data');
            } finally {
                if (isMounted) setRecordLoading(false);
            }
        };

        load();
        return () => {
            isMounted = false;
        };
    }, [recordId]);

    const generatePreviewPng = async () => {
        if (!viewShotRef.current) {
            throw new Error('Preview capture is not ready yet.');
        }
        const uri = await viewShotRef.current.capture?.({
            format: 'png',
            quality: 1,
            result: 'tmpfile',
        });
        if (!uri) throw new Error('Failed to generate preview image.');
        return uri;
    };

    const waitForNextFrame = async () =>
        new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const openPreview = async () => {
        try {
            setGeneratingPreview(true);
            // Give React Native a tick to flush the latest text/signature/physician state
            // and to lay out the hidden print view before capturing.
            await waitForNextFrame();
            const uri = await generatePreviewPng();
            setPreviewUri(uri);
            setPreviewVisible(true);
            return uri;
        } catch (e) {
            console.error('Preview capture error:', e);
            Alert.alert('Prescription', e?.message || 'Failed to generate prescription image.');
            return null;
        } finally {
            setGeneratingPreview(false);
        }
    };

    // In view mode, auto-open the stored prescription PNG (if available)
    useEffect(() => {
        if (!isViewMode) return;
        if (recordLoading || recordError) return;

        const storedFileId = recordDoc?.prescription_images;
        if (storedFileId) {
            (async () => {
                try {
                    const localUri = await downloadPrescriptionPngToCache({ fileId: storedFileId });
                    setPreviewUri(localUri);
                    setPreviewVisible(true);
                } catch (e) {
                    console.error('Prescription PNG fetch error:', e);
                    // Fallback: still allow generating from the hidden print layout
                    const t2 = setTimeout(() => {
                        openPreview();
                    }, 250);
                    return () => clearTimeout(t2);
                }
            })();
            return;
        }

        const t = setTimeout(() => {
            openPreview();
        }, 350);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isViewMode, recordLoading, recordError, recordDoc?.prescription_images]);

    const toggleVaccine = (key) => {
        if (isViewMode) return;
        setVaccinesChecked((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const setUnitsFor = (key, value) => {
        if (isViewMode) return;
        setUnits((prev) => ({ ...prev, [key]: value }));
    };

    const onPressBack = () => {
        if (navigation?.goBack) navigation.goBack();
    };

    // Signature
    const signatureRef = useRef(null);
    const [signatureModalVisible, setSignatureModalVisible] = useState(false);
    const [signatureDataUrl, setSignatureDataUrl] = useState(null); // data:image/png;base64,...
    const [signatureImageUri, setSignatureImageUri] = useState(null); // from camera/gallery
    const [pendingSignatureImageUri, setPendingSignatureImageUri] = useState(null); // awaiting ✓/X
    const [processingEsign, setProcessingEsign] = useState(false);

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

            const validation = await validateSignatureImageAsync(usableUri);
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

            const validation = await validateSignatureImageAsync(usableUri);
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
        const pngUri = await openPreview();

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
        backgroundColor: '#ffffff',
    },
    body: {
        flex: 1,
        backgroundColor: 'transparent',
        paddingHorizontal: 20,
        paddingTop: -20,
        paddingBottom: 20,
        
    },
    scrollContent: {
        paddingHorizontal: 18,
        paddingTop: 14,
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