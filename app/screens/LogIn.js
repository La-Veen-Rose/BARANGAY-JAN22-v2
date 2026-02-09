import React, { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Image,
    ImageBackground,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { account, appwriteConfig, databases, Query } from "./appwriteConfig";
import { registerForPushNotificationsAsync, savePushTokenForCurrentUser } from "../notifications/notificationService";
import { getBhwAccessiblePatientRecordOwnerFilters, STAFF_ROLE, updateLastLoginAtForCurrentUser, updatePresenceForCurrentUser } from "./staffProfileService";
import { logFailedLoginEvent, logSuspiciousLoginEvent, isIdentifierRegistered, logSuccessfulLoginEvent } from "./securityEventsService";
import { logActivity } from './activityLogsService';
import { useFonts, Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold, Poppins_700Bold } from "@expo-google-fonts/poppins";

const { width, height } = Dimensions.get('window');

// Navigation helper to keep the navigate call tidy
const navigateToMain = (navigation, authUserId, workerProfile, records, staffRole) => {
    navigation.navigate('Main', {
        authUserId: authUserId,
        workerProfile: workerProfile,
        records: records,
        staffRole,
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

        let workerEmail = '';
        let workerProfile = null;

        try {
            // --- Always clear any existing session ---
            await deleteCurrentSession();

            const trimmedHealthWorkerId = healthWorkerID.trim();

            // --- Step 1: Lookup profile in DB ---
            console.log('Step 1: Looking up profile for:', trimmedHealthWorkerId);
            const staffRes = await databases.listDocuments(
                appwriteConfig.staffDatabaseId, 
                appwriteConfig.healthWorkersCollectionId, 
                [
                    Query.equal('healthWorkerID', trimmedHealthWorkerId)
                ]
            );

            if (!staffRes.documents || staffRes.documents.length === 0) {
                throw new Error('Invalid Health Worker ID.');
            }

            workerProfile = staffRes.documents[0];
            workerEmail = workerProfile.email;
            console.log('Step 1 complete: Profile found for email:', workerEmail);

            if (!workerEmail) {
                throw new Error('Profile error: Missing email.');
            }

            // --- Step 2: Authenticate user ---
            console.log('Step 2: Creating session for:', workerEmail);
            await account.createEmailPasswordSession(workerEmail, password);

            const newCurrentUser = await account.get();
            const authUserId = newCurrentUser.$id;
            console.log('Step 2 complete: Session created, authUserId:', authUserId);

            // Update lastLoginAt for staff profile (HealthWorkers / Physician_Accounts)
            console.log('Step 3: Updating lastLoginAt...');
            try {
                await updateLastLoginAtForCurrentUser();
                console.log('Step 3 complete: lastLoginAt updated');
            } catch (e) {
                console.log('Skipping lastLoginAt update:', e?.message || String(e));
                // Don't throw - this is optional
            }
            console.log('Step 4: Updating presence...');
            try {
                await updatePresenceForCurrentUser({ isOnline: true });
                console.log('Step 4 complete: presence updated');
            } catch (e) {
                console.log('Skipping presence update:', e?.message || String(e));
                // Don't throw - this is optional
            }

            // Register and store Expo push token for this logged-in user
            console.log('Step 5: Registering push token...');
            try {
                const expoToken = await registerForPushNotificationsAsync();
                if (expoToken) {
                    await savePushTokenForCurrentUser(expoToken);
                    console.log('Step 5 complete: Push token saved');
                }
            } catch (tokenError) {
                console.log("Push token registration failed:", tokenError);
                // Don't throw - this is optional
            }

            // --- Step 6: Fetch patient records accessible to this BHW ---
            // Access is based on the submitting BHW's HealthWorkers purok+barangay (case-insensitive),
            // NOT the patient's address.
            const ownerFilters = await getBhwAccessiblePatientRecordOwnerFilters(workerProfile);
            const recordsRes = await databases.listDocuments(
                appwriteConfig.patientDatabaseId,
                appwriteConfig.patientRecordsCollectionId,
                [
                    ...ownerFilters,
                    Query.orderDesc('$createdAt'),
                    Query.limit(100),
                ]
            );

            const records = recordsRes.documents || [];
            console.log('Step 6 complete: Found', records.length, 'patient records');

            try {
                await logSuccessfulLoginEvent({
                    userEmail: workerEmail,
                    accessPoint: 'Mobile: BHW',
                    authUserId,
                });
            } catch (logError) {
                console.log('Security event log skipped:', logError?.message || String(logError));
            }

            try {
                await logActivity({
                    action: 'Login',
                    description: 'Successful login',
                    staffRole: STAFF_ROLE.BHW,
                    workerProfile,
                });
            } catch (e) {
                console.log('Activity log skipped:', e?.message || String(e));
            }

            console.log('Login successful! Navigating to Main...');
            navigateToMain(navigation, authUserId, workerProfile, records, STAFF_ROLE.BHW);

        } catch (error) {
            console.error('Login Error:', error);
            console.error('Error details - Name:', error.name);
            console.error('Error details - Message:', error.message);
            console.error('Error details - Code:', error.code);
            console.error('Error details - Type:', error.type);

            let securityEventResult = null;
            try {
                if (error.message.includes('Invalid Health Worker ID')) {
                    const registered = await isIdentifierRegistered(healthWorkerID);
                    if (!registered) {
                        securityEventResult = await logSuspiciousLoginEvent({
                            attemptedIdentifier: healthWorkerID,
                            accessPoint: 'Mobile: BHW',
                        });
                    } else {
                        securityEventResult = await logFailedLoginEvent({
                            userEmail: workerEmail || healthWorkerID,
                            accessPoint: 'Mobile: BHW',
                            authUserId: workerProfile?.auth_user_id || null,
                        });
                    }
                } else if (error.name === 'AppwriteException' && error.message.includes('Invalid credentials')) {
                    securityEventResult = await logFailedLoginEvent({
                        userEmail: workerEmail || healthWorkerID,
                        accessPoint: 'Mobile: BHW',
                        authUserId: workerProfile?.auth_user_id || null,
                    });
                } else {
                    securityEventResult = await logFailedLoginEvent({
                        userEmail: workerEmail || healthWorkerID,
                        accessPoint: 'Mobile: BHW',
                        authUserId: workerProfile?.auth_user_id || null,
                    });
                }
            } catch (logError) {
                console.log('Security event log skipped:', logError?.message || String(logError));
            }

            let errorMessage = 'Login failed. Please check your credentials.';

            if (error.message.includes('Invalid Health Worker ID')) {
                errorMessage = 'Invalid Health Worker ID.';
            } else if (error.message.includes('Missing email')) {
                errorMessage = 'Profile data error. Contact support.';
            } else if (error.name === 'AppwriteException' && error.message.includes('Invalid credentials')) {
                errorMessage = 'Invalid Health Worker ID or Password.';
            }

            if (securityEventResult?.eventType === 'Account locked') {
                errorMessage = 'Account locked after multiple failed login attempts.';
            }

            Alert.alert('Login Failed', errorMessage);

        } finally {
            setIsLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.background}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
            <ImageBackground
                style={styles.background}
                source={require("../assets/bg-blue.png")}
            >
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
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
                </ScrollView>
            </ImageBackground>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    background: { flex: 1 },
    headerContainer: { flex: 1, justifyContent: 'center', paddingHorizontal: 35 },
    header:{},
    welcomeText: { fontSize: 16, color: "#125872", fontWeight: "bold", lineHeight: 20, fontFamily: "Poppins-Bold", letterSpacing: -1, marginBottom: -5},
    cityText: { fontSize: 42, color: "#125872", fontWeight: "900", lineHeight: 45, fontFamily: "Poppins-Bold", letterSpacing: -2, paddingTop: 5, zIndex: 10},
    subText: { fontSize: 13, color: "#125872", fontStyle: "italic", lineHeight: 12, fontFamily: "Poppins-Regular", letterSpacing: -1, zIndex: 10, paddingTop: 5},
    scrollContent: { flexGrow: 1 },
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
