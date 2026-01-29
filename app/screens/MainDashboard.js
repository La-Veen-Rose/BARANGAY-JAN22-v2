import React, { useState, useEffect, useCallback } from 'react';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import {
    ImageBackground,
    StyleSheet,
    Text,
    View,
    TouchableOpacity,
    Dimensions,
    ActivityIndicator,
    Alert,
    ScrollView,
    Image,
} from "react-native";
import { useFocusEffect } from '@react-navigation/native';

// --- Appwrite Imports ---
import { databases, appwriteConfig, account, Query } from './appwriteConfig';
import { fetchAnimalBiteReportData } from './reportAnalyticsService';
import { getCurrentStaffProfile, getStaffHeaderLocation, STAFF_ROLE } from './staffProfileService';

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

            // BHW: show only records created by this worker
            // Physician: can access ALL patient records
            const submittedOwnerFilter = isPhysician
                ? []
                : [
                    (() => {
                        const workerHwId =
                            workerProfile.healthWorkerId ||
                            workerProfile.healthWorkerID ||
                            workerProfile.healthWorkerIDNumber ||
                            workerProfile.$id;
                        return Query.or([
                            Query.equal('recordedByUserID', user.$id),
                            Query.equal('recordedByHWID', workerHwId),
                        ]);
                    })(),
                ];

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
            <ImageBackground style={styles.background} source={require("../assets/bg-blue.png")}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#125872" />
                    <Text style={styles.loadingText}>Loading Dashboard...</Text>
                </View>
            </ImageBackground>
        );
    }

    const pendingSubmitted = Math.max(0, submittedCasesCount - verifiedCasesCount - terminatedCasesCount);

    return (
        <ImageBackground style={styles.background} source={require("../assets/bg-blue.png")}>
            {/* HEADER */}
            <View style={styles.topHeader}>
                <TouchableOpacity onPress={openSidebar}>
                    <Ionicons name="menu" size={28} color="#125872" />
                </TouchableOpacity>

                <Text style={styles.headerTitle}>{getStaffHeaderLocation(workerProfile, staffRole)}</Text>

                <TouchableOpacity onPress={() => navigation.navigate('MyProfile', { workerProfile })}>
                    <View style={styles.profileIcon}>
                        <Ionicons name="person" size={20} color="white" />
                    </View>
                </TouchableOpacity>
            </View>

            <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false}>
                {/* SUBMITTED CASES CARD */}
                <TouchableOpacity
                    style={styles.mainCard}
                    onPress={() => navigation.navigate("NavigationHeader", { workerProfile })}
                >
                    <Text style={[styles.mainCardTitle, { color: '#ffffff' }]}>Submitted cases</Text>
                    <View style={styles.mainCardRow}>
                        <Text style={styles.mainCardNumber}>{submittedCasesCount}</Text>
                        <View style={styles.mainCardStatus}>
                            <Text style={styles.statusLabel}>Status:</Text>
                            <Text style={styles.statusText}>{pendingSubmitted} pending</Text>
                            <Text style={styles.statusText}>{verifiedCasesCount} verified</Text>
                            <Text style={styles.statusText}>{terminatedCasesCount} terminated</Text>
                        </View>
                    </View>
                </TouchableOpacity>

                {/* TWO COLUMN LAYOUT FOR METRICS */}
                <View style={styles.twoColumnContainer}>
                    <View style={styles.columnLeft}>
                        {/* TOTAL CASES THIS MONTH */}
                        <TouchableOpacity 
                            style={styles.halfCard}
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
                                <Text style={styles.halfCardNumber}>{monthlyCases} cases</Text>
                            </View>
                            <Text style={styles.trendText}>Trend: {monthlyTrend >= 0 ? '+' : ''}{monthlyTrend}% from last month</Text>
                        </TouchableOpacity>

                        {/* ANNUAL BITE REPORTS */}
                        <TouchableOpacity
                            style={[styles.halfCard, { marginTop: 12 }]}
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
                                <Text style={styles.halfCardNumber}>{annualCases} reports</Text>
                            </View>
                            <Text style={styles.trendText}>Trend: {annualTrend >= 0 ? '+' : ''}{annualTrend}% from last year</Text>
                        </TouchableOpacity>
                    </View>

                    {/* RAVEN CARD */}
                    <TouchableOpacity style={styles.ravenCard}>
                        <Text
                            style={[styles.ravenText, { fontSize: responsiveFont(32, { min: 22, max: 36 }) }]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.7}
                            ellipsizeMode="tail"
                        >
                            RAVEN
                        </Text>
                        <View style={styles.shieldContainer}>
                            <Image source={require('../assets/RAVEN MONO 5.png')} style={styles.ravenImage} />
                        </View>
                    </TouchableOpacity>
                </View>

                {/* RABIES EDUCATION CARD */}
                <TouchableOpacity style={styles.rabEdCard}>
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
                    <Text style={styles.rabEdLink}>Go to RabEd</Text>
                </TouchableOpacity>

                <View style={styles.bottomSpacing} />
            </ScrollView>

        </ImageBackground>
    );
}

// --- STYLES ---
const styles = StyleSheet.create({
    background: { 
        flex: 1,
        backgroundColor: '#E8F4F8',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.7)',
    },
    loadingText: { 
        color: '#125872', 
        marginTop: 10, 
        fontSize: 16 
    },
    scrollContainer: {
        flex: 1,
        paddingHorizontal: 20,
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
    profileIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#125872',
        justifyContent: 'center',
        alignItems: 'center',
    },
    
    // MAIN CARD - SUBMITTED CASES
    mainCard: {
        backgroundColor: "#125872",
        borderRadius: 20,
        padding: 18,
        marginBottom: 15,
        shadowColor: "#000",
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 4,
    },
    mainCardTitle: { 
        fontSize: 26, 
        color: "white", 
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
        color: "white", 
        fontWeight: "900", 
        lineHeight: 72,
    },
    mainCardStatus: {
        alignItems: 'flex-end',
        paddingBottom: -4,
    },
    statusLabel: { 
        color: "white", 
        fontWeight: "600", 
        marginBottom: 6, 
        fontSize: 13 
    },
    statusText: { 
        fontSize: 13, 
        color: "white", 
        opacity: 0.95, 
        marginTop: 3,
        lineHeight: 16,
    },
    
    // TWO COLUMN LAYOUT
    twoColumnContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
        gap: 12,
    },
    columnLeft: {
        flex: 1.5,
    },
    halfCard: {
        backgroundColor: 'white',
        borderRadius: 15,
        padding: 15,
        borderWidth: 2.5,
        borderColor: '#125872',
        shadowColor: "#000",
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 2,
    },
    halfCardTitle: {
        fontSize: 16,
        fontWeight: '900',
        color: '#125872',
        marginBottom: 0,
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
    trendText: {
        fontSize: 12,
        letterSpacing: -0.5,
        color: '#125872',
        fontWeight: '500',
        textAlign: 'center',
        paddingBottom: -5,
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
    
    // RAVEN CARD
    ravenCard: {
        backgroundColor: '#125872',
        borderRadius: 15,
        padding: 15,
        justifyContent: 'center',
        alignItems: 'center',
        flex: 0.8,
        shadowColor: "#000",
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 4,
   
    },
    ravenText: {
        fontSize: 32,
        fontWeight: '900',
        letterSpacing: -1,
        color: 'white',
        marginBottom: 10,
        textAlign: 'center',
    },
    shieldContainer: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    ravenImage: {
        width: 100,
        height: 100,
        resizeMode: 'contain',
    },
    
    // RABIES EDUCATION CARD
    rabEdCard: {
        backgroundColor: '#125872',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        shadowColor: "#000",
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 4,
    },
    rabEdTitle: {
        fontSize: 24,
        fontWeight: '800',
        color: 'white',
        letterSpacing: -0.5,
        marginBottom: 5,
    },
    rabEdDescription: {
        fontSize: 14,
        color: 'white',
        lineHeight: 18,
        marginBottom: 12,
        marginTop: 5,
        opacity: 0.95,
    },
    rabEdLink: {
        fontSize: 13,
        color: 'white',
        fontWeight: '600',
        textDecorationLine: 'underline',
        marginBottom: 10,
    },
    
    bottomSpacing: {
        height: 20,
    },
    
});

export default MainDashboard;
