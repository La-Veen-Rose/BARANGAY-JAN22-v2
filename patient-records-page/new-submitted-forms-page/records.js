import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation} from "react-router-dom";
import searchIcon from "../../../images/search-icon.png"
import PatientDetails from "../Modals/new-submitted-form-modal";
import PrescriptionModal from "../Modals/prescription-modal";
import PrescriptionPreviewModal from "../Modals/prescription-preview-modal";
import ConfirmationModal from "../Modals/confirmation-modal";
import AlertModal from "../Modals/alert-modal";
import TerminateReasonModal from "../Modals/terminate-reason-modal";
import logo from "../../../images/RAVEN LOGO 2.png";
import { logAuditEvent } from "../../../utils/auditLogger";
import "./records.css";

//BY DEFAULT, NEW SUBMITTED PATIENTS TAB IS OPEN
const Records = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedPatient, setSelectedPatient] = useState(null);
    const [patients, setPatients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    
    // Confirmation modal states
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [confirmationAction, setConfirmationAction] = useState(null);
    const [confirmationPatientId, setConfirmationPatientId] = useState(null);
    const [confirmationData, setConfirmationData] = useState({
        title: "",
        message: "",
        confirmText: "OK"
    });

    // Termination reason modal states
    const [showTerminateReason, setShowTerminateReason] = useState(false);
    const [terminateReason, setTerminateReason] = useState("");
    const [terminateReasonError, setTerminateReasonError] = useState("");

    // Alert modal states
    const [showAlert, setShowAlert] = useState(false);
    const [alertData, setAlertData] = useState({
        title: "localhost:5001 says",
        message: "",
        buttonText: "OK"
    });

    // Prescription modal states
    const [showPrescription, setShowPrescription] = useState(false);
    const [prescriptionPatient, setPrescriptionPatient] = useState(null);
    const [showPrescriptionPreview, setShowPrescriptionPreview] = useState(false);
    const [prescriptionDraft, setPrescriptionDraft] = useState(null);

    const handleViewClick = (patientData) => {
        setSelectedPatient(patientData);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setSelectedPatient(null);
    };

    const updateMobileStatus = async (submissionId, status, extraData = {}) => {
        const mobileApiBase = (process.env.REACT_APP_MOBILE_API_BASE_URL || "").replace(/\/$/, "");
        if (!mobileApiBase || !submissionId) return;
        try {
            await fetch(`${mobileApiBase}/submissions/${submissionId}/status`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status, ...extraData }),
            });
        } catch (err) {
            console.warn("Failed to notify mobile about status change", err);
        }
    };

    const handleTerminate = async (patientId) => {
        setConfirmationPatientId(patientId);
        setConfirmationAction("terminate");
        setTerminateReason("");
        setTerminateReasonError("");
        setConfirmationData({
            title: "Confirm Termination",
            message: "Are you sure you want to terminate this patient record?",
            confirmText: "Yes, Terminate"
        });
        setShowConfirmation(true);
    };

    const handleTerminateConfirmed = async (reasonText) => {
        const patientId = confirmationPatientId;
        const finalReason = (reasonText || "").trim() || "Not specified";
        setShowConfirmation(false);
        setShowTerminateReason(false);

        if (!patientId) {
            showAlertModal("No patient selected for termination.");
            return;
        }
        
        try {
            const endpoint = process.env.REACT_APP_APPWRITE_ENDPOINT || "https://sgp.cloud.appwrite.io/v1";
            const project = process.env.REACT_APP_APPWRITE_PROJECT || "693295e1001e3363b764";
            const databaseId = process.env.REACT_APP_APPWRITE_DATABASE || "6932a0eb00353ed18a14";
            const collectionId = process.env.REACT_APP_APPWRITE_COLLECTION || "patientrecords";

            if (!endpoint || !project) {
                showAlertModal("Appwrite endpoint/project is missing. Please set REACT_APP_APPWRITE_ENDPOINT and REACT_APP_APPWRITE_PROJECT in .env.");
                return;
            }

            const { Client, Databases } = await import("appwrite");
            const client = new Client()
                .setEndpoint(endpoint)
                .setProject(project);

            const databases = new Databases(client);
            // Do NOT delete from DB; just mark status = terminated
            await databases.updateDocument(
                databaseId,
                collectionId,
                patientId,
                { status: "terminated", terminateReason: finalReason }
            );

            // Audit: termination from New Submitted tab
            logAuditEvent({
                action: "terminate_patient_record",
                recordId: patientId,
                recordType: "PatientRecord",
                collectionId,
                description: `Patient record terminated from New Submitted tab. Reason: ${finalReason || "N/A"}`,
            });

            // Notify mobile (best effort)
            const patient = patients.find(p => (p.$id || p.id) === patientId);
            const submissionId = patient?.submissionId || patient?.patientRecordId || patientId;
            updateMobileStatus(submissionId, "terminated");

            // Remove from local state view
            setPatients(patients.filter(p => (p.$id || p.id) !== patientId));
            setIsModalOpen(false);
            setSelectedPatient(null);
            setTerminateReason("");
            setTerminateReasonError("");
            setConfirmationAction(null);
            setConfirmationPatientId(null);
            showAlertModal("Patient record marked as terminated.");
        } catch (err) {
            console.error("Failed to terminate patient record:", err);
            showAlertModal("Error terminating patient record: " + (err.message || String(err)));
        }
    };

    const handleVerify = async (patientId) => {
        setConfirmationPatientId(patientId);
        setConfirmationAction("verify");
        setConfirmationData({
            title: "Confirm Verification",
            message: "Are you sure you want to verify this patient record?",
            confirmText: "Yes, Verify"
        });
        setShowConfirmation(true);
    };

    const handleVerifyConfirmed = async () => {
        const patientId = confirmationPatientId;
        setShowConfirmation(false);
        
        try {
            const endpoint = process.env.REACT_APP_APPWRITE_ENDPOINT || "https://sgp.cloud.appwrite.io/v1";
            const project = process.env.REACT_APP_APPWRITE_PROJECT || "693295e1001e3363b764";
            const databaseId = process.env.REACT_APP_APPWRITE_DATABASE || "6932a0eb00353ed18a14";
            const collectionId = process.env.REACT_APP_APPWRITE_COLLECTION || "patientrecords";

            if (!endpoint || !project) {
                showAlertModal("Appwrite endpoint/project is missing. Please set REACT_APP_APPWRITE_ENDPOINT and REACT_APP_APPWRITE_PROJECT in .env.");
                return;
            }

            const { Client, Databases } = await import("appwrite");
            const client = new Client()
                .setEndpoint(endpoint)
                .setProject(project);

            const databases = new Databases(client);
            
            // Find the patient to get their ids
            const patient = patients.find(p => (p.$id || p.id) === patientId);
            const patientRecordId = patient?.patientRecordId;
            const submissionId = patient?.submissionId || patientRecordId || patientId;
            
            // Update the patient record to mark as verified AND ensure patientRecordId is saved
            const updateData = { status: "verified" };
            if (patientRecordId) {
                updateData.patientRecordId = patientRecordId;
            }
            
            await databases.updateDocument(
                databaseId,
                collectionId,
                patientId,
                updateData
            );

            // Audit: verification from New Submitted tab
            logAuditEvent({
                action: "verify_patient_record",
                recordId: patientId,
                recordType: "PatientRecord",
                collectionId,
                description: "Patient record verified and moved to Verified tab from New Submitted.",
            });

            // Notify mobile (best effort)
            updateMobileStatus(submissionId, "verified");

            // Remove from local state (will appear in verified tab)
            setPatients(patients.filter(p => (p.$id || p.id) !== patientId));
            setIsModalOpen(false);
            setSelectedPatient(null);
            showAlertModal("Patient record verified successfully and moved to Verified tab.");
            // Optionally navigate to verified tab
            navigate("/patientRecords/verified");
        } catch (err) {
            console.error("Failed to verify patient record:", err);
            showAlertModal("Error verifying patient record: " + (err.message || String(err)));
        }
    };

    const handlePrescriptionNext = async (prescriptionData) => {
        const patientId = (prescriptionPatient && (prescriptionPatient.$id || prescriptionPatient.id))
            || (selectedPatient && (selectedPatient.$id || selectedPatient.id));
        if (!patientId) return;

        const passiveSelections = [];
        if (prescriptionData?.passiveVaccineERIG) passiveSelections.push("ERIG");
        if (prescriptionData?.passiveVaccineHRIG) passiveSelections.push("HRIG");

        const activeSelections = [];
        if (prescriptionData?.activeVaccinePVRV) activeSelections.push("PVRV");
        if (prescriptionData?.activeVaccinePCECV) activeSelections.push("PCECV");

        const enrichedPrescription = {
            ...prescriptionData,
            passiveVaccine: passiveSelections.length ? passiveSelections : [],
            activeVaccine: activeSelections.length ? activeSelections : [],
        };

        setPrescriptionDraft(enrichedPrescription);
        setShowPrescription(false);
        setShowPrescriptionPreview(true);
    };

    const handlePrescriptionSubmit = async (prescriptionData) => {
        const patientId = (prescriptionPatient && (prescriptionPatient.$id || prescriptionPatient.id))
            || (selectedPatient && (selectedPatient.$id || selectedPatient.id));
        if (!patientId) return;

        try {
            const endpoint = process.env.REACT_APP_APPWRITE_ENDPOINT || "https://sgp.cloud.appwrite.io/v1";
            const project = process.env.REACT_APP_APPWRITE_PROJECT || "693295e1001e3363b764";
            const databaseId = process.env.REACT_APP_APPWRITE_DATABASE || "6932a0eb00353ed18a14";
            const collectionId = process.env.REACT_APP_APPWRITE_COLLECTION || "patientrecords";

            if (!endpoint || !project) {
                showAlertModal("Appwrite endpoint/project is missing. Please set REACT_APP_APPWRITE_ENDPOINT and REACT_APP_APPWRITE_PROJECT in .env.");
                return;
            }

            const { Client, Databases } = await import("appwrite");
            const client = new Client()
                .setEndpoint(endpoint)
                .setProject(project);

            const databases = new Databases(client);

            const patient = patients.find(p => (p.$id || p.id) === patientId) || selectedPatient;
            const patientRecordId = patient?.patientRecordId;
            const submissionId = patient?.submissionId || patientRecordId || patientId;

            const passiveSelections = [];
            if (prescriptionData?.passiveVaccineERIG) passiveSelections.push("ERIG");
            if (prescriptionData?.passiveVaccineHRIG) passiveSelections.push("HRIG");

            const activeSelections = [];
            if (prescriptionData?.activeVaccinePVRV) activeSelections.push("PVRV");
            if (prescriptionData?.activeVaccinePCECV) activeSelections.push("PCECV");

            // Filter out fields not defined in the Appwrite schema (checkbox fields and signature blob)
            const { 
                passiveVaccineERIG, 
                passiveVaccineHRIG, 
                activeVaccinePVRV, 
                activeVaccinePCECV, 
                physicianSignature,
                vaxStatus,
                ...safePrescriptionData 
            } = prescriptionData || {};

            // Normalize numeric fields to match Appwrite attribute types
            if (Object.prototype.hasOwnProperty.call(safePrescriptionData, "passiveVaccineUnits")) {
                const parsedUnits = parseInt(safePrescriptionData.passiveVaccineUnits, 10);
                if (Number.isNaN(parsedUnits)) {
                    delete safePrescriptionData.passiveVaccineUnits;
                } else {
                    safePrescriptionData.passiveVaccineUnits = parsedUnits;
                }
            }

            const updateData = {
                status: "verified",
                ...safePrescriptionData,
                passiveVaccine: passiveSelections.length ? passiveSelections : [],
                activeVaccine: activeSelections.length ? activeSelections : [],
                vaxStatus: null,
            };

            if (patientRecordId) {
                updateData.patientRecordId = patientRecordId;
            }

            // Ensure plan conforms to Appwrite array attribute requirement
            if (Object.prototype.hasOwnProperty.call(updateData, "plan")) {
                const rawPlan = updateData.plan;
                if (Array.isArray(rawPlan)) {
                    updateData.plan = rawPlan;
                } else if (rawPlan == null || String(rawPlan).trim() === "") {
                    updateData.plan = [];
                } else {
                    updateData.plan = [String(rawPlan).trim()];
                }
            }

            await databases.updateDocument(
                databaseId,
                collectionId,
                patientId,
                updateData
            );

            console.log("Record verified with data:", updateData);
            console.log("Patient ID:", patientId);

            logAuditEvent({
                action: "verify_patient_record_with_prescription",
                recordId: patientId,
                recordType: "PatientRecord",
                collectionId,
                description: "Patient record verified from New Submitted tab via prescription modal.",
            });

            updateMobileStatus(submissionId, "verified", {
                prescription: {
                    ...prescriptionData,
                    passiveVaccine: passiveSelections.length ? passiveSelections : [],
                    activeVaccine: activeSelections.length ? activeSelections : [],
                },
            });

            setPatients(prev => prev.filter(p => (p.$id || p.id) !== patientId));
            setIsModalOpen(false);
            setSelectedPatient(null);
            setShowPrescription(false);
            setShowPrescriptionPreview(false);
            setPrescriptionPatient(null);
            setPrescriptionDraft(null);

            showAlertModal("Patient record verified and prescription generated successfully.");
            
            // Wait for DB propagation and navigation
            setTimeout(() => {
                navigate("/patientRecords/verified");
            }, 800);
        } catch (err) {
            console.error("Failed to save prescription / verify patient:", err);
            showAlertModal("Error saving prescription or verifying patient: " + (err.message || String(err)));
        }
    };

    const handleConfirmationConfirm = () => {
        if (confirmationAction === "verify") {
            handleVerifyConfirmed();
        } else if (confirmationAction === "terminate") {
            setShowConfirmation(false);
            setShowTerminateReason(true);
        }
    };

    const handleConfirmationCancel = () => {
        setShowConfirmation(false);
        setConfirmationAction(null);
        setConfirmationPatientId(null);
        setTerminateReason("");
        setTerminateReasonError("");
    };

    const handleTerminateReasonCancel = () => {
        setShowTerminateReason(false);
        setTerminateReason("");
        setTerminateReasonError("");
        setConfirmationAction(null);
        setConfirmationPatientId(null);
    };

    const handleTerminateReasonSubmit = () => {
        const trimmed = terminateReason.trim();
        if (!trimmed) {
            setTerminateReasonError("Please provide a reason before terminating.");
            return;
        }
        handleTerminateConfirmed(trimmed);
    };

    const showAlertModal = (message, title = "localhost:5001 says") => {
        setAlertData({
            title,
            message,
            buttonText: "OK"
        });
        setShowAlert(true);
    };

    const handleAlertClose = () => {
        setShowAlert(false);
    };

    const handleUpdatePatient = (patientId, updatedData) => {
        // Update the patient in the local state array
        setPatients(prevPatients => 
            prevPatients.map(p => 
                (p.$id || p.id) === patientId ? { ...p, ...updatedData } : p
            )
        );
        // Also update the selected patient if it's the one being viewed
        setSelectedPatient(prev => 
            (prev?.$id || prev?.id) === patientId ? { ...prev, ...updatedData } : prev
        );
    };

    const handleBack = () => {
        setIsModalOpen(false);
        setSelectedPatient(null);
    };

    const handleOpenPrescription = (patientId) => {
        const target = patients.find(p => (p.$id || p.id) === patientId) || selectedPatient;
        if (!target) return;
        setIsModalOpen(false);
        setSelectedPatient(target);
        setPrescriptionPatient(target);
        setShowPrescription(true);
    };

    const handleClosePrescription = () => {
        setShowPrescription(false);
        setPrescriptionPatient(null);
    };

    // Helper function to format date as mm/dd/yy
    const formatDate = (dateString) => {
        if (!dateString) return "";
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return dateString; // Return original if invalid

            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const day = date.getDate().toString().padStart(2, '0');
            const year = date.getFullYear().toString().slice(-2);

            return `${month}/${day}/${year}`;
        } catch (e) {
            return dateString;
        }
    };

    // Helper function to format time as 12-hour format (HH:MM AM/PM)
    const formatTime = (dateString) => {
        if (!dateString) return "";
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return dateString; // Return original if invalid
            
            let hours = date.getHours();
            const minutes = date.getMinutes();
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12;
            hours = hours ? hours : 12; // 0 should be 12
            const minutesStr = minutes < 10 ? '0' + minutes : minutes;
            
            return `${hours}:${minutesStr} ${ampm}`;
        } catch (e) {
            return dateString;
        }
    };

    // Fetch patients from Appwrite on component mount
    useEffect(() => {
        const fetchPatients = async () => {
            setLoading(true);
            setError(null);
            try {
                const { Client, Databases } = await import("appwrite");
                const client = new Client()
                    .setEndpoint(process.env.REACT_APP_APPWRITE_ENDPOINT || "https://sgp.cloud.appwrite.io/v1")
                    .setProject(process.env.REACT_APP_APPWRITE_PROJECT || "693295e1001e3363b764");

                const databases = new Databases(client);
                const databaseId = process.env.REACT_APP_APPWRITE_DATABASE || "6932a0eb00353ed18a14";
                const collectionId = process.env.REACT_APP_APPWRITE_COLLECTION || "patientrecords";
                
                // Get ALL documents to find the highest ID globally
                const allDocsResponse = await databases.listDocuments(
                    databaseId,
                    collectionId
                );
                
                // Fetch all records first, then filter client-side
                // This ensures we get records without a status field (new mobile submissions)
                const response = await databases.listDocuments(
                    databaseId,
                    collectionId
                );

                // Filter out verified or terminated records client-side
                const unverifiedDocs = (response.documents || []).filter(doc => doc.status !== "verified" && doc.status !== "terminated");
                
                console.log("Records page: Total documents fetched:", response.documents?.length);
                console.log("Records page: Unverified documents after filter:", unverifiedDocs.length);
                console.log("Records page: Sample unverified doc:", unverifiedDocs[0]);

                // Get the highest ID from ALL documents (not just this page's documents)
                const existingIds = allDocsResponse.documents
                    .filter(d => d.patientRecordId)
                    .map(d => {
                        const match = d.patientRecordId.match(/PR(\d+)/);
                        return match ? parseInt(match[1]) : 0;
                    });
                let maxId = existingIds.length > 0 ? Math.max(...existingIds) : 0;

                // Assign IDs to documents that need them (synchronously first, then save)
                const docsToUpdate = [];
                const patientsWithIds = unverifiedDocs.map((doc, index) => {
                    if (!doc.patientRecordId) {
                        // Increment maxId for each document being assigned an ID
                        maxId++;
                        const paddedNumber = String(maxId).padStart(5, '0');
                        const newPatientRecordId = `PR${paddedNumber}`;
                        
                        docsToUpdate.push({
                            docId: doc.$id,
                            patientRecordId: newPatientRecordId
                        });
                        
                        console.log(`Generated ID ${newPatientRecordId} for document ${doc.$id}`);
                        return { ...doc, patientRecordId: newPatientRecordId };
                    }
                    return doc;
                });

                // Persist all patientRecordIds to Appwrite sequentially to avoid race conditions
                if (docsToUpdate.length > 0) {
                    console.log(`Saving ${docsToUpdate.length} patientRecordIds to Appwrite...`);
                    for (const item of docsToUpdate) {
                        try {
                            const result = await databases.updateDocument(
                                databaseId,
                                collectionId,
                                item.docId,
                                { patientRecordId: item.patientRecordId }
                            );
                            console.log(`✓ Successfully saved patientRecordId ${item.patientRecordId} to document ${item.docId}`);
                        } catch (err) {
                            console.error(`✗ Failed to save patientRecordId ${item.patientRecordId} for document ${item.docId}:`, err);
                        }
                    }
                }

                console.log("Records page: Setting patients with IDs:", patientsWithIds.map(p => ({ id: p.$id, patientRecordId: p.patientRecordId })));
                setPatients(patientsWithIds);
            } catch (err) {
                console.error("Failed to fetch patients from Appwrite:", err);
                setError(err.message || "Failed to load patient records");
            } finally {
                setLoading(false);
            }
        };

        fetchPatients();
    }, []);

    const navigate = useNavigate();
    const location = useLocation();

    //FRONT-END
    
    return(
      <div className="records-header-wrapper">
            <div className="records-header">
                <div className="header-text">
                    <h2>Patient Records</h2>
                    <p className="records-subtext">This section provides a complete overview of all patient records.</p>
                </div>

                <div className="header-image">
                <img src={logo} alt="RAVEN" />
                </div> 
                </div>
            
{/* TABS SECTION */}
      <div className="records-tabs">
        <button
          className={`records-tab ${location.pathname === "/patientRecords" ? "active" : ""}`}
          onClick={() => navigate("/patientRecords")}
        >
          New Submitted Patients
        </button>

        <button
          className={`records-tab ${location.pathname === "/patientRecords/verified" ? "active" : ""}`}
          onClick={() => navigate("/patientRecords/verified")}
        >
          Verified
        </button>

        <button
          className={`records-tab records-tab-ongoing ${location.pathname === "/patientRecords/ongoing" ? "active" : ""}`}
          onClick={() => navigate("/patientRecords/ongoing")}
        >
          Ongoing
        </button>

        <button
          className={`records-tab ${location.pathname === "/patientRecords/missing" ? "active" : ""}`}
          onClick={() => navigate("/patientRecords/missing")}
        >
          Missing
        </button>

        <button
          className={`records-tab ${location.pathname === "/patientRecords/completed" ? "active" : ""}`}
          onClick={() => navigate("/patientRecords/completed")}
        >
          Completed
        </button>

        <button
          className={`records-tab ${location.pathname === "/patientRecords/terminated" ? "active" : ""}`}
          onClick={() => navigate("/patientRecords/terminated")}
        >
          Terminated
        </button>

      </div>

            <div className="abtc-records-table-section">
              <div className="records-search-bar">
                <img src={searchIcon} alt="search-icon" className="search-icon" />
                <input type="text" placeholder="Search name by ID" />
                <div className="buttons-group">
              </div>
              </div>
              
               <table className="abtc-records-table">
                    <thead>
                        <tr>
                        <th>Patient Submission ID</th>
                        <th>Name</th>
                        <th>Age</th>
                        <th>Barangay</th>
                        <th>Date Submitted</th>
                        <th>Time Submitted</th>
                        <th>Actions</th>
                        </tr>
                    </thead>
                                        <tbody>
                                            {loading ? (
                                                <tr><td colSpan="7" style={{ textAlign: "center", padding: 20 }}>Loading patients...</td></tr>
                                            ) : error ? (
                                                <tr><td colSpan="7" style={{ textAlign: "center", padding: 20, color: "crimson" }}>Error: {error}</td></tr>
                                            ) : patients.length === 0 ? (
                                                <tr><td colSpan="7" style={{ textAlign: "center", padding: 20 }}>No patients found</td></tr>
                                            ) : (
                                                patients.map((patient, index) => (
                                                    <tr key={patient.$id || patient.id || index}>
                                                        <td style={{ color: "#8E2626", fontWeight: "700" }}>{patient.submissionID || `PR${String(index + 1).padStart(5, '0')}`}</td>
                                                        <td>{patient.lastName && patient.firstName ? `${patient.lastName}, ${patient.firstName}` : (patient.name || "")}</td>
                                                        <td>{patient.age || ""}</td>
                                                        <td>{patient.barangay || ""}</td>
                                                        <td>{formatDate(patient.consultationDate || patient.timeSubmitted || "")}</td>
                                                        <td style={{ color: "#8E2626", fontWeight: "700" }}>{formatTime(patient.consultationDate || patient.timeSubmitted || "")}</td>
                                                        <td><button className="abtc-records-view-btn" onClick={() => handleViewClick(patient)}>View</button></td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                </table>

                {isModalOpen && selectedPatient && createPortal(
                    <PatientDetails 
                    patient={selectedPatient}
                    patientId={selectedPatient.$id || selectedPatient.id}
                    appwriteDatabaseId={process.env.REACT_APP_APPWRITE_DATABASE}
                    appwriteCollectionId={process.env.REACT_APP_APPWRITE_COLLECTION}
                    onClose={handleCloseModal}
                    onTerminate={handleTerminate}
                    onBack={handleBack}
                    onVerify={handleOpenPrescription}
                    onUpdatePatient={handleUpdatePatient}
                    hidePrescriptionSection={true}
                    primaryActionLabel="Go to prescription"
                    onPrimaryAction={handleOpenPrescription}
                    />,
                    document.body
                )}

                {showPrescription && prescriptionPatient && createPortal(
                    <PrescriptionModal
                        patient={{ ...prescriptionPatient, ...(prescriptionDraft || {}) }}
                        onClose={handleClosePrescription}
                        onBack={handleClosePrescription}
                        onSubmit={handlePrescriptionNext}
                    />,
                    document.body
                )}

                {showPrescriptionPreview && prescriptionPatient && prescriptionDraft && createPortal(
                    <PrescriptionPreviewModal
                        patient={prescriptionPatient}
                        prescription={prescriptionDraft}
                        onClose={() => { setShowPrescriptionPreview(false); }}
                        onBack={() => {
                            setShowPrescriptionPreview(false);
                            setShowPrescription(true);
                        }}
                        onVerify={handlePrescriptionSubmit}
                    />,
                    document.body
                )}

                {showConfirmation && createPortal(
                    <ConfirmationModal
                        title={confirmationData.title}
                        message={confirmationData.message}
                        onConfirm={handleConfirmationConfirm}
                        onCancel={handleConfirmationCancel}
                        confirmText={confirmationData.confirmText}
                    />,
                    document.body
                )}

                {showTerminateReason && createPortal(
                    <TerminateReasonModal
                        value={terminateReason}
                        error={terminateReasonError}
                        onChange={setTerminateReason}
                        onSubmit={handleTerminateReasonSubmit}
                        onCancel={handleTerminateReasonCancel}
                    />,
                    document.body
                )}

                {showAlert && createPortal(
                    <AlertModal
                        title={alertData.title}
                        message={alertData.message}
                        onClose={handleAlertClose}
                        buttonText={alertData.buttonText}
                    />,
                    document.body
                )}
                

            </div>
            </div>
    );
}

export default Records;
