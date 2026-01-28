import React, { useState, useEffect } from 'react';
import { 
    View, 
    StyleSheet, 
    Text, 
    TouchableOpacity, 
    Dimensions, 
    TextInput,
    Platform,
    Keyboard,
    ActivityIndicator,
    Modal,
    FlatList,
} from "react-native";

import { FontAwesome5, Ionicons } from '@expo/vector-icons'; 
import DateTimePicker from '@react-native-community/datetimepicker';
import { databases, appwriteConfig, account } from './appwriteConfig';
import { Query } from 'appwrite'; 

const { width } = Dimensions.get("window");

// --------------------------------------------------
// FORMATTERS
// --------------------------------------------------
const formatDate = (dateValue) => {
    if (!dateValue) return '';
    const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
    if (isNaN(date.getTime())) return '';
    // FIX: Changed order from DD/MM/YYYY to MM/DD/YYYY to match input handling logic below
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    return `${m}/${d}/${y}`; // Matches placeholder MM/DD/YYYY
};

const formatTime = (value) => {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return '';
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${hours}:${minutes}`;
};


// --------------------------------------------------
// REUSABLE RADIO BUTTON
// --------------------------------------------------
const FormRadioOption = ({ label, value, selectedValue, onSelect }) => (
    <TouchableOpacity 
        style={sectionStyles.optionContainer} 
        onPress={() => onSelect(value)}
    >
        <View style={sectionStyles.radioCircle}>
            {selectedValue === value && <View style={sectionStyles.radioDot} />}
        </View>
        <Text style={sectionStyles.optionLabel}>{label}</Text>
    </TouchableOpacity>
);


// --------------------------------------------------
// STANDARD INPUT
// --------------------------------------------------
const FormInput = ({ label, required, onInputChange, fieldName, value, placeholder, ...props }) => {
    // Determine if field should be uppercase (exclude numeric fields)
    const isNumericField = props.keyboardType === 'numeric' || props.keyboardType === 'phone-pad';
    const isContactField = fieldName === 'contactNumber';

    const normalizeContact = (raw) => {
        let digits = String(raw || '').replace(/\D/g, '');
        if (digits.startsWith('0')) {
            digits = '63' + digits.slice(1);
        } else if (!digits.startsWith('63')) {
            digits = '63' + digits;
        }
        return digits.slice(0, 12);
    };

    const displayValue = isContactField ? normalizeContact(value) : value;

    return (
        <View style={sectionStyles.inputGroup}>
            <Text style={sectionStyles.fieldLabel}>
                {label} {required && <Text style={{ color: '#D32F2F' }}> *</Text>}
            </Text>

            <TextInput
                style={[
                    sectionStyles.input, 
                    props.editable === false && sectionStyles.disabledInput
                ]}
                placeholder={placeholder || `Enter ${label.toLowerCase()}`}
                placeholderTextColor="#aaa"
                onChangeText={(val) => {
                    if (isContactField) {
                        onInputChange(fieldName, normalizeContact(val));
                    } else {
                        onInputChange(fieldName, val);
                    }
                }}
                value={displayValue}
                keyboardType={isContactField ? 'numeric' : props.keyboardType}
                maxLength={isContactField ? 12 : props.maxLength}
                autoCapitalize="none"
                {...props}
            />
        </View>
    );
};


// --------------------------------------------------
// DROPDOWN SELECT
// --------------------------------------------------
const FormDropdown = ({ label, fieldName, value, onInputChange, options, required = false, placeholder }) => {
    const [showDropdown, setShowDropdown] = useState(false);

    return (
        <View style={sectionStyles.inputGroup}>
            <Text style={sectionStyles.fieldLabel}>
                {label} {required && <Text style={{ color: '#D32F2F' }}> *</Text>}
            </Text>

            <TouchableOpacity
                style={[sectionStyles.input, sectionStyles.dropdownButton]}
                onPress={() => setShowDropdown(true)}
                activeOpacity={0.7}
            >
                <Text style={[sectionStyles.dropdownText, !value && sectionStyles.dropdownPlaceholder]}>
                    {value || placeholder || `Select ${label.toLowerCase()}`}
                </Text>
                <Ionicons name="chevron-down" size={20} color="#125872" />
            </TouchableOpacity>

            <Modal
                visible={showDropdown}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setShowDropdown(false)}
            >
                <TouchableOpacity
                    style={sectionStyles.modalOverlay}
                    activeOpacity={1}
                    onPress={() => setShowDropdown(false)}
                >
                    <View style={sectionStyles.dropdownModal}>
                        <View style={sectionStyles.dropdownHeader}>
                            <Text style={sectionStyles.dropdownHeaderText}>{label}</Text>
                            <TouchableOpacity onPress={() => setShowDropdown(false)}>
                                <Ionicons name="close" size={24} color="#125872" />
                            </TouchableOpacity>
                        </View>
                        <FlatList
                            data={options}
                            keyExtractor={(item, index) => index.toString()}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={[
                                        sectionStyles.dropdownOption,
                                        value === item && sectionStyles.dropdownOptionSelected
                                    ]}
                                    onPress={() => {
                                        onInputChange(fieldName, item);
                                        setShowDropdown(false);
                                    }}
                                >
                                    <Text style={[
                                        sectionStyles.dropdownOptionText,
                                        value === item && sectionStyles.dropdownOptionTextSelected
                                    ]}>
                                        {item}
                                    </Text>
                                    {value === item && (
                                        <Ionicons name="checkmark" size={20} color="#125872" />
                                    )}
                                </TouchableOpacity>
                            )}
                        />
                    </View>
                </TouchableOpacity>
            </Modal>
        </View>
    );
};


// --------------------------------------------------
// DATE INPUT (TYPE OR PICK)
// --------------------------------------------------
const FormDatePicker = ({ label, fieldName, value, onInputChange, required = false, showTodayButton = false }) => {
    const [showPicker, setShowPicker] = useState(false);
    const dateObject = value ? new Date(value) : new Date();
    const [textInputValue, setTextInputValue] = useState(formatDate(value));

    useEffect(() => {
        setTextInputValue(formatDate(value));
    }, [value]);

    const handleManualChange = (text) => {
        let cleaned = text.replace(/\D/g, '').slice(0, 8);
        let formatted = cleaned;

        if (cleaned.length > 2) {
            formatted = `${cleaned.slice(0, 2)}/${cleaned.slice(2)}`;
        }
        if (cleaned.length > 4) {
            formatted = `${formatted.slice(0, 5)}/${formatted.slice(5)}`;
        }

        setTextInputValue(formatted);
    };

    const handleParseAndSave = () => {
        const parts = textInputValue.split('/');
        if (parts.length === 3) {
            const [month, day, year] = parts.map(n => parseInt(n, 10));
            const d = new Date(year, month - 1, day);

            if (!isNaN(d.getTime()) && d.getFullYear() === year) {
                onInputChange(fieldName, d.toISOString());
                return;
            }
        }
        setTextInputValue(value ? formatDate(value) : "");
    };

    const handleSetToday = () => {
        const today = new Date();
        onInputChange(fieldName, today.toISOString());
        setTextInputValue(formatDate(today));
        Keyboard.dismiss();
    };

    return (
        <View style={sectionStyles.inputGroup}>
            <Text style={sectionStyles.fieldLabel}>
                {label} {required && <Text style={{ color: '#D32F2F' }}> *</Text>}
            </Text>

            <View style={sectionStyles.hybridInputContainer}>
                <TextInput
                    style={[sectionStyles.input, sectionStyles.hybridTextInput]}
                    placeholder="MM/DD/YYYY"
                    placeholderTextColor="#aaa"
                    keyboardType="numeric"
                    maxLength={10}
                    value={textInputValue}
                    onChangeText={handleManualChange}
                    onBlur={handleParseAndSave}
                />

                <TouchableOpacity 
                    style={sectionStyles.hybridIconWrapper}
                    onPress={() => setShowPicker(true)}
                    activeOpacity={0.6}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    <FontAwesome5 name="calendar-alt" size={20} color="#125872" />
                </TouchableOpacity>

                {showTodayButton && (
                    <TouchableOpacity 
                        style={sectionStyles.hybridIconWrapper}
                        onPress={handleSetToday}
                        activeOpacity={0.7}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <Text style={sectionStyles.todayText}>Today</Text>
                    </TouchableOpacity>
                )}
            </View>

            {showPicker && (
                <DateTimePicker
                    mode="date"
                    value={dateObject}
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(event, selectedDate) => {
                        setShowPicker(false);
                        if (selectedDate) {
                            onInputChange(fieldName, selectedDate.toISOString());
                            Keyboard.dismiss();
                        }
                    }}
                />
            )}
        </View>
    );
};


// --------------------------------------------------
// TIME INPUT (24-hour format HH:MM)
// --------------------------------------------------
const TimeInput = ({ label, fieldName, value, onInputChange, required = false, showNowButton = false }) => {
    const [showPicker, setShowPicker] = useState(false);

    const dateObj = value ? new Date(value) : new Date();
    const initialFormatted = value ? formatTime(value) : "";
    const [timeText, setTimeText] = useState(initialFormatted || "");

    useEffect(() => {
        if (value) {
            const t = formatTime(value);
            setTimeText(t);
        }
    }, [value]);

    const handleManualChange = (text) => {
        // Allow only digits and colon for 24-hour format
        let cleaned = text.replace(/[^\d:]/g, '').slice(0, 5);
        
        // Auto-format as HH:MM
        if (cleaned.length >= 3 && !cleaned.includes(':')) {
            cleaned = `${cleaned.slice(0, 2)}:${cleaned.slice(2)}`;
        }
        
        setTimeText(cleaned);
    };

    const handleSave = () => {
        if (!timeText.includes(":")) return;

        const [hh, mm] = timeText.split(":").map(n => parseInt(n, 10));

        if (isNaN(hh) || isNaN(mm) || hh > 23 || mm > 59) return;

        const newDate = new Date();
        newDate.setHours(hh);
        newDate.setMinutes(mm);
        newDate.setSeconds(0);

        onInputChange(fieldName, newDate.toISOString());
    };

    const handleSetNow = () => {
        const now = new Date();
        onInputChange(fieldName, now.toISOString());
        Keyboard.dismiss();
    };

    return (
        <View style={sectionStyles.inputGroup}>
            <Text style={sectionStyles.fieldLabel}>
                {label} {required && <Text style={{ color: '#D32F2F' }}> *</Text>}
            </Text>

            <View style={sectionStyles.hybridInputContainer}>
                <TextInput
                    style={[sectionStyles.input, sectionStyles.hybridTextInput]}
                    placeholder="HH:MM (24hr)"
                    placeholderTextColor="#aaa"
                    keyboardType="numeric"
                    maxLength={5}
                    value={timeText}
                    onChangeText={handleManualChange}
                    onBlur={handleSave}
                />

                <TouchableOpacity 
                    style={sectionStyles.hybridIconWrapper}
                    onPress={() => setShowPicker(true)}
                    activeOpacity={0.6}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    <Ionicons name="time-outline" size={24} color="#125872" />
                </TouchableOpacity>

                {showNowButton && (
                    <TouchableOpacity 
                        style={sectionStyles.hybridIconWrapper}
                        onPress={handleSetNow}
                        activeOpacity={0.7}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <Text style={sectionStyles.todayText}>Now</Text>
                    </TouchableOpacity>
                )}
            </View>

            {showPicker && (
                <DateTimePicker
                    mode="time"
                    value={dateObj}
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(event, selected) => {
                        setShowPicker(false);
                        if (selected) {
                            onInputChange(fieldName, selected.toISOString());
                        }
                    }}
                />
            )}
        </View>
    );
};

// --------------------------------------------------
// MAIN SECTION 1 COMPONENT
// --------------------------------------------------
function Section1({ formData, onInputChange, onTestSubmit, isSubmitting }) {
    const { 
        lastName, firstName, middleName,
        age, dateOfBirth, contactNumber,
        sex, civilStatus, purok, barangay, city,
        consultationDate, consultationTime,
        interviewedReferredBy
    } = formData;

    // 🟢 AUTO-FETCH: Get current user's fullName and barangay from HealthWorkers collection
    useEffect(() => {
        const fetchCurrentUserProfile = async () => {
            try {
                // Get current logged-in user
                const user = await account.get();

                // Query HealthWorkers collection for this user
                const res = await databases.listDocuments(
                    appwriteConfig.staffDatabaseId,
                    appwriteConfig.healthWorkersCollectionId,
                    [Query.equal("auth_user_id", user.$id)]
                );

                // If found, auto-populate the fields
                if (res.total > 0) {
                    const worker = res.documents[0];
                    const fullName = worker.fullName || `${worker.firstName || ''} ${worker.lastName || ''}`.trim() || '';
                    const workerBarangay = worker.barangay || '';

                    // Only set if not already filled by user
                    if (!interviewedReferredBy && fullName) {
                        const fullNameCaps = fullName.toUpperCase();
                        onInputChange('interviewedReferredBy', fullNameCaps);
                    }
                    if (!barangay && workerBarangay) {
                        onInputChange('barangay', workerBarangay);
                    }
                }
            } catch (error) {
                console.error('Error fetching user profile:', error);
            }
        };

        // Only fetch once on component mount and if either field is empty
        if (!interviewedReferredBy || !barangay) {
            fetchCurrentUserProfile();
        }
    }, []);

    return (
        <View style={sectionStyles.card}>

            <View style={sectionStyles.headerBlock}>
                <Text style={sectionStyles.headerText}>BASIC INFORMATION</Text>
                <Text style={sectionStyles.subText}>Patient name, personal information, and contact details</Text>
            </View>

            <Text style={sectionStyles.labelTitle}>Patient Name</Text>
            <FormInput label="Last Name" fieldName="lastName" value={lastName} onInputChange={onInputChange} required />
            <FormInput label="First Name" fieldName="firstName" value={firstName} onInputChange={onInputChange} required />

            <FormInput label="Middle Name" fieldName="middleName" value={middleName} onInputChange={onInputChange} />

            {/* Suffix Tick Option */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <TouchableOpacity
                    onPress={() => onInputChange('hasSuffix', !formData.hasSuffix)}
                    style={{
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        borderWidth: 2,
                        borderColor: '#125872',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 10,
                        backgroundColor: formData.hasSuffix ? '#125872' : '#fff',
                    }}
                >
                    {formData.hasSuffix && (
                        <Ionicons name="checkmark" size={18} color="#fff" />
                    )}
                </TouchableOpacity>
                <Text style={{ fontSize: 16, color: '#333', fontFamily: 'Poppins' }}>
                    Suffix (if applicable)
                </Text>
            </View>

            {/* Suffix Dropdown if ticked */}
            {formData.hasSuffix && (
                <FormDropdown
                    label="Suffix"
                    fieldName="suffix"
                    value={formData.suffix}
                    onInputChange={onInputChange}
                    options={["Jr.", "Sr.", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"]}
                    placeholder="Select suffix"
                />
            )}

            <Text style={sectionStyles.labelTitle}>Personal Information</Text>
            <FormDatePicker 
                label="Date of Birth" 
                fieldName="dateOfBirth" 
                value={dateOfBirth} 
                onInputChange={(field, value) => {
                    // Update date of birth
                    onInputChange(field, value);
                    
                    // Auto-calculate age
                    if (value) {
                        const birthDate = new Date(value);
                        const today = new Date();
                        let calculatedAge = today.getFullYear() - birthDate.getFullYear();
                        const monthDiff = today.getMonth() - birthDate.getMonth();
                        
                        // Adjust age if birthday hasn't occurred this year
                        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                            calculatedAge--;
                        }
                        
                        onInputChange('age', calculatedAge.toString());
                    }
                }} 
                required 
            />
            <FormInput 
                label="Age" 
                fieldName="age" 
                value={age} 
                onInputChange={onInputChange} 
                keyboardType="numeric" 
                required 
                editable={false}
            />
            <FormInput label="Contact Number" fieldName="contactNumber" value={contactNumber} onInputChange={onInputChange} keyboardType="phone-pad" required />

            <Text style={sectionStyles.fieldLabel}>Sex <Text style={{ color: '#D32F2F' }}> *</Text></Text>
            <View style={sectionStyles.radioGroup}>
                <FormRadioOption label="Male" value="Male" selectedValue={sex} onSelect={(v) => onInputChange("sex", v)} />
                <FormRadioOption label="Female" value="Female" selectedValue={sex} onSelect={(v) => onInputChange("sex", v)} />
            </View>

            <FormDropdown 
                label="Civil Status" 
                fieldName="civilStatus" 
                value={civilStatus} 
                onInputChange={onInputChange}
                options={['Single', 'Married', 'Widow', 'Legally Separated']}
                placeholder="Select civil status"
                required
            />

            <Text style={sectionStyles.labelTitle}>Address</Text>
            <FormInput label="Purok" fieldName="purok" value={purok} onInputChange={onInputChange} required />
            <FormDropdown 
                label="Barangay" 
                fieldName="barangay" 
                value={barangay} 
                onInputChange={onInputChange}
                options={[
                    'Apokon',
                    'Bincungan',
                    'Busaon',
                    'Canocotan',
                    'Cuambogan',
                    'La Filipina',
                    'Liboganon',
                    'Madaum',
                    'Magdum',
                    'Magugpo East',
                    'Magugpo North',
                    'Magugpo Poblacion',
                    'Magugpo South',
                    'Magugpo West',
                    'Mankilam',
                    'New Balamban',
                    'Nueva Fuerza',
                    'Pagsabangan',
                    'Pandapan',
                    'San Agustin',
                    'San Isidro',
                    'San Miguel (Camp 4)',
                    'Visayan Village',
                ]}
                placeholder="Select barangay"
                required
            />
            <FormInput label="Municipality" fieldName="city" value={city} onInputChange={onInputChange} editable={false} required />

            <Text style={sectionStyles.labelTitle}>Consultation Details</Text>
            <FormDatePicker 
                label="Consultation Date" 
                fieldName="consultationDate" 
                value={consultationDate} 
                onInputChange={onInputChange} 
                required 
                showTodayButton
            />
            <TimeInput 
                label="Consultation Time" 
                fieldName="consultationTime" 
                value={consultationTime} 
                onInputChange={onInputChange} 
                required 
                showNowButton
            />

            <FormInput label="Interviewed & Referred By" fieldName="interviewedReferredBy" value={interviewedReferredBy} onInputChange={onInputChange} />

            <View style={sectionStyles.infoBox}>
                <Text style={sectionStyles.infoText}>
                    Please ensure all required fields (*) are filled out accurately.
                </Text>
            </View>
            
        </View>
    );
}


// --------------------------------------------------
// STYLES
// --------------------------------------------------
const sectionStyles = StyleSheet.create({
    card: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 20,
        marginBottom: 20,
        elevation: 4,
        width: width * 0.9,
        alignSelf: 'center',
    },

    headerBlock: { 
        borderBottomWidth: 1, 
        borderBottomColor: '#eee', 
        paddingBottom: 15, 
        marginBottom: 15 
    },
    headerText: { 
        fontSize: 18, 
        fontWeight: 'bold', 
        color: '#125872', 
        marginBottom: 5,
        fontFamily: 'Poppins'
    },
    subText: { 
        fontSize: 14, 
        color: '#666',
        fontFamily: 'Poppins'
    },

    labelTitle: { 
        fontSize: 16, 
        fontWeight: 'bold', 
        color: '#333', 
        marginTop: 15, 
        marginBottom: 5,
        fontFamily: 'Poppins'
    },
    fieldLabel: { 
        fontSize: 14, 
        color: '#444', 
        marginBottom: 4, 
        marginTop: 10,
        fontFamily: 'Poppins'
    },

    inputGroup: { 
        marginBottom: 10 
    },
    input: { 
        borderWidth: 1, 
        borderColor: '#ccc', 
        padding: 12, 
        borderRadius: 8,   
        fontSize: 16, 
        backgroundColor: '#fff',
        fontFamily: 'Poppins'
    },
    disabledInput: { 
        backgroundColor: '#f5f5f5', 
        color: '#777' 
    },

    radioGroup: { 
        flexDirection: 'row', 
        flexWrap: 'wrap', 
        marginBottom: 10 
    },
    optionContainer: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        marginRight: 25, 
        marginTop: 5 
    },
    radioCircle: { 
        height: 20, 
        width: 20, 
        borderRadius: 10, 
        borderWidth: 2, 
        borderColor: '#125872', 
        alignItems: 'center', 
        justifyContent: 'center', 
        marginRight: 8,
        backgroundColor: '#fff'
    },
    radioDot: { 
        height: 10, 
        width: 10, 
        borderRadius: 5, 
        backgroundColor: '#125872' 
    },
    optionLabel: { 
        fontSize: 16, 
        color: '#333',
        fontFamily: 'Poppins'
    },

    infoBox: { 
        marginTop: 20, 
        padding: 15, 
        backgroundColor: '#E8F5E9', 
        borderLeftWidth: 5, 
        borderLeftColor: '#125872', 
        borderRadius: 8 
    },
    infoText: { fontSize: 14, color: '#125872', fontFamily: 'Poppins' },

    hybridInputContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#ccc', borderRadius: 8, backgroundColor: '#fff' },
    hybridTextInput: { flex: 1, borderWidth: 0, padding: 12, fontSize: 16, backgroundColor: 'transparent', fontFamily: 'Poppins' },
    hybridIconWrapper: { padding: 12, borderLeftWidth: 1, borderLeftColor: '#eee' },

    amPmButton: {
        marginLeft: 10,
        borderWidth: 1,
        borderColor: "#ccc",
        borderRadius: 8,
        paddingHorizontal: 14,
        justifyContent: "center",
        backgroundColor: "#fff",
    },
    amPmText: { fontSize: 16, color: "#333", fontFamily: 'Poppins' },

    // Input header row with quick action
    inputHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    quickActionButton: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 6,
        backgroundColor: '#fff',
    },
    quickActionText: {
        fontSize: 12,
        color: '#125872',
        fontWeight: '600',
        fontFamily: 'Poppins',
    },

    // Dropdown styles
    dropdownButton: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    dropdownText: {
        fontSize: 16,
        color: '#333',
        fontFamily: 'Poppins',
    },
    dropdownPlaceholder: {
        color: '#aaa',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    dropdownModal: {
        backgroundColor: '#fff',
        borderRadius: 12,
        width: '80%',
        maxHeight: '60%',
        overflow: 'hidden',
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
    },
    dropdownHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        backgroundColor: '#f8f9fa',
    },
    dropdownHeaderText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#125872',
        fontFamily: 'Poppins',
    },
    dropdownOption: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    dropdownOptionSelected: {
        backgroundColor: '#E8F5E9',
    },
    dropdownOptionText: {
        fontSize: 16,
        color: '#333',
        fontFamily: 'Poppins',
    },
    dropdownOptionTextSelected: {
        color: '#125872',
        fontWeight: '600',
    },

    // *** NEW STYLES FOR TEST BUTTON ***
    testButton: {
        backgroundColor: '#FF6347', // Tomato Red for high visibility
        padding: 15,
        borderRadius: 10,
        width: '80%',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
        elevation: 5,
    },
    testButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
        fontFamily: 'Poppins',
    },
});


export default Section1;