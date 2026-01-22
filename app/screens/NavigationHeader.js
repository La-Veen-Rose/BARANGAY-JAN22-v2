import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import SubmittedCasesList from './SubmittedCasesList';
import PatientRecordContent from './PatientRecordContent';

function NavigationHeader({ navigation, route }) {
  // If route has patient data, start with patient record view
  const initialScreen = route?.params?.patient ? 'PATIENT_RECORD' : 'SUBMITTED_CASES';
  const [activeScreen, setActiveScreen] = useState(initialScreen);
  const [selectedPatient, setSelectedPatient] = useState(route?.params?.patient || null);
  const screenName = route?.params?.screenName || 'SUBMITTED_CASES';

  /* ================= HEADER TITLE ================= */
  const getHeaderTitle = () => {
    switch (activeScreen) {
      case 'PATIENT_RECORD':
        return 'PATIENT RECORD';
      default:
        return screenName === 'REFERRAL_STATUS_REPORTS' ? 'REFERRAL STATUS REPORTS' : 'SUBMITTED CASES';
    }
  };

  /* ================= GET HEADER STYLE ================= */
  const getHeaderTitleStyle = () => {
    const title = getHeaderTitle();
    if (title === 'PATIENT RECORD') {
      return styles.patientRecordsText;
    } else if (title === 'REFERRAL STATUS REPORTS') {
      return styles.referralStatusText;
    } else {
      return styles.submittedCasesText;
    }
  };

  /* ================= SCREEN RENDERER ================= */
  const renderContent = () => {
    switch (activeScreen) {
      case 'PATIENT_RECORD':
        return <PatientRecordContent patient={selectedPatient} />;
      default:
        return (
          <SubmittedCasesList
            navigation={navigation}
            route={route}
            onOpenPatientRecordContent={(patient) => {
              setSelectedPatient(patient);
              setActiveScreen('PATIENT_RECORD');
            }}
          />
        );
    }
  };

  /* ================= BACK ACTION ================= */
  const handleBack = () => {
    if (activeScreen === 'PATIENT_RECORD') {
      setActiveScreen('SUBMITTED_CASES');
    } else {
      navigation.goBack();
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      
      {/* ================= HEADER ================= */}
      <View style={styles.headerContainer}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBack}
        >
          <Ionicons
            name="arrow-back-circle-outline"
            size={34}
            color="#FFFFFF"
          />
        </TouchableOpacity>

        <Text style={[styles.headerTitle, getHeaderTitleStyle()]}>
          {getHeaderTitle()}
        </Text>
      </View>

      {/* ================= MAIN CONTENT ================= */}
      <View style={styles.mainContentContainer}>
        {renderContent()}
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#125872',
  },

  /* HEADER */
  headerContainer: {
    height: 70,
    backgroundColor: '#125872',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },

  backButton: {
    marginRight: 12,
  },

  headerTitle: {
    fontSize: 20,
    color: '#FFFFFF',
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '900',
    marginLeft: 35,
  },

  /* ================= SCREEN-SPECIFIC TITLE STYLES ================= */
  patientRecordsText: {
    fontSize: 20,
    color: '#FFFFFF',
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '900',
  },

  referralStatusText: {
    fontSize: 18,
    color: '#FFFFFF',
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '900',
    marginLeft: 9,
  },

  submittedCasesText: {
    fontSize: 20,
    color: '#FFFFFF',
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '900',
  },

  /* MAIN CONTENT */
  mainContentContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 35,
    borderTopRightRadius: 35,
    paddingTop: 16,
  },
});


export default NavigationHeader;
