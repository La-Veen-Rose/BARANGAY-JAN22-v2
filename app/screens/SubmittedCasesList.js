import React, { useState, useEffect, useCallback } from 'react';
import { 
    View, 
    StyleSheet, 
    Text, 
    TouchableOpacity, 
    FlatList,
    ActivityIndicator,
    Alert,
    Modal
} from "react-native";
import { databases, appwriteConfig, account, Query } from './appwriteConfig';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { getCurrentStaffProfile, STAFF_ROLE } from './staffProfileService';

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
    const [selectedStatus, setSelectedStatus] = useState('Pending');
    const [cases, setCases] = useState([]);
    const [loading, setLoading] = useState(true);
    const [workerProfile, setWorkerProfile] = useState(passedProfile || null);
    const [staffRole, setStaffRole] = useState(null);
    const [showTerminatedModal, setShowTerminatedModal] = useState(false);
    const [selectedTerminatedCase, setSelectedTerminatedCase] = useState(null);
    const [terminatedReasonLoading, setTerminatedReasonLoading] = useState(false);

    // Fetch staff profile if not passed via params
    useEffect(() => {
        const fetchWorkerProfile = async () => {
            if (passedProfile) {
                setWorkerProfile(passedProfile);
                return;
            }

            try {
                const staff = await getCurrentStaffProfile();
                setWorkerProfile(staff.profile);
                setStaffRole(staff.role);
            } catch (error) {
                console.error('Error fetching worker profile:', error);
                Alert.alert('Error', 'Failed to fetch worker profile. Please login again.');
                navigation.navigate("SelectRole");
            }
        };

        fetchWorkerProfile();
    }, [passedProfile, navigation]);

    // Handle missing worker profile
    useEffect(() => {
        if (!workerProfile && !loading) {
            Alert.alert("Error", "Worker profile missing. Please login again.");
            navigation.navigate("SelectRole");
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

    // If navigation passed a desired status tab (from push notification), apply it.
    useEffect(() => {
        if (focusStatus) {
            setSelectedStatus(normalizeStatus(focusStatus));
        }
    }, [focusStatus]);

    const fetchSubmittedCases = async () => {
        try {
            if (!workerProfile) {
                Alert.alert('Error', 'Worker profile missing. Please login again.');
                navigation.navigate("SelectRole");
                return;
            }

            setLoading(true);

            // Always resolve role from session so physicians can access all records
            const staff = await getCurrentStaffProfile();
            if (!staffRole) setStaffRole(staff.role);

            const userId = staff.user?.$id;

            const filters = [];
            if (staff.role !== STAFF_ROLE.PHYSICIAN) {
                const workerHwId =
                    (workerProfile && (workerProfile.healthWorkerId || workerProfile.healthWorkerID || workerProfile.healthWorkerIDNumber)) ||
                    workerProfile?.$id;

                if (!workerHwId && !userId) {
                    Alert.alert('Error', 'Unable to identify current user. Please login again.');
                    navigation.navigate("SelectRole");
                    return;
                }

                if (userId && workerHwId) {
                    // Prefer exact matches by owner identity; supports both newer and older records.
                    filters.push(
                        Query.or([
                            Query.equal('recordedByUserID', userId),
                            Query.equal('recordedByHWID', workerHwId),
                        ])
                    );
                } else if (workerHwId) {
                    filters.push(Query.equal('recordedByHWID', workerHwId));
                } else {
                    filters.push(Query.equal('recordedByUserID', userId));
                }
            }

            let res = await databases.listDocuments(
                appwriteConfig.patientDatabaseId,
                appwriteConfig.patientRecordsCollectionId,
                [
                    ...filters,
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

            setCases(formattedCases);

        } catch (error) {
            console.error('Error fetching submitted cases:', error);
            
            // Provide more specific error messages
            let errorMessage = 'Failed to fetch submitted cases.';
            if (error.message && error.message.includes('Staff profile not found')) {
                errorMessage = 'Your staff profile is not properly configured. Please contact your administrator.';
            } else if (error.message && error.message.includes('physicianAccountsCollectionId')) {
                errorMessage = 'Configuration error: Missing physician accounts collection. Please check your setup.';
            }
            
            Alert.alert('Error', errorMessage);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSubmittedCases();
    }, [workerProfile]);

    useFocusEffect(
        useCallback(() => {
            if (workerProfile) {
                fetchSubmittedCases();
            }
        }, [workerProfile])
    );

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
});

export default SubmittedCasesList;
