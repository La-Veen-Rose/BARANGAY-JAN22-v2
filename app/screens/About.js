import React from 'react';
import {
    StyleSheet,
    View,
    Text,
    ImageBackground,
    ScrollView,
    TouchableOpacity,
    Dimensions,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import RavenLogo from '../assets/raven-logo-blue.svg';

const { width } = Dimensions.get('window');
const PRIMARY = '#125872';

function About({ navigation }) {
    const handleBack = () => {
        if (navigation.canGoBack()) navigation.goBack();
        else navigation.navigate('Main');
    };

    return (
        <ImageBackground
            style={styles.background}
            source={require('../assets/bg-blue.png')}
        >
            {/* Top bar */}
            <View style={styles.headerBar}>
                <TouchableOpacity onPress={handleBack} style={styles.backButton}>
                    <Ionicons name="chevron-back" size={24} color={PRIMARY} />
                    <Text style={styles.backText}>Back</Text>
                </TouchableOpacity>

                <Text style={styles.headerTitle}>About RAVEN</Text>

                <View style={{ width: 40 }} />
            </View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Hero */}
                <View style={styles.heroCard}>
                    <RavenLogo width={170} height={48} />
                    <Text style={styles.heroTagline}>Rabies Awareness and Vigilance Exposure Network</Text>
                    <Text style={styles.heroSub}>A digital shield for Tagum City against rabies.</Text>
                </View>

                {/* Mission */}
                <View style={styles.sectionCard}>
                    <Text style={styles.sectionTitle}>Why RAVEN?</Text>
                    <Text style={styles.sectionBody}>
                        RAVEN was created to help health workers respond fast and
                        confidently to animal bite incidents, while keeping every
                        Tagumenyo informed, protected, and connected to care.
                    </Text>
                </View>

                {/* Key pillars */}
                <View style={styles.sectionCard}>
                    <Text style={styles.sectionTitle}>What RAVEN Helps You Do</Text>

                    <View style={styles.pillarsRow}>
                        <View style={styles.pillarBox}>
                            <Ionicons name="shield-checkmark" size={24} color={PRIMARY} />
                            <Text style={styles.pillarTitle}>Protect Patients</Text>
                            <Text style={styles.pillarText}>
                                Capture bite details quickly so patients receive the right
                                care at the right time.
                            </Text>
                        </View>

                        <View style={styles.pillarBox}>
                            <Ionicons name="analytics" size={24} color={PRIMARY} />
                            <Text style={styles.pillarTitle}>See the Trend</Text>
                            <Text style={styles.pillarText}>
                                Monitor cases by barangay and purok to support better
                                planning and outbreak prevention.
                            </Text>
                        </View>
                    </View>

                    <View style={styles.pillarsRow}>
                        <View style={styles.pillarBox}>
                            <Ionicons name="book" size={24} color={PRIMARY} />
                            <Text style={styles.pillarTitle}>Educate Families</Text>
                            <Text style={styles.pillarText}>
                                Share simple Rabies Education (RabEd) content so families
                                know what to do after a bite.
                            </Text>
                        </View>

                        <View style={styles.pillarBox}>
                            <Ionicons name="people" size={24} color={PRIMARY} />
                            <Text style={styles.pillarTitle}>Support Health Workers</Text>
                            <Text style={styles.pillarText}>
                                Give frontliners a clear, guided workflow that reduces
                                manual logs and repetitive paperwork.
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Designed for */}
                <View style={styles.sectionCard}>
                    <Text style={styles.sectionTitle}>Designed For</Text>

                    <View style={styles.chipRow}>
                        <View style={styles.chip}>
                            <Ionicons name="medkit" size={16} color={PRIMARY} />
                            <Text style={styles.chipText}>ABTC & City Health Staff</Text>
                        </View>
                        <View style={styles.chip}>
                            <Ionicons name="home" size={16} color={PRIMARY} />
                            <Text style={styles.chipText}>Barangay Health Workers</Text>
                        </View>
                    </View>

                    <View style={styles.chipRow}>
                        <View style={styles.chip}>
                            <Ionicons name="paw" size={16} color={PRIMARY} />
                            <Text style={styles.chipText}>Bite Victims & Families</Text>
                        </View>
                        <View style={styles.chip}>
                            <Ionicons name="map" size={16} color={PRIMARY} />
                            <Text style={styles.chipText}>Tagum City Community</Text>
                        </View>
                    </View>
                </View>

                {/* RAVEN Team */}
                <View style={styles.sectionCard}>
                    <Text style={styles.sectionTitle}>RAVEN Team</Text>
                    <Text style={styles.sectionBody}>
                        Behind RAVEN is a small team of researchers and developers
                        committed to making rabies prevention clearer and more
                        accessible for Tagum City.
                    </Text>

                    <View style={styles.teamRow}>
                        <View style={styles.avatar}>
                            <Text style={styles.avatarInitials}>MM</Text>
                        </View>
                        <View style={styles.teamTextWrap}>
                            <Text style={styles.teamName}>Mahalyn Macosang</Text>
                            <Text style={styles.teamRole}>Research Leader / Front-end Developer</Text>
                        </View>
                    </View>

                    <View style={styles.teamRow}>
                        <View style={styles.avatar}>
                            <Text style={styles.avatarInitials}>KS</Text>
                        </View>
                        <View style={styles.teamTextWrap}>
                            <Text style={styles.teamName}>Kenneth Sanoy</Text>
                            <Text style={styles.teamRole}>Research Member / Full-stack Developer</Text>
                        </View>
                    </View>

                    <View style={styles.teamRow}>
                        <View style={styles.avatar}>
                            <Text style={styles.avatarInitials}>VR</Text>
                        </View>
                        <View style={styles.teamTextWrap}>
                            <Text style={styles.teamName}>Venus Rollon</Text>
                            <Text style={styles.teamRole}>Research Member / Full-stack Developer</Text>
                        </View>
                    </View>

                    <View style={styles.teamRow}>
                        <View style={styles.avatar}>
                            <Text style={styles.avatarInitials}>RM</Text>
                        </View>
                        <View style={styles.teamTextWrap}>
                            <Text style={styles.teamName}>Rhonie Cel Madum</Text>
                            <Text style={styles.teamRole}>Research Member / Front-end Developer</Text>
                        </View>
                    </View>

                    <View style={[styles.teamRow, { marginTop: 12 }] }>
                        <View style={[styles.avatar, styles.adviserAvatar]}>
                            <Text style={styles.avatarInitials}>JB</Text>
                        </View>
                        <View style={styles.teamTextWrap}>
                            <Text style={styles.teamName}>J-Archer Branzuela</Text>
                            <Text style={styles.teamRole}>Research Adviser</Text>
                        </View>
                    </View>
                </View>

                {/* System info */}
                <View style={[styles.sectionCard, styles.systemCard]}>
                    <Text style={styles.systemLabel}>System Information</Text>
                    <View style={styles.systemRow}>
                        <Text style={styles.systemKey}>App name</Text>
                        <Text style={styles.systemValue}>RAVEN (Rabies Awareness and Vigilance Exposure Network)</Text>
                    </View>
                    <View style={styles.systemRow}>
                        <Text style={styles.systemKey}>Version</Text>
                        <Text style={styles.systemValue}>v1.0.0</Text>
                    </View>
                    <View style={styles.systemRow}>
                        <Text style={styles.systemKey}>City</Text>
                        <Text style={styles.systemValue}>Tagum City, Davao del Norte</Text>
                    </View>
                </View>

                {/* CTA */}
                <TouchableOpacity style={styles.primaryButton} onPress={handleBack}>
                    <Text style={styles.primaryButtonText}>Back to Dashboard</Text>
                </TouchableOpacity>

                <View style={{ height: 28 }} />
            </ScrollView>
        </ImageBackground>
    );
}

export default About;

const styles = StyleSheet.create({
    background: {
        flex: 1,
        backgroundColor: '#E8F4F8',
    },
    headerBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 18,
        paddingTop: 50,
        paddingBottom: 12,
    },
    backButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 4,
    },
    backText: {
        marginLeft: 2,
        color: PRIMARY,
        fontSize: 14,
        fontWeight: '600',
        fontFamily: 'Poppins',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: PRIMARY,
        letterSpacing: -0.7,
        fontFamily: 'Poppins',
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 18,
        paddingBottom: 20,
    },
    heroCard: {
        backgroundColor: '#ffffffdd',
        borderRadius: 18,
        paddingHorizontal: 18,
        paddingVertical: 20,
        marginBottom: 14,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 5,
        elevation: 3,
    },
    heroTagline: {
        marginTop: 12,
        fontSize: 13,
        fontWeight: '700',
        textAlign: 'center',
        color: PRIMARY,
        letterSpacing: -0.3,
        fontFamily: 'Poppins',
    },
    heroSub: {
        marginTop: 8,
        fontSize: 12,
        color: '#336b88',
        textAlign: 'center',
        fontWeight: '500',
        fontFamily: 'Poppins',
    },
    sectionCard: {
        backgroundColor: '#ffffffee',
        borderRadius: 16,
        padding: 18,
        marginBottom: 14,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: PRIMARY,
        marginBottom: 8,
        letterSpacing: -0.5,
        fontFamily: 'Poppins',
    },
    sectionBody: {
        fontSize: 13,
        color: '#355166',
        lineHeight: 18,
        fontWeight: '500',
        fontFamily: 'Poppins',
    },
    pillarsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 10,
    },
    pillarBox: {
        width: '48%',
        backgroundColor: '#F1F7FA',
        borderRadius: 12,
        padding: 12,
    },
    pillarTitle: {
        marginTop: 8,
        fontSize: 13,
        fontWeight: '700',
        color: PRIMARY,
        fontFamily: 'Poppins',
    },
    pillarText: {
        marginTop: 4,
        fontSize: 11,
        color: '#47657a',
        lineHeight: 16,
        fontFamily: 'Poppins',
    },
    chipRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: 8,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 999,
        paddingVertical: 6,
        paddingHorizontal: 10,
        backgroundColor: '#E4F0F6',
        marginRight: 8,
        marginBottom: 8,
    },
    chipText: {
        marginLeft: 6,
        fontSize: 11,
        color: PRIMARY,
        fontWeight: '600',
        fontFamily: 'Poppins',
    },
    systemCard: {
        borderWidth: 1,
        borderColor: '#d0e1ec',
    },
    systemLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: '#5b7182',
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: 1,
        fontFamily: 'Poppins',
    },
    systemRow: {
        marginBottom: 6,
    },
    systemKey: {
        fontSize: 11,
        color: '#6e8493',
        fontWeight: '600',
        fontFamily: 'Poppins',
    },
    systemValue: {
        fontSize: 12,
        color: '#294154',
        fontWeight: '600',
        marginTop: 1,
        fontFamily: 'Poppins',
    },
    primaryButton: {
        marginTop: 6,
        backgroundColor: PRIMARY,
        paddingVertical: 14,
        borderRadius: 16,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.18,
        shadowRadius: 4,
        elevation: 3,
    },
    primaryButtonText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '700',
        letterSpacing: -0.5,
        fontFamily: 'Poppins',
    },
    teamRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 10,
    },
    avatar: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: '#D5E7F3',
        alignItems: 'center',
        justifyContent: 'center',
    },
    adviserAvatar: {
        backgroundColor: '#C7DBF0',
    },
    avatarInitials: {
        fontSize: 14,
        fontWeight: '800',
        color: PRIMARY,
        fontFamily: 'Poppins',
    },
    teamTextWrap: {
        marginLeft: 10,
        flex: 1,
    },
    teamName: {
        fontSize: 13,
        fontWeight: '700',
        color: PRIMARY,
        fontFamily: 'Poppins',
    },
    teamRole: {
        fontSize: 11,
        color: '#567186',
        marginTop: 2,
        fontFamily: 'Poppins',
    },
    photoNote: {
        marginTop: 10,
        fontSize: 10,
        color: '#8a9aae',
        lineHeight: 14,
        fontFamily: 'Poppins',
    },
});
