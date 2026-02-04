import React, { useState, useCallback, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Alert,
    ActivityIndicator,
    TouchableOpacity,
    Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { databases, account, appwriteConfig, ID, Query } from './appwriteConfig';
import { getCurrentStaffProfile, STAFF_ROLE } from './staffProfileService';

// Image Upload Service
import { uploadMultipleImages, deleteUploadedFiles, checkNetwork } from './imageUploadService';

// Submission Service
import { getSubmissionID } from './submissionService';

// Sections
import Section1 from './Section1';
import Section2 from './Section2';
import Section3 from './Section3_clean';
import Section4 from './Section4';
import Section6 from './Section6';
import Section7 from './Section7';
import SuccessScreen from './SuccessScreen';

const TAB_BAR_HEIGHT = 85;
// Patient-facing flow: 1) Info, 2) Exposure, 3) History, 4) Physical exam (without category),
// 5) Visual notes (images), 6) Review & submit.
const TOTAL_SECTIONS = 6;
const NAVIGATION_BAR_HEIGHT = 70;

const initialFormData = {
    // Section 1
    lastName: '', firstName: '', middleName: '', hasSuffix: false, age: '', dateOfBirth: '', contactNumber: '',
    sex: null, civilStatus: null, purok: '', barangay: '', city: 'Tagum City', consultationDate: '',
    consultationTime: '', interviewedReferredBy: '',

    // Section 2
    animalType: [], animalTypeOther: '', exposureDate: '', exposureTime: '', placeOfIncidence: '',
    animalStatus: [], typeOfExposure: [], animalImmunized: null, animalImmunizedDate: '',

    // Section 3
    prevAntiRabies: null, prevAntiRabiesDate: '', historyOfAllergies: '',

    // Section 4
    weight: '', height: '', bp: '', temp: '', woundDescription: [], siteInvolved: '',
    spontaneousBleeding: null, inducedBleeding: null, localWoundTreatment: null,
    washedSoapWater: null, washedWaterOnly: null, tandok: null, appliedGarlic: null,
    tetanusImmunization: null, tetanusDateGiven: '', HTIG: null, htigDateGiven: '',
    categoryOfExposure: null,

    // Section 6
    woundImages: [],

    // Section 7 is review only
};

const Forms = ({ navigation }) => {
    const [currentSection, setCurrentSection] = useState(1);
    const [formData, setFormData] = useState(initialFormData);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [validationError, setValidationError] = useState('');
    const scrollViewRef = useRef(null);
    const sectionRefs = useRef({});
    const submissionLockRef = useRef(false); // Prevent double submits
    
    // Upload progress states
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadStatus, setUploadStatus] = useState(''); // 'uploading', 'saving', ''
    const [showUploadModal, setShowUploadModal] = useState(false);

    const withTimeout = (promise, ms, timeoutMessage) => {
        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), ms);
        });

        return Promise.race([promise, timeoutPromise]).finally(() => {
            if (timeoutId) clearTimeout(timeoutId);
        });
    };

    const handleInputChange = useCallback((fieldName, value) => {
        setFormData(prev => ({ ...prev, [fieldName]: value }));
    }, []);

    const validateCurrentSection = () => {
        const data = formData;
        let errors = [];

        switch (currentSection) {
            case 1: // Section 1: All required except interviewedReferredBy and middleName
                if (!data.lastName?.trim()) errors.push('Last Name');
                if (!data.firstName?.trim()) errors.push('First Name');
                // middleName is optional
                if (!data.age || data.age === '') errors.push('Age');
                if (!data.dateOfBirth) errors.push('Date of Birth');
                if (!data.contactNumber?.trim()) errors.push('Contact Number');
                if (!data.sex) errors.push('Sex');
                if (!data.civilStatus) errors.push('Civil Status');
                if (!data.purok?.trim()) errors.push('Purok');
                if (!data.barangay?.trim()) errors.push('Barangay');
                if (!data.city?.trim()) errors.push('City');
                if (!data.consultationDate) errors.push('Consultation Date');
                if (!data.consultationTime) errors.push('Consultation Time');
                break;

            case 2: // Section 2: Most required, conditionally required animalImmunizedDate
                if (!data.animalType || data.animalType.length === 0) errors.push('Animal Type');
                if (!data.exposureDate) errors.push('Exposure Date');
                if (!data.exposureTime) errors.push('Exposure Time');
                if (!data.placeOfIncidence?.trim()) errors.push('Place of Incidence');
                if (!data.animalStatus || data.animalStatus.length === 0) errors.push('Animal Status');
                if (!data.typeOfExposure || data.typeOfExposure.length === 0) errors.push('Type of Exposure');
                if (data.animalImmunized === null) errors.push('Animal Immunized');
                if (data.animalImmunized === 'Yes' && !data.animalImmunizedDate) errors.push('Animal Immunized Date (required when Animal Immunized = Yes)');
                break;

            case 3: // Section 3: prevAntiRabies and prevAntiRabiesDate required, historyOfAllergies optional
                if (data.prevAntiRabies === null) errors.push('Previous Anti-Rabies');
                if (data.prevAntiRabies === 'Yes' && !data.prevAntiRabiesDate) errors.push('Previous Anti-Rabies Date (required when Previous Anti-Rabies = Yes)');
                break;

            case 4: // Section 4: All fields required EXCEPT Category of Exposure (staff will fill later)
                if (!data.weight || data.weight === '') errors.push('Weight');
                if (!data.height || data.height === '') errors.push('Height');
                if (!data.bp?.trim()) errors.push('Blood Pressure');
                if (!data.temp || data.temp === '') errors.push('Temperature');
                if (!data.woundDescription || data.woundDescription.length === 0) errors.push('Wound Description');
                if (!data.siteInvolved?.trim()) errors.push('Site Involved');
                if (data.spontaneousBleeding === null) errors.push('Spontaneous Bleeding');
                if (data.inducedBleeding === null) errors.push('Induced Bleeding');
                if (data.localWoundTreatment === null) errors.push('Local Wound Treatment');
                if (data.washedSoapWater === null) errors.push('Washed with Soap and Water');
                if (data.washedWaterOnly === null) errors.push('Washed with Water Only');
                if (data.tandok === null) errors.push('Tandok');
                if (data.appliedGarlic === null) errors.push('Applied Garlic');
                if (data.tetanusImmunization === null) errors.push('Tetanus Immunization');
                if (data.HTIG === null) errors.push('HTIG');
                break;

            case 5: // Section 5 (Visual Notes / Images): woundImages optional
                break;

            case 6: // Section 6: Review only
                break;

            default:
                break;
        }

        if (errors.length > 0) {
            setValidationError(`Missing required fields: ${errors.join(', ')}`);
            scrollViewRef.current?.scrollTo({ y: 0, animated: true });
            return false;
        }

        setValidationError('');
        return true;
    };

    const handleGoBack = () => {
        if (currentSection > 1) {
            handlePrevious();
        } else {
            Alert.alert("Exit Form?", "Unsaved data will be lost.", [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Exit",
                    onPress: () => {
                        setFormData(initialFormData);
                        navigation.goBack();
                    }
                }
            ]);
        }
    };

    const handleNext = () => {
        if (!validateCurrentSection()) {
            Alert.alert("Missing Fields", "Fill all required fields before proceeding.");
            return;
        }
        if (currentSection < TOTAL_SECTIONS) {
            setCurrentSection(prev => prev + 1);
            scrollViewRef.current?.scrollTo({ y: 0, animated: true });
        }
    };

    const handlePrevious = () => {
        if (currentSection > 1) {
            setCurrentSection(prev => prev - 1);
            scrollViewRef.current?.scrollTo({ y: 0, animated: true });
        }
    };

    const handleSubmit = async () => {
        // Prevent double submits
        if (submissionLockRef.current) {
            Alert.alert("Processing", "Your submission is already being processed. Please wait.");
            return;
        }
        submissionLockRef.current = true;

        if (currentSection !== TOTAL_SECTIONS) {
            Alert.alert("Incomplete", "Finish all sections before submitting.");
            submissionLockRef.current = false;
            return;
        }

        // Check network connectivity first
        const isConnected = await checkNetwork();
        if (!isConnected) {
            Alert.alert(
                "No Internet Connection",
                "Please check your internet connection and try again.",
                [{ text: "OK" }]
            );
            submissionLockRef.current = false;
            return;
        }

        setIsSubmitting(true);
        setShowUploadModal(true);
        setUploadProgress(0);
        setUploadStatus('Starting submission...');
        
        let uploadedFileIds = []; // Track uploaded files for cleanup on failure

        try {
            const user = await withTimeout(
                account.get(),
                15000,
                'Timed out while fetching your account. Please check your connection and try again.'
            );

            // Fetch staff profile (BHW or Physician)
            setUploadStatus('Fetching profile...');
            const staff = await withTimeout(
                getCurrentStaffProfile(),
                20000,
                'Timed out while fetching your profile. Please try again.'
            );

            const worker = staff.profile;
            const staffRole = staff.role;

            // Upload images to Appwrite Storage (if any)
            // Store ONLY file IDs, generate URLs on-demand
            let woundImageIds = [];
            
            const images = formData.woundImages || [];
            if (images.length > 0) {
                setUploadStatus(`Uploading ${images.length} image(s)...`);
                
                const imageUris = images.map(img => img.uri);
                const uploadResult = await withTimeout(
                    uploadMultipleImages(
                        imageUris,
                        user.$id,
                        (progress) => {
                            setUploadProgress(Math.round(progress * 0.7)); // 70% for image upload
                            setUploadStatus(`Uploading image... ${Math.round(progress)}%`);
                        }
                    ),
                    // Roughly 45s per image, with a sane cap
                    Math.min(180000, Math.max(45000, images.length * 45000)),
                    'Image upload is taking too long. Please try again (or submit without images).'
                );

                if (uploadResult.failed > 0) {
                    // Some images failed - ask user if they want to continue
                    const failedCount = uploadResult.failed;
                    const successCount = uploadResult.fileIds.length;
                    
                    // Track successfully uploaded files for cleanup if needed
                    uploadedFileIds = uploadResult.fileIds;

                    const shouldContinue = await new Promise((resolve) => {
                        Alert.alert(
                            "Upload Issue",
                            `${failedCount} image(s) failed to upload. ${successCount} succeeded.\n\nDo you want to continue without the failed images?`,
                            [
                                { 
                                    text: "Cancel", 
                                    style: "cancel",
                                    onPress: () => resolve(false)
                                },
                                { 
                                    text: "Continue", 
                                    onPress: () => resolve(true)
                                }
                            ]
                        );
                    });

                    if (!shouldContinue) {
                        // Cleanup uploaded files
                        if (uploadedFileIds.length > 0) {
                            await deleteUploadedFiles(uploadedFileIds);
                        }
                        throw new Error("Submission cancelled by user.");
                    }
                }

                // Store file IDs only (not URLs)
                woundImageIds = uploadResult.fileIds;
            }

            setUploadProgress(75);
            setUploadStatus('Saving record...');

            // Generate unique submission ID (BRGYCODE-YYYY-SEQUENCE)
            const submissionID = await withTimeout(
                getSubmissionID(worker?.barangay || formData.barangay),
                20000,
                'Timed out while generating a submission ID. Please try again.'
            );

            // Convert integer fields
            const formattedData = {
                ...(() => {
                    // Strip deprecated fields that were removed from Appwrite schema.
                    const {
                        hasSuffix,
                        passiveVaccineUnitsCombined,
                        passiveVaccineUnitType,
                        passiveVaccine,
                        passiveVaccineUnits,
                        activeVaccine,
                        activeVaccineOther,
                        antibioticsText,
                        antiInflammatoryMedication,
                        ...rest
                    } = formData;
                    return rest;
                })(),
                // Do NOT include hasSuffix, passiveVaccineUnitsCombined, or passiveVaccineUnitType (display-only fields) in the data sent to Appwrite
                suffix: formData.suffix,
                age: parseInt(formData.age) || 0,
                weight: parseInt(formData.weight) || 0,
                height: parseInt(formData.height) || 0,
                temp: parseInt(formData.temp) || 0,
                // Store ONLY file IDs, not URLs (URLs are derivable from fileIds)
                woundImages: woundImageIds,
            };

            const data = {
                ...formattedData,
                // Do NOT include hasSuffix, passiveVaccineUnitsCombined, or passiveVaccineUnitType in the data sent to Appwrite
                suffix: formattedData.suffix,
                purok: formData.purok,
                barangay: formData.barangay,
                recordedByUserID: user.$id,
                recordedByHWID: staffRole === STAFF_ROLE.BHW ? (worker.healthWorkerId || worker.$id) : worker.$id,
                submissionID,
                dateSubmitted: new Date().toISOString(),
            };

            setUploadProgress(85);

            await withTimeout(
                databases.createDocument(
                    appwriteConfig.patientDatabaseId,
                    appwriteConfig.patientRecordsCollectionId,
                    ID.unique(),
                    data
                ),
                25000,
                'Timed out while saving your record. Please try again.'
            );

            setUploadProgress(100);
            setUploadStatus('Complete!');

            // Brief delay to show 100%
            await new Promise(resolve => setTimeout(resolve, 500));

            // 🎉 Show success screen
            setShowUploadModal(false);
            setIsSubmitted(true);

        } catch (error) {
            // Cleanup uploaded files on failure
            if (uploadedFileIds.length > 0) {
                setUploadStatus('Cleaning up...');
                await deleteUploadedFiles(uploadedFileIds);
            }
            
            setShowUploadModal(false);
            
            if (error.message !== "Submission cancelled by user.") {
                Alert.alert("Submission Error", error.message);
            }
        } finally {
            setIsSubmitting(false);
            setUploadStatus('');
            setUploadProgress(0);
            submissionLockRef.current = false; // Release submission lock
        }
    };

    // When completed, show SuccessScreen
    if (isSubmitted) {
        const handleDone = () => {
            setFormData(initialFormData);
            setCurrentSection(1);
            setIsSubmitted(false);
        };

        return <SuccessScreen onDone={handleDone} navigation={navigation} />;
    }

    const renderSection = () => {
        const props = { formData, onInputChange: handleInputChange };

        switch (currentSection) {
            case 1:
                return <Section1 {...props} />;
            case 2:
                return <Section2 {...props} />;
            case 3:
                return <Section3 {...props} />;
            case 4:
                return <Section4 {...props} />;
            case 5: // Skip assessment/prescription; go straight to visual notes (images)
                return <Section6 {...props} />;
            case 6: // Final review & submit
                return <Section7 {...props} onSubmit={handleSubmit} isSubmitting={isSubmitting} />;
            default:
                return <Text style={styles.errorText}>Unknown Section</Text>;
        }
    };

    const progress = Math.round((currentSection / TOTAL_SECTIONS) * 100);

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.topHeader}>
                    <TouchableOpacity onPress={handleGoBack} style={styles.backButton} disabled={isSubmitting}>
                        <View style={styles.backButtonCircle}>
                            <Ionicons name="arrow-back" size={24} color="white" />
                        </View>
                    </TouchableOpacity>
                    <View style={styles.titleContainer}>
                        <Text style={styles.titleText}>Animal Bite Treatment Center</Text>
                        <Text style={styles.subtitleText}>Patient Health Record</Text>
                    </View>
                </View>
            </View>

            {/* Progress Card */}
            <View style={styles.progressCard}>
                <View style={styles.progressHeader}>
                    <View>
                        <Text style={styles.progressCardSectionText}>Section {currentSection} of {TOTAL_SECTIONS}</Text>
                        
                    </View>
                    <Text style={styles.progressCardPercentage}>{progress}% Complete</Text>
                </View>
                <View style={styles.progressBarBackground}>
                    <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
                </View>
            </View>

            {/* Floating Error Message */}
            {validationError ? (
                <View style={styles.errorBanner}>
                    <Ionicons name="alert-circle" size={20} color="#fff" />
                    <Text style={styles.errorBannerText}>{validationError}</Text>
                </View>
            ) : null}

            {/* Content Wrapper */}
            <View style={styles.contentWrapper}>
                <ScrollView
                    ref={scrollViewRef}
                    style={styles.content}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    contentContainerStyle={{ paddingBottom: NAVIGATION_BAR_HEIGHT + TAB_BAR_HEIGHT }}
                >
                    {renderSection()}
                </ScrollView>
            </View>

            {/* Navigation Buttons */}
            <View style={styles.navigationBar}>
                <TouchableOpacity
                    style={[
                        styles.previousButton,
                        currentSection === 1 || isSubmitting 
                            ? styles.previousButtonInactive 
                            : styles.previousButtonActive
                    ]}
                    onPress={handlePrevious}
                    disabled={currentSection === 1 || isSubmitting}
                >
                    <Text style={[
                        currentSection === 1 || isSubmitting 
                            ? styles.previousButtonTextInactive 
                            : styles.previousButtonTextActive
                    ]}>
                        &lt; Previous
                    </Text>
                </TouchableOpacity>

                {currentSection < TOTAL_SECTIONS ? (
                    <TouchableOpacity 
                        style={[styles.navButton, styles.nextButton]} 
                        onPress={handleNext} 
                        disabled={isSubmitting}
                    >
                        <Text style={styles.nextButtonText}>Next &gt;</Text>
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity 
                        style={[styles.navButton, styles.submitButton]} 
                        onPress={handleSubmit} 
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.nextButtonText}>Submit Record</Text>}
                    </TouchableOpacity>
                )}
            </View>

            {/* Upload Progress Modal */}
            <Modal
                visible={showUploadModal}
                transparent={true}
                animationType="fade"
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <ActivityIndicator size="large" color="#125872" />
                        <Text style={styles.modalTitle}>Submitting Record</Text>
                        <Text style={styles.modalStatus}>{uploadStatus}</Text>
                        
                        <View style={styles.uploadProgressContainer}>
                            <View style={styles.uploadProgressBackground}>
                                <View style={[styles.uploadProgressFill, { width: `${uploadProgress}%` }]} />
                            </View>
                            <Text style={styles.uploadProgressText}>{uploadProgress}%</Text>
                        </View>
                        
                        <Text style={styles.modalHint}>Please wait, do not close the app...</Text>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#E6F4F1' },
    contentWrapper: { flex: 1, display: 'flex', flexDirection: 'column' },
    header: { paddingHorizontal: 20, paddingBottom: 20, paddingTop: 15, backgroundColor: '#E5F4F8' },
    topHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', paddingTop: 5 },
    backButtonCircle: { width: 30, height: 30, borderRadius: 20, backgroundColor: '#125872', justifyContent: 'center', alignItems: 'center' },
    titleContainer: { flex: 1, alignItems: 'center', paddingRight: 32 },
    titleText: { fontSize: 18, fontWeight: '600', color: '#125872', textAlign: 'center', fontFamily: 'Poppins' },
    subtitleText: { fontSize: 14, color: '#333', textAlign: 'center', marginBottom: 5, fontFamily: 'Poppins' },
    progressCard: { backgroundColor: '#fff', marginHorizontal: 20, marginBottom: 20, padding: 15, borderRadius: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3.84, elevation: 5 },
    progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
    progressCardSectionText: { fontSize: 14, color: '#125872', fontWeight: '500', fontFamily: 'Poppins' },
    progressCardTitle: { fontSize: 20, fontWeight: 'bold', color: '#125872', marginTop: 2, fontFamily: 'Poppins' },
    progressCardPercentage: { fontSize: 14, fontWeight: '400', color: '#125872', fontFamily: 'Poppins' },
    progressBarBackground: { height: 8, backgroundColor: '#B2DFDB', borderRadius: 4, overflow: 'hidden' },
    progressBarFill: { height: 8, backgroundColor: '#125872', borderRadius: 4 },
    backButton: { paddingRight: 15 },
    errorBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#D32F2F', paddingHorizontal: 20, paddingVertical: 12, marginHorizontal: 20, marginBottom: 15, borderRadius: 8 },
    errorBannerText: { color: '#fff', fontSize: 13, marginLeft: 10, flex: 1, fontWeight: '500', fontFamily: 'Poppins' },
    content: { flex: 1, paddingHorizontal: 20, paddingVertical: 10 },
    navigationBar: { 
        flexDirection: 'row',
        justifyContent: 'space-between', 
        alignItems: 'center',
        padding: 10, 
        borderTopWidth: 1, 
        borderTopColor: '#ddd', 
        backgroundColor: '#fff', 
        position: 'absolute', 
        bottom: 0, 
        left: 0, 
        right: 0,
        paddingHorizontal: 20,
        gap: 2,
        zIndex: 10,
        paddingBottom: 20,
        marginTop: 20,
    },
    previousButton: { 
        borderWidth: 2,
        borderColor: '#125872',
        backgroundColor: '#ffffff',
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 8,
        alignItems: 'center',
        minWidth: 150,
    },
    previousButtonActive: {
        borderColor: '#125872',
        backgroundColor: '#ffffff',
    },
    previousButtonInactive: {
        borderColor: '#E7E7E7',
        backgroundColor: '#ffffff',
    },
    navButton: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, alignItems: 'center', minWidth: 160 },
    nextButton: { 
        backgroundColor: '#125872' 
    },
    submitButton: { backgroundColor: '#2E7D32' },
    disabledButton: { backgroundColor: '#CFD8DC' },
    navButtonText: { fontSize: 16, fontWeight: '600', fontFamily: 'Poppins' },
    previousButtonTextActive: { color: '#125872', fontSize: 16, fontWeight: '600', fontFamily: 'Poppins' },
    previousButtonTextInactive: { color: '#E7E7E7', fontSize: 16, fontWeight: '600', fontFamily: 'Poppins' },
    nextButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '600', fontFamily: 'Poppins' },
    disabledButtonText: { color: '#78909C', fontFamily: 'Poppins' },
    errorText: { color: 'red', textAlign: 'center', marginTop: 20, fontFamily: 'Poppins' },
    
    // Upload Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        backgroundColor: 'white',
        borderRadius: 15,
        padding: 30,
        width: '80%',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#125872',
        marginTop: 15,
        marginBottom: 5,
        fontFamily: 'Poppins',
    },
    modalStatus: {
        fontSize: 14,
        color: '#666',
        marginBottom: 20,
        textAlign: 'center',
        fontFamily: 'Poppins',
    },
    uploadProgressContainer: {
        width: '100%',
        alignItems: 'center',
    },
    uploadProgressBackground: {
        width: '100%',
        height: 10,
        backgroundColor: '#E0E0E0',
        borderRadius: 5,
        overflow: 'hidden',
    },
    uploadProgressFill: {
        height: '100%',
        backgroundColor: '#AEC6CF',
        borderRadius: 5,
    },
    uploadProgressText: {
        fontSize: 14,
        color: '#125872',
        marginTop: 8,
        fontWeight: '600',
        fontFamily: 'Poppins',
    },
    modalHint: {
        fontSize: 12,
        color: '#999',
        marginTop: 15,
        fontStyle: 'italic',
        fontFamily: 'Poppins',
    },
});

export default Forms;
