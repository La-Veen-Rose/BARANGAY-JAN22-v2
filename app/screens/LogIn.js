import React, { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Image,
    ImageBackground,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { account, appwriteConfig, databases, Query } from "./appwriteConfig";
import { registerForPushNotificationsAsync, savePushTokenForCurrentUser } from "../notifications/notificationService";
import { useFonts, Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold, Poppins_700Bold } from "@expo-google-fonts/poppins";

const { width, height } = Dimensions.get('window');

// Navigation helper to keep the navigate call tidy
const navigateToMain = (navigation, authUserId, workerProfile, records) => {
    navigation.navigate('Main', {
        authUserId: authUserId,
        workerProfile: workerProfile,
        records: records,
    });
};

function LogIn({ navigation }) {
    // ------------------------------------------------------------------
    // Fonts
    // ------------------------------------------------------------------
    const [fontsLoaded] = useFonts({
        'Poppins': Poppins_400Regular,
        'Poppins-Regular': Poppins_400Regular,
        'Poppins-Medium': Poppins_500Medium,
        'Poppins-SemiBold': Poppins_600SemiBold,
        'Poppins-Bold': Poppins_700Bold,
    });

    // ------------------------------------------------------------------
    // Local state
    // ------------------------------------------------------------------
    const [healthWorkerID, sethealthWorkerID] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // Wait for fonts after all hooks are registered to keep hook order stable
    if (!fontsLoaded) {
        return null;
    }

    // ------------------------------------------------------------------
    // Session management helpers
    // ------------------------------------------------------------------
    const deleteCurrentSession = async () => {
        try {
            await account.deleteSession('current');
            console.log('Previous session deleted.');
        } catch (e) {
            console.log('No previous session to delete.');
        }
    };

    // ------------------------------------------------------------------
    // Main login flow
    // ------------------------------------------------------------------
    const handleLogin = async () => {
        if (!healthWorkerID || !password) {
            Alert.alert('Login', 'Please enter Health Worker ID and password.');
            return;
        }

        setIsLoading(true);

        try {
            // --- Always clear any existing session ---
            await deleteCurrentSession();

            // --- Step 1: Lookup profile in DB ---
            const staffRes = await databases.listDocuments(
                appwriteConfig.staffDatabaseId, 
                appwriteConfig.healthWorkersCollectionId, 
                [
                    Query.equal('healthWorkerID', healthWorkerID.trim())
                ]
            );

            if (!staffRes.documents || staffRes.documents.length === 0) {
                throw new Error('Invalid Health Worker ID.');
            }

            const workerProfile = staffRes.documents[0];
            const workerEmail = workerProfile.email;

            if (!workerEmail) {
                throw new Error('Profile error: Missing email.');
            }

            // --- Step 2: Authenticate user ---
            await account.createEmailPasswordSession(workerEmail, password);

            const newCurrentUser = await account.get();
            const authUserId = newCurrentUser.$id;

            // Register and store Expo push token for this logged-in user
            try {
                const expoToken = await registerForPushNotificationsAsync();
                if (expoToken) {
                    await savePushTokenForCurrentUser(expoToken);
                }
            } catch (tokenError) {
                console.log("Push token registration failed:", tokenError);
            }

            // --- Step 3: Fetch patient records for this user's purok and barangay ---
            const recordsRes = await databases.listDocuments(
                appwriteConfig.patientDatabaseId, 
                appwriteConfig.patientRecordsCollectionId, 
                [
                    Query.equal('purok', workerProfile.purok),
                    Query.equal('barangay', workerProfile.barangay)
                ]
            );

            const records = recordsRes.documents || [];

            navigateToMain(navigation, authUserId, workerProfile, records);

        } catch (error) {
            console.error('Login Error:', error);
            let errorMessage = 'Login failed. Please check your credentials.';

            if (error.message.includes('Invalid Health Worker ID')) {
                errorMessage = 'Invalid Health Worker ID.';
            } else if (error.message.includes('Missing email')) {
                errorMessage = 'Profile data error. Contact support.';
            } else if (error.name === 'AppwriteException' && error.message.includes('Invalid credentials')) {
                errorMessage = 'Invalid Health Worker ID or Password.';
            }

            Alert.alert('Login Failed', errorMessage);

        } finally {
            setIsLoading(false);
        }
    };

    return (
        <ImageBackground
            style={styles.background}
            source={require("../assets/bg-blue.png")}
        >
            <View style={styles.headerContainer}>
                <View style={styles.header}>
                    <Text style={styles.welcomeText}>Mabuhay og Madayaw,</Text>
                    <Text style={styles.cityText}>Tagumeños!</Text>
                    <Text style={styles.subText}>Welcome to RAVEN!</Text>
                </View>
            </View>

            <View style={styles.loginBox}>
                <Text style={styles.loginTitle}>Login</Text>


                <View style={styles.inputContainer}>
                    <Ionicons name="id-card" size={15} color="#125872" style={styles.icon} />
                    <TextInput
                        style={styles.input}
                        placeholder="Health Worker ID"
                        placeholderTextColor="#C9C9C9"
                        value={healthWorkerID}
                        onChangeText={sethealthWorkerID}
                        editable={!isLoading}
                        autoCapitalize="none"
                    />
                </View>

                <View style={styles.inputContainer}>
                    <Ionicons name="lock-closed" size={15} color="#125872" style={styles.icon} />
                    <TextInput
                        style={styles.input}
                        placeholder="Password"
                        placeholderTextColor="#C9C9C9"
                        secureTextEntry={!showPassword}
                        value={password}
                        onChangeText={setPassword}
                        editable={!isLoading}
                    />
                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)} disabled={isLoading}>
                        <Ionicons
                            name={showPassword ? "eye-off" : "eye"}
                            size={20}
                            color="#125872"
                            style={styles.eyeIcon}
                        />
                    </TouchableOpacity>
                </View>

                <TouchableOpacity
                    style={styles.loginButton}
                    onPress={handleLogin}
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.loginButtonText}>Login</Text>
                    )}
                </TouchableOpacity>

                <Image source={require("../assets/CityHall-img.png")} style={styles.footerImage} />
            </View>
        </ImageBackground>
    );
}

const styles = StyleSheet.create({
    background: { flex: 1 },
    headerContainer: { flex: 1, justifyContent: 'center', paddingHorizontal: 35 },
    header:{},
    welcomeText: { fontSize: 16, color: "#125872", fontWeight: "bold", lineHeight: 20, fontFamily: "Poppins-Bold", letterSpacing: -1, marginBottom: -5},
    cityText: { fontSize: 42, color: "#125872", fontWeight: "900", lineHeight: 45, fontFamily: "Poppins-Bold", letterSpacing: -2, paddingTop: 5, zIndex: 10},
    subText: { fontSize: 13, color: "#125872", fontStyle: "italic", lineHeight: 12, fontFamily: "Poppins-Regular", letterSpacing: -1, zIndex: 10, paddingTop: 5},
    loginBox: { backgroundColor: "#226B85", borderTopLeftRadius: 50, padding: 35, paddingBottom: 0, width: '100%', alignSelf: 'flex-end' },
    loginTitle: { color: "#fff", fontSize: 30, fontWeight: "900", lineHeight: 42, paddingBottom: 20, fontFamily: "Poppins-Bold", letterSpacing: -1 },
    inputContainer: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 10, paddingHorizontal: 10, marginVertical: 15, width: "100%" },
    icon: { marginRight: 5 },
    eyeIcon: { paddingHorizontal: 4 },
    input: {
        flex: 1,
        height: 40,
        fontSize: 14,
        color: "#125872",
        fontFamily: "Poppins-Regular",
        paddingVertical: 8,
        ...Platform.select({
            android: {
                textAlignVertical: 'center',
                includeFontPadding: false,
            },
            ios: {
                paddingVertical: 10,
            },
        }),
    },
    loginButton:{ backgroundColor: "#125872", borderRadius: 12, paddingVertical: 15, width: "100%", alignItems: "center", marginTop: 25 },
    loginButtonText: { color: "#fff", fontSize: 16, fontWeight: "bold", fontFamily: "Poppins-Bold" },
    footerImage: { width: width, height: height * 0.20, resizeMode: "cover", alignSelf: 'center' }
});

export default LogIn;
