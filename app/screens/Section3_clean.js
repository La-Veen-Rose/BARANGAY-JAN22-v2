import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Dimensions,
  Platform,
} from 'react-native';

import { FontAwesome5 } from "@expo/vector-icons";
import DateTimePicker from '@react-native-community/datetimepicker';

const { width } = Dimensions.get('window');

const formatDate = (dateValue) => {
  if (!dateValue) return '';
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (isNaN(date.getTime())) return '';
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${m}/${d}/${y}`;
};

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

const FormInput = ({ label, required, onInputChange, fieldName, value, placeholder, multiline = false, ...props }) => {
  const inputStyle = [
    sectionStyles.input,
    multiline && sectionStyles.multilineInput,
  ];

  return (
    <View style={sectionStyles.inputGroup}>
      <Text style={sectionStyles.fieldLabel}>
        {label} {required && <Text style={{ color: '#D32F2F' }}> *</Text>}
      </Text>

      <TextInput
        style={inputStyle}
        placeholder={placeholder || `Enter ${label.toLowerCase()}`}
        placeholderTextColor="#aaa"
        onChangeText={(val) => onInputChange(fieldName, val)}
        value={value}
        multiline={multiline}
        numberOfLines={multiline ? 4 : 1}
        autoCapitalize="none"
        {...props}
      />
    </View>
  );
};

const FormDatePicker = ({ label, fieldName, value, onInputChange, required = false, style }) => {
  const [showPicker, setShowPicker] = useState(false);
  const dateObject = value ? new Date(value) : new Date();
  const [textInputValue, setTextInputValue] = useState(formatDate(value));

  useEffect(() => {
    setTextInputValue(formatDate(value));
  }, [value]);

  const handleManualChange = (text) => {
    let cleaned = text.replace(/\D/g, '').slice(0, 8);
    let formatted = cleaned;

    if (cleaned.length > 2) formatted = `${cleaned.slice(0, 2)}/${cleaned.slice(2)}`;
    if (cleaned.length > 4) formatted = `${formatted.slice(0, 5)}/${formatted.slice(5)}`;

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
    setTextInputValue(value ? formatDate(value) : "");
  };

  return (
    <View style={[sectionStyles.inputGroup, style]}>
      <Text style={sectionStyles.fieldLabel}>{label} {required && <Text style={{ color: '#D32F2F' }}> *</Text>}</Text>
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
            if (selectedDate) onInputChange(fieldName, selectedDate.toISOString());
          }}
        />
      )}
    </View>
  );
};

export default function Section3_clean({ formData, onInputChange }) {
  const { prevAntiRabies, prevAntiRabiesDate, historyOfAllergies } = formData;
  const handleSetPrevAntiRabies = (value) => {
    onInputChange('prevAntiRabies', value);
    if (value === 'No') onInputChange('prevAntiRabiesDate', '');
  };
  const isPrevRabiesYes = prevAntiRabies === 'Yes';

  return (
    <View style={sectionStyles.card}>
      <View style={sectionStyles.headerBlock}>
        <Text style={sectionStyles.headerText}>PERTINENT PAST MEDICAL HISTORY</Text>
        <Text style={sectionStyles.subText}>Previous immunization and medical conditions</Text>
      </View>

      <Text style={sectionStyles.labelTitle}>Previous Immunization (Anti-Rabies) of Patient <Text style={{ color: '#D32F2F' }}> *</Text></Text>
      <View style={sectionStyles.radioGroup}>
        <FormRadioOption label="Yes" value="Yes" selectedValue={prevAntiRabies} onSelect={handleSetPrevAntiRabies} />
        <FormRadioOption label="No" value="No" selectedValue={prevAntiRabies} onSelect={handleSetPrevAntiRabies} />
      </View>

      {isPrevRabiesYes && (
        <FormDatePicker
          label="When (Date)"
          fieldName="prevAntiRabiesDate"
          value={prevAntiRabiesDate}
          onInputChange={onInputChange}
          required={true}
          style={sectionStyles.indentedInput}
        />
      )}

      <Text style={sectionStyles.labelTitle}>History of Allergies or Asthma of Patient</Text>
      <FormInput
        label="List allergies and asthma details (optional)"
        fieldName="historyOfAllergies"
        value={historyOfAllergies}
        onInputChange={onInputChange}
        placeholder="e.g., Penicillin, shellfish, severe seasonal asthma..."
        multiline
        required={false}
      />

      <View style={sectionStyles.infoBox}>
        <Text style={sectionStyles.infoTextHeader}>Important Medical History</Text>
        <Text style={sectionStyles.infoText}>This information is crucial for determining safe treatment options and preventing adverse reactions to vaccines or medications.</Text>
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
  multilineInput: {
    height: 100,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  indentedInput: {
    marginLeft: 20,
    width: '95%',
    alignSelf: 'flex-start',
  },
  radioGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
    justifyContent: 'flex-start',
  },
  optionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 25,
    marginTop: 5,
    minWidth: '30%',
    marginBottom: 5,
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
    backgroundColor: '#fff',
  },
  radioDot: {
    height: 10,
    width: 10,
    borderRadius: 5,
    backgroundColor: '#125872',
  },
  optionLabel: {
    fontSize: 16,
    color: '#333',
  },
  infoBox: {
    marginTop: 20,
    padding: 15,
    backgroundColor: '#FFEBEE',
    borderLeftWidth: 5,
    borderLeftColor: '#F44336',
    borderRadius: 8,
  },
  infoTextHeader: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#D32F2F',
    marginBottom: 5,
  },
  infoText: {
    fontSize: 14,
    color: '#D32F2F',
  },
  hybridInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  hybridTextInput: {
    flex: 1,
    borderWidth: 0,
    padding: 12,
    fontSize: 16,
    backgroundColor: 'transparent',
  },
  hybridIconWrapper: {
    padding: 12,
    borderLeftWidth: 1,
    borderLeftColor: '#eee',
  },
});
