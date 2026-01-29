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
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from "@expo/vector-icons";
import { account, appwriteConfig, databases, Query } from "./appwriteConfig";
import { registerForPushNotificationsAsync, savePushTokenForCurrentUser } from "../notifications/notificationService";
import { useFonts, Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold, Poppins_700Bold } from "@expo-google-fonts/poppins";

const { width, height } = Dimensions.get('window');

const ROLE = {
    PHYSICIAN: 'physician',
    BHW: 'bhw',
};

const navigateToMain = (navigation, authUserId, workerProfile, records) => {
    navigation.navigate('Main', {
        authUserId: authUserId,
        workerProfile: workerProfile,
        records: records,
    });
};

function SelectRole({ navigation }) {
    const [fontsLoaded] = useFonts({
        'Poppins': Poppins_400Regular,
        'Poppins-Regular': Poppins_400Regular,
        'Poppins-Medium': Poppins_500Medium,
        'Poppins-SemiBold': Poppins_600SemiBold,
        'Poppins-Bold': Poppins_700Bold,
    });

    const [role, setRole] = useState(ROLE.BHW);
    const [idOrEmail, setIdOrEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    if (!fontsLoaded) {
        return null;
    }

    const deleteCurrentSession = async () => {
        try {
            await account.deleteSession('current');
            console.log('Previous session deleted.');
        } catch (e) {
            console.log('No previous session to delete.');
        }
    };

    const handleLogin = async () => {
        if (!idOrEmail || !password) {
            Alert.alert('Login', `Please enter ${role === ROLE.BHW ? 'Health Worker ID' : 'Email'} and password.`);
            return;
        }
        setIsLoading(true);
        try {
            await deleteCurrentSession();
            let workerProfile, workerEmail, authUserId, records = [];
            if (role === ROLE.BHW) {
                // BHW login flow
                const staffRes = await databases.listDocuments(
                    appwriteConfig.staffDatabaseId,
                    appwriteConfig.healthWorkersCollectionId,
                    [Query.equal('healthWorkerID', idOrEmail.trim())]
                );
                if (!staffRes.documents || staffRes.documents.length === 0) {
                    throw new Error('Invalid Health Worker ID.');
                }
                workerProfile = staffRes.documents[0];
                workerEmail = workerProfile.email;
                if (!workerEmail) {
                    throw new Error('Profile error: Missing email.');
                }
                await account.createEmailPasswordSession(workerEmail, password);
                const newCurrentUser = await account.get();
                authUserId = newCurrentUser.$id;
                try {
                    const expoToken = await registerForPushNotificationsAsync();
                    if (expoToken) {
                        await savePushTokenForCurrentUser(expoToken);
                    }
                } catch (tokenError) {
                    console.log("Push token registration failed:", tokenError);
                }
                const recordsRes = await databases.listDocuments(
                    appwriteConfig.patientDatabaseId,
                    appwriteConfig.patientRecordsCollectionId,
                    [
                        Query.equal('purok', workerProfile.purok),
                        Query.equal('barangay', workerProfile.barangay)
                    ]
                );
                records = recordsRes.documents || [];
            } else {
                // Physician login flow
                if (!appwriteConfig.physicianAccountsCollectionId) {
                    throw new Error('Missing Appwrite config: physicianAccountsCollectionId');
                }
                // 1) Authenticate against Appwrite Auth using the entered email/password
                workerEmail = idOrEmail.trim();
                await account.createEmailPasswordSession(workerEmail, password);
                const newCurrentUser = await account.get();
                authUserId = newCurrentUser.$id;

                // 2) Fetch physician profile by auth_user_id from physician_accounts
                const staffRes = await databases.listDocuments(
                    appwriteConfig.staffDatabaseId,
                    appwriteConfig.physicianAccountsCollectionId,
                    [Query.equal('auth_user_id', authUserId)]
                );
                if (!staffRes.documents || staffRes.documents.length === 0) {
                    throw new Error('Physician profile not found.');
                }
                workerProfile = staffRes.documents[0];

                try {
                    const expoToken = await registerForPushNotificationsAsync();
                    if (expoToken) {
                        await savePushTokenForCurrentUser(expoToken);
                    }
                } catch (tokenError) {
                    console.log("Push token registration failed:", tokenError);
                }
                // Fetch records for physician if needed (customize as needed)
                records = [];
            }
            navigateToMain(navigation, authUserId, workerProfile, records);
        } catch (error) {
            console.error('Login Error:', error);
            let errorMessage = 'Login failed. Please check your credentials.';
            if (error.message.includes('Invalid Health Worker ID')) {
                errorMessage = 'Invalid Health Worker ID.';
            } else if (error.message.includes('Physician profile not found')) {
                errorMessage = 'Physician account profile not found. Please contact administrator.';
            } else if (error.message.includes('physicianAccountsCollectionId')) {
                errorMessage = 'Physician login is not configured. Please set EXPO_PUBLIC_PHYSICIAN_ACCOUNTS_COLLECTION_ID.';
            } else if (error.message.includes('Missing email')) {
                errorMessage = 'Profile data error. Contact support.';
            } else if (error.name === 'AppwriteException' && error.message.includes('Invalid credentials')) {
                errorMessage = 'Invalid email or password.';
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
                <Text style={styles.selectRoleTitle}>SELECT ROLE</Text>
                <View style={styles.roleContainer}>
                    <TouchableOpacity
                        style={[styles.roleButton, role === ROLE.PHYSICIAN && styles.selectedRole]}
                        onPress={() => setRole(ROLE.PHYSICIAN)}
                        disabled={isLoading}
                    >
                        <MaterialCommunityIcons name="stethoscope" size={48} color={role === ROLE.PHYSICIAN ? "#125872" : "#226B85"} />
                        <Text style={styles.roleText}>PHYSICIAN</Text>
                        {role === ROLE.PHYSICIAN && <Ionicons name="checkmark-circle" size={24} color="#1ED760" style={styles.checkIcon} />}
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.roleButton, role === ROLE.BHW && styles.selectedRole]}
                        onPress={() => setRole(ROLE.BHW)}
                        disabled={isLoading}
                    >
                        <FontAwesome5 name="clinic-medical" size={48} color={role === ROLE.BHW ? "#125872" : "#226B85"} />
                        <Text style={styles.roleText}>BHW</Text>
                        {role === ROLE.BHW && <Ionicons name="checkmark-circle" size={24} color="#1ED760" style={styles.checkIcon} />}
                    </TouchableOpacity>
                </View>
                <View style={styles.inputContainer}>
                    <Ionicons name={role === ROLE.BHW ? "id-card" : "mail"} size={15} color="#125872" style={styles.icon} />
                    <TextInput
                        style={styles.input}
                        placeholder={role === ROLE.BHW ? "Health Worker ID" : "Email"}
                        placeholderTextColor="#C9C9C9"
                        value={idOrEmail}
                        onChangeText={setIdOrEmail}
                        editable={!isLoading}
                        autoCapitalize={role === ROLE.BHW ? "none" : "none"}
                        keyboardType={role === ROLE.BHW ? "default" : "email-address"}
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
    header: {},
    welcomeText: { fontSize: 16, color: "#125872", fontWeight: "bold", lineHeight: 20, fontFamily: "Poppins-Bold", letterSpacing: -1, marginBottom: -5 },
    cityText: { fontSize: 42, color: "#125872", fontWeight: "900", lineHeight: 45, fontFamily: "Poppins-Bold", letterSpacing: -2, paddingTop: 5, zIndex: 10 },
    subText: { fontSize: 13, color: "#125872", fontStyle: "italic", lineHeight: 12, fontFamily: "Poppins-Regular", letterSpacing: -1, zIndex: 10, paddingTop: 5 },
    loginBox: { backgroundColor: "#226B85", borderTopLeftRadius: 50, padding: 35, paddingBottom: 0, width: '100%', alignSelf: 'flex-end' },
    selectRoleTitle: { color: "#fff", fontSize: 22, fontWeight: "900", lineHeight: 32, paddingBottom: 10, fontFamily: "Poppins-Bold", letterSpacing: -1 },
    roleContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
    roleButton: { flex: 1, alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, marginHorizontal: 5, paddingVertical: 15, position: 'relative' },
    selectedRole: { borderWidth: 2, borderColor: '#1ED760', backgroundColor: '#e6f9f0' },
    roleText: { color: '#125872', fontSize: 16, fontWeight: 'bold', fontFamily: 'Poppins-Bold', marginTop: 8 },
    checkIcon: { position: 'absolute', top: 10, right: 10 },
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
    loginButton: { backgroundColor: "#125872", borderRadius: 12, paddingVertical: 15, width: "100%", alignItems: "center", marginTop: 25 },
    loginButtonText: { color: "#fff", fontSize: 16, fontWeight: "bold", fontFamily: "Poppins-Bold" },
    footerImage: { width: width, height: height * 0.20, resizeMode: "cover", alignSelf: 'center' }
});

export default SelectRole;
