import React, { useState, useEffect } from 'react';
import { 
    View, 
    Text, 
    StyleSheet, 
    TouchableOpacity, 
    TextInput,
    Dimensions,
    Keyboard,
    Platform
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons'; 
import DateTimePicker from '@react-native-community/datetimepicker'; // Import DateTimePicker

const { width } = Dimensions.get("window");

// --------------------------------------------------w 
// DATE FORMATTERS (Copied from Section 1/3)
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

// --------------------------------------------------
// HYBRID DATE INPUT (FormDatePicker - Copied from Section 1/3)
// --------------------------------------------------
const FormDatePicker = ({ label, fieldName, value, onInputChange, required = false, style }) => {
    const [showPicker, setShowPicker] = useState(false);
    // Use value if valid, otherwise use today's date for picker initial value
    const dateObject = value ? new Date(value) : new Date();
    const [textInputValue, setTextInputValue] = useState(formatDate(value));

    // Keep internal text input synchronized with external value changes
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
            // Note: Date constructor uses month index 0-11
            const d = new Date(year, month - 1, day);

            // Basic validation to ensure the parsed date is sensible
            if (!isNaN(d.getTime()) && d.getFullYear() === year) {
                // Save the date as ISO string
                onInputChange(fieldName, d.toISOString());
                return;
            }
        }
        // If invalid, revert the input field to the last valid value or empty
        setTextInputValue(value ? formatDate(value) : "");
    };

    return (
        <View style={[sectionStyles.inputGroup, style]}>
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
                        }
                    }}
                />
            )}
        </View>
    );
};


// --- BP Input Group Component for the desired dual-field layout ---
const BPInputGroup = ({ value, onInputChange, fieldName }) => {
    // The 'value' prop for BP is expected to be a string like "120/80"
    const [systolic, diastolic] = value ? value.split('/') : ['', ''];

    const handleSysChange = (text) => {
        const newSys = text.replace(/\D/g, '').substring(0, 3); // Max 3 digits
        onInputChange(fieldName, `${newSys}/${diastolic}`);
    };

    const handleDiaChange = (text) => {
        const newDia = text.replace(/\D/g, '').substring(0, 3); // Max 3 digits
        onInputChange(fieldName, `${systolic}/${newDia}`);
    };

    return (
        <View style={[sectionStyles.inputGroup, sectionStyles.vitalsItem]}>
            <Text style={sectionStyles.fieldLabel}>BP (mmHg) <Text style={{ color: '#D32F2F' }}> *</Text></Text>
            <View style={sectionStyles.bpInputContainer}>
                {/* Systolic Input */}
                <View style={[sectionStyles.bpSingleInputWrapper, sectionStyles.bpInputLeft]}>
                    <TextInput
                        style={sectionStyles.bpInput}
                        value={systolic}
                        placeholder="120"
                        placeholderTextColor="#aaa" // Lighter shade for placeholder
                        onChangeText={handleSysChange}
                        keyboardType="numeric"
                        maxLength={3}
                    />
                </View>
                
                {/* Separator */}
                <Text style={sectionStyles.bpSeparator}>/</Text>

                {/* Diastolic Input */}
                <View style={[sectionStyles.bpSingleInputWrapper, sectionStyles.bpInputRight]}>
                    <TextInput
                        style={sectionStyles.bpInput}
                        value={diastolic}
                        placeholder="80"
                        placeholderTextColor="#aaa" // Lighter shade for placeholder
                        onChangeText={handleDiaChange}
                        keyboardType="numeric"
                        maxLength={3}
                    />
                </View>
            </View>
        </View>
    );
};

// Helper Component for Input Fields (Used for Vitals, without date logic now)
const FormInput = ({ label, required, onInputChange, fieldName, value, placeholder, keyboardType = 'default', style, parseNumeric = false, ...props }) => {
    const handleChange = (text) => {
        if (parseNumeric) {
            // Keep as a string while typing to avoid cursor/value glitches.
            // Allow only digits and a single decimal point.
            const raw = String(text ?? '');
            const digitsAndDot = raw.replace(/[^0-9.]/g, '');
            const parts = digitsAndDot.split('.');
            const normalized = parts.length <= 1 ? digitsAndDot : `${parts[0]}.${parts.slice(1).join('')}`;
            onInputChange(fieldName, normalized);
        } else {
            // Store text as-is (no forced uppercase to avoid input lag)
            onInputChange(fieldName, text);
        }
    };

    // Ensure the TextInput receives a string value for display
    const displayValue = (value === undefined || value === null) ? '' : String(value);

    return (
        <View style={[sectionStyles.inputGroup, style]}>
            <Text style={sectionStyles.fieldLabel}>
                {label}
                {required && <Text style={{ color: '#D32F2F' }}> *</Text>}
            </Text>

            <TextInput
                style={sectionStyles.input}
                value={displayValue}
                placeholder={placeholder}
                placeholderTextColor="#aaa"
                onChangeText={handleChange}
                keyboardType={keyboardType}
                autoCapitalize="none"
                {...props}
            />
        </View>
    );
};

// Helper Component for Radio/Checkbox Options
const FormOption = ({ label, value, selectedValue, onSelect, type = 'radio', isFullWidth = false }) => {
    let isSelected = false;
    
    if (type === 'radio') {
        isSelected = selectedValue === value;
    } else {
        isSelected = Array.isArray(selectedValue) && selectedValue.includes(value);
    }
    
    return (
        <TouchableOpacity 
            style={[sectionStyles.optionContainer, isFullWidth && { minWidth: '45%' }]} 
            onPress={() => onSelect(value)}
        >
            <View style={[
                sectionStyles.controlBox, 
                type === 'radio' ? sectionStyles.radioCircle : sectionStyles.checkboxSquare,
            ]}>
                {isSelected && (
                    <View style={[
                        sectionStyles.controlDot,
                        type === 'radio' ? sectionStyles.radioDot : sectionStyles.checkboxCheck,
                    ]} />
                )}
            </View>
            <Text style={sectionStyles.optionLabel}>{label}</Text>
        </TouchableOpacity>
    );
};

function Section4({ formData, onInputChange }) {
    const { 
        weight, 
        height, 
        bp, 
        temp, 
        woundDescription, 
        siteInvolved, 
        spontaneousBleeding, 
        inducedBleeding, 
        localWoundTreatment, 
        washedSoapWater, 
        appliedGarlic, 
        washedWaterOnly, 
        tandok, 
        tetanusImmunization, 
        tetanusDateGiven, 
        HTIG, 
        htigDateGiven, 
        categoryOfExposure
    } = formData;

    // --- Handlers ---
    const handleToggleMultiSelect = (fieldName) => (value) => {
        const currentList = Array.isArray(formData[fieldName]) ? formData[fieldName] : [];
        let newList;
        if (currentList.includes(value)) {
            newList = currentList.filter(i => i !== value);
        } else {
            newList = [...currentList, value];
        }
        onInputChange(fieldName, newList);
    };

    const handleSingleSelect = (fieldName) => (value) => onInputChange(fieldName, value);

    const handleConditionalDate = (radioField, dateField) => (value) => {
        onInputChange(radioField, value);
        // Clear date if 'No' is selected
        if (value === 'No') {
            onInputChange(dateField, '');
        }
    };
    
    const isTetanusYes = tetanusImmunization === 'Yes';
    const isHTIGYes = HTIG === 'Yes';

    return (
        <View style={sectionStyles.card}>
            {/* Header Block */}
            <View style={sectionStyles.headerBlock}>
                <Text style={sectionStyles.headerText}>PERTINENT PHYSICAL EXAMINATION FINDINGS</Text>
                <Text style={sectionStyles.subText}>Vitals, wound description, and immediate wound management history</Text>
            </View>

            {/* --- Vitals --- */}
            <Text style={sectionStyles.labelTitle}>Vital Signs</Text>
            <View style={sectionStyles.vitalsRow}>
                <FormInput 
                    label="Weight (kg)" 
                    fieldName="weight" 
                    value={weight} 
                    onInputChange={onInputChange} 
                    keyboardType="numeric" 
                    parseNumeric={true}
                    placeholder="e.g., 65" 
                    style={sectionStyles.vitalsItem} 
                    required
                />
                <FormInput 
                    label="Height (cm)" 
                    fieldName="height" 
                    value={height} 
                    onInputChange={onInputChange} 
                    keyboardType="numeric" 
                    parseNumeric={true}
                    placeholder="e.g., 170" 
                    style={sectionStyles.vitalsItem} 
                    required
                />
            </View>
            <View style={sectionStyles.vitalsRow}>
                {/* BP FIELD using the new dual-input component */}
                <BPInputGroup 
                    fieldName="bp" 
                    value={bp} 
                    onInputChange={onInputChange} 
                    required
                />
                <FormInput 
                    label="Temp (°C)" 
                    fieldName="temp" 
                    value={temp} 
                    onInputChange={onInputChange} 
                    keyboardType="numeric" 
                    parseNumeric={true}
                    placeholder="e.g., 37.0" 
                    style={sectionStyles.vitalsItem} 
                    required
                />
            </View>

            {/* --- Wound Description --- */}
            <Text style={sectionStyles.labelTitle}>Wound Description <Text style={{ color: '#D32F2F' }}> *</Text></Text>
            <View style={sectionStyles.checkboxGroup}>
                <FormOption label="Abrasion" value="abrasion" selectedValue={woundDescription} onSelect={handleToggleMultiSelect('woundDescription')} type="checkbox" isFullWidth />
                <FormOption label="Scratch" value="scratch" selectedValue={woundDescription} onSelect={handleToggleMultiSelect('woundDescription')} type="checkbox" isFullWidth />
                <FormOption label="Punctured Wound" value="punctured" selectedValue={woundDescription} onSelect={handleToggleMultiSelect('woundDescription')} type="checkbox" isFullWidth />
                <FormOption label="Laceration" value="laceration" selectedValue={woundDescription} onSelect={handleToggleMultiSelect('woundDescription')} type="checkbox" isFullWidth />
                <FormOption label="Avulsed Wound" value="avulsed wound" selectedValue={woundDescription} onSelect={handleToggleMultiSelect('woundDescription')} type="checkbox" isFullWidth />
            </View>
            <FormInput 
                label="Site Involved (Body Part)" 
                fieldName="siteInvolved" 
                value={siteInvolved} 
                onInputChange={onInputChange} 
                placeholder="e.g., Right forearm, left leg"
                required
            />

            {/* --- Bleeding Status --- */}
            <Text style={sectionStyles.labelTitle}>Bleeding Status</Text>
            <Text style={sectionStyles.fieldLabel}>Spontaneous Bleeding <Text style={{ color: '#D32F2F' }}> *</Text></Text>
            <View style={sectionStyles.radioGroup}>
                <FormOption label="With" value="With" selectedValue={spontaneousBleeding} onSelect={handleSingleSelect('spontaneousBleeding')} />
                <FormOption label="Without" value="Without" selectedValue={spontaneousBleeding} onSelect={handleSingleSelect('spontaneousBleeding')} />
            </View>
            <Text style={sectionStyles.fieldLabel}>Induced Bleeding <Text style={{ color: '#D32F2F' }}> *</Text></Text>
            <View style={sectionStyles.radioGroup}>
                <FormOption label="Yes" value="Yes" selectedValue={inducedBleeding} onSelect={handleSingleSelect('inducedBleeding')} />
                <FormOption label="No" value="No" selectedValue={inducedBleeding} onSelect={handleSingleSelect('inducedBleeding')} />
            </View>

            {/* --- Local Wound Treatment --- */}
            <Text style={sectionStyles.labelTitle}>Local Wound Treatment</Text>
            <Text style={sectionStyles.fieldLabel}>Local Wound Treatment Performed by Patient/Others? <Text style={{ color: '#D32F2F' }}> *</Text></Text>
            <View style={sectionStyles.radioGroup}>
                <FormOption label="Yes" value="Yes" selectedValue={localWoundTreatment} onSelect={handleSingleSelect('localWoundTreatment')} />
                <FormOption label="No" value="No" selectedValue={localWoundTreatment} onSelect={handleSingleSelect('localWoundTreatment')} />
            </View>
            
            <Text style={sectionStyles.fieldLabel}>Washed with Soap and Water? <Text style={{ color: '#D32F2F' }}> *</Text></Text>
            <View style={sectionStyles.radioGroup}>
                <FormOption label="Yes" value="Yes" selectedValue={washedSoapWater} onSelect={handleSingleSelect('washedSoapWater')} />
                <FormOption label="No" value="No" selectedValue={washedSoapWater} onSelect={handleSingleSelect('washedSoapWater')} />
            </View>
            <Text style={sectionStyles.fieldLabel}>Washed with Water Only? <Text style={{ color: '#D32F2F' }}> *</Text></Text>
            <View style={sectionStyles.radioGroup}>
                <FormOption label="Yes" value="Yes" selectedValue={washedWaterOnly} onSelect={handleSingleSelect('washedWaterOnly')} />
                <FormOption label="No" value="No" selectedValue={washedWaterOnly} onSelect={handleSingleSelect('washedWaterOnly')} />
            </View>
            <Text style={sectionStyles.fieldLabel}>Applied Garlic, etc? <Text style={{ color: '#D32F2F' }}> *</Text></Text>
            <View style={sectionStyles.radioGroup}>
                <FormOption label="Yes" value="Yes" selectedValue={appliedGarlic} onSelect={handleSingleSelect('appliedGarlic')} />
                <FormOption label="No" value="No" selectedValue={appliedGarlic} onSelect={handleSingleSelect('appliedGarlic')} />
            </View>
            <Text style={sectionStyles.fieldLabel}>Tandok Applied? <Text style={{ color: '#D32F2F' }}> *</Text></Text>
            <View style={sectionStyles.radioGroup}>
                <FormOption label="Yes" value="Yes" selectedValue={tandok} onSelect={handleSingleSelect('tandok')} />
                <FormOption label="No" value="No" selectedValue={tandok} onSelect={handleSingleSelect('tandok')} />
            </View>

            {/* --- Tetanus Immunization (NOW USING FormDatePicker) --- */}
            <Text style={sectionStyles.labelTitle}>Tetanus Immunization</Text>
            <Text style={sectionStyles.fieldLabel}>Received Tetanus Immunization? <Text style={{ color: '#D32F2F' }}> *</Text></Text>
            <View style={sectionStyles.radioGroup}>
                <FormOption label="Yes" value="Yes" selectedValue={tetanusImmunization} onSelect={handleConditionalDate('tetanusImmunization', 'tetanusDateGiven')} />
                <FormOption label="No" value="No" selectedValue={tetanusImmunization} onSelect={handleConditionalDate('tetanusImmunization', 'tetanusDateGiven')} />
            </View>
            {isTetanusYes && (
                <FormDatePicker 
                    label="Date Given" 
                    fieldName="tetanusDateGiven"
                    value={tetanusDateGiven} 
                    onInputChange={onInputChange} 
                    required={false}
                    style={sectionStyles.indentedInput}
                />
            )}

            {/* --- HTIG Status (NOW USING FormDatePicker) --- */}
            <Text style={sectionStyles.labelTitle}>HTIG Status</Text>
            <Text style={sectionStyles.fieldLabel}>HTIG Received? <Text style={{ color: '#D32F2F' }}> *</Text></Text>
            <View style={sectionStyles.radioGroup}>
                <FormOption label="Yes" value="Yes" selectedValue={HTIG} onSelect={handleConditionalDate('HTIG', 'htigDateGiven')} />
                <FormOption label="No" value="No" selectedValue={HTIG} onSelect={handleConditionalDate('HTIG', 'htigDateGiven')} />
            </View>
            {isHTIGYes && (
                <FormDatePicker 
                    label="Date Given" 
                    fieldName="htigDateGiven"
                    value={htigDateGiven} 
                    onInputChange={onInputChange} 
                    required={false}
                    style={sectionStyles.indentedInput}
                />
            )}

            {/* Info Box */}
            <View style={sectionStyles.infoBox}>
                <Text style={sectionStyles.infoTextHeader}>Wound Treatment Note</Text>
                <Text style={sectionStyles.infoText}>
                    Proper wound cleansing is essential. Report any non-standard treatments (like Tandok/Garlic) for complete assessment.
                </Text>
            </View>
        </View>
    );
}

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
        color: '#125872',
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
    // --- Hybrid/Date Input Styles for FormDatePicker ---
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
    // --- Vitals Row Layout ---
    vitalsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 5,
    },
    // Used by Weight, Height, Temp, and the BPInputGroup to ensure they all take up ~50% width
    vitalsItem: {
        width: '48%', 
    },
    
    // --- BP Styles --- (kept original for dual-field BP)
    bpInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 48, 
        backgroundColor: 'transparent', 
        borderRadius: 8,
    },
    bpSingleInputWrapper: {
        flex: 1, 
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#fff', 
        borderRadius: 8, 
        marginHorizontal: 3,
        borderWidth: 1,
        borderColor: '#ccc',
       // ...Platform.select({
        //    ios: {
         //       shadowOffset: { width: 0, height: 1 },
           //     shadowOpacity: 0.08,
           //     shadowRadius: 2,
         //   },
          //  android: {
            //    elevation: 2,
            //},
        //}),
    },
    bpInputLeft: {
        marginRight: 4, 
    },
    bpInputRight: {
        marginLeft: 4, 
    },
    bpInput: {
        padding: 0, 
        fontSize: 16, 
       // fontWeight: '600', 
        //color: '#00796B',   //to be changed
        textAlign: 'center',
        height: '100%',
        width: '100%',
    },
    bpSeparator: {
        fontSize: 16, 
        fontWeight: '600',
       // color: '#00796B', 
        marginHorizontal: 8, 
        height: '100%',
        lineHeight: Platform.OS === 'ios' ? 48 : 50, 
        backgroundColor: 'transparent',
    },
    // --- Control Styles ---
    indentedInput: {
        marginLeft: 20,
        width: '95%',
    },
    radioGroup: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: 10,
        justifyContent: 'flex-start',
    },
    checkboxGroup: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: 5,
        justifyContent: 'space-between',
    },
    optionContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: 25,
        marginTop: 5,
        minWidth: '30%', 
        marginBottom: 5,
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
    // --- Info Box Styles (Blue/Informational) ---
    infoBox: {
        marginTop: 20,
        padding: 15,
        backgroundColor: '#E3F2FD', // Light Blue background
        borderLeftWidth: 5,
        borderLeftColor: '#2196F3', // Blue accent
        borderRadius: 8,
    },
    infoTextHeader: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#1565C0',
        marginBottom: 5,
    },
    infoText: {
        fontSize: 14,
        color: '#1565C0',
    }
});

export default Section4;