import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
} from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ConfettiCannon from 'react-native-confetti-cannon';

// Get screen size for better positioning
const { height, width } = Dimensions.get('window');

// 🚨 CONSTANT: Use the same value used for bottom tab bar clearance in Forms.js
const TAB_BAR_HEIGHT = 85; 

function SuccessScreen({ navigation, onDone }) {

    const [showConfetti, setShowConfetti] = useState(true);

    const handleRecordAnother = () => {
        if (onDone) {
            onDone();
        } else {
            navigation.navigate('Forms');
        }
    };

    const handleGoToDashboard = () => {
        if (onDone) {
            // Reset the form state in Forms so a new report starts fresh
            onDone();
        }
        navigation.navigate('Home');
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.container}>
                {showConfetti && (
                    <ConfettiCannon
                        count={120}
                        origin={{ x: width / 2, y: 0 }}
                        fadeOut
                        autoStart
                        onAnimationEnd={() => setShowConfetti(false)}
                    />
                )}
                <View style={styles.content}>
                    
                    {/* Success Icon */}
                    <View style={styles.iconCircle}>
                        <Ionicons name="checkmark-sharp" size={80} color="white" />
                    </View>

                    {/* Confirmation Text */}
                    <Text style={styles.title}>Record Submitted!</Text>
                    <Text style={styles.subtitle}>
                        The patient's health record has been successfully finalized and submitted for review by the City Health Office Nurse.
                    </Text>

                </View>

                <View style={styles.buttonContainer}>
                    <TouchableOpacity style={styles.buttonPrimary} onPress={handleRecordAnother}>
                        <Text style={styles.buttonPrimaryText}>Record Another Patient</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.buttonSecondary} onPress={handleGoToDashboard}>
                        <Text style={styles.buttonSecondaryText}>Back to Dashboard</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#E6F4F6', // Light blue background matching your app theme
    },
    container: {
        flex: 1,
        padding: 20,
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
        width: '100%',
    },
    iconCircle: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: '#38A752', // Green success color
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 30,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 10,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#125872', // Dark blue text
        marginBottom: 10,
    },
    subtitle: {
        fontSize: 16,
        color: '#555',
        textAlign: 'center',
        lineHeight: 24,
    },
    buttonContainer: {
        width: '100%',
        marginBottom: -20,
    },
    buttonPrimary: {
        width: '100%',
        backgroundColor: '#125872',
        padding: 15,
        borderRadius: 10,
        alignItems: 'center',
        marginBottom: 12,
    },
    buttonPrimaryText: {
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold',
    },
    buttonSecondary: {
        width: '100%',
        padding: 15,
        borderRadius: 10,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#125872',
        backgroundColor: 'white',
    },
    buttonSecondaryText: {
        color: '#125872',
        fontSize: 18,
        fontWeight: 'bold',
    },
});

export default SuccessScreen;