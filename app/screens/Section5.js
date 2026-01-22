import React, { useMemo, useCallback } from 'react';
import {
    View, 
    Text, 
    StyleSheet, 
    TouchableOpacity, 
    TextInput, 
    Dimensions 
} from 'react-native';

const { width } = Dimensions.get("window");

// --- UTILITY COMPONENT STYLES ---
const controlStyles = StyleSheet.create({
    optionContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: 25,
        paddingVertical: 4,
    },
    controlBox: {
        height: 20,
        width: 20,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 8,
    },
    controlBoxUnselected: {
        borderColor: '#ccc',
        backgroundColor: '#fff',
    },
    controlBoxSelected: {
        borderColor: '#125872',
        backgroundColor: '#125872',
    },
    radioCircle: {
        borderRadius: 10,
    },
    checkboxSquare: {
        borderRadius: 4,
    },
    checkmark: {
        fontSize: 14,
        fontWeight: 'bold',
    },
    optionLabel: {
        fontSize: 16,
        color: '#333',
    },
});

// --- CHECKBOX/RADIO COMPONENT ---
const Checkbox = ({ label, isSelected, onToggle, isRadio = false }) => {
    const boxStyle = useMemo(() => [
        controlStyles.controlBox,
        isRadio ? controlStyles.radioCircle : controlStyles.checkboxSquare,
        isSelected ? controlStyles.controlBoxSelected : controlStyles.controlBoxUnselected,
    ], [isSelected, isRadio]);

    // Use a filled circle for radio (•) or checkmark (✓) for checkbox
    const checkmarkText = isSelected ? (isRadio ? '•' : '✓') : '';

    const checkmarkStyle = [
        controlStyles.checkmark,
        { 
            opacity: isSelected ? 1 : 0,
            color: isSelected ? '#FFFFFF' : 'transparent',
            // Adjust position for circle marker if radio
            transform: isRadio && isSelected ? [{ translateY: -1.5 }] : [{ translateY: 0 }],
        }
    ];

    return (
        <TouchableOpacity
            style={controlStyles.optionContainer}
            onPress={onToggle}
            activeOpacity={0.7}
        >
            <View style={boxStyle}>
                <Text style={checkmarkStyle}>{checkmarkText}</Text>
            </View>
            <Text style={controlStyles.optionLabel}>{label}</Text>
        </TouchableOpacity>
    );
};

// --- MAIN SECTION 5 COMPONENT ---
const Section5 = ({ formData = {}, onInputChange = () => {} }) => {
    
    /**
     * Helper to combine units and unit type safely
     */
    const combineUnitsWithType = useCallback((units, unitType) => {
        // Safely handle empty or invalid values
        const hasUnits = units !== undefined && units !== null && units !== '';
        const hasUnitType = unitType !== undefined && unitType !== null && unitType !== '';
        
        if (hasUnits && hasUnitType) {
            return `${units} ${unitType}`;
        } else if (hasUnits) {
            return String(units);
        }
        return '';
    }, []);
    
    /**
     * Toggles/Selects a value in an array field.
     * If forceRadio is true, it replaces the entire array with the new value.
     */
    const toggleArrayField = useCallback((key, value, forceRadio = false) => {
        const currentArray = formData[key] || []; 
        let newArray;

        if (forceRadio) {
            // If it's a radio button, toggle it off if already selected, otherwise set it exclusively
            newArray = currentArray.includes(value) ? [] : [value];
        } else {
            // Normal checkbox behavior
            if (currentArray.includes(value)) {
                newArray = currentArray.filter(item => item !== value);
            } else {
                newArray = [...currentArray, value];
            }
        }
        onInputChange(key, newArray);
    }, [formData, onInputChange]);

    const { 
        activeVaccine = [], 
        passiveVaccine = [], 
        plan = [] 
    } = formData;

    return (
        <View style={section5Styles.card}>

            {/* Header */}
            <View style={section5Styles.headerBlock}>
                <Text style={section5Styles.headerText}>ASSESSMENT AND PLAN</Text>
                <Text style={section5Styles.subText}>Medical assessment and treatment plan</Text>
            </View>

            {/* Assessment */}
            <Text style={section5Styles.labelTitle}>Assessment (Optional)</Text>
            <TextInput
                style={[section5Styles.input, section5Styles.textArea]}
                placeholder="Enter clinical assessment and diagnosis..."
                placeholderTextColor="#aaa"
                value={formData.assessmentDiagnosis || ''}
                onChangeText={(val) => onInputChange('assessmentDiagnosis', val.toUpperCase())}
                multiline={true}
                numberOfLines={4}
            />

            {/* Plan - NOW SINGLE SELECTION (Radio Behavior) */}
            <Text style={section5Styles.labelTitle}>Plan<Text style={{ color: '#D32F2F' }}> *</Text></Text>
            <View style={section5Styles.groupContainer}>
                <Checkbox
                    label="PrEP"
                    isSelected={plan.includes('PrEP')}
                    onToggle={() => toggleArrayField('plan', 'PrEP', true)} // forceRadio: true
                    isRadio={true} // Visual change to radio circle
                />
                <Checkbox
                    label="PEP"
                    isSelected={plan.includes('PEP')}
                    onToggle={() => toggleArrayField('plan', 'PEP', true)} // forceRadio: true
                    isRadio={true} // Visual change to radio circle
                />
                <Checkbox
                    label="Booster"
                    isSelected={plan.includes('Booster')}
                    onToggle={() => toggleArrayField('plan', 'Booster', true)} // forceRadio: true
                    isRadio={true} // Visual change to radio circle
                />
            </View>

            {/* Passive Vaccine - NOW SINGLE SELECTION (Radio Behavior) */}
            <Text style={section5Styles.labelTitle}>Passive Vaccine<Text style={{ color: '#D32F2F' }}> *</Text></Text>
            <View style={section5Styles.groupContainer}>
                <Checkbox
                    label="ERIG"
                    isSelected={passiveVaccine.includes('ERIG')}
                    onToggle={() => toggleArrayField('passiveVaccine', 'ERIG', true)} // forceRadio: true
                    isRadio={true} // Visual change to radio circle
                />
                <Checkbox
                    label="HRIG"
                    isSelected={passiveVaccine.includes('HRIG')}
                    onToggle={() => toggleArrayField('passiveVaccine', 'HRIG', true)} // forceRadio: true
                    isRadio={true} // Visual change to radio circle
                />
            </View>

            <Text style={section5Styles.fieldLabel}>No. of Units<Text style={{ color: '#D32F2F' }}> *</Text></Text>
            <TextInput
                style={section5Styles.input}
                placeholder="Enter units"
                placeholderTextColor="#aaa"
                value={(formData.passiveVaccineUnits === undefined || formData.passiveVaccineUnits === null) ? '' : String(formData.passiveVaccineUnits)}
                onChangeText={(val) => {
                    // Allow numbers and decimal point
                    const cleaned = String(val).replace(/[^0-9.]/g, '');
                    // Ensure only one decimal point
                    const parts = cleaned.split('.');
                    const formatted = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : cleaned;
                    
                    // Store the numeric value
                    onInputChange('passiveVaccineUnits', formatted);
                    
                    // Auto-combine with unit type if available
                    const combined = combineUnitsWithType(formatted, formData.passiveVaccineUnitType);
                    onInputChange('passiveVaccineUnitsCombined', combined);
                }}
                keyboardType="decimal-pad"
            />

            <Text style={section5Styles.fieldLabel}>Unit of Measurement<Text style={{ color: '#D32F2F' }}> *</Text></Text>
            <View style={section5Styles.groupContainer}>
                <Checkbox
                    label="IU"
                    isSelected={(formData.passiveVaccineUnitType || '') === 'IU'}
                    onToggle={() => {
                        onInputChange('passiveVaccineUnitType', 'IU');
                        const combined = combineUnitsWithType(formData.passiveVaccineUnits, 'IU');
                        onInputChange('passiveVaccineUnitsCombined', combined);
                    }}
                    isRadio={true}
                />
                <Checkbox
                    label="ml"
                    isSelected={(formData.passiveVaccineUnitType || '') === 'ml'}
                    onToggle={() => {
                        onInputChange('passiveVaccineUnitType', 'ml');
                        const combined = combineUnitsWithType(formData.passiveVaccineUnits, 'ml');
                        onInputChange('passiveVaccineUnitsCombined', combined);
                    }}
                    isRadio={true}
                />
                <Checkbox
                    label="mg"
                    isSelected={(formData.passiveVaccineUnitType || '') === 'mg'}
                    onToggle={() => {
                        onInputChange('passiveVaccineUnitType', 'mg');
                        const combined = combineUnitsWithType(formData.passiveVaccineUnits, 'mg');
                        onInputChange('passiveVaccineUnitsCombined', combined);
                    }}
                    isRadio={true}
                />
                <Checkbox
                    label="g"
                    isSelected={(formData.passiveVaccineUnitType || '') === 'g'}
                    onToggle={() => {
                        onInputChange('passiveVaccineUnitType', 'g');
                        const combined = combineUnitsWithType(formData.passiveVaccineUnits, 'g');
                        onInputChange('passiveVaccineUnitsCombined', combined);
                    }}
                    isRadio={true}
                />
                <Checkbox
                    label="oz"
                    isSelected={(formData.passiveVaccineUnitType || '') === 'oz'}
                    onToggle={() => {
                        onInputChange('passiveVaccineUnitType', 'oz');
                        const combined = combineUnitsWithType(formData.passiveVaccineUnits, 'oz');
                        onInputChange('passiveVaccineUnitsCombined', combined);
                    }}
                    isRadio={true}
                />
            </View>

            {/* Active Vaccine (Already Radio) */}
            <Text style={section5Styles.labelTitle}>Active Vaccine<Text style={{ color: '#D32F2F' }}> *</Text></Text>
            <View style={section5Styles.groupContainer}>
                <Checkbox
                    label="PVRV"
                    isSelected={activeVaccine.includes('PVRV')}
                    onToggle={() => toggleArrayField('activeVaccine', 'PVRV', true)}
                    isRadio={true}
                />
                <Checkbox
                    label="PCECV"
                    isSelected={activeVaccine.includes('PCECV')}
                    onToggle={() => toggleArrayField('activeVaccine', 'PCECV', true)}
                    isRadio={true}
                />
            </View>

            <Text style={section5Styles.fieldLabel}>Others (Specify - Optional)</Text>
            <TextInput
                style={section5Styles.input}
                placeholder="Specify other vaccines"
                placeholderTextColor="#aaa"
                value={formData.activeVaccineOther || ''}
                onChangeText={(val) => onInputChange('activeVaccineOther', val.toUpperCase())}
            />

            {/* Antibiotics - CHANGED TO TEXT INPUT */}
            <Text style={section5Styles.labelTitle}>Antibiotics (Optional)</Text>
            <TextInput
                style={section5Styles.input}
                placeholder="Enter prescribed antibiotics and dosage (e.g., Amoxicillin 500mg TID)"
                placeholderTextColor="#aaa"
                value={formData.antibioticsText || ''} // New field to store text
                onChangeText={(val) => onInputChange('antibioticsText', val.toUpperCase())}
            />
            {/* Removed the original <View style={section5Styles.groupContainer}>... checkboxes */}

            {/* Analgesic */}
            <Text style={section5Styles.labelTitle}>Analgesic/Anti-inflammatory (Optional)</Text>
            <TextInput
                style={section5Styles.input}
                placeholder="Enter medication and dosage"
                placeholderTextColor="#aaa"
                value={formData.antiInflammatoryMedication || ''}
                onChangeText={(val) => onInputChange('antiInflammatoryMedication', val.toUpperCase())}
            />

            {/* Physician */}
            <Text style={section5Styles.labelTitle}>Physician Name (Optional)</Text>
            <TextInput
                style={section5Styles.input}
                placeholder="Enter physician's name"
                placeholderTextColor="#aaa"
                value={formData.physicianName || ''}
                onChangeText={(val) => onInputChange('physicianName', val.toUpperCase())}
            />
            <Text style={section5Styles.noteText}>
                Digital signature will be captured upon submission (Not implemented in this UI)
            </Text>

        </View>
    );
};

// --- STYLES ---
const section5Styles = StyleSheet.create({
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
        marginBottom: 8,
    },
    fieldLabel: {
        fontSize: 14,
        fontWeight: '500',
        color: '#444',
        marginTop: 10,
        marginBottom: 5,
    },
    input: {
        borderWidth: 1,
        borderColor: '#ccc',
        padding: 12,
        borderRadius: 8,
        fontSize: 16,
        backgroundColor: '#fff',
    },
    textArea: {
        height: 100,
        textAlignVertical: 'top',
    },
    noteText: {
        fontSize: 12,
        color: '#999',
        marginTop: 4,
        marginBottom: 10,
    },
    groupContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: 10,
    },
});

export default Section5;