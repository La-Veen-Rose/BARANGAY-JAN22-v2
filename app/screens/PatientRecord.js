import React, { useState, useEffect } from 'react';
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
    Modal } 
from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { databases, storage, appwriteConfig } from './appwriteConfig';

function PatientRecord({ navigation, route }) {
    const [patientData, setPatientData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [loadingImages, setLoadingImages] = useState({});
    const [selectedImage, setSelectedImage] = useState(null);
    const [showQRModal, setShowQRModal] = useState(false);
    const [showPrescriptionTemplate, setShowPrescriptionTemplate] = useState(false);
    const patient = route?.params?.patient;
    const documentId = patient?.id;

    const handleGenerateQR = () => {
        Alert.alert('Feature Coming Soon', 'Generate QR feature will be implemented soon');
    };

    const handlePrintRecord = () => {
        Alert.alert('Feature Coming Soon', 'Print PDF feature will be implemented soon');
    };

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

                // Format data for display
                const formattedData = {
                    // Patient Info
                    status: doc.status || 'pending',
                    name: formatName(doc.lastName, doc.firstName, doc.middleName),
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

                    // Treatment Plan
                    plan: Array.isArray(doc.plan) ? doc.plan.join(', ') : doc.plan,
                    passiveVaccine: Array.isArray(doc.passiveVaccine) ? doc.passiveVaccine.join(', ') : doc.passiveVaccine,
                    noOfUnits: doc.passiveVaccineUnits,
                    activeVaccine: Array.isArray(doc.activeVaccine) ? doc.activeVaccine.join(', ') : doc.activeVaccine,
                    antibiotic: doc.antibioticsText,
                    analgesic: doc.antiInflammatoryMedication,
                    physician: doc.physicianName,

                    // Generated prescription asset (stored in dedicated Appwrite bucket)
                    // Field name in Appwrite schema: prescriptionField (string)
                    prescriptionField: doc.prescriptionField || null,

                    // Wound Images
                    woundImages: doc.woundImages || [],

                    // Footer
                    submissionId: doc.submissionID,
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
    }, [documentId]);

    const formatName = (lastName, firstName, middleName) => {
        let name = '';
        if (lastName) name += capitalizeWords(lastName);
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

    const getImageUrl = (fileId) => {
        if (!fileId) return null;
        try {
            // fileId is already stored as a string ID
            return storage.getFileView(appwriteConfig.imagesBucketId, fileId).toString();
        } catch (error) {
            console.error('Error generating image URL:', error);
            return null;
        }
    };

    const getPrescriptionUrl = (fileId) => {
        if (!fileId) return null;
        try {
            const bucketId = appwriteConfig.prescriptionBucketId || appwriteConfig.imagesBucketId;
            return storage.getFileView(bucketId, fileId).toString();
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

    const handleImageLoadStart = (index) => {
        setLoadingImages(prev => ({ ...prev, [index]: true }));
    };

    const handleImageLoadEnd = (index) => {
        setLoadingImages(prev => ({ ...prev, [index]: false }));
    };

    const ImageWithLoader = ({ uri, index }) => (
        <TouchableOpacity 
            style={styles.imageContainer}
            onPress={() => setSelectedImage(uri)}
            activeOpacity={0.7}
        >
            {loadingImages[index] && (
                <View style={styles.imageLoader}>
                    <ActivityIndicator size="large" color="#125872" />
                </View>
            )}
            <Image
                source={{ uri }}
                style={styles.woundImage}
                onLoadStart={() => handleImageLoadStart(index)}
                onLoadEnd={() => handleImageLoadEnd(index)}
                onError={() => handleImageLoadEnd(index)}
            />
        </TouchableOpacity>
    );

    // Loading state
    if (loading) {
        return (
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation?.goBack()}>
                        <Ionicons name="arrow-back-circle-outline" size={32} color={styles.headerText.color} />
                    </TouchableOpacity>
                    <Text style={styles.headerText}>PATIENT RECORD</Text>
                    <View style={{ width: 32 }} />
                </View>
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" color="#125872" />
                </View>
            </SafeAreaView>
        );
    }

    // Error state
    if (error) {
        return (
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation?.goBack()}>
                        <Ionicons name="arrow-back-circle-outline" size={32} color={styles.headerText.color} />
                    </TouchableOpacity>
                    <Text style={styles.headerText}>PATIENT RECORD</Text>
                    <View style={{ width: 32 }} />
                </View>
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }}>
                    <Ionicons name="alert-circle" size={64} color="#EF4444" />
                    <Text style={{ fontSize: 16, color: '#EF4444', marginTop: 16, textAlign: 'center' }}>{error}</Text>
                    <TouchableOpacity style={{ marginTop: 20 }} onPress={() => navigation?.goBack()}>
                        <Text style={{ color: '#125872', fontSize: 16, fontWeight: '600' }}>Go Back</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    // No data state
    if (!patientData) {
        return (
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation?.goBack()}>
                        <Ionicons name="arrow-back-circle-outline" size={32} color={styles.headerText.color} />
                    </TouchableOpacity>
                    <Text style={styles.headerText}>PATIENT RECORD</Text>
                    <View style={{ width: 32 }} />
                </View>
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ color: '#999', fontSize: 16 }}>No patient data available</Text>
                </View>
            </SafeAreaView>
        );
    }

    const isVerified = (patientData.status || '').toLowerCase() === 'verified';

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

    // Image Modal View
    if (selectedImage) {
        return (
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.imageModalHeader}>
                    <TouchableOpacity onPress={() => setSelectedImage(null)}>
                        <Ionicons name="arrow-back-circle-outline" size={32} color="#FFFFFF" />
                    </TouchableOpacity>
                    <Text style={styles.imageModalTitle}>WOUND IMAGE</Text>
                    <View style={{ width: 32 }} />
                </View>
                <View style={styles.imageModalContainer}>
                    <Image
                        source={{ uri: selectedImage }}
                        style={styles.imageModalImage}
                        resizeMode="contain"
                    />
                </View>
            </SafeAreaView>
        );
    }
    
    return (
    <SafeAreaView style={styles.safeArea}> 
    
        {/* HEADER */}
        <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation?.goBack()}>
                <Ionicons name="arrow-back-circle-outline" size={32} color={styles.headerText.color} />
            </TouchableOpacity>
            <Text style={styles.headerText}>PATIENT RECORD</Text>
            <View style={{ width: 32 }} />
        </View>

        {/* RECORD STATUS - OVERLAY */}
        <View style={[
            styles.recordStatus,
            { 
              position: 'absolute',
              top: 140,
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
                contentContainerStyle={[isVerified && { paddingBottom: 100 }]}
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

                {isVerified ? (
                    <>
                        <View style={styles.infoRow}>
                            <View style={styles.infoColumn}>
                                <Text style={styles.infoLabel}>CATEGORY OF EXPOSURE</Text>
                                <Text style={styles.infoValue}>{patientData.categoryOfExposure}</Text>
                            </View>
                        </View>
                        <View style={styles.divider} />

                        <View style={styles.infoRow}>
                            <View style={styles.infoColumn}>
                                <Text style={styles.infoLabel}>Assessment :</Text>
                                <Text style={styles.infoValue}>{patientData.assessment}</Text>
                            </View>
                        </View>
                    </>
                ) : (
                    <View style={styles.noticeContainer}>
                        <Ionicons name="information-circle-outline" size={18} color="#125872" style={{ marginRight: 6 }} />
                        <Text style={styles.noticeText}>
                            Treatment details from Category of Exposure down to Physician will be available once this record has been verified and a prescription has been sent back by the staff.
                        </Text>
                    </View>
                )}
            </View>
            </View>

            {/* TREATMENT PLAN & VACCINES */}
            {isVerified && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>TREATMENT PLAN & VACCINES</Text>
                    <View style={styles.infoContainer}>
                        <View style={styles.infoRow}>
                            <View style={[styles.infoColumn, { flex: .94 }]}>
                                <Text style={styles.infoLabel}>Plan :</Text>
                                <Text style={styles.infoValue}>{patientData.plan}</Text>
                            </View>
                            <View style={[styles.infoColumn, { flex: 1 }]}>
                                <Text style={styles.infoLabel}>Passive Vaccine :</Text>
                                <Text style={styles.infoValue}>{patientData.passiveVaccine}</Text>
                            </View>
                            <View style={[styles.infoColumn, { flex: 1 }]}>
                                <Text style={styles.infoLabel}>No. of Units</Text>
                                <Text style={styles.infoValue}>{patientData.noOfUnits}</Text>
                            </View>
                        </View>
                        <View style={styles.divider} />

                        <View style={styles.infoRow}>
                            <View style={[styles.infoColumn, { flex: 0.75 }]}>
                                <Text style={styles.infoLabel}>Active Vaccine :</Text>
                                <Text style={styles.infoValue}>{patientData.activeVaccine}</Text>
                            </View>
                            <View style={[styles.infoColumn, { flex: 0.75 }]}>
                                <Text style={styles.infoLabel}>Antibiotic :</Text>
                                <Text style={styles.infoValue}>{patientData.antibiotic}</Text>
                            </View>
                            <View style={[styles.infoColumn, { flex: .8 }]}>
                                <Text style={styles.infoLabel}>Analgesic/ Anti-inflammatory :</Text>
                                <Text style={styles.infoValue}>{patientData.analgesic}</Text>
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
            )}

            {/* WOUND IMAGES */}
            <View style={styles.section}>
            <Text style={styles.sectionTitle}>WOUND IMAGES</Text>
            <View style={styles.imagesContainer}>
                {patientData.woundImages && patientData.woundImages.length > 0 ? (
                    <>
                        <View style={styles.imageGrid}>
                            {getImageUrls().slice(0, 3).map((uri, index) => (
                                <ImageWithLoader key={index} uri={uri} index={index} />
                            ))}
                        </View>

                        {getImageUrls().length > 3 && (
                            <View style={styles.imageGridBottom}>
                                {getImageUrls().slice(3).map((uri, index) => (
                                    <ImageWithLoader key={index} uri={uri} index={index + 3} />
                                ))}
                            </View>
                        )}
                    </>
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
                    <Text style={styles.footerLabel}>Date & Time Submitted :</Text>
                    <Text style={styles.footerValue}>{patientData.date}   {patientData.time}</Text>
                </View>
            </View>
        </ScrollView>

        {/* ========== VERIFIED ACTION BUTTONS ========== */}
        {isVerified && (
            <View style={styles.actionButtonsContainer}>
                <TouchableOpacity 
                    style={styles.actionButton}
                    onPress={handleGenerateQR}
                >
                    <Ionicons name="qr-code" size={20} color="#226B85" />
                    <Text style={styles.actionButtonText}>Generate QR</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                    style={styles.actionButton}
                    onPress={handlePrintRecord}
                >
                    <Ionicons name="print" size={20} color="#226B85" />
                    <Text style={styles.actionButtonText}>Print Record</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                    style={styles.actionButton}
                    onPress={() => setShowPrescriptionTemplate(true)}
                >
                    <Ionicons name="document-text" size={20} color="#226B85" />
                    <Text style={styles.actionButtonText}>Prescription</Text>
                </TouchableOpacity>
            </View>
        )}

        {/* Prescription template modal for patient photo or stored image */}
        {isVerified && (
            <Modal
                visible={showPrescriptionTemplate}
                transparent
                animationType="fade"
                onRequestClose={() => setShowPrescriptionTemplate(false)}
            >
                <View style={styles.rxOverlay}>
                    <View style={styles.rxContainer}>
                        {patientData.prescriptionField ? (
                            <ScrollView
                                style={styles.rxScroll}
                                contentContainerStyle={styles.rxScrollContent}
                                showsVerticalScrollIndicator={false}
                            >
                                <Image
                                    source={{ uri: getPrescriptionUrl(patientData.prescriptionField) }}
                                    style={styles.rxImage}
                                    resizeMode="contain"
                                />
                                <Text style={styles.rxHintText}>
                                    You may show this screen to the patient so they can take a photo of the official prescription image generated by the City Health Office.
                                </Text>
                            </ScrollView>
                        ) : (
                            <ScrollView
                                style={styles.rxScroll}
                                contentContainerStyle={styles.rxScrollContent}
                                showsVerticalScrollIndicator={false}
                            >
                                <View style={styles.rxHeaderBar}>
                                    <Text style={styles.rxHeaderTitle}>CITY HEALTH OFFICE</Text>
                                    <Text style={styles.rxHeaderSubtitle}>ANIMAL BITE TREATMENT CENTER</Text>
                                </View>

                                <View style={styles.rxRowBetween}>
                                    <Text style={styles.rxLabel}>Name:</Text>
                                    <Text style={styles.rxLine}>{patientData.name}</Text>
                                </View>
                                <View style={styles.rxRowBetween}>
                                    <Text style={styles.rxLabel}>Address:</Text>
                                    <Text style={styles.rxLine}>{patientData.address}</Text>
                                </View>
                                <View style={styles.rxRowBetween}>
                                    <Text style={styles.rxLabel}>Age / Sex:</Text>
                                    <Text style={styles.rxLine}>{patientData.age} / {patientData.sex}</Text>
                                </View>
                                <View style={styles.rxRowBetween}>
                                    <Text style={styles.rxLabel}>Rx No.:</Text>
                                    <Text style={styles.rxLine}>{patientData.submissionId}</Text>
                                </View>

                                <View style={styles.rxDivider} />

                                <View style={styles.rxSection}>
                                    <Text style={styles.rxSectionTitle}>Exposure & Assessment</Text>
                                    <Text style={styles.rxItem}><Text style={styles.rxItemLabel}>Category of Exposure: </Text>{patientData.categoryOfExposure || 'N/A'}</Text>
                                    <Text style={styles.rxItem}><Text style={styles.rxItemLabel}>Assessment: </Text>{patientData.assessment || 'N/A'}</Text>
                                </View>

                                <View style={styles.rxSection}>
                                    <Text style={styles.rxSectionTitle}>Vaccination Plan</Text>
                                    <Text style={styles.rxItem}><Text style={styles.rxItemLabel}>Plan: </Text>{patientData.plan || 'N/A'}</Text>
                                    <Text style={styles.rxItem}><Text style={styles.rxItemLabel}>Passive Vaccine: </Text>{patientData.passiveVaccine || 'N/A'}</Text>
                                    <Text style={styles.rxItem}><Text style={styles.rxItemLabel}>No. of Units: </Text>{patientData.noOfUnits || 'N/A'}</Text>
                                    <Text style={styles.rxItem}><Text style={styles.rxItemLabel}>Active Vaccine: </Text>{patientData.activeVaccine || 'N/A'}</Text>
                                </View>

                                <View style={styles.rxSection}>
                                    <Text style={styles.rxSectionTitle}>Medications</Text>
                                    <Text style={styles.rxItem}><Text style={styles.rxItemLabel}>Antibiotic: </Text>{patientData.antibiotic || 'N/A'}</Text>
                                    <Text style={styles.rxItem}><Text style={styles.rxItemLabel}>Analgesic / Anti-inflammatory: </Text>{patientData.analgesic || 'N/A'}</Text>
                                </View>

                                <View style={styles.rxFooterBlock}>
                                    <View style={styles.rxSignatureBlock}>
                                        <Text style={styles.rxSignatureLine}>______________________________</Text>
                                        <Text style={styles.rxSignatureName}>{patientData.physician || 'Physician'}</Text>
                                        <Text style={styles.rxSignatureNote}>Digitally authorized prescription</Text>
                                    </View>
                                </View>

                                <Text style={styles.rxHintText}>
                                    You may show this screen to the patient so they can take a photo of the prescription for their reference.
                                </Text>
                            </ScrollView>
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
    </SafeAreaView>
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
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
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
  imageGrid: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 12,
    marginHorizontal: 12,
  },
  imageGridBottom: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginHorizontal: 12,
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
    marginRight: 8,
    marginBottom: 8,
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
    // Prescription template modal styles
    rxOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    rxContainer: {
        width: '100%',
        maxWidth: 420,
        maxHeight: '90%',
        backgroundColor: '#FFFFFF',
        borderRadius: 18,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 10,
    },
    rxHeaderBar: {
        backgroundColor: '#125872',
        paddingVertical: 10,
        paddingHorizontal: 16,
        alignItems: 'center',
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
    },
    rxScroll: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    rxScrollContent: {
        paddingHorizontal: 18,
        paddingVertical: 16,
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
        color: '#555',
        marginRight: 6,
    },
    rxLine: {
        flex: 1,
        fontSize: 13,
        fontWeight: '600',
        color: '#111',
        textAlign: 'right',
    },
    rxDivider: {
        height: 1,
        backgroundColor: '#E5E5E5',
        marginVertical: 10,
    },
    rxSection: {
        marginBottom: 10,
    },
    rxSectionTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: '#125872',
        marginBottom: 4,
    },
    rxItem: {
        fontSize: 12,
        color: '#222',
        marginBottom: 2,
    },
    rxItemLabel: {
        fontWeight: '600',
    },
    rxFooterBlock: {
        marginTop: 12,
        alignItems: 'flex-end',
    },
    rxSignatureBlock: {
        alignItems: 'center',
    },
    rxSignatureLine: {
        fontSize: 12,
        color: '#333',
        marginBottom: 2,
    },
    rxSignatureName: {
        fontSize: 13,
        fontWeight: '700',
        color: '#111',
    },
    rxSignatureNote: {
        fontSize: 10,
        color: '#666',
    },
    rxHintText: {
        marginTop: 10,
        fontSize: 11,
        color: '#666',
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

export default PatientRecord;