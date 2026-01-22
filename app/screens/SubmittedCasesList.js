import React, { useState, useEffect, useRef } from 'react';
import { 
    View, 
    StyleSheet, 
    Text, 
    TouchableOpacity, 
    FlatList,
    ActivityIndicator,
    Alert,
    Modal,
    RefreshControl,
} from "react-native";
import { databases, appwriteConfig, account } from './appwriteConfig';
import { Query } from 'appwrite';
import { Ionicons } from '@expo/vector-icons';

// ---------------------------
// REUSABLE COMPONENTS
// ---------------------------
const StatusTab = ({ label, value, selectedValue, onSelect }) => (
    <TouchableOpacity 
        style={[styles.tab, selectedValue === value && styles.tabSelected]} 
        onPress={() => onSelect(value)}
    >
        <Text style={[styles.tabText, selectedValue === value && styles.tabTextSelected]}>
            {label}
        </Text>
    </TouchableOpacity>
);

const CaseItem = ({ item, onPress, onTerminatedPress }) => {
    let statusStyle;
    switch (item.status) {
        case 'Pending': statusStyle = styles.statusPending; break;
        case 'Verified': statusStyle = styles.statusVerified; break;
        case 'Terminated': statusStyle = styles.statusTerminated; break;
        default: statusStyle = styles.statusPending;
    }

    const displayName = `${item.lastName}, ${item.firstName.charAt(0)}.`;
    const recordedBy = item.recordedByFullName || 'N/A';

    return (
        <TouchableOpacity 
            style={styles.caseItemContainer}
            onPress={() => {
                // If terminated, show termination reason modal instead of full record
                if (item.status === 'Terminated' && onTerminatedPress) {
                    onTerminatedPress(item);
                } else {
                    onPress();
                }
            }}
            activeOpacity={0.8}
        >
            <View style={styles.caseContent}>
                <Text style={styles.caseName}>{displayName}</Text>
                <Text style={styles.caseId}>{item.submissionID}</Text>
                <Text style={styles.caseRecordedBy}>Recorded By: {recordedBy}</Text>
                <Text style={styles.caseDate}>{item.dateFormatted}</Text>
            </View>

            <View style={[styles.statusPill, statusStyle]}>
                <Text style={styles.statusText}>{item.status}</Text>
            </View>
        </TouchableOpacity>
    );
};

// ---------------------------
// TERMINATED REASON MODAL
// ---------------------------
const TerminatedReasonModal = ({ visible, onClose, patientName, terminateReason, loading }) => (
    <Modal
        transparent={true}
        animationType="fade"
        visible={visible}
        onRequestClose={onClose}
    >
        <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
                {loading ? (
                    <ActivityIndicator size="large" color="#125872" />
                ) : (
                    <>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Termination Reason</Text>
                            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                                <Ionicons name="close" size={24} color="#125872" />
                            </TouchableOpacity>
                        </View>
                        
                        <View style={styles.modalBody}>
                            <Text style={styles.patientNameText}>{patientName}</Text>
                            <View style={styles.reasonContainer}>
                                <Text style={styles.reasonLabel}>Reason for Termination:</Text>
                                <Text style={styles.reasonText}>
                                    {terminateReason || 'No reason provided'}
                                </Text>
                            </View>
                        </View>

                        <TouchableOpacity 
                            style={styles.closeModalButton}
                            onPress={onClose}
                        >
                            <Text style={styles.closeModalButtonText}>Close</Text>
                        </TouchableOpacity>
                    </>
                )}
            </View>
        </View>
    </Modal>
);

// ---------------------------
// MAIN COMPONENT (Child of SharedHeader)
// ---------------------------
function SubmittedCasesList({ navigation, route, onOpenPatientRecordContent }) {
    const { workerProfile: passedProfile, focusStatus } = route?.params || {};
    const initialStatus = focusStatus || 'Pending';
    const [selectedStatus, setSelectedStatus] = useState(initialStatus);
    const [cases, setCases] = useState([]);
    const [loading, setLoading] = useState(true);
    const [workerProfile, setWorkerProfile] = useState(passedProfile || null);
    const [showTerminatedModal, setShowTerminatedModal] = useState(false);
    const [selectedTerminatedCase, setSelectedTerminatedCase] = useState(null);
    const [terminatedReasonLoading, setTerminatedReasonLoading] = useState(false);

    // Track previous cases to detect newly verified records in this session
    const prevCasesRef = useRef([]);
    const [newlyVerifiedCases, setNewlyVerifiedCases] = useState([]);
    const [showNewVerifiedModal, setShowNewVerifiedModal] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    // Update selected status if focusStatus route param changes (e.g., from notification)
    useEffect(() => {
        if (focusStatus && focusStatus !== selectedStatus) {
            setSelectedStatus(focusStatus);
        }
    }, [focusStatus]);

    // Fetch worker profile if not passed via params
    useEffect(() => {
        const fetchWorkerProfile = async () => {
            if (passedProfile) {
                setWorkerProfile(passedProfile);
                return;
            }

            try {
                const user = await account.get();
                const userEmail = user.email;

                const response = await databases.listDocuments(
                    appwriteConfig.staffDatabaseId,
                    appwriteConfig.healthWorkersCollectionId,
                    [Query.equal('email', userEmail)]
                );

                if (response.documents.length > 0) {
                    setWorkerProfile(response.documents[0]);
                } else {
                    Alert.alert('Error', 'Worker profile not found. Please contact administrator.');
                    navigation.navigate("LogIn");
                }
            } catch (error) {
                console.error('Error fetching worker profile:', error);
                Alert.alert('Error', 'Failed to fetch worker profile. Please login again.');
                navigation.navigate("LogIn");
            }
        };

        fetchWorkerProfile();
    }, [passedProfile, navigation]);

    // Handle missing worker profile
    useEffect(() => {
        if (!workerProfile && !loading) {
            Alert.alert("Error", "Worker profile missing. Please login again.");
            navigation.navigate("LogIn");
        }
    }, [workerProfile, loading, navigation]);

    // Format date like "NOVEMBER 03, 2025"
    const formatDate = (isoDate) => {
        const date = new Date(isoDate);
        const options = { month: 'long', day: '2-digit', year: 'numeric' };
        return date.toLocaleDateString('en-US', options).toUpperCase();
    };

    // ✅ Normalize status to proper case for consistency
    const normalizeStatus = (status) => {
        if (!status) return 'Pending';
        const normalized = status.toLowerCase();
        if (normalized === 'pending') return 'Pending';
        if (normalized === 'verified') return 'Verified';
        if (normalized === 'terminated') return 'Terminated';
        return 'Pending';
    };

    const fetchSubmittedCases = async (isInitialLoad = false) => {
        try {
            if (isInitialLoad) {
                setLoading(true);
            } else {
                setRefreshing(true);
            }

            // Guard: Check if workerProfile exists before accessing its properties
            if (!workerProfile || !workerProfile.purok || !workerProfile.barangay) {
                Alert.alert('Error', 'Worker profile information missing. Please login again.');
                navigation.navigate("LogIn");
                setLoading(false);
                setRefreshing(false);
                return;
            }

            const purok = workerProfile.purok;
            const barangay = workerProfile.barangay;

            // 🔑 CHANGE: Filter by purok AND barangay
            // This allows all workers at the same purok and barangay to see all records from that location
            let res = await databases.listDocuments(
                appwriteConfig.patientDatabaseId,
                appwriteConfig.patientRecordsCollectionId,
                [
                    Query.equal('purok', purok),
                    Query.equal('barangay', barangay),
                    Query.orderDesc('$createdAt'),
                    Query.limit(100)
                ]
            );

            // 🟢 NEW: Format cases with interviewed/referred by information
            const formattedCases = await Promise.all(
                (res.documents || []).map(async (doc) => {
                    return {
                        ...doc,
                        id: doc.$id,
                        lastName: doc.lastName || 'N/A',
                        firstName: doc.firstName || 'N/A',
                        submissionID: doc.submissionID,
                        dateFormatted: doc.dateSubmitted
                            ? formatDate(doc.dateSubmitted)
                            : (doc.$createdAt ? formatDate(doc.$createdAt) : 'N/A'),
                        status: normalizeStatus(doc.status),
                        recordedByFullName: doc.interviewedReferredBy || 'N/A',
                    };
                })
            );

            // Detect records that have just transitioned to Verified
            const prevById = (prevCasesRef.current || []).reduce((acc, item) => {
                acc[item.id] = item;
                return acc;
            }, {});

            const justVerified = formattedCases.filter((item) => {
                if (item.status !== 'Verified') return false;
                const prev = prevById[item.id];
                const prevStatus = prev?.status;
                return prevStatus && prevStatus !== 'Verified';
            });

            if (justVerified.length > 0) {
                setNewlyVerifiedCases(justVerified);
                setShowNewVerifiedModal(true);
            }

            prevCasesRef.current = formattedCases;
            setCases(formattedCases);

        } catch (error) {
            console.error('Error fetching submitted cases:', error);
            Alert.alert('Error', 'Failed to fetch submitted cases.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchSubmittedCases(true);
    }, [workerProfile]);

    const handleRefresh = () => {
        if (!workerProfile || refreshing) return;
        fetchSubmittedCases(false);
    };

    // Handle showing terminated reason modal
    const handleShowTerminatedReason = async (caseItem) => {
        setSelectedTerminatedCase(caseItem);
        setShowTerminatedModal(true);
        setTerminatedReasonLoading(false);
    };

    const handleCloseTerminatedModal = () => {
        setShowTerminatedModal(false);
        setSelectedTerminatedCase(null);
        setTerminatedReasonLoading(false);
    };

    const filteredCases = selectedStatus === 'All'
        ? cases
        : cases.filter(c => c.status === selectedStatus);

    if (!workerProfile) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="large" color="#125872" style={{ marginTop: 50 }} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.tabBar}>
                <StatusTab label="Pending" value="Pending" selectedValue={selectedStatus} onSelect={setSelectedStatus} />
                <StatusTab label="Verified" value="Verified" selectedValue={selectedStatus} onSelect={setSelectedStatus} />
                <StatusTab label="Terminated" value="Terminated" selectedValue={selectedStatus} onSelect={setSelectedStatus} />
            </View>

            <View style={styles.tabDivider} />

            {loading ? (
                <ActivityIndicator size="large" color="#125872" style={{ marginTop: 50 }} />
            ) : (
                <FlatList
                    data={filteredCases}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => (
                        <CaseItem 
                            item={item}
                            onPress={() => {
                                if (onOpenPatientRecordContent) {
                                    onOpenPatientRecordContent(item);
                                } else {
                                    navigation.navigate("PatientRecordContent", { patient: item });
                                }
                            }}
                            onTerminatedPress={handleShowTerminatedReason}
                        />
                    )}
                    contentContainerStyle={styles.listContent}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={handleRefresh}
                            tintColor="#125872"
                            colors={["#125872"]}
                        />
                    }
                    ListEmptyComponent={() => (
                        <Text style={styles.emptyText}>
                            No {selectedStatus.toLowerCase()} cases found.
                        </Text>
                    )}
                /> 
            )}

            <TerminatedReasonModal 
                visible={showTerminatedModal}
                onClose={handleCloseTerminatedModal}
                patientName={selectedTerminatedCase ? `${selectedTerminatedCase.lastName}, ${selectedTerminatedCase.firstName}` : ''}
                terminateReason={selectedTerminatedCase?.terminateReason}
                loading={terminatedReasonLoading}
            />

            {/* Newly verified notification: informs worker that prescriptions are now available */}
            <Modal
                transparent
                animationType="fade"
                visible={showNewVerifiedModal && newlyVerifiedCases.length > 0}
                onRequestClose={() => setShowNewVerifiedModal(false)}
            >
                <View style={styles.newVerifiedOverlay}>
                    <View style={styles.newVerifiedContent}>
                        <View style={styles.newVerifiedHeader}>
                            <Ionicons name="checkmark-circle" size={28} color="#22C55E" />
                            <Text style={styles.newVerifiedTitle}>Record Verified</Text>
                        </View>
                        <Text style={styles.newVerifiedBody}>
                            {newlyVerifiedCases.length === 1
                                ? `A patient record has just been verified by the City Health Office. The prescription details are now available inside the patient record under "Treatment Plan & Vaccines". You may open the record so the patient can take a photo of the prescription.`
                                : `${newlyVerifiedCases.length} patient records have just been verified. Prescriptions are now available inside each patient record under "Treatment Plan & Vaccines".`}
                        </Text>

                        <TouchableOpacity
                            style={styles.newVerifiedButton}
                            onPress={() => setShowNewVerifiedModal(false)}
                        >
                            <Text style={styles.newVerifiedButtonText}>Got it</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

// ---------------------------
// STYLES
// ---------------------------
const styles = StyleSheet.create({
    container: { 
        flex: 1, 
        backgroundColor: 'transparent',
    },
    tabBar: { 
        flexDirection: 'row', 
        justifyContent: 'center',
        gap: 12,
        paddingHorizontal: 15, 
        paddingVertical: 15, 
        backgroundColor: 'transparent',
    },
    tab: { 
        paddingVertical: 10, 
        paddingHorizontal: 22, 
        borderRadius: 25, 
        backgroundColor: 'rgba(18, 88, 114, 0.34)', 
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: -12,
    },
    tabSelected: { backgroundColor: '#125872' },
    tabText: { color: '#FFFFFF', fontWeight: '500', fontSize: 14 },
    tabTextSelected: { color: '#FFFFFF', fontWeight: '500', fontSize: 14 },
    listContent: { paddingTop: 10, paddingHorizontal: 15, paddingBottom: 30 },
    caseItemContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#0E5F7A',
        padding: 16,
        borderRadius: 12,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 4,
    },
    caseContent: { 
        flex: 1,
        justifyContent: 'center',
    },
    caseName: { 
        fontSize: 15, 
        fontWeight: '700', 
        color: '#fff',
        marginBottom: 3,
    },
    caseId: { 
        fontSize: 12, 
        color: 'rgba(255,255,255,0.9)',
        marginBottom: 4,
    },
    caseRecordedBy: { 
        fontSize: 11, 
        color: '#12e7ffff', 
        marginBottom: 2,
    },
    caseDate: { 
        fontSize: 11, 
        color: 'rgba(255,255,255,0.8)',
    },
    statusPill: { 
        paddingVertical: 3, 
        paddingHorizontal: 12, 
        borderRadius: 15, 
        marginLeft: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    statusText: { 
        fontSize: 11, 
        fontWeight: 'bold', 
        color: '#fff',
    },
    statusPending: { backgroundColor: '#FBC02D' },
    statusVerified: { backgroundColor: '#4CAF50' },
    statusTerminated: { backgroundColor: '#D32F2F' },
    emptyText: { textAlign: 'center', marginTop: 50, fontSize: 16, color: '#125872' },
    tabDivider: {
        height: 1,
        backgroundColor: 'rgba(18, 88, 114, 0.34)',
        marginHorizontal: 21
        ,
    },
    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        backgroundColor: '#fff',
        borderRadius: 16,
        width: '85%',
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 20,
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 10,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#125872',
    },
    closeButton: {
        padding: 8,
    },
    modalBody: {
        marginBottom: 20,
    },
    patientNameText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#125872',
        marginBottom: 16,
    },
    reasonContainer: {
        backgroundColor: '#f5f5f5',
        borderRadius: 12,
        padding: 16,
        borderLeftWidth: 4,
        borderLeftColor: '#D32F2F',
    },
    reasonLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#666',
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    reasonText: {
        fontSize: 14,
        color: '#333',
        lineHeight: 20,
    },
    closeModalButton: {
        backgroundColor: '#125872',
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    closeModalButtonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },

    // Newly verified modal styles
    newVerifiedOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    newVerifiedContent: {
        backgroundColor: '#FFFFFF',
        borderRadius: 18,
        paddingHorizontal: 20,
        paddingVertical: 22,
        width: '100%',
        maxWidth: 380,
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 8,
    },
    newVerifiedHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
        gap: 8,
    },
    newVerifiedTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#125872',
    },
    newVerifiedBody: {
        fontSize: 13,
        color: '#444',
        lineHeight: 20,
        marginBottom: 18,
    },
    newVerifiedButton: {
        alignSelf: 'flex-end',
        backgroundColor: '#125872',
        paddingHorizontal: 18,
        paddingVertical: 10,
        borderRadius: 999,
    },
    newVerifiedButtonText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '600',
    },
});

export default SubmittedCasesList;
