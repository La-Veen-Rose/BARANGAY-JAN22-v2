import React, { useEffect, useRef, useState } from "react";
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
import Checkbox from "expo-checkbox";
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from "@expo/vector-icons";
import { account, appwriteConfig, databases, Query } from "./appwriteConfig";
import { registerForPushNotificationsAsync, savePushTokenForCurrentUser } from "../notifications/notificationService";
import { getBhwAccessiblePatientRecordOwnerFilters, updateLastLoginAtForCurrentUser, updatePresenceForCurrentUser } from "./staffProfileService";
import { logFailedLoginEvent, logSuspiciousLoginEvent, isIdentifierRegistered, logSuccessfulLoginEvent } from "./securityEventsService";
import { logActivity } from './activityLogsService';
import { useFonts, Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold, Poppins_700Bold } from "@expo-google-fonts/poppins";
import { useFocusEffect } from '@react-navigation/native';

const { width, height } = Dimensions.get('window');

const ROLE = {
    PHYSICIAN: 'physician',
    BHW: 'bhw',
};

const REMEMBER_KEYS = {
    enabled: 'rememberMeEnabled',
    lastRole: 'rememberMeLastRole',
    bhwId: 'rememberedBhwHealthWorkerId',
    physicianEmail: 'rememberedPhysicianEmail',
};

const REMEMBER_FILE_NAME = 'remember-me.json';

const getRememberFilePath = () => {
    const baseDir = FileSystem.documentDirectory || '';
    return `${baseDir}${REMEMBER_FILE_NAME}`;
};

const fileStoreRead = async () => {
    try {
        const path = getRememberFilePath();
        if (!path) return {};
        const info = await FileSystem.getInfoAsync(path);
        if (!info.exists) return {};
        const content = await FileSystem.readAsStringAsync(path);
        const parsed = JSON.parse(content || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
};

const fileStoreWrite = async (nextData) => {
    try {
        const path = getRememberFilePath();
        if (!path) return;
        await FileSystem.writeAsStringAsync(path, JSON.stringify(nextData || {}));
    } catch {
        // ignore
    }
};

const buildWorkerContextFromSession = async (authUser) => {
    if (!authUser) {
        throw new Error('Missing auth user');
    }

    const prefs = authUser.prefs || {};
    const lastRole = prefs.lastRole === ROLE.PHYSICIAN ? ROLE.PHYSICIAN : ROLE.BHW;

    if (lastRole === ROLE.PHYSICIAN) {
        if (!appwriteConfig.physicianAccountsCollectionId) {
            throw new Error('Missing Appwrite config: physicianAccountsCollectionId');
        }
        const staffRes = await databases.listDocuments(
            appwriteConfig.staffDatabaseId,
            appwriteConfig.physicianAccountsCollectionId,
            [Query.equal('auth_user_id', authUser.$id)]
        );
        if (!staffRes.documents || staffRes.documents.length === 0) {
            throw new Error('Physician profile not found.');
        }
        return {
            role: ROLE.PHYSICIAN,
            workerProfile: staffRes.documents[0],
            records: [],
        };
    }

    const staffRes = await databases.listDocuments(
        appwriteConfig.staffDatabaseId,
        appwriteConfig.healthWorkersCollectionId,
        [Query.equal('email', authUser.email)]
    );
    if (!staffRes.documents || staffRes.documents.length === 0) {
        throw new Error('Health Worker profile not found.');
    }
    const workerProfile = staffRes.documents[0];

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

    return {
        role: ROLE.BHW,
        workerProfile,
        records: recordsRes.documents || [],
    };
};

const safeSecureGet = async (key) => {
    if (Platform.OS === 'web') {
        try {
            return window?.localStorage?.getItem(key) ?? null;
        } catch {
            return null;
        }
    }
    const data = await fileStoreRead();
    return data[key] ?? null;
};

const safeSecureSet = async (key, value) => {
    if (Platform.OS === 'web') {
        try {
            window?.localStorage?.setItem(key, String(value));
        } catch {
            // ignore
        }
        return;
    }
    const data = await fileStoreRead();
    data[key] = value;
    await fileStoreWrite(data);
};

const safeSecureDelete = async (key) => {
    if (Platform.OS === 'web') {
        try {
            window?.localStorage?.removeItem(key);
        } catch {
            // ignore
        }
        return;
    }
    const data = await fileStoreRead();
    if (Object.prototype.hasOwnProperty.call(data, key)) {
        delete data[key];
        await fileStoreWrite(data);
    }
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
    const [rememberMe, setRememberMe] = useState(false);
    const rememberMeRef = useRef(false);

    useEffect(() => {
        rememberMeRef.current = rememberMe;
    }, [rememberMe]);

    const deleteCurrentSession = async () => {
        try {
            await account.deleteSession('current');
            console.log('Previous session deleted.');
        } catch (e) {
            console.log('No previous session to delete.');
        }
    };

    const clearRememberedIdentifiers = async () => {
        rememberMeRef.current = false;
        await safeSecureDelete(REMEMBER_KEYS.enabled);
        await safeSecureDelete(REMEMBER_KEYS.lastRole);
        await safeSecureDelete(REMEMBER_KEYS.bhwId);
        await safeSecureDelete(REMEMBER_KEYS.physicianEmail);
    };

    const loadRememberedIdentifierForRole = async (nextRole, options = {}) => {
        const { allowEmpty = false } = options;
        const key = nextRole === ROLE.PHYSICIAN ? REMEMBER_KEYS.physicianEmail : REMEMBER_KEYS.bhwId;
        const stored = (await safeSecureGet(key)) || '';
        if (stored) {
            setIdOrEmail(stored);
            return;
        }
        if (allowEmpty) {
            setIdOrEmail('');
        }
    };

    const restoreRememberedIdentifier = async () => {
        setIsLoading(true);
        try {
            // Always force a logged-out state when arriving on the login screen.
            await deleteCurrentSession();

            // Always clear password when returning to login.
            setPassword('');
            setShowPassword(false);

            const enabled = (await safeSecureGet(REMEMBER_KEYS.enabled)) === '1';
            if (!enabled) {
                rememberMeRef.current = false;
                setRememberMe(false);
                return;
            }

            rememberMeRef.current = true;
            setRememberMe(true);
            const storedLastRole = await safeSecureGet(REMEMBER_KEYS.lastRole);
            let initialRole = null;
            if (storedLastRole === ROLE.PHYSICIAN) {
                initialRole = ROLE.PHYSICIAN;
            } else if (storedLastRole === ROLE.BHW) {
                initialRole = ROLE.BHW;
            }
            // If lastRole is missing (older installs), infer role from whichever identifier exists.
            if (!initialRole) {
                const storedPhysician = (await safeSecureGet(REMEMBER_KEYS.physicianEmail)) || '';
                const storedBhw = (await safeSecureGet(REMEMBER_KEYS.bhwId)) || '';
                initialRole = storedPhysician ? ROLE.PHYSICIAN : ROLE.BHW;
                if (!storedPhysician && storedBhw) {
                    initialRole = ROLE.BHW;
                }
            }
            setRole(initialRole);
            await loadRememberedIdentifierForRole(initialRole, { allowEmpty: true });
        } catch (e) {
            console.log('Remember-me restore skipped:', e?.message || e);
        } finally {
            setIsLoading(false);
        }
    };

    useFocusEffect(
        React.useCallback(() => {
            let isActive = true;
            (async () => {
                if (!isActive) return;
                await restoreRememberedIdentifier();
            })();
            return () => {
                isActive = false;
            };
        }, [])
    );

    useEffect(() => {
        // When switching roles, load the remembered identifier for that role (if enabled).
        const syncRememberedOnRoleChange = async () => {
            if (!rememberMe) return;
            await loadRememberedIdentifierForRole(role, { allowEmpty: true });
        };
        syncRememberedOnRoleChange();
    }, [role, rememberMe]);

    useEffect(() => {
        // Persist only the identifier while typing (if Remember me is enabled).
        // This makes autofill reliable after logout without ever storing a password.
        if (!rememberMe) return;

        const trimmed = String(idOrEmail || '').trim();
        const key = role === ROLE.PHYSICIAN ? REMEMBER_KEYS.physicianEmail : REMEMBER_KEYS.bhwId;

        const t = setTimeout(async () => {
            try {
                await safeSecureSet(REMEMBER_KEYS.enabled, '1');
                await safeSecureSet(REMEMBER_KEYS.lastRole, role);
                if (trimmed) {
                    await safeSecureSet(key, trimmed);
                }
            } catch {
                // ignore
            }
        }, 300);

        return () => clearTimeout(t);
    }, [idOrEmail, rememberMe, role]);

    if (!fontsLoaded) {
        return null;
    }

    const handleLogin = async () => {
        if (!idOrEmail || !password) {
            Alert.alert('Login', `Please enter ${role === ROLE.BHW ? 'Health Worker ID' : 'Email'} and password.`);
            return;
        }
        setIsLoading(true);
        let workerEmail = '';
        let workerProfile = null;
        let authUserId = '';
        let securityEventResult = null;
        const accessPoint = role === ROLE.PHYSICIAN ? 'Mobile: Physician' : 'Mobile: BHW';
        try {
            await deleteCurrentSession();
            let records = [];
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

                // Update lastLoginAt for staff profile (HealthWorkers / Physician_Accounts)
                try {
                    await updateLastLoginAtForCurrentUser();
                } catch (e) {
                    console.log('Skipping lastLoginAt update:', e?.message || String(e));
                }
                try {
                    await updatePresenceForCurrentUser({ isOnline: true });
                } catch (e) {
                    console.log('Skipping presence update:', e?.message || String(e));
                }
                try {
                    const expoToken = await registerForPushNotificationsAsync();
                    if (expoToken) {
                        await savePushTokenForCurrentUser(expoToken);
                    }
                } catch (tokenError) {
                    console.log("Push token registration failed:", tokenError);
                }
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

                // Update lastLoginAt for staff profile (HealthWorkers / Physician_Accounts)
                try {
                    await updateLastLoginAtForCurrentUser();
                } catch (e) {
                    console.log('Skipping lastLoginAt update:', e?.message || String(e));
                }
                try {
                    await updatePresenceForCurrentUser({ isOnline: true });
                } catch (e) {
                    console.log('Skipping presence update:', e?.message || String(e));
                }

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

            // Remember-me: persist only the identifier (email / health worker id), never the password.
            try {
                const shouldRemember = (rememberMeRef.current === true) || (rememberMe === true);
                if (shouldRemember) {
                    await safeSecureSet(REMEMBER_KEYS.enabled, '1');
                    await safeSecureSet(REMEMBER_KEYS.lastRole, role);
                    if (role === ROLE.PHYSICIAN) {
                        await safeSecureSet(REMEMBER_KEYS.physicianEmail, idOrEmail.trim());
                    } else {
                        await safeSecureSet(REMEMBER_KEYS.bhwId, idOrEmail.trim());
                    }
                } else {
                    await clearRememberedIdentifiers();
                }
            } catch (prefError) {
                console.log('Failed to save rememberMe identifier:', prefError);
            }

            try {
                await logSuccessfulLoginEvent({
                    userEmail: workerEmail || idOrEmail,
                    accessPoint,
                    authUserId,
                });
            } catch (logError) {
                console.log('Security event log skipped:', logError?.message || String(logError));
            }

            try {
                await logActivity({
                    action: 'Login',
                    description: 'Successful login',
                    staffRole: role,
                    workerProfile,
                });
            } catch (e) {
                console.log('Activity log skipped:', e?.message || String(e));
            }

            navigateToMain(navigation, authUserId, workerProfile, records);
        } catch (error) {
            console.error('Login Error:', error);

            try {
                const resolveAuthUserIdForLog = async () => {
                    if (authUserId) return authUserId;
                    if (workerProfile?.auth_user_id) return workerProfile.auth_user_id;

                    if (role === ROLE.PHYSICIAN && workerEmail && appwriteConfig.physicianAccountsCollectionId) {
                        try {
                            const res = await databases.listDocuments(
                                appwriteConfig.staffDatabaseId,
                                appwriteConfig.physicianAccountsCollectionId,
                                [Query.equal('email', workerEmail), Query.limit(1)]
                            );
                            return res.documents?.[0]?.auth_user_id || null;
                        } catch (lookupError) {
                            console.log('Physician auth_user_id lookup skipped:', lookupError?.message || String(lookupError));
                        }
                    }

                    if (role === ROLE.BHW && idOrEmail) {
                        try {
                            const res = await databases.listDocuments(
                                appwriteConfig.staffDatabaseId,
                                appwriteConfig.healthWorkersCollectionId,
                                [Query.equal('healthWorkerID', idOrEmail.trim()), Query.limit(1)]
                            );
                            return res.documents?.[0]?.auth_user_id || null;
                        } catch (lookupError) {
                            console.log('BHW auth_user_id lookup skipped:', lookupError?.message || String(lookupError));
                        }
                    }

                    return null;
                };

                const resolvedAuthUserId = await resolveAuthUserIdForLog();

                if (error.message.includes('Invalid Health Worker ID')) {
                    const registered = await isIdentifierRegistered(idOrEmail);
                    if (!registered) {
                        securityEventResult = await logSuspiciousLoginEvent({
                            attemptedIdentifier: idOrEmail,
                            accessPoint,
                        });
                    } else {
                        securityEventResult = await logFailedLoginEvent({
                            userEmail: workerEmail || idOrEmail,
                            accessPoint,
                            authUserId: resolvedAuthUserId,
                        });
                    }
                } else if (error.name === 'AppwriteException' && error.message.includes('Invalid credentials')) {
                    const registered = await isIdentifierRegistered(idOrEmail);
                    if (!registered) {
                        securityEventResult = await logSuspiciousLoginEvent({
                            attemptedIdentifier: idOrEmail,
                            accessPoint,
                        });
                    } else {
                        securityEventResult = await logFailedLoginEvent({
                            userEmail: workerEmail || idOrEmail,
                            accessPoint,
                            authUserId: resolvedAuthUserId,
                        });
                    }
                } else {
                    securityEventResult = await logFailedLoginEvent({
                        userEmail: workerEmail || idOrEmail,
                        accessPoint,
                        authUserId: resolvedAuthUserId,
                    });
                }
            } catch (logError) {
                console.log('Security event log skipped:', logError?.message || String(logError));
            }

            let errorMessage = 'Login failed. Please check your credentials.';
            if (error.message.includes('Invalid Health Worker ID')) {
                errorMessage = 'Invalid Health Worker ID.';
            } else if (error.message.includes('Physician profile not found')) {
                errorMessage = 'Physician account profile not found. Please contact administrator.';
            } else if (error.message.includes('Health Worker profile not found')) {
                errorMessage = 'Health Worker account profile not found. Please contact administrator.';
            } else if (error.message.includes('physicianAccountsCollectionId')) {
                errorMessage = 'Physician login is not configured. Please set EXPO_PUBLIC_PHYSICIAN_ACCOUNTS_COLLECTION_ID.';
            } else if (error.message.includes('Missing email')) {
                errorMessage = 'Profile data error. Contact support.';
            } else if (error.name === 'AppwriteException' && error.message.includes('Invalid credentials')) {
                errorMessage = 'Invalid email or password.';
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
                <View style={styles.rememberRow}>
                    <Checkbox
                        value={rememberMe}
                        onValueChange={async (value) => {
                            rememberMeRef.current = value;
                            setRememberMe(value);
                            if (!value) {
                                await clearRememberedIdentifiers();
                            } else {
                                await safeSecureSet(REMEMBER_KEYS.enabled, '1');
                                await safeSecureSet(REMEMBER_KEYS.lastRole, role);
                                // If user already typed an identifier, keep it (don't overwrite).
                                // If the field is empty, try to autofill from stored value.
                                const current = String(idOrEmail || '').trim();
                                if (!current) {
                                    await loadRememberedIdentifierForRole(role, { allowEmpty: false });
                                } else {
                                    const key = role === ROLE.PHYSICIAN ? REMEMBER_KEYS.physicianEmail : REMEMBER_KEYS.bhwId;
                                    await safeSecureSet(key, current);
                                }
                            }
                        }}
                        color={rememberMe ? "#1ED760" : undefined}
                        disabled={isLoading}
                    />
                    <Text style={styles.rememberText}>Remember me</Text>
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
    scrollContent: { flexGrow: 1 },
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
    rememberRow: { flexDirection: 'row', alignItems: 'center', marginTop: -5, marginBottom: 10 },
    rememberText: { marginLeft: 8, color: '#fff', fontSize: 13, fontFamily: 'Poppins-Medium' },
    loginButton: { backgroundColor: "#125872", borderRadius: 12, paddingVertical: 15, width: "100%", alignItems: "center", marginTop: 25, marginBottom: 12 },
    loginButtonText: { color: "#fff", fontSize: 16, fontWeight: "bold", fontFamily: "Poppins-Bold" },
    footerImage: { width: width, height: height * 0.20, resizeMode: "cover", alignSelf: 'center' }
});

export default SelectRole;
