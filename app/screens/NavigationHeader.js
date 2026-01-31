import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
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
  const [prescriptionParams, setPrescriptionParams] = useState(null);
  const screenName = route?.params?.screenName || 'SUBMITTED_CASES';

  // Focus status for SubmittedCasesList (allows external screens to request a specific tab)
  const [focusStatus, setFocusStatus] = useState(route?.params?.focusStatus || null);

  // Prescription preview modal hosted here so it stays visible while content switches
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewUri, setPreviewUri] = useState(null);

  const prescriptionNavigation = useMemo(() => {
    return {
      ...navigation,
      goBack: () => {
        // When Prescription is rendered as content inside this header,
        // go back to the patient record view (not the parent navigator).
        setActiveScreen('PATIENT_RECORD');
      },
      // Called by Prescription to show the preview and optionally switch underlying screen/tab
      showPreview: ({ uri, focusStatus: requestedFocusStatus, activeScreen: requestedActive, requestedPatient } = {}) => {
        if (requestedFocusStatus) setFocusStatus(requestedFocusStatus);
        if (requestedActive) setActiveScreen(requestedActive);
        if (requestedPatient) setSelectedPatient(requestedPatient);
        setPreviewUri(uri || null);
        setPreviewVisible(true);
      },
      hidePreview: () => {
        setPreviewVisible(false);
        setPreviewUri(null);
      },
    };
  }, [navigation]);

  const prescriptionRoute = useMemo(() => {
    return {
      key: 'PRESCRIPTION',
      name: 'Prescription',
      params: prescriptionParams || {},
    };
  }, [prescriptionParams]);

  /* ================= HEADER TITLE ================= */
  const getHeaderTitle = () => {
    switch (activeScreen) {
      case 'PATIENT_RECORD':
        return 'PATIENT RECORD';
      case 'PRESCRIPTION':
        return 'PRESCRIPTION';
      default:
        return screenName === 'REFERRAL_STATUS_REPORTS' ? 'REFERRAL STATUS REPORTS' : 'SUBMITTED CASES';
    }
  };

  /* ================= GET HEADER STYLE ================= */
  const getHeaderTitleStyle = () => {
    const title = getHeaderTitle();
    if (title === 'PATIENT RECORD') {
      return styles.patientRecordsText;
    } else if (title === 'PRESCRIPTION') {
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
        return (
          <PatientRecordContent
            patient={selectedPatient}
            onOpenPrescription={({ patient, recordId, mode }) => {
              setPrescriptionParams({
                patient: patient || selectedPatient,
                recordId: recordId || selectedPatient?.id || selectedPatient?.$id,
                mode: mode || 'edit',
              });
              setActiveScreen('PRESCRIPTION');
            }}
          />
        );
      case 'PRESCRIPTION': {
        // Lazy-load to avoid crashing the app at startup if Prescription (or its deps)
        // throws during module evaluation.
        try {
          // eslint-disable-next-line global-require
          const mod = require('./Prescription');
          const Prescription = mod?.default ?? mod;
          if (!Prescription) {
            throw new Error('Prescription module loaded but returned empty exports.');
          }
          return (
            <Prescription
              navigation={prescriptionNavigation}
              route={prescriptionRoute}
            />
          );
        } catch (e) {
          console.error('PRESCRIPTION_SCREEN_LOAD_FAILED', e);
          return (
            <View style={{ flex: 1, backgroundColor: '#FFFFFF', padding: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827' }}>
                Prescription screen failed to load
              </Text>
              <Text style={{ marginTop: 10, color: '#374151' }}>
                {String(e?.message || e)}
              </Text>
              <TouchableOpacity
                style={{ marginTop: 16, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: '#125872', borderRadius: 10, alignSelf: 'flex-start' }}
                onPress={() => setActiveScreen('PATIENT_RECORD')}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Go back</Text>
              </TouchableOpacity>
            </View>
          );
        }
      }
      default:
        return (
          <SubmittedCasesList
            navigation={navigation}
            route={{ ...(route || {}), params: { ...(route?.params || {}), focusStatus } }}
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
    if (activeScreen === 'PRESCRIPTION') {
      setActiveScreen('PATIENT_RECORD');
    } else if (activeScreen === 'PATIENT_RECORD') {
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

      {/* Prescription preview modal (hosted here so it persists across content changes) */}
      {previewVisible ? (
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999,
            elevation: 9999,
          }}
          pointerEvents="auto"
        >
          <TouchableOpacity
            style={{ position: 'absolute', right: 18, top: 24, zIndex: 10000 }}
            onPress={() => setPreviewVisible(false)}
            activeOpacity={0.9}
          >
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, elevation: 6 }}>
              <Ionicons name="close" size={20} color="#FFFFFF" />
            </View>
          </TouchableOpacity>

          {previewUri ? (
            <View style={{ width: '92%', height: '88%', backgroundColor: '#fff', borderRadius: 8, overflow: 'hidden', zIndex: 9999, elevation: 9999 }}>
              <Image source={{ uri: previewUri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
            </View>
          ) : (
            <View style={{ padding: 20 }}>
              <Text style={{ color: '#fff' }}>Loading preview...</Text>
            </View>
          )}
        </View>
      ) : null}

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
