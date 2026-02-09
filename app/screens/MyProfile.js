import React, { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput, Alert, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useFonts, Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold, Poppins_700Bold } from "@expo-google-fonts/poppins";

// Appwrite
import { databases, appwriteConfig, account, Query } from './appwriteConfig';

// SVG Logo
import RavenLogo from "../assets/raven-logo-blue-fang.svg";
import { getCurrentStaffProfile, STAFF_ROLE } from './staffProfileService';

export default function MyProfile({ navigation, route }) {
    const [fontsLoaded] = useFonts({
        'Poppins': Poppins_400Regular,
        'Poppins-Regular': Poppins_400Regular,
        'Poppins-Medium': Poppins_500Medium,
        'Poppins-SemiBold': Poppins_600SemiBold,
        'Poppins-Bold': Poppins_700Bold,
    });
    
    const [healthWorker, setHealthWorker] = useState(null);
    const [staffRole, setStaffRole] = useState(null);
    const [userPhone, setUserPhone] = useState("");
    const [userEmail, setUserEmail] = useState("");
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

    const fetchPhysicianProfile = async (userId) => {
        let profile = null;
        try {
            const res = await databases.listDocuments(
                appwriteConfig.staffDatabaseId,
                appwriteConfig.physicianAccountsCollectionId,
                [Query.equal("auth_user_id", userId), Query.limit(1)]
            );
            if (res.total > 0) profile = res.documents[0];
        } catch (e) {
            if (e?.name === 'AppwriteException' && /not authorized/i.test(e?.message || '')) {
                try {
                    profile = await databases.getDocument(
                        appwriteConfig.staffDatabaseId,
                        appwriteConfig.physicianAccountsCollectionId,
                        userId
                    );
                } catch (_) {
                    // ignore fallback failure
                }
            } else {
                throw e;
            }
        }
        return profile;
    };

    const fetchHealthWorkerProfile = async (skipLoading = false) => {
        try {
            // Only show loading on initial fetch, not on background refreshes
            if (!skipLoading) {
                setIsLoading(true);
            }
            setError(null);
            
            // Get current logged-in user
            const user = await account.get();
            setUserPhone(user.phone || "N/A");
            setUserEmail(user.email || "N/A");
            setNewPhone(user.phone || "");
            const staff = await getCurrentStaffProfile();
            setStaffRole(staff.role);

            if (staff.role === STAFF_ROLE.PHYSICIAN) {
                const physicianProfile = await fetchPhysicianProfile(user.$id);
                if (physicianProfile) {
                    setHealthWorker(physicianProfile);
                } else {
                    setHealthWorker(staff.profile || null);
                    setError("Physician profile not found.");
                }
            } else {
                setHealthWorker(staff.profile || null);
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
    const isPhysician = staffRole === STAFF_ROLE.PHYSICIAN;

    // Physician display values
    const displayLicenseNo = healthWorker?.License_No || healthWorker?.licenseNo || "N/A";
    const displayDesignation = healthWorker?.designation || healthWorker?.Designation || "N/A";
    const displayOffice = healthWorker?.office || healthWorker?.Office || "N/A";

    // Shared display values
    const displayName = isPhysician
        ? (healthWorker?.Physician_Name || healthWorker?.fullName || healthWorker?.name || "N/A")
        : (healthWorker?.fullName || "N/A");
    const displayEmail = isPhysician
        ? (userEmail || "N/A")
        : (healthWorker?.email || userEmail || "N/A");
    const displayPhone = userPhone || "N/A";
    const displayRole = healthWorker?.role || "BHW";
    const displayHWID = healthWorker?.healthWorkerID || "N/A";

    // Location for BHWs
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
                <Text style={{ marginTop: 10, color: "#6B7C87", fontFamily: "Poppins-Regular" }}>Loading profile...</Text>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
            {/* BACK BUTTON */}
            <View style={styles.topHeader}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Ionicons name="arrow-back" size={24} color="#2C3E50" />
                </TouchableOpacity>
                <Text style={styles.backText}>Back</Text>
            </View>

            <ScrollView 
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {/* HEADER CARD */}
                <View style={styles.headerCard}>
                    <View style={styles.avatarContainer}>
                        <Ionicons name="person" size={40} color="#ffffff" />
                    </View>
                    <View style={styles.profileTextContainer}>
                        <Text style={styles.profileName}>{displayName}</Text>
                        <Text style={styles.profileRole}>{isPhysician ? displayDesignation : displayRole}</Text>
                    </View>
                </View>

                {/* INFO FIELDS */}
                <View style={styles.fieldsContainer}>
                    {isPhysician ? (
                        <>
                            <ProfileField icon="mail" label="Email" value={displayEmail} />
                            <ProfileField icon="call" label="Phone Number" value={displayPhone} isEditing={isEditing} editValue={newPhone} onChangeText={setNewPhone} isPhone />
                            <ProfileField icon="people" label="Designation" value={displayDesignation} />
                            <ProfileField icon="id-card" label="License No." value={displayLicenseNo} />
                            <ProfileField icon="business" label="Office" value={displayOffice} />
                            {isEditing ? (
                                <PasswordField 
                                    icon="key" 
                                    label="New Password (optional)" 
                                    value={newPassword}
                                    onChangeText={setNewPassword}
                                    placeholder="Enter new password"
                                    showPassword={showNewPassword}
                                    toggleShowPassword={() => setShowNewPassword(!showNewPassword)}
                                />
                            ) : (
                                <ProfileField icon="lock-closed" label="Password" value="**********" />
                            )}
                        </>
                    ) : (
                        <>
                            <ProfileField icon="id-card" label="Health Worker ID" value={displayHWID} />
                            <ProfileField icon="person" label="Name" value={displayName} />
                            <ProfileField icon="mail" label="Email" value={displayEmail} />
                            <ProfileField icon="people" label="Role" value={displayRole} />
                            <ProfileField icon="location" label="Barangay Health Station" value={displayLocation || "N/A"} />
                            <ProfileField icon="call" label="Phone Number" value={displayPhone} isEditing={isEditing} editValue={newPhone} onChangeText={setNewPhone} isPhone />
                            {isEditing ? (
                                <PasswordField 
                                    icon="key" 
                                    label="New Password (optional)" 
                                    value={newPassword}
                                    onChangeText={setNewPassword}
                                    placeholder="Enter new password"
                                    showPassword={showNewPassword}
                                    toggleShowPassword={() => setShowNewPassword(!showNewPassword)}
                                />
                            ) : (
                                <ProfileField icon="lock-closed" label="Password" value="**********" />
                            )}
                        </>
                    )}

                    {/* Current Password - Only show in edit mode */}
                    {isEditing && (
                        <PasswordField 
                            icon="lock-closed" 
                            label="Confirm Password *" 
                            value={currentPassword}
                            onChangeText={setCurrentPassword}
                            placeholder="Confirm new password"
                            showPassword={showCurrentPassword}
                            toggleShowPassword={() => setShowCurrentPassword(!showCurrentPassword)}
                        />
                    )}
                </View>

            </ScrollView>

            {/* BUTTONS */}
            <View style={styles.btnRow}>
                {isEditing ? (
                    <>
                        <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
                            <Text style={styles.cancelButtonText}>Cancel</Text>
                        </TouchableOpacity>

                        <TouchableOpacity 
                            style={[styles.saveButton, isSaving && styles.disabledButton]} 
                            onPress={handleSaveChanges}
                            disabled={isSaving}
                        >
                            {isSaving ? (
                                <ActivityIndicator size="small" color="#ffffff" />
                            ) : (
                                <Text style={styles.saveButtonText}>Save Changes</Text>
                            )}
                        </TouchableOpacity>
                    </>
                ) : (
                    <>
                        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                            <Text style={styles.backButtonText}>Back to Dashboard</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.editButton} onPress={handleEditProfile}>
                            <Text style={styles.editButtonText}>Edit Profile</Text>
                        </TouchableOpacity>
                    </>
                )}
            </View>

        </KeyboardAvoidingView>
    );
}

// PROFILE FIELD COMPONENT
const ProfileField = ({ label, value, icon, isEditing, editValue, onChangeText, isPhone }) => {
    if (isEditing && isPhone) {
        return (
            <View style={styles.fieldCard}>
                <View style={styles.fieldIconContainer}>
                    <Ionicons name={icon} size={20} color="#5A8FA8" />
                </View>
                <View style={styles.fieldTextContainer}>
                    <Text style={styles.fieldLabel}>{label} *</Text>
                    <View style={styles.phoneInputWrapper}>
                        <Text style={styles.phonePrefix}>+639</Text>
                        <TextInput
                            style={styles.fieldInput}
                            value={editValue}
                            onChangeText={(text) => {
                                const cleaned = text.replace(/[^0-9]/g, '').slice(0, 9);
                                onChangeText(cleaned);
                            }}
                            placeholder="XXXXXXXXX"
                            placeholderTextColor="#B8C9D0"
                            keyboardType="phone-pad"
                            maxLength={9}
                        />
                    </View>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.fieldCard}>
            <View style={styles.fieldIconContainer}>
                <Ionicons name={icon} size={20} color="#5A8FA8" />
            </View>
            <View style={styles.fieldTextContainer}>
                <Text style={styles.fieldLabel}>{label}</Text>
                <Text style={styles.fieldValue}>{value}</Text>
            </View>
        </View>
    );
};

// PASSWORD FIELD WITH EYE ICON
const PasswordField = ({ label, value, icon, onChangeText, placeholder, showPassword, toggleShowPassword }) => (
    <View style={styles.fieldCard}>
        <View style={styles.fieldIconContainer}>
            <Ionicons name={icon} size={20} color="#5A8FA8" />
        </View>
        <View style={styles.fieldTextContainer}>
            <Text style={styles.fieldLabel}>{label}</Text>
            <View style={styles.passwordInputWrapper}>
                <TextInput
                    style={styles.passwordFieldInput}
                    value={value}
                    onChangeText={onChangeText}
                    placeholder={placeholder}
                    placeholderTextColor="#B8C9D0"
                    secureTextEntry={!showPassword}
                />
                <TouchableOpacity onPress={toggleShowPassword} style={styles.eyeIconButton}>
                    <Ionicons 
                        name={showPassword ? "eye-outline" : "eye-off-outline"} 
                        size={20} 
                        color="#9BADB5" 
                    />
                </TouchableOpacity>
            </View>
        </View>
    </View>
);

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#F8FAFB",
    },

    topHeader: {
        flexDirection: "row",
        alignItems: "center",
        paddingTop: 50,
        paddingHorizontal: 20,
        paddingBottom: 15,
        backgroundColor: "#F8FAFB",
    },

    backText: {
        fontSize: 16,
        color: "#2C3E50",
        marginLeft: 8,
        fontFamily: "Poppins-Regular",
    },

    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: 20,
        paddingBottom: 40,
    },

    headerCard: {
        backgroundColor: "linear-gradient(135deg, #125872 0%, #357A8F 100%)",
        backgroundColor: "#125872",
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        borderBottomLeftRadius: 8,
        borderBottomRightRadius: 8,
        paddingVertical: 20,
        paddingHorizontal: 20,
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 24,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 3,
    },

    avatarContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: "#ffffff33",
        justifyContent: "center",
        alignItems: "center",
        marginRight: 16,
        borderWidth: 3,
        borderColor: "#ffffff66",
    },

    profileTextContainer: {
        flex: 1,
        justifyContent: "center",
    },

    profileName: {
        fontSize: 22,
        fontWeight: "700",
        color: "#ffffff",
        marginBottom: 4,
        fontFamily: "Poppins-Bold",
    },

    profileRole: {
        fontSize: 14,
        color: "#E8F4F8",
        fontFamily: "Poppins-Regular",
    },

    fieldsContainer: {
        gap: 12,
    },

    fieldCard: {
        flexDirection: "row",
        backgroundColor: "#ffffff",
        borderRadius: 12,
        padding: 16,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },

    fieldIconContainer: {
        width: 40,
        height: 40,
        borderRadius: 10,
        backgroundColor: "#EBF5F9",
        justifyContent: "center",
        alignItems: "center",
        marginRight: 12,
    },

    fieldTextContainer: {
        flex: 1,
        justifyContent: "center",
    },

    fieldLabel: {
        fontSize: 12,
        color: "#6B7C87",
        marginBottom: 4,
        fontFamily: "Poppins-Regular",
    },

    fieldValue: {
        fontSize: 15,
        color: "#2C3E50",
        fontFamily: "Poppins-Medium",
    },

    fieldInput: {
        fontSize: 15,
        color: "#2C3E50",
        fontFamily: "Poppins-Medium",
        padding: 0,
        margin: 0,
        flex: 1,
    },

    phoneInputWrapper: {
        flexDirection: "row",
        alignItems: "center",
    },

    phonePrefix: {
        fontSize: 15,
        color: "#2C3E50",
        fontFamily: "Poppins-Medium",
        marginRight: 4,
    },

    passwordInputWrapper: {
        flexDirection: "row",
        alignItems: "center",
    },

    passwordFieldInput: {
        flex: 1,
        fontSize: 15,
        color: "#2C3E50",
        fontFamily: "Poppins-Medium",
        padding: 0,
        margin: 0,
    },

    eyeIconButton: {
        padding: 4,
    },

    btnRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        width: "100%",
        paddingHorizontal: 20,
        paddingBottom: 30,
        paddingTop: 15,
        backgroundColor: "#F8FAFB",
        gap: 12,
    },

    editButton: {
        backgroundColor: "#125872",
        paddingVertical: 14,
        flex: 1,
        borderRadius: 12,
        alignItems: "center",
        shadowColor: "#125872",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 3,
    },

    editButtonText: {
        color: "#ffffff",
        fontSize: 15,
        fontWeight: "600",
        fontFamily: "Poppins-SemiBold",
    },

    backButton: {
        backgroundColor: "#E8EEF1",
        paddingVertical: 14,
        flex: 1,
        borderRadius: 12,
        alignItems: "center",
    },

    backButtonText: {
        color: "#5A6C78",
        fontSize: 15,
        fontWeight: "600",
        fontFamily: "Poppins-SemiBold",
    },

    saveButton: {
        backgroundColor: "#28A745",
        paddingVertical: 14,
        flex: 1,
        borderRadius: 12,
        alignItems: "center",
        shadowColor: "#28A745",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 3,
    },

    saveButtonText: {
        color: "#ffffff",
        fontSize: 15,
        fontWeight: "600",
        fontFamily: "Poppins-SemiBold",
    },

    cancelButton: {
        backgroundColor: "#E8EEF1",
        paddingVertical: 14,
        flex: 1,
        borderRadius: 12,
        alignItems: "center",
    },

    cancelButtonText: {
        color: "#5A6C78",
        fontSize: 15,
        fontWeight: "600",
        fontFamily: "Poppins-SemiBold",
    },

    disabledButton: {
        opacity: 0.6,
    },
});
