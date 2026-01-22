import React, { useState, useEffect } from 'react';
import { 
    View, 
    Text, 
    StyleSheet, 
    TouchableOpacity, 
    TextInput,
    Dimensions,
    Platform,
    Keyboard,
} from 'react-native';
import { FontAwesome5, Ionicons } from '@expo/vector-icons'; 
import DateTimePicker from '@react-native-community/datetimepicker'; 

const { width } = Dimensions.get("window");

// --------------------------------------------------
// FORMATTERS (Copied from Section 1)
// --------------------------------------------------
const formatDate = (dateValue) => {
    if (!dateValue) return '';
    const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
    if (isNaN(date.getTime())) return '';
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    return `${m}/${d}/${y}`;
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
// REUSABLE COMPONENTS (Copied from Section 1)
// --------------------------------------------------

// Standard Form Input
const FormInput = ({ label, required, onInputChange, fieldName, value, placeholder, uppercase = false, ...props }) => {
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
                onChangeText={(val) => onInputChange(fieldName, uppercase ? (val || '').toUpperCase() : val)}
                value={uppercase && typeof value === 'string' ? value.toUpperCase() : value}
                autoCapitalize={uppercase ? 'characters' : (props.autoCapitalize || 'none')}
                {...props}
            />
        </View>
    );
};

// Date Picker Input
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
            const [day, month, year] = parts.map(n => parseInt(n, 10));
            const d = new Date(year, month - 1, day);

            if (!isNaN(d.getTime()) && d.getFullYear() === year) {
                onInputChange(fieldName, d.toISOString());
                return;
            }
        }
        // Reset if invalid
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
                    placeholder="DD/MM/YYYY"
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


// Time Input
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

// Helper Component for Radio/Checkbox options (Single Select or Multi-Select)
const FormOption = ({ label, value, selectedValue, onSelect, type = 'radio' }) => {
    let isSelected = false;
    
    if (type === 'radio') {
        isSelected = selectedValue === value;
    } else {
        isSelected = Array.isArray(selectedValue) && selectedValue.includes(value);
    }
    
    return (
        <TouchableOpacity 
            style={[
                sectionStyles.optionContainer,
                type === 'radio' 
                    ? sectionStyles.radioOptionContainer 
                    : sectionStyles.checkboxOptionContainer,
            ]} 
            onPress={() => onSelect(value)}
        >
            <View style={[
                sectionStyles.controlBox, 
                type === 'radio' && sectionStyles.radioCircle,
                type === 'checkbox' && sectionStyles.checkboxSquare,
            ]}>
                {isSelected && (
                    <View style={[
                        sectionStyles.controlDot,
                        type === 'radio' && sectionStyles.radioDot,
                        type === 'checkbox' && sectionStyles.checkboxCheck,
                    ]} />
                )}
            </View>
            <Text style={sectionStyles.optionLabel}>{label}</Text>
        </TouchableOpacity>
    );
};


// --------------------------------------------------
// MAIN SECTION 2 COMPONENT
// --------------------------------------------------
function Section2({ formData, onInputChange }) {
    const { 
        animalType, animalTypeOther, exposureDate, exposureTime, 
        placeOfIncidence, animalStatus, typeOfExposure, 
        animalImmunized, animalImmunizedDate
    } = formData;

    // --- Handlers for Multi-Select Checkboxes (e.g., animalType, animalStatus, typeOfExposure) ---
    const handleToggleMultiSelect = (fieldName) => (value) => {
        // Ensure field is an array, default to empty array if undefined/null
        const currentList = Array.isArray(formData[fieldName]) ? formData[fieldName] : [];
        let newList;

        if (currentList.includes(value)) {
            // Remove item
            newList = currentList.filter(i => i !== value);
        } else {
            // Add item
            newList = [...currentList, value];
        }
        onInputChange(fieldName, newList);
    };

    const handleSetAnimalImmunized = (value) => {
        onInputChange('animalImmunized', value);
        // Clear date if 'No' is selected
        if (value === 'No') {
            onInputChange('animalImmunizedDate', '');
        }
    };
    
    // Checkbox items for conditional rendering
    const isOthersChecked = Array.isArray(animalType) && animalType.includes('Others');
    const isImmunizedYes = animalImmunized === 'Yes';

    return (
        <View style={sectionStyles.card}>
            {/* Header Block */}
            <View style={sectionStyles.headerBlock}>
                <Text style={sectionStyles.headerText}>PERTINENT DATA</Text>
                <Text style={sectionStyles.subText}>Type of biting animal, date/time of exposure, and incident details</Text>
            </View>

            {/* --- Type of Biting Animal --- */}
            <Text style={sectionStyles.labelTitle}>Type of Biting Animal <Text style={{ color: '#D32F2F' }}> *</Text></Text>
            <View style={sectionStyles.checkboxGroup}>
                {['Dog', 'Cat', 'Pet', 'Stray', 'Others'].map(type => (
                    <FormOption 
                        key={type}
                        label={type === 'Others' && isOthersChecked && animalTypeOther ? animalTypeOther : type} 
                        value={type} 
                        selectedValue={animalType} 
                        onSelect={handleToggleMultiSelect('animalType')} 
                        type="checkbox"
                    />
                ))}
            </View>

            {/* Others (Specify) Conditional Input */}
            {isOthersChecked && (
                <FormInput 
                    label="Specify other animal" 
                    fieldName="animalTypeOther"
                    value={animalTypeOther} 
                    onInputChange={onInputChange} 
                    placeholder="Enter other animal"
                    uppercase={true}
                    style={sectionStyles.indentedInput}
                />
            )}

            {/* --- Exposure Information (Using Reusable Date/Time Components) --- */}
            <Text style={sectionStyles.labelTitle}>Exposure Information *</Text>
            
            {/* Date of Exposure - USING FormDatePicker */}
            <FormDatePicker 
                label="Date of Exposure" 
                fieldName="exposureDate"
                value={exposureDate} 
                onInputChange={onInputChange} 
                showTodayButton
                required 
            />
            
            {/* Time of Exposure - USING TimeInput */}
            <TimeInput 
                label="Time of Exposure" 
                fieldName="exposureTime"
                value={exposureTime} 
                onInputChange={onInputChange} 
                showNowButton
                required 
            />
            
            <FormInput 
                label="Place of Incidence (Purok)" 
                fieldName="placeOfIncidence"
                value={placeOfIncidence} 
                onInputChange={onInputChange} 
                placeholder="Enter location"
                uppercase={true}
                required 
            />

            {/* --- Status of Biting Animal --- */}
            <Text style={sectionStyles.labelTitle}>Status of Biting Animal <Text style={{ color: '#D32F2F' }}> *</Text></Text>
            <View style={sectionStyles.checkboxGroup}>
                {['Alive', 'Dead', 'Lost', 'Killed'].map(status => (
                    <FormOption 
                        key={status}
                        label={status} 
                        value={status} 
                        selectedValue={animalStatus} 
                        onSelect={handleToggleMultiSelect('animalStatus')} 
                        type="checkbox"
                    />
                ))}
            </View>

            {/* --- Type of Exposure --- */}
            <Text style={sectionStyles.labelTitle}>Type of Exposure <Text style={{ color: '#D32F2F' }}> *</Text></Text>
            <View style={sectionStyles.checkboxGroup}>
                {['Non-Bite', 'Bite', 'Provoked', 'Unprovoked'].map(exposure => (
                    <FormOption 
                        key={exposure}
                        label={exposure} 
                        value={exposure} 
                        selectedValue={typeOfExposure} 
                        onSelect={handleToggleMultiSelect('typeOfExposure')} 
                        type="checkbox"
                    />
                ))}
            </View>
            
            {/* --- Immunization Received by Biting Animal --- */}
            <Text style={sectionStyles.labelTitle}>Immunization Received by Biting Animal <Text style={{ color: '#D32F2F' }}> *</Text></Text>
            <View style={sectionStyles.radioGroup}>
                <FormOption label="Yes" value="Yes" selectedValue={animalImmunized} onSelect={handleSetAnimalImmunized} type="radio" />
                <FormOption label="No" value="No" selectedValue={animalImmunized} onSelect={handleSetAnimalImmunized} type="radio" />
            </View>

            {/* Conditional Date Input - USING FormDatePicker */}
            {isImmunizedYes && (
                <FormDatePicker 
                    label="When (Date)" 
                    fieldName="animalImmunizedDate"
                    value={animalImmunizedDate} 
                    onInputChange={onInputChange} 
                    required={true}
                />
            )}


            {/* Info Box */}
            <View style={sectionStyles.infoBox}>
                <Text style={sectionStyles.infoText}>
                    Accurate incident details are critical for determining the appropriate treatment protocol and rabies risk assessment.
                </Text>
            </View>
        </View>
    );
}

// --------------------------------------------------
// STYLES (Merged and Harmonized)
// --------------------------------------------------
const sectionStyles = StyleSheet.create({
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
        color: '#125872', // Keeping Section 1 header color for consistency
        marginBottom: 5,
    },
    subText: {
        fontSize: 14,
        color: '#666',
    },
    labelTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#333',
        marginTop: 15,
        marginBottom: 5,
    },
    fieldLabel: {
        fontSize: 14,
        color: '#444',
        marginBottom: 4,
        marginTop: 10,
    },
    inputGroup: {
        marginBottom: 10,
    },
    input: {
        borderWidth: 1,
        borderColor: '#ccc',
        padding: 12,
        borderRadius: 8,
        fontSize: 16,
        backgroundColor: '#fff',
    },
    disabledInput: { 
        backgroundColor: '#f5f5f5', 
        color: '#777' 
    },
    // --- Hybrid Input Styles (Date/Time) ---
    hybridInputContainer: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        borderWidth: 1, 
        borderColor: '#ccc', 
        borderRadius: 8, 
        backgroundColor: '#fff' 
    },
    hybridTextInput: { 
        flex: 1, 
        borderWidth: 0, 
        padding: 12, 
        fontSize: 16, 
        backgroundColor: 'transparent' 
    },
    hybridIconWrapper: { 
        padding: 12, 
        borderLeftWidth: 1, 
        borderLeftColor: '#eee' 
    },
    todayText: {
        fontSize: 14,
        color: '#125872',
        fontWeight: '600',
    },
    // --- Radio/Checkbox Styles ---
    radioGroup: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: 10,
        justifyContent: 'flex-start',
    },
    checkboxGroup: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: 10,
        justifyContent: 'space-between',
        width: '100%', 
    },
    optionContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: 10,
        marginTop: 5,
        marginBottom: 5,
    },
    checkboxOptionContainer: {
        width: '48%',
    },
    radioOptionContainer: {
        marginRight: 16,
    },
    controlBox: {
        height: 20,
        width: 20,
        borderWidth: 2,
        borderColor: '#125872',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 8,
        backgroundColor: '#fff',
    },
    radioCircle: {
        borderRadius: 10,
    },
    checkboxSquare: {
        borderRadius: 4,
    },
    controlDot: {
        backgroundColor: '#125872',
    },
    radioDot: {
        height: 10,
        width: 10,
        borderRadius: 5,
    },
    checkboxCheck: {
        height: 12,
        width: 12,
    },
    optionLabel: {
        fontSize: 16,
        color: '#333',
    },
    // --- Conditional/Indented Input Styles ---
    indentedInput: {
        marginLeft: 20,
    },
    // --- Info Box Styles (Harmonized with Section 2 original colors) ---
    infoBox: {
        marginTop: 20,
        padding: 15,
        backgroundColor: '#FFF8E1', 
        borderLeftWidth: 5,
        borderLeftColor: '#FFC107', 
        borderRadius: 8,
    },
    infoText: {
        fontSize: 14,
        color: '#FF6F00',
    }
});

export default Section2;