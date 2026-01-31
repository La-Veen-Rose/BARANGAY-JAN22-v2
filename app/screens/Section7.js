import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Dimensions, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { storage, appwriteConfig } from './appwriteConfig';

const { width } = Dimensions.get("window");

const MOCK_WOUND_IMAGE_PLACEHOLDER = 'https://picsum.photos/id/1018/';

/* --- ADDED: date/time formatting helpers --- */
const isTimeOnly = (val) => {
    if (typeof val !== 'string') return false;
    const trimmed = val.trim();
    return /^\d{1,2}:\d{2}(:\d{2})?(\s?[AaPp][Mm])?$/.test(trimmed);
};

const formatDateStr = (val) => {
    if (val === null || val === undefined || val === '') return 'N/A';
    if (isTimeOnly(val)) return 'N/A';
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${mm}/${dd}/${yyyy}`;
    }
    // fallback for YYYY-MM-DD strings
    if (typeof val === 'string') {
        const m = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return `${m[2]}/${m[3]}/${m[1]}`;
    }
    return String(val).trim() || 'N/A';
};

const formatTo12Hour = (hours, minutes) => {
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return 'N/A';
    const normalizedHours = ((hours % 24) + 24) % 24;
    const safeMinutes = Math.max(0, Math.min(59, minutes));
    const period = normalizedHours >= 12 ? 'PM' : 'AM';
    let displayHour = normalizedHours % 12;
    if (displayHour === 0) displayHour = 12;
    return `${String(displayHour).padStart(2, '0')}:${String(safeMinutes).padStart(2, '0')} ${period}`;
};

const formatTimeStr = (val) => {
    if (val === null || val === undefined || val === '') return 'N/A';
    const str = String(val).trim();

    const ampmMatch = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])$/);
    if (ampmMatch) {
        const hrs = parseInt(ampmMatch[1], 10);
        const mins = parseInt(ampmMatch[2], 10);
        const period = ampmMatch[3].toUpperCase();
        const normalizedHours = ((hrs % 12) + (period === 'PM' ? 12 : 0)) % 24;
        return formatTo12Hour(normalizedHours, mins);
    }

    const timeOnlyMatch = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (timeOnlyMatch) {
        const hrs = parseInt(timeOnlyMatch[1], 10);
        const mins = parseInt(timeOnlyMatch[2], 10);
        return formatTo12Hour(hrs, mins);
    }

    const d = new Date(str);
    if (!isNaN(d.getTime())) {
        return formatTo12Hour(d.getHours(), d.getMinutes());
    }

    return 'N/A';
};

const formatDateTimeStr = (val) => {
    if (val === null || val === undefined || val === '') return 'N/A';
    const date = formatDateStr(val);
    const time = formatTimeStr(val);
    if (date === 'N/A' && time === 'N/A') return 'N/A';
    if (time === 'N/A') return date;
    return `${date} ${time}`;
};

const getAnimalTypeDisplay = (animalType, animalTypeOther) => {
    if (!Array.isArray(animalType)) return animalType;
    if (animalType.includes('Others') && animalTypeOther) {
        return animalType.filter(a => a !== 'Others').concat([animalTypeOther]).join(', ');
    }
    return animalType.join(', ');
};
/* --- end added --- */

/**
 * Helper component to render a key-value pair.
 */
const DetailRow = ({ label, value, isDiagnosis = false }) => {
    // Convert value to display string
    let displayValue = 'N/A';
    
    if (Array.isArray(value)) {
        displayValue = value.length > 0 ? value.join(', ') : 'N/A';
    } else if (typeof value === 'boolean') {
        displayValue = value ? 'Yes' : 'No';
    } else if (value === 0 || value === '0') {
        displayValue = '0';
    } else if (value) {
        displayValue = String(value).trim();
        displayValue = displayValue === '' ? 'N/A' : displayValue;
    }
    
    return (
        <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, isDiagnosis && styles.diagnosisLabel]}>{label}</Text>
            <Text style={[styles.detailValue, isDiagnosis && styles.diagnosisValue]}>
                {displayValue}
            </Text>
        </View>
    );
};

/**
 * The main Section 7 component for review and submission.
 */
function Section7({ formData = {}, onSubmit, isSubmitting }) {
    

    const displayData = useMemo(() => formData, [formData]);
    const imageCount = displayData.woundImages ? displayData.woundImages.length : 0;

    return (
        <ScrollView contentContainerStyle={styles.scrollContainer}>
            <View style={styles.card}>
                {/* Header Block */}
                <View style={styles.headerBlock}>
                    <Text style={styles.headerText}>REVIEW AND SUBMIT</Text>
                    <Text style={styles.subText}>Final Confirmation of Patient Health Record</Text>
                </View>

                {/* --- SECTION 1: PATIENT INFORMATION --- */}
                <Text style={styles.sectionTitle}>1. PATIENT INFORMATION</Text>
                <DetailRow label="Last Name:" value={displayData.lastName} />
                <DetailRow label="First Name:" value={displayData.firstName} />
                <DetailRow label="Middle Name:" value={displayData.middleName} />
                {/* Suffix display if applicable */}
                {displayData.hasSuffix && displayData.suffix && (
                    <DetailRow label="Suffix:" value={displayData.suffix} />
                )}
                <DetailRow label="Age:" value={displayData.age} />
                <DetailRow label="Date of Birth:" value={formatDateStr(displayData.dateOfBirth)} />
                <DetailRow label="Contact Number:" value={displayData.contactNumber} />
                <DetailRow label="Sex:" value={displayData.sex} />
                <DetailRow label="Civil Status:" value={displayData.civilStatus} />
                <DetailRow label="Address:" value={`${displayData.purok || ''}, ${displayData.barangay || ''}, ${displayData.city || ''}`}/>
                <DetailRow label="Date of Consultation:" value={formatDateStr(displayData.consultationDate)} />
                <DetailRow label="Time of Consultation:" value={formatTimeStr(displayData.consultationTime)} />
                <DetailRow label="Interviewed & Referred by:" value={displayData.interviewedReferredBy} />

                {/* --- SECTION 2: ANIMAL & EXPOSURE HISTORY --- */}
                <Text style={styles.sectionTitle}>2. ANIMAL & EXPOSURE HISTORY</Text>
                <DetailRow label="Type of Biting Animal:" value={getAnimalTypeDisplay(displayData.animalType, displayData.animalTypeOther)} />
                <DetailRow label="Other Animal Type:" value={displayData.animalTypeOther} />
                <DetailRow label="Date of Exposure:" value={formatDateStr(displayData.exposureDate)} />
                <DetailRow label="Time of Exposure:" value={formatTimeStr(displayData.exposureTime)} />
                <DetailRow label="Place of Incidence (Purok):" value={displayData.placeOfIncidence} />
                <DetailRow label="Status of Biting Animal:" value={displayData.animalStatus} />
                <DetailRow label="Type of Exposure:" value={displayData.typeOfExposure} />
                <DetailRow label="Animal Immunized:" value={displayData.animalImmunized} />
                <DetailRow label="Animal Immunization Date:" value={formatDateStr(displayData.animalImmunizedDate)} />

                {/* --- SECTION 3: PAST MEDICAL HISTORY --- */}
                <Text style={styles.sectionTitle}>3. PAST MEDICAL HISTORY</Text>
                <DetailRow label="Previous Anti-Rabies Immunization:" value={displayData.prevAntiRabies} />
                <DetailRow label="Previous Immunization Date:" value={formatDateStr(displayData.prevAntiRabiesDate)} />
                <DetailRow label="History of Allergies/Asthma:" value={displayData.historyOfAllergies} />

                {/* --- SECTION 4: PHYSICAL EXAMINATION FINDINGS --- */}
                <Text style={styles.sectionTitle}>4. PHYSICAL EXAMINATION FINDINGS</Text>
                <DetailRow label="Weight (kg):" value={displayData.weight} />
                <DetailRow label="Height (cm):" value={displayData.height} />
                <DetailRow label="Blood Pressure:" value={displayData.bp} />
                <DetailRow label="Temperature (°C):" value={displayData.temp} />
                <DetailRow label="Wound Description:" value={displayData.woundDescription} />
                <DetailRow label="Site Involved:" value={displayData.siteInvolved} />
                <DetailRow label="Spontaneous Bleeding:" value={displayData.spontaneousBleeding} />
                <DetailRow label="Induced Bleeding:" value={displayData.inducedBleeding} />
                <DetailRow label="Local Wound Treatment:" value={displayData.localWoundTreatment} />
                <DetailRow label="Washed with Soap & Water:" value={displayData.washedSoapWater} />
                <DetailRow label="Applied Garlic:" value={displayData.appliedGarlic} />
                <DetailRow label="Washed with Water Only:" value={displayData.washedWaterOnly} />
                <DetailRow label="Tandok:" value={displayData.tandok} />
                <DetailRow label="Tetanus Immunization:" value={displayData.tetanusImmunization} />
                <DetailRow label="Tetanus Date Given:" value={formatDateStr(displayData.tetanusDateGiven)} />
                <DetailRow label="HTIG Given:" value={displayData.HTIG} />
                <DetailRow label="HTIG Date Given:" value={formatDateStr(displayData.htigDateGiven)} />

                {/* --- SECTION 5: ASSESSMENT & TREATMENT PLAN --- */}
                <Text style={styles.sectionTitle}>5. ASSESSMENT & TREATMENT PLAN</Text>
                <Text style={styles.agreementText}>
                    The assessment and prescription will be prepared after this record has been submitted. City Health Office physicians will validate the information first, then finalize and release the appropriate prescription once everything has been reviewed.
                </Text>

                {/* --- SECTION 6: ATTACHMENTS --- */}
                <Text style={styles.sectionTitle}>6. ATTACHMENTS</Text>
                <View style={styles.attachmentSummary}>
                    <Ionicons name="camera" size={24} color={imageCount > 0 ? '#125872' : '#ccc'} />
                    <Text style={styles.attachmentText}>
                        Wound Images Uploaded: 
                        <Text style={styles.attachmentCount}> {imageCount} photo{imageCount !== 1 ? 's' : ''}</Text>
                    </Text>
                </View>

                {/* Image Display Block */}
                {imageCount > 0 && (
                    <ScrollView 
                        horizontal 
                        showsHorizontalScrollIndicator={false}
                        style={styles.imageScroll} 
                        contentContainerStyle={styles.imageScrollContent}
                    >
                        {displayData.woundImages.map((img, index) => {
                            // If img is a fileId (string from storage), generate URL on-demand
                            // If img is an object with uri (local preview), use the uri
                            const imageUri = typeof img === 'string' 
                                ? storage.getFileView(appwriteConfig.imagesBucketId, img).toString()
                                : img?.uri;
                            
                            if (!imageUri) return null;
                            
                            return (
                                <View key={index} style={styles.imageWrapper}>
                                    <Image
                                        source={{ uri: imageUri }} 
                                        style={styles.imageThumbnail}
                                        accessibilityLabel={`Wound Photo ${index + 1}`}
                                    />
                                </View>
                            );
                        })}
                    </ScrollView>
                )}

                {imageCount === 0 && (
                    <Text style={styles.noImagesText}>No wound images attached.</Text>
                )}

                <Text style={styles.agreementText}>
                    By clicking **Submit Record**, I confirm the data above is accurate and complete, and I authorize the finalization of the patient's record.
                </Text>

                {/* Submit Button is on the Form.js which is the parent
                <TouchableOpacity 
                    style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
                    onPress={onSubmit}
                    disabled={isSubmitting}
                >
                    {isSubmitting ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <Text style={styles.submitButtonText}>SUBMIT RECORD</Text>
                    )}
                </TouchableOpacity>
                 */}

            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    scrollContainer: {
        paddingVertical: 10,
        paddingHorizontal: 20,
        paddingBottom: 30,
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 20,
        marginBottom: 20,
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        width: width * 0.9, 
        alignSelf: 'center',
    },
    headerBlock: {
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        paddingBottom: 15,
        marginBottom: 15,
    },
    headerText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#125872',
        marginBottom: 5,
    },
    subText: {
        fontSize: 14,
        color: '#666',
    },
    sectionTitle: {
        fontSize: 15,
        fontWeight: 'bold',
        color: '#125872',
        marginTop: 20,
        marginBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#E0F2F1',
        paddingBottom: 5,
    },
    detailRow: {
        flexDirection: 'row',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#fafafa',
    },
    detailLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: '#555',
        width: '40%',
    },
    detailValue: {
        fontSize: 13,
        color: '#333',
        width: '60%',
        fontWeight: '400',
    },
    diagnosisLabel: {
        fontSize: 13,
        color: '#333',
    },
    diagnosisValue: {
        fontSize: 13,
        color: '#333',

    },
    attachmentSummary: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F7FCFD',
        padding: 15,
        borderRadius: 8,
        marginTop: 10,
        borderWidth: 1,
        borderColor: '#E6F4F6',
    },
    attachmentText: {
        marginLeft: 10,
        fontSize: 13,
        color: '#333',
    },
    attachmentCount: {
        fontWeight: 'bold',
        color: '#125872',
    },
    imageScroll: {
        marginTop: 10,
        paddingVertical: 5,
    },
    imageScrollContent: {
        alignItems: 'center',
        paddingRight: 20,
    },
    imageWrapper: {
        width: 80,
        height: 80,
        borderRadius: 6,
        marginRight: 10,
        borderWidth: 1,
        borderColor: '#ccc',
        overflow: 'hidden',
    },
    imageThumbnail: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
    noImagesText: {
        fontSize: 12,
        color: '#999',
        textAlign: 'center',
        marginTop: 10,
        marginBottom: 10,
        fontStyle: 'italic',
    },
    agreementText: {
        fontSize: 12,
        color: '#888',
        textAlign: 'center',
        marginTop: 25,
        marginBottom: 15,
    },
    submitButton: {
        backgroundColor: '#38A752',
        padding: 15,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        height: 50,
        marginTop: 20,
    },
    submitButtonDisabled: {
        backgroundColor: '#A5D6A7',
    },
    submitButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
});

export default Section7;