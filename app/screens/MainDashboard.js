import React, { useState, useEffect, useCallback } from 'react';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import {
    StyleSheet,
    Text,
    View,
    TouchableOpacity,
    Dimensions,
    ActivityIndicator,
    Alert,
    ScrollView,
    BackHandler,
} from "react-native";
import { useFocusEffect } from '@react-navigation/native';

// --- Appwrite Imports ---
import { databases, appwriteConfig, account, Query } from './appwriteConfig';
import { fetchAnimalBiteReportData } from './reportAnalyticsService';
import { getBhwAccessiblePatientRecordOwnerFilters, getCurrentStaffProfile, getStaffHeaderLocation, STAFF_ROLE, updatePresenceForCurrentUser } from './staffProfileService';
import LogOut from './LogOut';
import { logActivity } from './activityLogsService';

const { width } = Dimensions.get('window');

// Basic responsive font scaling (no extra dependencies)
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const responsiveFont = (baseSize, { min, max } = {}) => {
    const scale = width / 375; // iPhone X-ish baseline
    const scaled = baseSize * scale;
    const lower = min ?? baseSize * 0.85;
    const upper = max ?? baseSize * 1.15;
    return clamp(Math.round(scaled), Math.round(lower), Math.round(upper));
};

function MainDashboard({ navigation, openSidebar }) {

    const [workerProfile, setWorkerProfile] = useState(null);
    const [staffRole, setStaffRole] = useState(null);
    const [submittedCasesCount, setSubmittedCasesCount] = useState(0);
    const [verifiedCasesCount, setVerifiedCasesCount] = useState(0);
    const [terminatedCasesCount, setTerminatedCasesCount] = useState(0);
    const [monthlyCases, setMonthlyCases] = useState(0);
    const [monthlyTrend, setMonthlyTrend] = useState(0);
    const [annualCases, setAnnualCases] = useState(0);
    const [annualTrend, setAnnualTrend] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [logoutVisible, setLogoutVisible] = useState(false);

    // ✅ GET LOGGED IN STAFF PROFILE (BHW or Physician)
    const fetchWorkerProfile = useCallback(async () => {
        try {
            const { profile, role } = await getCurrentStaffProfile();
            setWorkerProfile(profile);
            setStaffRole(role);

        } catch (err) {
            setError(err.message);
        }
    }, []);

    // ✅ FETCH DASHBOARD COUNTS
    const fetchDashboardData = useCallback(async () => {
        if (!workerProfile) return;

        try {
            setIsLoading(true);
            setError(null);

            const user = await account.get();
            const isPhysician = staffRole === STAFF_ROLE.PHYSICIAN;

            // BHW: can access records submitted by any BHW with the same purok+barangay
            // (case-insensitive match using HealthWorkers table)
            // Physician: can access ALL patient records
            const submittedOwnerFilter = isPhysician
                ? []
                : await getBhwAccessiblePatientRecordOwnerFilters(workerProfile);

            // Fetch counts first so the dashboard can render quickly.
            const [submittedRes, verifiedRes, terminatedRes] = await Promise.all([
                databases.listDocuments(
                    appwriteConfig.patientDatabaseId,
                    appwriteConfig.patientRecordsCollectionId,
                    [...submittedOwnerFilter, Query.limit(1)]
                ),
                databases.listDocuments(
                    appwriteConfig.patientDatabaseId,
                    appwriteConfig.patientRecordsCollectionId,
                    [...submittedOwnerFilter, Query.equal('status', 'verified'), Query.limit(1)]
                ),
                databases.listDocuments(
                    appwriteConfig.patientDatabaseId,
                    appwriteConfig.patientRecordsCollectionId,
                    [...submittedOwnerFilter, Query.equal('status', 'terminated'), Query.limit(1)]
                ),
            ]);

            setSubmittedCasesCount(submittedRes.total || 0);
            setVerifiedCasesCount(verifiedRes.total || 0);
            setTerminatedCasesCount(terminatedRes.total || 0);

            // ✅ Unblock UI after counts are ready.
            setIsLoading(false);

            // Fetch heavier analytics separately; don't block the dashboard.
            fetchAnimalBiteReportData()
                .then((analytics) => {
                    setMonthlyCases(analytics?.monthlyCaseSummary?.totalCases || 0);
                    setMonthlyTrend(analytics?.monthlyCaseSummary?.trendFromLastMonth || 0);
                    setAnnualCases(analytics?.annualBiteSummary?.totalReports || 0);
                    setAnnualTrend(analytics?.annualBiteSummary?.annualTrend || 0);
                })
                .catch((e) => {
                    console.warn('Dashboard analytics failed:', e?.message || e);
                });

        } catch (err) {
            setError(`Failed to load dashboard data: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [workerProfile, staffRole]);

    useEffect(() => {
        fetchWorkerProfile();
    }, []);

    // ✅ REFRESH DATA WHEN SCREEN IS FOCUSED (e.g., coming back from form submission)
    useFocusEffect(
        useCallback(() => {
            if (workerProfile) {
                fetchDashboardData();
            }
        }, [workerProfile, fetchDashboardData])
    );

    useFocusEffect(
        useCallback(() => {
            const onBackPress = () => {
                setLogoutVisible(true);
                return true; // block default behavior so we can confirm logout
            };

            const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);

            return () => subscription.remove();
        }, [])
    );

    const handleConfirmLogout = useCallback(async () => {
        setLogoutVisible(false);
        try {
            try {
                await logActivity({
                    action: 'Logout',
                    description: 'Successfully logout',
                });
            } catch (e2) {
                console.log('Activity log skipped:', e2?.message || String(e2));
            }
            await updatePresenceForCurrentUser({ isOnline: false, lastSeenAt: new Date() });
            await account.deleteSession('current');
        } catch (e) {
            // ignore if already logged out
        }
        navigation.replace('SelectRole');
    }, [navigation]);

    // ❌ ERROR HANDLING
    if (error) {
        Alert.alert(
            "Error",
            error,
            [{ text: "Back to Login", onPress: () => navigation.navigate("SelectRole") }]
        );
        return null;
    }

    // ⏳ LOADING
    if (isLoading || !workerProfile) {
        return (
            <View style={styles.background}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#125872" />
                    <Text style={styles.loadingText}>Loading Dashboard...</Text>
                </View>
            </View>
        );
    }

    const pendingSubmitted = Math.max(0, submittedCasesCount - verifiedCasesCount - terminatedCasesCount);

    return (
        <View style={styles.background}>
            <View style={styles.screenWrapper}>
                {/* HEADER */}
                <View style={styles.topHeader}>
                    <TouchableOpacity onPress={openSidebar} style={styles.menuIconContainer}>
                        <Ionicons name="menu" size={24} color="#125872" />
                    </TouchableOpacity>

                    <Text style={styles.headerTitle}>{getStaffHeaderLocation(workerProfile, staffRole)}</Text>

                    <TouchableOpacity onPress={() => navigation.navigate('MyProfile', { workerProfile })}>
                        <View style={styles.profileIcon}>
                            <Ionicons name="person" size={20} color="#125872" />
                        </View>
                    </TouchableOpacity>
                </View>

                <View style={styles.cardsScrollArea}>
                    <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
                        {/* SUBMITTED CASES CARD */}
                        <TouchableOpacity
                            style={styles.mainCard}
                            onPress={() => navigation.navigate("NavigationHeader", { workerProfile })}
                        >
                            <Text style={styles.mainCardTitle}>Submitted Cases</Text>
                            <View style={styles.mainCardRow}>
                                <Text style={styles.mainCardNumber}>{submittedCasesCount}</Text>
                                <View style={styles.mainCardStatus}>
                                    <Text style={styles.statusLabel}>Status:</Text>
                                    <View style={[styles.statusBadge, styles.statusPending]}>
                                        <Text style={styles.statusTextPending}>{pendingSubmitted} pending</Text>
                                    </View>
                                    <View style={[styles.statusBadge, styles.statusVerified]}>
                                        <Text style={styles.statusTextVerified}>{verifiedCasesCount} verified</Text>
                                    </View>
                                    <View style={[styles.statusBadge, styles.statusTerminated]}>
                                        <Text style={styles.statusTextTerminated}>{terminatedCasesCount} terminated</Text>
                                    </View>
                                </View>
                            </View>
                        </TouchableOpacity>

                        {/* METRICS ROW */}
                        <View style={styles.metricsRow}>
                            {/* TOTAL CASES THIS MONTH */}
                            <TouchableOpacity 
                                style={[styles.halfCard, styles.metricsCardLeft]}
                                onPress={() => navigation.navigate('AnimalBiteReport', { workerProfile })}
                            >
                                <Text
                                    style={[styles.halfCardTitle, { fontSize: responsiveFont(16, { min: 12, max: 18 }) }]}
                                    numberOfLines={1}
                                    adjustsFontSizeToFit
                                    minimumFontScale={0.75}
                                    ellipsizeMode="tail"
                                >
                                    Total Cases this Month
                                </Text>
                                <View style={styles.numberWithLabel}>
                                    <Text style={[styles.halfCardNumber, styles.violetNumber]}>{monthlyCases} cases</Text>
                                </View>
                                <View style={styles.trendContainer}>
                                    <Ionicons name="trending-up" size={12} color="#5A8FA3" />
                                    <Text style={styles.trendText}>Trend: {monthlyTrend >= 0 ? '+' : ''}{monthlyTrend}%</Text>
                                </View>
                            </TouchableOpacity>

                            {/* ANNUAL BITE REPORTS */}
                            <TouchableOpacity
                                style={[styles.halfCard, styles.metricsCardRight]}
                                onPress={() => navigation.navigate('AnimalBiteReport', { workerProfile })}
                            >
                                <Text
                                    style={[styles.halfCardTitle, { fontSize: responsiveFont(16, { min: 12, max: 18 }) }]}
                                    numberOfLines={1}
                                    adjustsFontSizeToFit
                                    minimumFontScale={0.75}
                                    ellipsizeMode="tail"
                                >
                                    Annual Bite Reports
                                </Text>
                                <View style={styles.numberWithLabel}>
                                    <Text style={[styles.halfCardNumber, styles.redNumber]}>{annualCases} reports</Text>
                                </View>
                                <View style={styles.trendContainer}>
                                    <Ionicons name="trending-up" size={12} color="#5A8FA3" />
                                    <Text style={styles.trendText}>Trend: {annualTrend >= 0 ? '+' : ''}{annualTrend}%</Text>
                                </View>
                            </TouchableOpacity>
                        </View>

                        {/* RABIES EDUCATION CARD */}
                        <TouchableOpacity
                            style={styles.rabEdCard}
                            onPress={() => navigation.navigate('RabEdAnnouncements', { workerProfile })}
                        >
                            <Text
                                style={[styles.rabEdTitle, { fontSize: responsiveFont(24, { min: 16, max: 28 }) }]}
                                numberOfLines={1}
                                adjustsFontSizeToFit
                                minimumFontScale={0.75}
                                ellipsizeMode="tail"
                            >
                                Rabies Education (RabEd)
                            </Text>
                            <Text style={styles.rabEdDescription}>
                                Rabies Education (RabEd) empowers Tagum City with clear, bite-sized lessons to prevent panic and act wisely.
                            </Text>
                        </TouchableOpacity>

                        <View style={styles.bottomSpacing} />
                    </ScrollView>
                </View>
            </View>

            <LogOut
                visible={logoutVisible}
                onCancel={() => setLogoutVisible(false)}
                onConfirm={handleConfirmLogout}
            />

        </View>
    );
}

// --- STYLES ---
const styles = StyleSheet.create({
    background: { 
        flex: 1,
        backgroundColor: '#F5FAFB',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: { 
        color: '#125872', 
        marginTop: 10, 
        fontSize: 16 
    },
    screenWrapper: {
        flex: 1,
    },
    cardsScrollArea: {
        flex: 1,
    },
    scrollContainer: {
        flexGrow: 1,
        paddingHorizontal: 20,
        paddingBottom: 30,
    },
    topHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: 35,
        marginBottom: 30,
        paddingHorizontal: 15,
    },
    headerTitle: { 
        fontSize: 18, 
        fontWeight: "700", 
        color: "#125872", 
        flex: 1, 
        marginLeft: 15,
        letterSpacing: -0.5,
        textAlign: 'center',
    },
    menuIconContainer: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: 'transparent',
    },
    profileIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#E8F5F9',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: 'transparent',
    },
    
    // MAIN CARD - SUBMITTED CASES
    mainCard: {
        backgroundColor: "#E8F5F9",
        borderRadius: 20,
        padding: 20,
        marginBottom: 15,
        shadowColor: "#125872",
        shadowOpacity: 0.12,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
        borderLeftWidth: 5,
        borderLeftColor: '#125872',
    },
    mainCardTitle: { 
        fontSize: 26, 
        color: "#125872", 
        fontWeight: "800", 
        marginBottom: 12,
        letterSpacing: -0.5,
    },
    mainCardRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    mainCardNumber: { 
        fontSize: 72, 
        color: "#125872", 
        fontWeight: "900", 
        lineHeight: 72,
    },
    mainCardStatus: {
        alignItems: 'flex-end',
        paddingBottom: -4,
    },
    statusLabel: { 
        color: "#125872", 
        fontWeight: "700", 
        marginBottom: 8, 
        fontSize: 13 
    },
    statusBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        marginTop: 4,
        width: 100,
        alignItems: 'flex-end',
    },
    statusPending: {
        backgroundColor: '#FFF9E6',
    },
    statusVerified: {
        backgroundColor: '#E8F8F0',
    },
    statusTerminated: {
        backgroundColor: '#FFE8E8',
    },
    statusText: { 
        fontSize: 12, 
        color: "#125872", 
        fontWeight: '600',
    },
    statusTextPending: { 
        fontSize: 12, 
        color: "#B8860B", 
        fontWeight: '600',
    },
    statusTextVerified: { 
        fontSize: 12, 
        color: "#2E8B57", 
        fontWeight: '600',
    },
    statusTextTerminated: { 
        fontSize: 12, 
        color: "#C9302C", 
        fontWeight: '600',
    },
    
    // TWO COLUMN LAYOUT
    metricsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    metricsCardLeft: {
        flex: 1,
        marginRight: 6,
    },
    metricsCardRight: {
        flex: 1,
        marginLeft: 6,
    },
    halfCard: {
        backgroundColor: '#ffffff',
        borderRadius: 18,
        padding: 16,
        borderWidth: 0,
        shadowColor: "#125872",
        shadowOpacity: 0.08,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
        elevation: 3,
    },
    halfCardTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: '#125872',
        marginBottom: 2,
        letterSpacing: -0.5,
        textAlign: 'center',
    },
    halfCardNumber: {
        fontSize: 28,
        letterSpacing: -2,
        fontWeight: '900',
        color: '#125872',
        textAlign: 'center',
    },
    violetNumber: {
        color: '#7B68EE',
    },
    redNumber: {
        color: '#E85D75',
    },
    trendContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        marginTop: 2,
    },
    trendText: {
        fontSize: 10,
        letterSpacing: -0.5,
        color: '#5A8FA3',
        fontWeight: '500',
        opacity: 0.85,
    },
    numberWithLabel: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        marginBottom: -2,
        marginTop: -2,
        justifyContent: 'center',
      
    },
    // numberLabel: {
    //     fontSize: 20,
    //     color: '#0F74A7',
    //     fontWeight: '900',
    //     marginLeft: 3,
    //     marginBottom: 2,
    // },
    
    // RABIES EDUCATION CARD
    rabEdCard: {
        backgroundColor: '#E8F5F9',
        borderRadius: 18,
        padding: 20,
        marginBottom: 12,
        shadowColor: "#125872",
        shadowOpacity: 0.10,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
        elevation: 4,
        borderTopWidth: 4,
        borderTopColor: '#125872',
    },
    rabEdTitle: {
        fontSize: 24,
        fontWeight: '800',
        color: '#125872',
        letterSpacing: -0.5,
        marginBottom: 4,
    },
    rabEdDescription: {
        fontSize: 14,
        color: '#4A7485',
        lineHeight: 20,
        marginBottom: 0,
        marginTop: 0,
        opacity: 0.90,
    },
    
    bottomSpacing: {
        height: 20,
    },
    
});

export default MainDashboard;
