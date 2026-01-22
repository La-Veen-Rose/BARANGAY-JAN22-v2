import React, { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput, Alert, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useFonts, Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold, Poppins_700Bold } from "@expo-google-fonts/poppins";

// Appwrite
import { databases, appwriteConfig, account } from './appwriteConfig';
import client from './appwriteConfig';
import { Query } from 'appwrite';

// SVG Logo
import RavenLogo from "../assets/raven-logo-blue-fang.svg";

export default function MyProfile({ navigation, route }) {
    const [fontsLoaded] = useFonts({
        'Poppins': Poppins_400Regular,
        'Poppins-Regular': Poppins_400Regular,
        'Poppins-Medium': Poppins_500Medium,
        'Poppins-SemiBold': Poppins_600SemiBold,
        'Poppins-Bold': Poppins_700Bold,
    });
    
    const [healthWorker, setHealthWorker] = useState(null);
    const [userPhone, setUserPhone] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const refreshIntervalRef = useRef(null);
    
    // Edit mode states
    const [isEditing, setIsEditing] = useState(false);
    const [newPhone, setNewPhone] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [currentPassword, setCurrentPassword] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    
    // Password visibility states
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);

    useEffect(() => {
        fetchHealthWorkerProfile();
        
        // 🟢 POLLING: Refetch data every 3 seconds to catch all changes (silent refresh)
        refreshIntervalRef.current = setInterval(() => {
            if (!isEditing && !isSaving) {
                // Pass true to skip loading indicator on background refreshes
                fetchHealthWorkerProfile(true);
            }
        }, 3000);

        // Cleanup interval on unmount
        return () => {
            if (refreshIntervalRef.current) {
                clearInterval(refreshIntervalRef.current);
            }
        };
    }, [isEditing, isSaving]);

    // 🟢 FOCUS LISTENER: Refetch immediately when user returns to this screen (silent refresh)
    useFocusEffect(
        React.useCallback(() => {
            console.log('Profile screen focused - refetching data silently');
            // Pass true to skip loading indicator on focus refresh
            fetchHealthWorkerProfile(true);
        }, [])
    );

    const fetchHealthWorkerProfile = async (skipLoading = false) => {
        try {
            // Only show loading on initial fetch, not on background refreshes
            if (!skipLoading) {
                setIsLoading(true);
            }
            
            // Get current logged-in user
            const user = await account.get();
            setUserPhone(user.phone || "N/A");
            setNewPhone(user.phone || "");

            // Fetch health worker profile from database
            const res = await databases.listDocuments(
                appwriteConfig.staffDatabaseId,
                appwriteConfig.healthWorkersCollectionId,
                [Query.equal("auth_user_id", user.$id)]
            );

            if (res.total > 0) {
                setHealthWorker(res.documents[0]);
            } else {
                setError("Health worker profile not found.");
            }
        } catch (err) {
            console.error("Error fetching profile:", err);
            setError(err.message);
        } finally {
            if (!skipLoading) {
                setIsLoading(false);
            }
        }
    };

    const handleEditProfile = () => {
        setIsEditing(true);
        // Extract digits after +639 if phone exists
        const phoneDigits = userPhone !== "N/A" ? userPhone.replace("+639", "") : "";
        setNewPhone(phoneDigits);
        setNewPassword("");
        setCurrentPassword("");
        setShowCurrentPassword(false);
        setShowNewPassword(false);
    };

    const handleCancel = () => {
        setIsEditing(false);
        setNewPhone("");
        setNewPassword("");
        setCurrentPassword("");
        setShowCurrentPassword(false);
        setShowNewPassword(false);
    };

    const handleSaveChanges = async () => {
        // Build full phone number with +639 prefix
        const fullPhone = newPhone ? `+639${newPhone}` : "";
        
        // Check what's being changed
        const isPhoneChanged = fullPhone && fullPhone !== userPhone;
        const isPasswordChanged = newPassword.length > 0;
        
        // If nothing changed, just exit edit mode
        if (!isPhoneChanged && !isPasswordChanged) {
            Alert.alert("Info", "No changes were made.");
            setIsEditing(false);
            return;
        }
        
        // Require current password only if something is being changed
        if ((isPhoneChanged || isPasswordChanged) && !currentPassword) {
            Alert.alert("Error", "Please enter your current password to save changes.");
            return;
        }

        try {
            setIsSaving(true);

            // Update phone number if changed
            if (isPhoneChanged) {
                try {
                    await account.updatePhone(fullPhone, currentPassword);
                    setUserPhone(fullPhone);
                } catch (phoneErr) {
                    Alert.alert("Error", "Failed to update phone number. Please check your current password.");
                    setIsSaving(false);
                    return;
                }
            }

            // Update password if provided
            if (isPasswordChanged) {
                try {
                    await account.updatePassword(newPassword, currentPassword);
                } catch (passErr) {
                    Alert.alert("Error", "Failed to update password. Please check your current password.");
                    setIsSaving(false);
                    return;
                }
            }

            Alert.alert("Success", "Profile updated successfully!");
            
            // 🟢 REAL-TIME: Immediately refetch profile to sync changes
            await fetchHealthWorkerProfile();
            
            setIsEditing(false);
            setNewPassword("");
            setCurrentPassword("");

        } catch (err) {
            console.error("Error saving profile:", err);
            Alert.alert("Error", err.message || "Failed to save changes.");
        } finally {
            setIsSaving(false);
        }
    };

    // Display values
    const displayHWID = healthWorker?.healthWorkerID || "N/A";
    const displayName = healthWorker?.fullName || "N/A";
    const displayEmail = healthWorker?.email || "N/A";
    const displayRole = healthWorker?.role || "N/A";
    const displayPhone = userPhone || "N/A";
    
    // Location: purok + barangay + Tagum City
    const purok = healthWorker?.purok || "";
    const barangay = healthWorker?.barangay || "";
    const displayLocation = [purok, barangay, "Tagum City"].filter(Boolean).join(", ");

    // Wait for fonts to load
    if (!fontsLoaded) {
        return null;
    }

    // Loading state
    if (isLoading) {
        return (
            <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
                <ActivityIndicator size="large" color="#125872" />
                <Text style={{ marginTop: 10, color: "#125872", fontFamily: "Poppins-Regular" }}>Loading profile...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* BACK BUTTON + TITLE */}
            <View style={styles.topHeader}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Ionicons name="arrow-back-circle-outline" size={32} color="#125872" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>My Profile</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView 
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {/* INFO CARD */}
                <View style={styles.infoCard}>
                    <ProfileField icon="id-card-outline" label="Health Worker ID" value={displayHWID} />
                <ProfileField icon="person-outline" label="Name" value={displayName} />
                <ProfileField icon="mail-outline" label="Email" value={displayEmail} />
                <ProfileField icon="people-outline" label="Role" value={displayRole} />
                <ProfileField icon="location-outline" label="Health Center" value={displayLocation} />
                
                {/* Editable Password Field */}
                {isEditing ? (
                    <>
                        <PasswordField 
                            icon="key-outline" 
                            label="New Password (Leave blank to keep current)" 
                            value={newPassword}
                            onChangeText={setNewPassword}
                            placeholder="Enter new password"
                            showPassword={showNewPassword}
                            toggleShowPassword={() => setShowNewPassword(!showNewPassword)}
                        />
                    </>
                ) : (
                    <ProfileField icon="lock-closed-outline" label="Password" value="***********" />
                )}
                
                {/* Editable Phone Field */}
                {isEditing ? (
                    <PhoneField 
                        icon="call-outline" 
                        label="Phone Number" 
                        value={newPhone}
                        onChangeText={setNewPhone}
                        placeholder="XX XXX XXXX"
                    />
                ) : (
                    <ProfileField icon="call-outline" label="Phone Number" value={displayPhone} />
                )}

                {/* Current Password - Only show in edit mode */}
                {isEditing && (
                    <PasswordField 
                        icon="lock-closed-outline" 
                        label="Current Password (Required to save changes)" 
                        value={currentPassword}
                        onChangeText={setCurrentPassword}
                        placeholder="Enter current password"
                        showPassword={showCurrentPassword}
                        toggleShowPassword={() => setShowCurrentPassword(!showCurrentPassword)}
                    />
                )}
            </View>

            </ScrollView>

            {/* BUTTONS SIDE BY SIDE - Outside ScrollView for bottom positioning */}
            <View style={styles.btnRow}>
                {isEditing ? (
                    <>
                        <TouchableOpacity style={styles.secondaryButton} onPress={handleCancel}>
                            <Text style={styles.secondaryButtonText}>Cancel</Text>
                        </TouchableOpacity>

                        <TouchableOpacity 
                            style={[styles.primaryButton, isSaving && styles.disabledButton]} 
                            onPress={handleSaveChanges}
                            disabled={isSaving}
                        >
                            {isSaving ? (
                                <ActivityIndicator size="small" color="#0A4D5C" />
                            ) : (
                                <Text style={styles.primaryButtonText}>Save Changes</Text>
                            )}
                        </TouchableOpacity>
                    </>
                ) : (
                    <>
                        <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.goBack()}>
                            <Text style={styles.secondaryButtonText}>Back to Dashboard</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.primaryButton} onPress={handleEditProfile}>
                            <Text style={styles.primaryButtonText}>Edit Profile</Text>
                        </TouchableOpacity>
                    </>
                )}
            </View>

        </View>
    );
}

// CUSTOM COMPONENT FIELD (Read-only)
const ProfileField = ({ label, value, icon }) => (
    <View style={styles.fieldContainer}>
        <Ionicons name={icon} size={20} color="#0A4D5C" style={styles.fieldIcon} />
        <View style={styles.fieldContent}>
            <Text style={styles.fieldLabel}>{label}</Text>
            <Text style={styles.fieldValue}>{value}</Text>
        </View>
    </View>
);

// EDITABLE FIELD COMPONENT
const EditableField = ({ label, value, icon, onChangeText, placeholder, secureTextEntry, keyboardType }) => (
    <View style={styles.fieldContainer}>
        <Ionicons name={icon} size={20} color="#0A4D5C" style={styles.fieldIcon} />
        <View style={styles.fieldContent}>
            <Text style={styles.fieldLabel}>{label}</Text>
            <TextInput
                style={styles.fieldInput}
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor="#A0C4CC"
                secureTextEntry={secureTextEntry}
                keyboardType={keyboardType}
            />
        </View>
    </View>
);

// PASSWORD FIELD WITH EYE ICON
const PasswordField = ({ label, value, icon, onChangeText, placeholder, showPassword, toggleShowPassword }) => (
    <View style={styles.fieldContainer}>
        <Ionicons name={icon} size={20} color="#0A4D5C" style={styles.fieldIcon} />
        <View style={styles.fieldContent}>
            <Text style={styles.fieldLabel}>{label}</Text>
            <View style={styles.passwordInputContainer}>
                <TextInput
                    style={styles.passwordInput}
                    value={value}
                    onChangeText={onChangeText}
                    placeholder={placeholder}
                    placeholderTextColor="#A0C4CC"
                    secureTextEntry={!showPassword}
                />
                <TouchableOpacity onPress={toggleShowPassword} style={styles.eyeIcon}>
                    <Ionicons 
                        name={showPassword ? "eye-outline" : "eye-off-outline"} 
                        size={20} 
                        color="#A0C4CC" 
                    />
                </TouchableOpacity>
            </View>
        </View>
    </View>
);

// PHONE FIELD WITH +639 PREFIX
const PhoneField = ({ label, value, icon, onChangeText, placeholder }) => (
    <View style={styles.fieldContainer}>
        <Ionicons name={icon} size={20} color="#0A4D5C" style={styles.fieldIcon} />
        <View style={styles.fieldContent}>
            <Text style={styles.fieldLabel}>{label}</Text>
            <View style={styles.phoneInputContainer}>
                <Text style={styles.phonePrefix}>+639</Text>
                <TextInput
                    style={styles.phoneInput}
                    value={value}
                    onChangeText={(text) => {
                        // Only allow digits and max 9 characters (for the remaining digits)
                        const cleaned = text.replace(/[^0-9]/g, '').slice(0, 9);
                        onChangeText(cleaned);
                    }}
                    placeholder={placeholder}
                    placeholderTextColor="#A0C4CC"
                    keyboardType="phone-pad"
                    maxLength={9}
                />
            </View>
        </View>
    </View>
);

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#ffffff",
    },

    topHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingTop: 50,
        paddingHorizontal: 20,
        paddingBottom: 15,
        backgroundColor: "#ffffff",
    },

    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 40,
    },

    headerTitle: {
        fontSize: 18,
        fontWeight: "900",
        color: "#125872",
        marginLeft: -10,
        fontFamily: "Poppins-Bold",
    },

    profileSection: {
        alignItems: "center",
        marginTop: 10,
    },

    profileImageContainer: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: "#a9bbbfff",
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 3,
        borderColor: "#1A6B7C",
    },

    profileName: {
        fontSize: 18,
        fontWeight: "bold",
        color: "#125872",
        marginTop: 10,
        fontFamily: "Poppins-Bold",
    },

    profileSub: {
        fontSize: 13,
        color: "#125872",
        marginTop: 2,
        fontFamily: "Poppins-Regular",
    },

    infoCard: {
        marginTop: 20,
        backgroundColor: "#125872",
        borderRadius: 30,
        paddingHorizontal: 25,
        paddingVertical: 25,
        paddingTop: 40,
        width: "100%",
    },

    fieldContainer: {
        flexDirection: "row",
        marginBottom: 18,
        alignItems: "flex-start",
    },

    fieldIcon: {
        marginRight: 12,
        marginTop: 2,
        color: "#fff",
    },

    fieldContent: {
        flex: 1,
    },

    fieldLabel: {
        fontSize: 12,
        color: "#fff",
        marginBottom: 2,
        fontFamily: "Poppins-Regular",
    },

    fieldValue: {
        fontSize: 15,
        color: "#fff",
        fontWeight: "500",
        borderBottomWidth: 1,
        borderBottomColor: "#C5D8DC",
        paddingBottom: 8,
        fontFamily: "Poppins-Medium",
    },

    fieldInput: {
        fontSize: 15,
        color: "#fff",
        fontWeight: "500",
        borderBottomWidth: 1,
        borderBottomColor: "#C5D8DC",
        paddingBottom: 8,
        paddingTop: 0,
        fontFamily: "Poppins-Medium",
    },

    passwordInputContainer: {
        flexDirection: "row",
        alignItems: "center",
        borderBottomWidth: 1,
        borderBottomColor: "#C5D8DC",
    },

    passwordInput: {
        flex: 1,
        fontSize: 15,
        color: "#fff",
        fontWeight: "500",
        paddingBottom: 8,
        paddingTop: 0,
        fontFamily: "Poppins-Medium",
    },

    eyeIcon: {
        padding: 5,
        paddingBottom: 8,
    },

    phoneInputContainer: {
        flexDirection: "row",
        alignItems: "center",
        borderBottomWidth: 1,
        borderBottomColor: "#C5D8DC",
    },

    phonePrefix: {
        fontSize: 15,
        color: "#fff",
        fontWeight: "500",
        paddingBottom: 8,
        marginRight: 2,
        fontFamily: "Poppins-Medium",
    },

    phoneInput: {
        flex: 1,
        fontSize: 15,
        color: "#fff",
        fontWeight: "500",
        paddingBottom: 8,
        paddingTop: 0,
        fontFamily: "Poppins-Medium",
    },

    btnRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        width: "100%",
        paddingHorizontal: 20,
        paddingBottom: 30,
        paddingTop: 15,
        backgroundColor: "#fff",
    },

    primaryButton: {
        backgroundColor: "#fff",
        borderWidth: 1.5,
        borderColor: "#125872",
        paddingVertical: 12,
        width: "48%",
        borderRadius: 15,
        alignItems: "center",
    },

    primaryButtonText: {
        color: "#125872",
        fontWeight: "600",
        fontFamily: "Poppins-SemiBold",
    },

    secondaryButton: {
        backgroundColor: "#125872",
        borderColor: "#125872",
        borderWidth: 1,
        paddingVertical: 12,
        width: "48%",
        borderRadius: 15,
        alignItems: "center",
    },

    secondaryButtonText: {
        color: "#fff",
        fontWeight: "600",
        fontFamily: "Poppins-SemiBold",
    },

    disabledButton: {
        opacity: 0.6,
    },
});
