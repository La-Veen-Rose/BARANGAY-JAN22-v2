import React from 'react';
import { 
    ImageBackground, 
    Text,
    View, 
    StyleSheet,
    TouchableOpacity} from 'react-native';

function GetStarted({ navigation }) {
    return (
        <ImageBackground style={styles.background} source={require("../assets/bg-blue.png")}>
            <View style={styles.Container}>
               
                <View style={styles.contentContainer}>
                    <Text style={styles.titleText}>
                        Know the situation.
                    </Text>
                    <Text style={styles.subtitleText}>
                        Get updated <Text style={styles.boldText}>rabies statistics and alerts </Text>
                        {'\n'}in your community. 
                    </Text>
                </View>
                {/* Onboarding page indicators */}
                <View style={styles.paginationContainer}>
                    <View style={styles.dot} />
                    <View style={styles.dot} />
                    <View style={styles.activeDot} />
                </View>

                {/* Next Button at the bottom */}
                <TouchableOpacity 
                    style={styles.getStartedButton}
                    onPress={() => navigation.navigate('LogIn')} 
                    >
                    <Text style={styles.getStartedButtonText}>Get Started</Text>
                </TouchableOpacity>
            </View>

        </ImageBackground>
    );
}

const styles = StyleSheet.create({
    background:{
        flex: 1,
        resizeMode: 'cover',
    },
    Container: {
        flex: 1,
        paddingHorizontal: 25,
        paddingVertical: 40,
        justifyContent: 'space-between',
    },
    contentContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    titleText: {
        color: '#125872',
        fontSize: 13,
        fontWeight: 'bold',
        textAlign: 'center',
    },
    subtitleText: {
        color: '#125872',
        fontSize: 13,
        textAlign: 'center',
    },
    boldText: {
        fontWeight: 'bold'
    },
    paginationContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginBottom: 20,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#0f232a01',
        borderColor: '#125872',
        borderWidth: 1,
        marginHorizontal: 4,
    },
    activeDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#125872',
        borderColor: '#125872',
        borderWidth: 1,
        marginHorizontal: 4,
    },
    getStartedButton: {
        width: '100%',
        backgroundColor: '#125872',
        paddingVertical: 15,
        borderRadius: 15,
        alignItems: 'center',
    },
    getStartedButtonText: {
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold',
    },
});

export default GetStarted;