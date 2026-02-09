import React, { useRef, useState, useEffect } from 'react';
import { 
    View, 
    Text, 
    ScrollView, 
    TouchableOpacity, 
    StyleSheet, 
    SafeAreaView,
    ActivityIndicator,
    Image,
    Alert,
    Dimensions,
    Modal,
    Platform,
    TextInput,
} 
from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { databases, appwriteConfig, APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID } from './appwriteConfig';
import CityHealthLogo from '../assets/CITY HEALTH OFFICE LOGO.png';
import { printPatientRecordPdf } from './patientRecordPdfService';
import { getCurrentStaffProfile } from './staffProfileService';
import { logActivity } from './activityLogsService';

function PatientRecordContent({ patient, onOpenPrescription }) {
    const [patientData, setPatientData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [loadingImages, setLoadingImages] = useState({});
    const imageLoadTimeoutsRef = useRef({});
    const [selectedImage, setSelectedImage] = useState(null);
    const [showQRModal, setShowQRModal] = useState(false);
    const [showPrescriptionTemplate, setShowPrescriptionTemplate] = useState(false);
    const [staffRole, setStaffRole] = useState(null);
    const [showTerminateModal, setShowTerminateModal] = useState(false);
    const [terminateReason, setTerminateReason] = useState('');
    const [terminateReasonError, setTerminateReasonError] = useState('');
    const [isTerminating, setIsTerminating] = useState(false);
    const [showTerminateSuccess, setShowTerminateSuccess] = useState(false);
    const terminateSuccessTimeoutRef = useRef(null);
    const documentId = patient?.id || patient?.$id;
    const patientUpdatedAt = patient?.$updatedAt || patient?.updatedAt || null;

    const normalizeStatus = (value) => String(value || '').trim().toLowerCase();

    const normalizeOptionalBool = (value) => {
        if (value === true) return true;
        if (value === false) return false;
        return null;
    };

    const SIGNATURE_CACHE_PREFIX = 'physician_signature';
    const getSavedSignaturePath = (physicianKey) => {
        const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
        if (!baseDir) return null;
        return `${baseDir}${SIGNATURE_CACHE_PREFIX}_${physicianKey || 'default'}.png`;
    };

    const getPrescriptionImageUrl = (fileId) => {
        if (!fileId) return null;

        if (typeof fileId === 'string' && /^https?:\/\//i.test(fileId.trim())) {
            return fileId.trim();
        }

        try {
            const bucketId = appwriteConfig.prescriptionBucketId || appwriteConfig.imagesBucketId;
            if (!bucketId) return null;

            return `${APPWRITE_ENDPOINT}/storage/buckets/${bucketId}/files/${fileId}/view?project=${APPWRITE_PROJECT_ID}`;
        } catch (e) {
            console.warn('Failed to build prescription image URL:', e?.message || e);
            return null;
        }
    };

    // If a parent screen (e.g., Prescription flow) passes an updated/optimistic status,
    // reflect it immediately so the badge updates without waiting for a refetch.
    useEffect(() => {
        const nextStatus = normalizeStatus(patient?.status);
        if (!nextStatus) return;

        setPatientData((prev) => {
            if (!prev) return { status: nextStatus };

            const prevStatus = normalizeStatus(prev?.status);
            if (prevStatus === nextStatus) return prev;

            // Never downgrade a verified record back to pending/other while transitions are in-flight.
            if (prevStatus === 'verified' && nextStatus !== 'verified') return prev;
            if (prevStatus === 'terminated' && nextStatus !== 'terminated') return prev;

            return { ...prev, status: nextStatus };
        });
    }, [patient?.status]);

    const handlePrintRecord = async () => {
        try {
            if (!patientData) {
                Alert.alert('Download Record', 'Patient record is still loading.');
                return;
            }

            const prescriptionImageUrl = getPrescriptionImageUrl(patientData?.prescriptionImageId);

            // Best effort: embed the physician signature image used (cached on device)
            let signatureImageUri = null;
            try {
                const staff = await getCurrentStaffProfile();
                const profile = staff?.profile || staff || {};
                const physicianKey = profile?.auth_user_id || profile?.AuthUserId || profile?.userId || profile?.$id || 'default';
                const path = getSavedSignaturePath(physicianKey);
                if (path) {
                    const info = await FileSystem.getInfoAsync(path);
                    if (info?.exists) signatureImageUri = path;
                }
            } catch (e) {
                // ignore signature loading failures
            }

            const result = await printPatientRecordPdf({
                doc: patientData,
                signatureImageUri,
                prescriptionImageUrl,
            });
            if (!result?.uri) {
                Alert.alert('Download Record', 'PDF generation failed.');
                return;
            }

            if (result.savedTo === 'device') {
                Alert.alert('Download Record', `PDF saved to the folder you selected as: ${result.filename}`);
            } else {
                Alert.alert(
                    'Download Record',
                    `PDF created as: ${result.filename}\nUse the share dialog to save/download it to your Files/Downloads.`
                );
            }
        } catch (e) {
            console.error('Print record error:', e);
            Alert.alert('Download Record', e?.message || 'Failed to generate PDF.');
        }
    };

    const handleDownloadRecord = () => {
        return handlePrintRecord();
    };

    const handleChangeTerminateReason = (value) => {
        if (terminateReasonError) {
            setTerminateReasonError('');
        }
        setTerminateReason(value);
    };

    const openTerminatePrompt = () => {
        setTerminateReason('');
        setTerminateReasonError('');
        setShowTerminateModal(true);
    };

    const closeTerminatePrompt = () => {
        if (isTerminating) return;
        setShowTerminateModal(false);
        setTerminateReason('');
        setTerminateReasonError('');
    };

    const triggerTerminateSuccess = () => {
        setShowTerminateSuccess(true);
        if (terminateSuccessTimeoutRef.current) {
            clearTimeout(terminateSuccessTimeoutRef.current);
        }
        terminateSuccessTimeoutRef.current = setTimeout(() => {
            setShowTerminateSuccess(false);
        }, 3000);
    };

    const handleConfirmTerminate = async () => {
        const trimmedReason = terminateReason.trim();
        if (!trimmedReason) {
            setTerminateReasonError('Please provide a termination reason.');
            return;
        }

        if (terminateReasonError) {
            setTerminateReasonError('');
        }

        if (!documentId) {
            Alert.alert('Terminate Record', 'Patient record is missing an ID.');
            return;
        }

        try {
            setIsTerminating(true);
            await databases.updateDocument(
                appwriteConfig.patientDatabaseId,
                appwriteConfig.patientRecordsCollectionId,
                documentId,
                {
                    status: 'terminated',
                    terminateReason: trimmedReason,
                }
            );

            setPatientData((prev) => {
                if (!prev) return prev;
                return { ...prev, status: 'terminated', terminateReason: trimmedReason };
            });

            setShowTerminateModal(false);
            setTerminateReason('');
            setTerminateReasonError('');
            triggerTerminateSuccess();

            try {
                await logActivity({
                    action: 'Update',
                    description: 'Updated patient record',
                });
            } catch (eLog) {
                console.log('Activity log skipped:', eLog?.message || String(eLog));
            }
        } catch (e) {
            console.error('Terminate record error:', e);
            Alert.alert('Terminate Record', e?.message || 'Failed to terminate patient record.');
        } finally {
            setIsTerminating(false);
        }
    };

    useEffect(() => {
        let mounted = true;

        (async () => {
            try {
                const staff = await getCurrentStaffProfile();
                if (mounted) setStaffRole(staff?.role || null);
            } catch (e) {
                console.warn('Failed to resolve staff role:', e?.message || e);
                if (mounted) setStaffRole(null);
            }
        })();

        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        if (!documentId) {
            setError('No patient record ID provided');
            setLoading(false);
            return;
        }

        const fetchPatientRecord = async () => {
            try {
                setLoading(true);
                const doc = await databases.getDocument(
                    appwriteConfig.patientDatabaseId,
                    appwriteConfig.patientRecordsCollectionId,
                    documentId
                );

                const optimisticStatus = normalizeStatus(patient?.status);
                const fetchedStatus = normalizeStatus(doc?.status) || 'pending';
                const effectiveStatus = optimisticStatus === 'verified' ? 'verified' : fetchedStatus;

                // Format data for display
                const formattedData = {
                    // Patient Info
                    status: effectiveStatus,
                    name: formatName(doc.lastName, doc.firstName, doc.middleName, doc.suffix),
                    age: doc.age,
                    dateOfBirth: formatDate(doc.dateOfBirth),
                    sex: doc.sex,
                    civilStatus: doc.civilStatus,
                    address: formatAddress(doc.purok, doc.barangay, doc.city),
                    contactNo: doc.contactNumber,
                    consultationDate: formatDate(doc.consultationDate),
                    consultationTime: formatTime(doc.consultationTime),
                    interviewedBy: doc.interviewedReferredBy,

                    // Pertinent Data
                    bitingAnimal: getAnimalTypeDisplay(doc.animalType, doc.animalTypeOther),
                    // Raw fields for PDF rendering / checkbox logic
                    animalType: doc.animalType,
                    animalTypeOther: doc.animalTypeOther,
                    animalOwnership: doc.animalOwnership || doc.ownership || doc.animalOwned,
                    exposureDate: formatDate(doc.exposureDate),
                    exposureTime: formatTime(doc.exposureTime),
                    placeOfIncidence: capitalizeWords(doc.placeOfIncidence),
                    bitingAnimalStatus: Array.isArray(doc.animalStatus) ? doc.animalStatus.join(', ') : doc.animalStatus,
                    typeOfExposure: Array.isArray(doc.typeOfExposure) ? doc.typeOfExposure.join(', ') : doc.typeOfExposure,
                    immunizationReceived: doc.animalImmunized,
                    immunizationDate: doc.animalImmunized === 'Yes' ? formatDate(doc.animalImmunizedDate) : '',

                    // Medical History
                    previousImmunization: doc.prevAntiRabies,
                    prevImmunizationDate: doc.prevAntiRabies === 'Yes' ? formatDate(doc.prevAntiRabiesDate) : '',
                    allergies: doc.historyOfAllergies,

                    // Physical Examination
                    weight: doc.weight,
                    height: doc.height,
                    bp: doc.bp,
                    temp: doc.temp,
                    woundDescription: Array.isArray(doc.woundDescription) ? doc.woundDescription.join(', ') : doc.woundDescription,
                    spontaneousBleeding: doc.spontaneousBleeding,
                    inducedBleeding: doc.inducedBleeding,
                    localWoundTreatment: doc.localWoundTreatment,
                    washedWaterOnly: doc.washedWaterOnly,
                    washedSoapWater: doc.washedSoapWater,
                    tandok: doc.tandok,
                    appliedGarlic: doc.appliedGarlic,
                    tetanusImmunization: doc.tetanusImmunization,
                    tetanusDateGiven: doc.tetanusImmunization === 'Yes' ? formatDate(doc.tetanusDateGiven) : '',
                    htg: doc.HTIG,
                    htigDateGiven: doc.HTIG === 'Yes' ? formatDate(doc.htigDateGiven) : '',
                    siteInvolved: doc.siteInvolved,
                    categoryOfExposure: doc.categoryOfExposure,
                    assessment: doc.assessmentDiagnosis,
                    terminateReason: doc.terminateReason || '',

                    // Treatment Plan
                    plan: Array.isArray(doc.plan) ? doc.plan.join(', ') : doc.plan,
                    tt_vaccine: normalizeOptionalBool(doc.tt_vaccine),
                    htig_vaccine: normalizeOptionalBool(doc.htig_vaccine),
                    pcec_pvrv_vaccine: normalizeOptionalBool(doc.pcec_pvrv_vaccine),
                    erig_vaccine: normalizeOptionalBool(doc.erig_vaccine),
                    hrig_vaccine: normalizeOptionalBool(doc.hrig_vaccine),
                    otherMed: doc.otherMed,
                    tt_units: doc.tt_units,
                    htig_units: doc.htig_units,
                    pcec_pvrv_units: doc.pcec_pvrv_units,
                    erig_units: doc.erig_units,
                    hrig_units: doc.hrig_units,
                    physician: doc.physicianName,

                    // Generated prescription asset (stored in dedicated Appwrite bucket)
                    // Field name in Appwrite schema: prescription_images (string fileId)
                    // Normalize defensively in case older records used array.
                    prescriptionImageId: typeof doc.prescription_images === 'string'
                        ? doc.prescription_images
                        : (Array.isArray(doc.prescription_images) ? (doc.prescription_images[0] || '') : ''),

                    // Wound Images
                    woundImages: normalizeFileIds(doc.woundImages),

                    // Footer
                    submissionId: doc.submissionID,
                    patientRecordId: doc.patientRecordId || doc.patientRecordID,
                    date: formatDate(doc.dateSubmitted),
                    time: formatTime(doc.dateSubmitted),
                };

                setPatientData(formattedData);
                setError(null);
            } catch (err) {
                console.error('Error fetching patient record:', err);
                setError(err.message || 'Failed to load patient record');
            } finally {
                setLoading(false);
            }
        };

        fetchPatientRecord();
    }, [documentId, patientUpdatedAt]);

    const formatName = (lastName, firstName, middleName, suffix) => {
        let name = '';
        if (lastName) name += capitalizeWords(lastName);

        const suffixText = String(suffix || '').trim();
        if (suffixText) {
            name += (name ? ' ' : '') + suffixText.toUpperCase();
        }

        if (firstName) name += (name ? ', ' : '') + capitalizeWords(firstName);
        if (middleName) name += (name ? ' ' : '') + capitalizeWords(middleName);
        return name;
    };

    const formatAddress = (purok, barangay, city) => {
        const parts = [];
        if (purok) parts.push(capitalizeWords(purok));
        if (barangay) parts.push(capitalizeWords(barangay));
        if (city) parts.push(capitalizeWords(city));
        return parts.join(', ');
    };

    const capitalizeWords = (str) => {
        if (!str) return '';
        return str.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
    };

    const getAnimalTypeDisplay = (animalType, animalTypeOther) => {
        if (!Array.isArray(animalType)) return animalType;
        if (animalType.includes('Others') && animalTypeOther) {
            return animalType.filter(a => a !== 'Others').concat([animalTypeOther]).join(', ');
        }
        return animalType.join(', ');
    };

    const formatDate = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    };

    const formatTime = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    };

    const displayYesOrDate = (yesNo, date) => {
        if (yesNo === 'Yes' && date) {
            return date;
        }
        return yesNo || '';
    };

    const displayUnits = (value) => {
        if (value === null || value === undefined) return '';
        return String(value);
    };

    const BooleanCheckbox = ({ value }) => {
        if (value === null || value === undefined) {
            return <View style={styles.boolCheckboxPlaceholder} />;
        }

        return (
            <View style={styles.boolCheckboxBox}>
                {value ? <Ionicons name="checkmark" size={14} color="#125872" /> : null}
            </View>
        );
    };

    const normalizeFileIds = (value) => {
        if (!value) return [];

        const toArray = (input) => {
            if (Array.isArray(input)) return input;
            if (typeof input === 'string') {
                const trimmed = input.trim();
                if (!trimmed) return [];
                try {
                    const parsed = JSON.parse(trimmed);
                    if (parsed && typeof parsed === 'object') {
                        return toArray(parsed);
                    }
                } catch (err) {
                    // Fall through to treat as literal string/CSV
                }

                if (trimmed.includes(',')) {
                    return trimmed.split(',').map(part => part.trim()).filter(Boolean);
                }
                return [trimmed];
            }
            if (typeof input === 'object') {
                return [input];
            }
            return [];
        };

        const flatList = toArray(value)
            .map(item => {
                if (!item) return null;
                if (typeof item === 'string') return item.trim() || null;
                if (typeof item === 'object') {
                    return item.fileId
                        || item.$id
                        || item.id
                        || item.url
                        || item.path
                        || null;
                }
                return null;
            })
            .filter(Boolean)
            .map(String);

        return Array.from(new Set(flatList));
    };

    const getImageUrl = (fileId) => {
        if (!fileId) return null;

        // If the value already looks like a full URL (legacy data), use it directly.
        if (typeof fileId === 'string' && /^https?:\/\//i.test(fileId.trim())) {
            return fileId.trim();
        }

        try {
            const bucketId = appwriteConfig.imagesBucketId;
            if (!bucketId) {
                console.error('Images bucket ID is not configured.');
                return null;
            }

            return `${APPWRITE_ENDPOINT}/storage/buckets/${bucketId}/files/${fileId}/view?project=${APPWRITE_PROJECT_ID}`;
        } catch (error) {
            console.error('Error generating image URL:', error);
            return null;
        }
    };

    const getPrescriptionUrl = (fileId) => {
        if (!fileId) {
            console.warn('getPrescriptionUrl: No fileId provided');
            return null;
        }
        try {
            const bucketId = appwriteConfig.prescriptionBucketId || appwriteConfig.imagesBucketId;
            if (!bucketId) {
                console.error('getPrescriptionUrl: No bucket ID configured');
                return null;
            }
            
            // Use the REST API directly for file view
            const url = `${APPWRITE_ENDPOINT}/storage/buckets/${bucketId}/files/${fileId}/view?project=${APPWRITE_PROJECT_ID}`;
            console.log('Prescription URL:', url);
            return url;
        } catch (error) {
            console.error('Error generating prescription image URL:', error);
            return null;
        }
    };

    // Convert file IDs to image URLs
    const getImageUrls = () => {
        if (!patientData || !patientData.woundImages) return [];
        const fileIds = patientData.woundImages || [];
        if (!Array.isArray(fileIds)) return [];
        
        return fileIds.map(fileId => getImageUrl(fileId)).filter(url => url !== null);
    };

    const clearImageLoadTimeout = (key) => {
        const timeoutId = imageLoadTimeoutsRef.current?.[key];
        if (timeoutId) {
            clearTimeout(timeoutId);
            delete imageLoadTimeoutsRef.current[key];
        }
    };

    const handleImageLoadStart = (key) => {
        if (!key) return;
        clearImageLoadTimeout(key);
        setLoadingImages(prev => ({ ...prev, [key]: true }));

        // Fallback: if the image load callbacks don't fire reliably on some devices,
        // don't leave the spinner stuck forever.
        imageLoadTimeoutsRef.current[key] = setTimeout(() => {
            setLoadingImages(prev => ({ ...prev, [key]: false }));
            clearImageLoadTimeout(key);
        }, 10000);
    };

    const handleImageLoadEnd = (key) => {
        if (!key) return;
        clearImageLoadTimeout(key);
        setLoadingImages(prev => ({ ...prev, [key]: false }));
    };

    useEffect(() => {
        return () => {
            // Cleanup any pending timeouts on unmount
            const timeouts = imageLoadTimeoutsRef.current || {};
            Object.keys(timeouts).forEach((key) => clearImageLoadTimeout(key));
        };
    }, []);

    useEffect(() => {
        return () => {
            if (terminateSuccessTimeoutRef.current) {
                clearTimeout(terminateSuccessTimeoutRef.current);
            }
        };
    }, []);

    const ImageWithLoader = ({ uri }) => (
        <TouchableOpacity 
            style={styles.imageContainer}
            onPress={() => setSelectedImage(uri)}
            activeOpacity={0.7}
        >
            {!!loadingImages[uri] && (
                <View style={styles.imageLoader}>
                    <ActivityIndicator size="large" color="#125872" />
                </View>
            )}
            <Image
                source={{ uri }}
                style={styles.woundImage}
                onLoadStart={() => handleImageLoadStart(uri)}
                onLoad={() => handleImageLoadEnd(uri)}
                onLoadEnd={() => handleImageLoadEnd(uri)}
                onError={() => handleImageLoadEnd(uri)}
            />
        </TouchableOpacity>
    );

    // Loading state
    if (loading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#125872" />
            </View>
        );
    }

    // Error state
    if (error) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }}>
                <Ionicons name="alert-circle" size={64} color="#EF4444" />
                <Text style={{ fontSize: 16, color: '#EF4444', marginTop: 16, textAlign: 'center' }}>{error}</Text>
            </View>
        );
    }

    // No data state
    if (!patientData) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ color: '#999', fontSize: 16 }}>No patient data available</Text>
            </View>
        );
    }

    const statusNormalized = String(patientData.status || '').toLowerCase();
    const isVerified = statusNormalized === 'verified';
    const isPending = statusNormalized === 'pending';
    const isPhysician = staffRole === 'physician';

    const shouldOpenPrescriptionScreen = isPhysician && isPending;
    const showTerminateButton = isPhysician && isPending;

    // Physicians should be able to see treatment details even for pending records.
    const canSeeTreatmentDetails = isVerified || isPhysician;
    const showActionButtons = isVerified || isPhysician;
    const woundImageUrls = getImageUrls();

    const getStatusColor = (status) => {
        switch (status) {
            case 'verified':
                return '#22C55E';
            case 'pending':
                return '#EAB308';
            case 'terminated':
                return '#EF4444';
            default:
                return '#22C55E';
        }
    };

    const getStatusLabel = (status) => {
        switch (status) {
        case 'verified':
            return 'verified';
        case 'pending':
            return 'pending';
        case 'terminated':
            return 'terminated';
        default:
            return 'verified';
        }
    };

    return (
        <>
        {/* RECORD STATUS - OVERLAY */}
        <View style={[
            styles.recordStatus,
            { 
              position: 'absolute',
              top: 0,
              right: 20,
              zIndex: 10,
              backgroundColor: 'transparent',
              paddingHorizontal: 0,
              paddingVertical: 0,
            }
        ]}>
            <View
                style={[
                    styles.statusBadge,
                    { backgroundColor: getStatusColor(patientData.status) },
                ]}>
                <Text style={styles.statusText}>{getStatusLabel(patientData.status)}</Text>
            </View>
        </View>

        {/* MAIN CONTENT - SCROLLABLE */}
        <ScrollView
            style={styles.mainContent}
            contentContainerStyle={[
                styles.mainContentContent,
                showActionButtons && { paddingBottom: 100 },
            ]}
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={16}>
            
                {/* PATIENT INFO */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>PATIENT INFORMATION</Text>
                    <View style={styles.infoContainer}>
                        <View style={styles.infoRowFull}>
                            <View style={styles.infoColumnFull}>
                                <Text style={styles.infoLabel}>Name :</Text>
                                <Text style={styles.infoValue}>{patientData.name}</Text>
                            </View>
                        </View>
                        <View style={styles.divider} />
                        
                        <View style={styles.infoRowQuarter}>
                            <View style={[styles.infoColumnQuarter, { flex: 0.8 }]}>
                                <Text style={styles.infoLabel}>Age :</Text>
                                <Text style={styles.infoValue}>{patientData.age}</Text>
                            </View>
                            <View style={[styles.infoColumnQuarter, { flex: 1.2 }]}>
                                <Text style={styles.infoLabel}>Date of Birth :</Text>
                                <Text style={styles.infoValue}>{patientData.dateOfBirth}</Text>
                            </View>
                            <View style={[styles.infoColumnQuarter, { flex: 0.8 }]}>
                                <Text style={styles.infoLabel}>Sex :</Text>
                                <Text style={styles.infoValue}>{patientData.sex}</Text>
                            </View>
                            <View style={[styles.infoColumnQuarter, { flex: 1.2 }]}>
                                <Text style={styles.infoLabel}>Civil Status :</Text>
                                <Text style={styles.infoValue}>{patientData.civilStatus}</Text>
                            </View>
                </View>
                <View style={styles.divider} />
                
                <View style={styles.infoRowFull}>
                    <View style={styles.infoColumnFull}>
                        <Text style={styles.infoLabel}>Address :</Text>
                        <Text style={styles.infoValue}>{patientData.address}</Text>
                    </View>
                </View>
                <View style={styles.divider} />

                <View style={styles.infoRowHalf}>
                    <View style={[styles.infoColumnHalf, { flex: 0.8 }]}>
                        <Text style={styles.infoLabel}>Contact No. :</Text>
                        <Text style={styles.infoValue}>{patientData.contactNo}</Text>
                    </View>
                    <View style={[styles.infoColumnHalf, { flex: 1.4 }]}>
                        <Text style={styles.infoLabel}>Date & Time of Consultation :</Text>
                        <Text style={styles.infoValue}>
                        {patientData.consultationDate}   {patientData.consultationTime}</Text>
                    </View>
                </View>
                <View style={styles.divider} />

                <View style={styles.infoRowFull}>
                    <View style={styles.infoColumnFull}>
                        <Text style={styles.infoLabel}>Interviewed & Referred By :</Text>
                        <Text style={styles.infoValue}>{patientData.interviewedBy}</Text>
                    </View>
                </View>
            </View>
            </View>

            {/* PERTINENT DATA */}
            <View style={styles.section}>
            <Text style={styles.sectionTitle}>PERTINENT DATA</Text>
            <View style={styles.infoContainer}>
                <View style={styles.infoRow}>
                <View style={styles.infoColumn}>
                    <Text style={styles.infoLabel}>Type of Biting Animal :</Text>
                    <Text style={styles.infoValue}>{patientData.bitingAnimal}</Text>
                </View>
                <View style={styles.infoColumn}>
                    <Text style={styles.infoLabel}>Date & Time of Exposure :</Text>
                    <Text style={styles.infoValue}>
                    {patientData.exposureDate}   {patientData.exposureTime}
                    </Text>
                </View>
                </View>
                <View style={styles.divider} />

                <View style={styles.infoRow}>
                <View style={styles.infoColumn}>
                    <Text style={styles.infoLabel}>Place of Incidence :</Text>
                    <Text style={styles.infoValue}>{patientData.placeOfIncidence}</Text>
                </View>
                </View>
                <View style={styles.divider} />

                <View style={styles.infoRow}>
                <View style={styles.infoColumn}>
                    <Text style={styles.infoLabel}>Status of Biting Animal :</Text>
                    <Text style={styles.infoValue}>{patientData.bitingAnimalStatus}</Text>
                </View>
                <View style={styles.infoColumn}>
                    <Text style={styles.infoLabel}>Type of Exposure :</Text>
                    <Text style={styles.infoValue}>{patientData.typeOfExposure}</Text>
                </View>
                </View>
                <View style={styles.divider} />

                <View style={styles.infoRow}>
                <View style={styles.infoColumn}>
                    <Text style={styles.infoLabel}>
                    Immunization Received by Biting Animal :
                    </Text>
                    <Text style={styles.infoValue}>
                    {displayYesOrDate(patientData.immunizationReceived, patientData.immunizationDate)}
                    </Text>
                </View>
                </View>
            </View>
            </View>

            {/* PERTINENT PAST MEDICAL HISTORY */}
            <View style={styles.section}>
            <Text style={styles.sectionTitle}>PERTINENT PAST MEDICAL HISTORY</Text>
            <View style={styles.infoContainer}>
                <View style={styles.infoRow}>
                <View style={styles.infoColumn}>
                    <Text style={styles.infoLabel}>Previous Immunization (Anti-Rabies) of Patient :</Text>
                    <Text style={styles.infoValue}>
                    {displayYesOrDate(patientData.previousImmunization, patientData.prevImmunizationDate)}
                    </Text>
                </View>
                </View>
                <View style={styles.divider} />

                <View style={styles.infoRow}>
                <View style={styles.infoColumn}>
                    <Text style={styles.infoLabel}>History of Allergies of Patient :</Text>
                    <Text style={styles.infoValue}>{patientData.allergies}</Text>
                </View>
                </View>
            </View>
            </View>

            {/* PERTINENT PHYSICAL EXAMINATION FINDINGS */}
            <View style={styles.section}>
            <Text style={styles.sectionTitle}>PERTINENT PHYSICAL EXAMINATION FINDINGS</Text>
            <View style={styles.infoContainer}>
                <View style={styles.infoRow}>
                <View style={styles.infoColumn}>
                    <Text style={styles.infoLabel}>Weight (kg) :</Text>
                    <Text style={styles.infoValue}>{patientData.weight}</Text>
                </View>
                <View style={styles.infoColumn}>
                    <Text style={styles.infoLabel}>Height (cm) :</Text>
                    <Text style={styles.infoValue}>{patientData.height}</Text>
                </View>
                <View style={styles.infoColumn}>
                    <Text style={styles.infoLabel}>BP :</Text>
                    <Text style={styles.infoValue}>{patientData.bp}</Text>
                </View>
                <View style={styles.infoColumn}>
                    <Text style={styles.infoLabel}>Temp (°C) :</Text>
                    <Text style={styles.infoValue}>{patientData.temp}</Text>
                </View>
                </View>
                <View style={styles.divider} />

                <View style={styles.infoRow}>
                <View style={styles.infoColumn}>
                    <Text style={styles.infoLabel}>Description of Wound :</Text>
                    <Text style={styles.infoValue}>{patientData.woundDescription}</Text>
                </View>
                </View>
                <View style={styles.divider} />

                <View style={styles.infoRow}>
                <View style={styles.infoColumn}>
                    <Text style={styles.infoLabel}>Spontaneous Bleeding :</Text>
                    <Text style={styles.infoValue}>{patientData.spontaneousBleeding}</Text>
                </View>
                <View style={styles.infoColumn}>
                    <Text style={styles.infoLabel}>Induced Bleeding :</Text>
                    <Text style={styles.infoValue}>{patientData.inducedBleeding}</Text>
                </View>
                </View>
                <View style={styles.divider} />

                <View style={styles.infoRow}>
                <View style={styles.infoColumn}>
                    <Text style={styles.infoLabel}>Local Wound Treatment :</Text>
                    <Text style={styles.infoValue}>{patientData.localWoundTreatment}</Text>
                </View>
                <View style={styles.infoColumn}>
                    <Text style={styles.infoLabel}>Washed w/ Water Only :</Text>
                    <Text style={styles.infoValue}>{patientData.washedWaterOnly}</Text>
                </View>
                </View>
                <View style={styles.divider} />

                <View style={styles.infoRow}>
                <View style={styles.infoColumn}>
                    <Text style={styles.infoLabel}>Washed w/ Soap & Water :</Text>
                    <Text style={styles.infoValue}>{patientData.washedSoapWater}</Text>
                </View>
                <View style={styles.infoColumn}>
                    <Text style={styles.infoLabel}>Tandok :</Text>
                    <Text style={styles.infoValue}>{patientData.tandok}</Text>
                </View>
                </View>
                <View style={styles.divider} />

                <View style={styles.infoRow}>
                <View style={styles.infoColumn}>
                    <Text style={styles.infoLabel}>Applied Garlic etc. :</Text>
                    <Text style={styles.infoValue}>{patientData.appliedGarlic}</Text>
                </View>
                <View style={styles.infoColumn}>
                    <Text style={styles.infoLabel}>Tetanus Immunization :</Text>
                    <Text style={styles.infoValue}>{displayYesOrDate(patientData.tetanusImmunization, patientData.tetanusDateGiven)}</Text>
                </View>
                </View>
                <View style={styles.divider} />

                <View style={styles.infoRow}>
                <View style={styles.infoColumn}>
                    <Text style={styles.infoLabel}>HTG :</Text>
                    <Text style={styles.infoValue}>{displayYesOrDate(patientData.htg, patientData.htigDateGiven)}</Text>
                </View>
                </View>
                <View style={styles.divider} />

                <View style={styles.infoRow}>
                <View style={styles.infoColumn}>
                    <Text style={styles.infoLabel}>Site Involved :</Text>
                    <Text style={styles.infoValue}>{patientData.siteInvolved}</Text>
                </View>
                </View>
                <View style={styles.divider} />
            </View>
            </View>

            {/* TREATMENT PLAN & VACCINES */}
            {canSeeTreatmentDetails ? (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>TREATMENT PLAN & VACCINES</Text>
                    <View style={styles.infoContainer}>
                        <View style={styles.infoRowHalf}>
                            <View style={[styles.infoColumnHalf, { flex: 1.1 }]}>
                                <Text style={styles.infoLabel}>Category of Exposure :</Text>
                                <Text style={styles.infoValue}>{patientData.categoryOfExposure}</Text>
                            </View>
                            <View style={[styles.infoColumnHalf, { flex: 0.9 }]}>
                                <Text style={styles.infoLabel}>Plan :</Text>
                                <Text style={styles.infoValue}>{patientData.plan}</Text>
                            </View>
                        </View>
                        <View style={styles.divider} />

                        <View style={styles.infoRow}>
                            <View style={styles.infoColumn}>
                                <Text style={styles.infoLabel}>Assessment :</Text>
                                <Text style={styles.infoValue}>{patientData.assessment}</Text>
                            </View>
                        </View>
                        <View style={styles.divider} />

                        <View style={styles.infoRowHalf}>
                            <View style={[styles.infoColumnHalf, { flex: 1.2 }]}>
                                <View style={styles.labelWithCheckbox}>
                                    <BooleanCheckbox value={patientData.tt_vaccine} />
                                    <Text style={[styles.infoLabel, styles.labelWithCheckboxText]}>TETANUS TOXOID (TT) :</Text>
                                </View>
                            </View>
                            <View style={[styles.infoColumnHalf, { flex: 0.8 }]}>
                                <Text style={styles.infoLabel}># of Units :</Text>
                                <Text style={styles.infoValue}>{displayUnits(patientData.tt_units)}</Text>
                            </View>
                        </View>

                        <View style={styles.infoRowHalf}>
                            <View style={[styles.infoColumnHalf, { flex: 1.2 }]}>
                                <View style={styles.labelWithCheckbox}>
                                    <BooleanCheckbox value={patientData.htig_vaccine} />
                                    <Text style={[styles.infoLabel, styles.labelWithCheckboxText]}>HTIG :</Text>
                                </View>
                            </View>
                            <View style={[styles.infoColumnHalf, { flex: 0.8 }]}>
                                <Text style={styles.infoLabel}># of Units :</Text>
                                <Text style={styles.infoValue}>{displayUnits(patientData.htig_units)}</Text>
                            </View>
                        </View>

                        <View style={styles.infoRowHalf}>
                            <View style={[styles.infoColumnHalf, { flex: 1.2 }]}>
                                <View style={styles.labelWithCheckbox}>
                                    <BooleanCheckbox value={patientData.pcec_pvrv_vaccine} />
                                    <Text style={[styles.infoLabel, styles.labelWithCheckboxText]}>PCEC/PVRV :</Text>
                                </View>
                            </View>
                            <View style={[styles.infoColumnHalf, { flex: 0.8 }]}>
                                <Text style={styles.infoLabel}># of Units :</Text>
                                <Text style={styles.infoValue}>{displayUnits(patientData.pcec_pvrv_units)}</Text>
                            </View>
                        </View>

                        <View style={styles.infoRowHalf}>
                            <View style={[styles.infoColumnHalf, { flex: 1.2 }]}>
                                <View style={styles.labelWithCheckbox}>
                                    <BooleanCheckbox value={patientData.erig_vaccine} />
                                    <Text style={[styles.infoLabel, styles.labelWithCheckboxText]}>ERIG :</Text>
                                </View>
                            </View>
                            <View style={[styles.infoColumnHalf, { flex: 0.8 }]}>
                                <Text style={styles.infoLabel}># of Units :</Text>
                                <Text style={styles.infoValue}>{displayUnits(patientData.erig_units)}</Text>
                            </View>
                        </View>

                        <View style={styles.infoRowHalf}>
                            <View style={[styles.infoColumnHalf, { flex: 1.2 }]}>
                                <View style={styles.labelWithCheckbox}>
                                    <BooleanCheckbox value={patientData.hrig_vaccine} />
                                    <Text style={[styles.infoLabel, styles.labelWithCheckboxText]}>HRIG :</Text>
                                </View>
                            </View>
                            <View style={[styles.infoColumnHalf, { flex: 0.8 }]}>
                                <Text style={styles.infoLabel}># of Units :</Text>
                                <Text style={styles.infoValue}>{displayUnits(patientData.hrig_units)}</Text>
                            </View>
                        </View>

                        <View style={styles.divider} />

                        <View style={styles.infoRowFull}>
                            <View style={styles.infoColumnFull}>
                                <Text style={styles.infoLabel}>OTHERS :</Text>
                                <Text style={styles.infoValue}>{patientData.otherMed}</Text>
                            </View>
                        </View>
                        <View style={styles.divider} />

                        <View style={styles.infoRow}>
                            <View style={styles.infoColumn}>
                                <Text style={styles.infoLabel}>Physician :</Text>
                                <Text style={styles.infoValue}>{patientData.physician}</Text>
                            </View>
                        </View>
                    </View>
                </View>
            ) : (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>TREATMENT PLAN & VACCINES</Text>
                    <View style={styles.noticeContainer}>
                        <Ionicons name="information-circle-outline" size={18} color="#125872" style={{ marginRight: 6 }} />
                        <Text style={styles.noticeText}>
                            Treatment details will be available once this record has been verified and a prescription has been sent back by the physician.
                        </Text>
                    </View>
                </View>
            )}

            {/* WOUND IMAGES */}
            <View style={styles.section}>
            <Text style={styles.sectionTitle}>WOUND IMAGES</Text>
            <View style={styles.imagesContainer}>
                {woundImageUrls.length > 0 ? (
                    <View style={styles.imageGridWrap}>
                        {woundImageUrls.map((uri) => (
                            <ImageWithLoader key={uri} uri={uri} />
                        ))}
                    </View>
                ) : (
                    <View style={styles.noImagesContainer}>
                        <Ionicons name="image-outline" size={48} color="#CCC" />
                        <Text style={styles.noImagesText}>No wound images available</Text>
                    </View>
                )}
            </View>
            </View>

            {/* FOOTER */}
            <View style={styles.footer}>
                <View style={styles.footerRow}>
                    <Text style={styles.footerLabel}>Submission ID :</Text>
                    <Text style={styles.footerValue}>{patientData.submissionId}</Text>
                </View>
                <View style={styles.footerRow}>
                    <Text style={styles.footerLabel}>Patient Record ID :</Text>
                    <Text style={styles.footerValue}>{patientData.patientRecordId || '—'}</Text>
                </View>
                <View style={styles.footerRow}>
                    <Text style={styles.footerLabel}>Date & Time Submitted :</Text>
                    <Text style={styles.footerValue}>{patientData.date}   {patientData.time}</Text>
                </View>
            </View>
        </ScrollView>

        {/* ========== ACTION BUTTONS ========== */}
        {showActionButtons && (
            <View style={styles.actionButtonsContainer}>
                <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => {
                        if (shouldOpenPrescriptionScreen) {
                            if (typeof onOpenPrescription === 'function') {
                                onOpenPrescription({
                                    patient,
                                    recordId: documentId,
                                    mode: 'edit',
                                });
                                return;
                            }

                            Alert.alert('Prescription', 'Navigation is not available.');
                            return;
                        }

                        setShowPrescriptionTemplate(true);
                    }}
                >
                    <Ionicons name="document-text-outline" size={20} color="#226B85" />
                    <Text style={styles.actionButtonText}>Prescription</Text>
                </TouchableOpacity>

                {showTerminateButton && (
                    <TouchableOpacity
                        style={[styles.actionButton, styles.terminateActionButton]}
                        onPress={openTerminatePrompt}
                    >
                        <Ionicons name="close-circle-outline" size={20} color="#B91C1C" />
                        <Text style={[styles.actionButtonText, styles.terminateActionButtonText]}>Terminate</Text>
                    </TouchableOpacity>
                )}

                {/* For physicians on pending records, only show Prescription as requested */}
                {!shouldOpenPrescriptionScreen && (
                    <TouchableOpacity
                        style={styles.actionButton}
                        onPress={handleDownloadRecord}
                    >
                        <Ionicons name="print" size={20} color="#226B85" />
                        <Text style={styles.actionButtonText}>Download Record</Text>
                    </TouchableOpacity>
                )}
            </View>
        )}

        {/* Full-screen wound image viewer */}
        <Modal
            visible={!!selectedImage}
            transparent
            animationType="fade"
            statusBarTranslucent
            onRequestClose={() => setSelectedImage(null)}
        >
            <View style={styles.imageModalContainer}>
                <TouchableOpacity
                    style={styles.imageModalClose}
                    onPress={() => setSelectedImage(null)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                    <Ionicons name="close" size={28} color="#FFFFFF" />
                </TouchableOpacity>
                {!!selectedImage && (
                    <Image
                        source={{ uri: selectedImage }}
                        style={styles.imageModalImage}
                        resizeMode="contain"
                    />
                )}
            </View>
        </Modal>

        {/* Prescription modal (shows stored prescription image only) */}
        {showActionButtons && !shouldOpenPrescriptionScreen && (
            <Modal
                visible={showPrescriptionTemplate}
                transparent
                animationType="fade"
                onRequestClose={() => setShowPrescriptionTemplate(false)}
            >
                <View style={styles.rxOverlay}>
                    <View style={styles.rxContainer}>
                        {patientData?.prescriptionImageId ? (
                            <ScrollView
                                style={styles.rxScroll}
                                contentContainerStyle={styles.rxScrollContent}
                                showsVerticalScrollIndicator={false}
                            >
                                <Image
                                    source={{ uri: getPrescriptionUrl(patientData.prescriptionImageId) }}
                                    style={styles.rxImage}
                                    resizeMode="contain"
                                />
                                <Text style={styles.rxHintText}>
                                    This is the official prescription image sent by the City Health Office.
                                </Text>
                            </ScrollView>
                        ) : (
                            <View style={[styles.rxScroll, { paddingHorizontal: 20, paddingVertical: 22 }]}
                            >
                                <Text style={[styles.rxSectionTitle, { textAlign: 'center', marginBottom: 8 }]}>No Prescription Yet</Text>
                                <Text style={[styles.rxHintText, { marginTop: 0 }]}
                                >
                                    {isPhysician
                                        ? 'No prescription image is attached yet. Use the Prescription screen to generate and attach one.'
                                        : 'The prescription image hasn’t been uploaded by the staff yet. Please check again later.'}
                                </Text>
                            </View>
                        )}

                        <TouchableOpacity
                            style={styles.rxCloseButton}
                            onPress={() => setShowPrescriptionTemplate(false)}
                        >
                            <Text style={styles.rxCloseButtonText}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        )}

        <Modal
            visible={showTerminateModal}
            transparent
            animationType="fade"
            onRequestClose={closeTerminatePrompt}
        >
            <View style={styles.terminateOverlay}>
                <View style={styles.terminateContainer}>
                    <Text style={styles.terminateTitle}>Reason for terminating</Text>
                    <Text style={styles.terminateSubtitle}>Provide a short note so the staff knows why this record is closed.</Text>
                    <TextInput
                        style={[styles.terminateInput, terminateReasonError ? styles.terminateInputError : null]}
                        placeholder="Type termination reason"
                        placeholderTextColor="#94A3B8"
                        multiline
                        value={terminateReason}
                        editable={!isTerminating}
                        onChangeText={handleChangeTerminateReason}
                    />
                    {terminateReasonError ? (
                        <Text style={styles.terminateErrorText}>{terminateReasonError}</Text>
                    ) : null}

                    <View style={styles.terminateActionsRow}>
                        <TouchableOpacity
                            style={[styles.terminateActionButtonBase, styles.terminateCancelButton]}
                            onPress={closeTerminatePrompt}
                            disabled={isTerminating}
                        >
                            <Text style={styles.terminateCancelText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[
                                styles.terminateActionButtonBase,
                                styles.terminateSubmitButton,
                                isTerminating && styles.terminateSubmitButtonDisabled,
                            ]}
                            onPress={handleConfirmTerminate}
                            disabled={isTerminating}
                        >
                            {isTerminating ? (
                                <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                                <Text style={styles.terminateSubmitText}>Terminate</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>

        <Modal
            visible={showTerminateSuccess}
            transparent
            animationType="fade"
            onRequestClose={() => setShowTerminateSuccess(false)}
        >
            <View style={styles.terminateSuccessOverlay} pointerEvents="none">
                <View style={styles.terminateSuccessCard}>
                    <Ionicons name="checkmark-circle" size={40} color="#22C55E" />
                    <Text style={styles.terminateSuccessText}>Patient record successfully terminated</Text>
                </View>
            </View>
        </Modal>
        </>
    );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#125872',
  },
    rxImage: {
        width: '100%',
        aspectRatio: 0.7,
        marginBottom: 16,
    },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#125872',
    marginTop: 38,
  },
  headerText: {
    fontSize: 25,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'Poppins',
    flex: 1,
    marginLeft: 16,
    textAlign: 'center',
  },
  recordStatus: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#125872',
    alignItems: 'flex-end',
    position: 'absolute',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 30,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    fontFamily: 'Poppins',
    textTransform: 'capitalize',
  },
    mainContent: {
        flex: 1,
        backgroundColor: 'transparent',
        paddingHorizontal: 20,
        paddingBottom: 20,
        marginTop: -12,
    },
    mainContentContent: {
        paddingTop: 4,
    },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#125872',
    fontFamily: 'Poppins',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  infoContainer: {
    paddingHorizontal: 0,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 12,
  },
  infoRowFull: {
    marginBottom: 12,
  },
  infoRowHalf: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 20,
  },
  infoRowQuarter: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 12,
    justifyContent: 'space-between',
  },
  infoColumn: {
    flex: 1,
  },
  infoColumnFull: {
    flex: 1,
  },
  infoColumnHalf: {
    flex: 1,
  },
  infoColumnQuarter: {
    minWidth: 0,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '400',
    color: '#999999',
    fontFamily: 'Poppins',
    marginBottom: -1,
    flexShrink: 0,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000000',
    fontFamily: 'Poppins',
  },
    boolValueRow: {
        marginTop: 2,
    },
    labelWithCheckbox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    labelWithCheckboxText: {
        flex: 1,
        flexShrink: 1,
    },
    boolCheckboxBox: {
        width: 18,
        height: 18,
        borderRadius: 4,
        borderWidth: 2,
        borderColor: '#125872',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFFFFF',
    },
    boolCheckboxPlaceholder: {
        width: 18,
        height: 18,
    },
    noticeContainer: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingVertical: 10,
        paddingHorizontal: 12,
        backgroundColor: '#F0F8FF',
        borderRadius: 12,
        borderLeftWidth: 4,
        borderLeftColor: '#125872',
        marginTop: 4,
        marginBottom: 16,
    },
    noticeText: {
        flex: 1,
        fontSize: 12,
        lineHeight: 18,
        color: '#125872',
        fontFamily: 'Poppins',
    },
  divider: {
    height: 1,
    backgroundColor: '#E5E5E5',
    marginTop: -9,
    marginBottom: 12,
  },
  imagesContainer: {
    alignItems: 'center',
  },
    imageGridWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 12,
    },
  imageWrapper: {
    width: 100,
    height: 100,
  },
  imageContainer: {
    width: 100,
    height: 100,
    borderRadius: 8,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
        margin: 6,
  },
  imageLoader: {
    position: 'absolute',
    zIndex: 10,
    justifyContent: 'center',
    alignItems: 'center',
    width: 100,
    height: 100,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  woundImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D0D0D0',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#E5E5E5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D0D0D0',
  },
  noImagesContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  noImagesText: {
    color: '#999',
    fontSize: 14,
    marginTop: 12,
    fontFamily: 'Poppins',
  },
  footer: {
    paddingTop: 12,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
    marginTop: 20,
  },
  footerRow: {
    flexDirection: 'row',
    marginBottom: 4,
    alignItems: 'center',
  },
  footerLabel: {
    fontSize: 12,
    fontWeight: '400',
    color: '#666666',
    fontFamily: 'Poppins',
    marginRight: 8,
  },
  footerValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#125872',
    fontFamily: 'Poppins',
  },
  imageModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#125872',
  },
  imageModalTitle: {
    fontSize: 25,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'Poppins',
    flex: 1,
    marginLeft: 16,
    textAlign: 'center',
  },
  imageModalContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
    imageModalClose: {
        position: 'absolute',
        top: Platform.OS === 'android' ? 40 : 60,
        right: 16,
        zIndex: 20,
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(0,0,0,0.35)',
        justifyContent: 'center',
        alignItems: 'center',
    },
  imageModalImage: {
    width: '100%',
    height: '100%',
  },
  actionButtonsContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: '#125872',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginHorizontal: 5,
    gap: 8,
  },
  actionButtonText: {
    color: '#125872',
    fontSize: 13,
    fontWeight: 'bold',
  },
    terminateActionButton: {
        backgroundColor: '#FEE2E2',
        borderWidth: 1,
        borderColor: '#F87171',
    },
    terminateActionButtonText: {
        color: '#B91C1C',
    },
    // Prescription template modal styles
    rxOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 18,
        paddingVertical: 32,
    },
    rxContainer: {
        width: '100%',
        maxWidth: 420,
        maxHeight: '90%',
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 12,
    },
    rxHeaderBar: {
        backgroundColor: '#125872',
        paddingVertical: 10,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
    },
    rxHeaderLeft: {
        width: 52,
        height: 52,
        borderRadius: 26,
        overflow: 'hidden',
        marginRight: 10,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#FFFFFF15',
    },
    rxLogo: {
        width: 46,
        height: 46,
    },
    rxHeaderCenter: {
        flex: 1,
    },
    rxHeaderTitle: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
    },
    rxHeaderSubtitle: {
        color: '#CDE8F2',
        fontSize: 12,
        marginTop: 2,
        fontWeight: '500',
    },
    rxHeaderSubline: {
        color: '#E5F3FF',
        fontSize: 10,
        marginTop: 1,
    },
    rxScroll: {
        backgroundColor: '#FFFFFF',
    },
    rxScrollContent: {
        paddingHorizontal: 20,
        paddingTop: 18,
        paddingBottom: 22,
    },
    rxRowBetween: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    rxLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#4B5563',
        marginRight: 6,
    },
    rxLine: {
        flex: 1,
        fontSize: 13,
        fontWeight: '600',
        color: '#111827',
        textAlign: 'right',
    },
    rxDivider: {
        height: 1,
        backgroundColor: '#E5E7EB',
        marginVertical: 12,
    },
    rxSection: {
        marginBottom: 12,
    },
    rxSectionTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: '#125872',
        marginBottom: 4,
    },
    rxItem: {
        fontSize: 12,
        color: '#111827',
        marginBottom: 2,
    },
    rxItemLabel: {
        fontWeight: '600',
    },
    rxFooterBlock: {
        marginTop: 14,
        alignItems: 'flex-end',
    },
    rxSignatureBlock: {
        alignItems: 'center',
    },
    rxSignatureLine: {
        fontSize: 12,
        color: '#4B5563',
        marginBottom: 2,
    },
    rxSignatureName: {
        fontSize: 13,
        fontWeight: '700',
        color: '#111827',
    },
    rxSignatureNote: {
        fontSize: 10,
        color: '#6B7280',
    },
    rxHintText: {
        marginTop: 8,
        fontSize: 11,
        color: '#4B5563',
        textAlign: 'center',
        marginHorizontal: 6,
    },
    rxCloseButton: {
        paddingVertical: 10,
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: '#E5E5E5',
    },
    rxCloseButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#125872',
    },
    terminateOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    terminateContainer: {
        width: '100%',
        maxWidth: 420,
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 12,
    },
    terminateTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111827',
        marginBottom: 6,
        fontFamily: 'Poppins',
    },
    terminateSubtitle: {
        fontSize: 12,
        color: '#475569',
        marginBottom: 14,
        fontFamily: 'Poppins',
    },
    terminateInput: {
        minHeight: 100,
        borderWidth: 1,
        borderColor: '#CBD5F5',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        backgroundColor: '#F8FAFC',
        color: '#0F172A',
        fontSize: 13,
        textAlignVertical: 'top',
        fontFamily: 'Poppins',
    },
    terminateInputError: {
        borderColor: '#EF4444',
    },
    terminateErrorText: {
        color: '#EF4444',
        fontSize: 12,
        marginTop: 6,
        fontFamily: 'Poppins',
    },
    terminateActionsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
        marginTop: 18,
    },
    terminateActionButtonBase: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    terminateCancelButton: {
        backgroundColor: '#F1F5F9',
        borderWidth: 1,
        borderColor: '#CBD5F5',
    },
    terminateSubmitButton: {
        backgroundColor: '#DC2626',
    },
    terminateSubmitButtonDisabled: {
        opacity: 0.7,
    },
    terminateCancelText: {
        color: '#0F172A',
        fontSize: 13,
        fontWeight: '600',
        fontFamily: 'Poppins',
    },
    terminateSubmitText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '700',
        fontFamily: 'Poppins',
    },
    terminateSuccessOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        justifyContent: 'flex-end',
        padding: 24,
    },
    terminateSuccessCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        paddingVertical: 16,
        paddingHorizontal: 20,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 6,
        elevation: 10,
    },
    terminateSuccessText: {
        color: '#14532D',
        fontSize: 14,
        fontWeight: '600',
        flex: 1,
        fontFamily: 'Poppins',
    },
  qrModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  qrModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 15,
  },
  qrCloseButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
  },
  qrTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#125872',
    marginTop: 20,
    marginBottom: 8,
    fontFamily: 'Poppins',
  },
  qrSubtitle: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    fontStyle: 'italic',
    fontFamily: 'Poppins',
    lineHeight: 18,
  },
  qrCodeContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  qrCodeBox: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#125872',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  qrCodeImage: {
    width: 280,
    height: 280,
  },
  qrInfoBox: {
    backgroundColor: '#F0F8FF',
    padding: 12,
    borderRadius: 12,
    width: '100%',
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#125872',
  },
  qrInfoLabel: {
    fontSize: 11,
    color: '#125872',
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  qrInfoValue: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#125872',
    fontFamily: 'Poppins',
  },
  qrDownloadButton: {
    flexDirection: 'row',
    backgroundColor: '#125872',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  qrDownloadButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 8,
    fontFamily: 'Poppins',
  },
  qrDoneButton: {
    backgroundColor: '#E0E0E0',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  qrDoneButtonText: {
    color: '#333',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Poppins',
  },
});

export default PatientRecordContent;