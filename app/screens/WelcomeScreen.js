import React, { useEffect } from 'react';
import { ImageBackground, StyleSheet, View, Text } from 'react-native';

// SVG Logo
import RavenLogo from "../assets/raven-logo-blue.svg";

function WelcomeScreen({ navigation}) {
    useEffect(() => {
        const timer = setTimeout(() => {
            navigation.replace('OnBoarding'); 
        }, 3000); // 3 seconds

        return () => clearTimeout(timer); // Cleanup the timer on unmount
    }, [navigation]);

    return (
        <ImageBackground
            style={styles.background} 
            // FIX: Corrected path to bg-img.png
            source={require("../assets/bg-img.png")} >
            <View style={styles.logoContainer}>
                <RavenLogo width={200} height={200} />
                <Text style={styles.infoText}>
                    Rabies Awareness and Vigilance{'\n'}Exposure Network
                </Text>
            </View>
        </ImageBackground>
    );
}

const styles = StyleSheet.create({
    background: {
        flex: 1,
    },
    logoContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 20,
    },
    infoText: {
        color: '#125872',
        fontSize: 12,
        fontWeight: 'bold',
        marginTop: -20,
        textAlign: 'center',
        fontFamily: 'Poppins_bold',
    },
});

export default WelcomeScreen;