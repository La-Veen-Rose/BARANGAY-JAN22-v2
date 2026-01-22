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
import { databases, appwriteConfig, account } from './appwriteConfig';
import { Query } from 'appwrite';
import { fetchAnimalBiteReportData } from './reportAnalyticsService';

const { width } = Dimensions.get('window');

function MainDashboard({ navigation, openSidebar }) {

    const [workerProfile, setWorkerProfile] = useState(null);
    const [submittedCasesCount, setSubmittedCasesCount] = useState(0);
    const [verifiedCasesCount, setVerifiedCasesCount] = useState(0);
    const [terminatedCasesCount, setTerminatedCasesCount] = useState(0);
    const [monthlyCases, setMonthlyCases] = useState(0);
    const [monthlyTrend, setMonthlyTrend] = useState(0);
    const [annualCases, setAnnualCases] = useState(0);
    const [annualTrend, setAnnualTrend] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    // ✅ GET LOGGED IN WORKER PROFILE
    const fetchWorkerProfile = useCallback(async () => {
        try {
            const user = await account.get();

            const res = await databases.listDocuments(
                appwriteConfig.staffDatabaseId,
                appwriteConfig.healthWorkersCollectionId,
                [
                    Query.equal("auth_user_id", user.$id)
                ]
            );

            if (res.total === 0) {
                throw new Error("No health worker profile found.");
            }

            setWorkerProfile(res.documents[0]);

        } catch (err) {
            setError(err.message);
        }
    }, []);

    // ✅ FETCH DASHBOARD COUNTS
    const fetchDashboardData = useCallback(async () => {
        if (!workerProfile) return;

        try {
            const submittedRes = await databases.listDocuments(
                appwriteConfig.patientDatabaseId,
                appwriteConfig.patientRecordsCollectionId,
                [
                    Query.equal('purok', workerProfile.purok),
                    Query.equal('barangay', workerProfile.barangay),
                    Query.limit(1)
                ]
            );

            const verifiedRes = await databases.listDocuments(
                appwriteConfig.patientDatabaseId,
                appwriteConfig.patientRecordsCollectionId,
                [
                    Query.equal('purok', workerProfile.purok),
                    Query.equal('barangay', workerProfile.barangay),
                    Query.equal('status', 'verified'),
                    Query.limit(1)
                ]
            );

            const terminatedRes = await databases.listDocuments(
                appwriteConfig.patientDatabaseId,
                appwriteConfig.patientRecordsCollectionId,
                [
                    Query.equal('purok', workerProfile.purok),
                    Query.equal('barangay', workerProfile.barangay),
                    Query.equal('status', 'terminated'),
                    Query.limit(1)
                ]
            );

            setSubmittedCasesCount(submittedRes.total);
            setVerifiedCasesCount(verifiedRes.total);
            setTerminatedCasesCount(terminatedRes.total);

            // ✅ Link dashboard summary cards to the same
            // analytics used by the AnimalBiteReport screen
            const analytics = await fetchAnimalBiteReportData();

            // Total cases this month + trend (city-wide verified records)
            setMonthlyCases(analytics.monthlyCaseSummary.totalCases || 0);
            setMonthlyTrend(analytics.monthlyCaseSummary.trendFromLastMonth || 0);

            // Annual bite report (city-wide verified records)
            setAnnualCases(analytics.annualBiteSummary.totalReports || 0);
            setAnnualTrend(analytics.annualBiteSummary.annualTrend || 0);

        } catch (err) {
            setError(`Failed to load dashboard data: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [workerProfile]);

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
            [{ text: "Back to Login", onPress: () => navigation.navigate("LogIn") }]
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

    const pendingSubmitted = submittedCasesCount - verifiedCasesCount;

    return (
        <ImageBackground style={styles.background} source={require("../assets/bg-blue.png")}>
            {/* HEADER */}
            <View style={styles.topHeader}>
                <TouchableOpacity onPress={openSidebar}>
                    <Ionicons name="menu" size={28} color="#0F74A7" />
                </TouchableOpacity>

                <Text style={styles.headerTitle}>{workerProfile.barangay}, Tagum</Text>

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
                    <Text style={styles.mainCardTitle}>Submitted cases</Text>
                    <View style={styles.mainCardRow}>
                        <Text style={styles.mainCardNumber}>{submittedCasesCount}</Text>
                        <View style={styles.mainCardStatus}>
                            <Text style={styles.statusLabel}>Status:</Text>
                            <Text style={styles.statusText}>{verifiedCasesCount} ({verifiedCasesCount}) verified forms</Text>
                            <Text style={styles.statusText}>{pendingSubmitted} ({pendingSubmitted}) pending forms</Text>
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
                            <Text style={styles.halfCardTitle}>Total Cases this Month</Text>
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
                            <Text style={styles.halfCardTitle}>Annual Bite Reports</Text>
                            <View style={styles.numberWithLabel}>
                                <Text style={styles.halfCardNumber}>{annualCases} reports</Text>
                            </View>
                            <Text style={styles.trendText}>Trend: {annualTrend >= 0 ? '+' : ''}{annualTrend}% from last year</Text>
                        </TouchableOpacity>
                    </View>

                    {/* RAVEN CARD */}
                    <TouchableOpacity style={styles.ravenCard}>
                        <Text style={styles.ravenText}>RAVEN</Text>
                        <View style={styles.shieldContainer}>
                            <Image source={require('../assets/RAVEN MONO 5.png')} style={styles.ravenImage} />
                        </View>
                    </TouchableOpacity>
                </View>

                {/* RABIES EDUCATION CARD */}
                <TouchableOpacity
                    style={styles.rabEdCard}
                    onPress={() => navigation.navigate('RabEdAnnouncements')}
                >
                    <Text style={styles.rabEdTitle}>Rabies Education (RabEd)</Text>
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
        color: '#0F74A7', 
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
        color: "#0F74A7", 
        flex: 1, 
        marginLeft: 15,
        letterSpacing: -0.5,
        textAlign: 'center',
    },
    profileIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#0F74A7',
        justifyContent: 'center',
        alignItems: 'center',
    },
    
    // MAIN CARD - SUBMITTED CASES
    mainCard: {
        backgroundColor: "#0F74A7",
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
        borderColor: '#0F74A7',
        shadowColor: "#000",
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 2,
    },
    halfCardTitle: {
        fontSize: 16,
        fontWeight: '900',
        color: '#0F74A7',
        marginBottom: 0,
        letterSpacing: -0.5,
        textAlign: 'center',
    },
    halfCardNumber: {
        fontSize: 28,
        letterSpacing: -2,
        fontWeight: '900',
        color: '#0F74A7',
        textAlign: 'center',
    },
    trendText: {
        fontSize: 12,
        letterSpacing: -0.5,
        color: '#0F74A7',
        fontWeight: '500',
        textAlign: 'center',
    },
    numberWithLabel: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        marginBottom: 10,
        marginTop: 10,
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
        backgroundColor: '#0F74A7',
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
        backgroundColor: '#0F74A7',
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
        marginBottom: 8,
    },
    rabEdDescription: {
        fontSize: 14,
        color: 'white',
        lineHeight: 18,
        marginBottom: 15,
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
