import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { Client, Databases, Query } from "appwrite";
import searchIcon from "../../../images/search-icon.png";
import PatientDetails from "../Modals/new-submitted-form-modal";
import logo from "../../../images/RAVEN LOGO 2.png";
import { logAuditEvent } from "../../../utils/auditLogger";
import "../new-submitted-forms-page/records.css";
import "./terminated-page.css";

const TerminatedPage = () => {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [search, setSearch] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false); // first prompt
  const [showDeletePhrase, setShowDeletePhrase] = useState(false); // second prompt
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteInput, setDeleteInput] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const navigate = useNavigate();
  const location = useLocation();

  // Fetch terminated patients from Appwrite on mount
  useEffect(() => {
    const fetchTerminatedPatients = async () => {
      setLoading(true);
      setError(null);
      try {
        const client = new Client()
          .setEndpoint(process.env.REACT_APP_APPWRITE_ENDPOINT || "https://sgp.cloud.appwrite.io/v1")
          .setProject(process.env.REACT_APP_APPWRITE_PROJECT || "693295e1001e3363b764");

        const databases = new Databases(client);
        const databaseId = process.env.REACT_APP_APPWRITE_DATABASE || "6932a0eb00353ed18a14";
        const collectionId = process.env.REACT_APP_APPWRITE_COLLECTION || "patientrecords";

        const response = await databases.listDocuments(
          databaseId,
          collectionId,
          [Query.equal("status", "terminated")]
        );

        const mappedPatients = (response.documents || []).map((doc, index) => ({
          ...doc,
          $id: doc.$id,
          id: doc.patientRecordId || doc.id || `PR${String(index + 1).padStart(5, "0")}`,
          lastName: doc.lastName || "",
          firstName: doc.firstName || "",
          age: doc.age || "",
          barangay: doc.barangay || "",
          consultationDate: doc.consultationDate || doc.timeSubmitted || "",
          categoryOfExposure: doc.categoryOfExposure || "",
          plan: doc.plan || doc.vaccinationPlan || "",
        }));

        setPatients(mappedPatients);
      } catch (err) {
        console.error("Failed to fetch terminated patients:", err);
        setError(err.message || "Failed to load terminated records");
        setPatients([]);
      } finally {
        setLoading(false);
      }
    };

    fetchTerminatedPatients();
  }, []);

  const handleViewClick = (patientData) => {
    setSelectedPatient(patientData);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedPatient(null);
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

  const openDeleteConfirm = (patient) => {
    setDeleteTarget(patient);
    setDeleteInput("");
    setDeleteError(null);
    setShowDeleteConfirm(true);
    setShowDeletePhrase(false);
  };

  const closeAllDeleteModals = () => {
    if (deleting) return;
    setShowDeleteConfirm(false);
    setShowDeletePhrase(false);
    setDeleteTarget(null);
    setDeleteInput("");
    setDeleteError(null);
  };

  const proceedToPhraseModal = () => {
    setShowDeleteConfirm(false);
    setShowDeletePhrase(true);
  };

  const confirmPhrase = "I want to delete this record";

  const handleDelete = async () => {
    if (!deleteTarget || deleteInput.trim() !== confirmPhrase) {
      setDeleteError("Please type the exact confirmation phrase.");
      return;
    }

    setDeleting(true);
    setDeleteError(null);
    try {
      const client = new Client()
        .setEndpoint(process.env.REACT_APP_APPWRITE_ENDPOINT || "https://sgp.cloud.appwrite.io/v1")
        .setProject(process.env.REACT_APP_APPWRITE_PROJECT || "693295e1001e3363b764");

      const databases = new Databases(client);
      const databaseId = process.env.REACT_APP_APPWRITE_DATABASE || "6932a0eb00353ed18a14";
      const collectionId = process.env.REACT_APP_APPWRITE_COLLECTION || "patientrecords";
      const documentId = deleteTarget.$id || deleteTarget.id;

      if (!documentId) {
        throw new Error("Missing document id for deletion");
      }

      await databases.deleteDocument(databaseId, collectionId, documentId);

      // Audit: hard delete of a terminated record
      logAuditEvent({
        action: "delete_patient_record",
        recordId: documentId,
        recordType: "PatientRecord",
        collectionId,
        description: "Permanently deleted a terminated patient record from Terminated tab.",
      });

      setPatients((prev) => prev.filter((p) => (p.$id || p.id) !== documentId));
      closeAllDeleteModals();
    } catch (err) {
      console.error("Failed to delete record:", err);
      setDeleteError(err.message || "Failed to delete record");
    } finally {
      setDeleting(false);
    }
  };

  const formatTime = (dateString) => {
    if (!dateString) return "";
    try {
      const date = new Date(dateString);
      if (Number.isNaN(date.getTime())) return dateString;

      let hours = date.getHours();
      const minutes = date.getMinutes();
      const ampm = hours >= 12 ? "PM" : "AM";
      hours = hours % 12;
      hours = hours || 12;
      const minutesStr = minutes < 10 ? `0${minutes}` : `${minutes}`;

      return `${hours}:${minutesStr} ${ampm}`;
    } catch (e) {
      return dateString;
    }
  };

  const filteredPatients = patients.filter((patient) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;

    const id = (patient.patientRecordId || patient.$id || "").toString().toLowerCase();
    const name = (patient.lastName && patient.firstName
      ? `${patient.lastName}, ${patient.firstName}`
      : patient.name || "").toString().toLowerCase();

    return id.includes(query) || name.includes(query);
  });

  return (
    <div className="records-header-wrapper">
      <div className="records-header">
        <div className="header-text">
          <h2>Terminated Records</h2>
          <p className="records-subtext">This section lists records that have been terminated.</p>
        </div>

        <div className="header-image">
          <img src={logo} alt="RAVEN" />
        </div>
      </div>

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
          <input
            type="text"
            placeholder="Search by ID or name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="buttons-group" />
        </div>

        <table className="abtc-records-table terminated-table">
          <thead>
            <tr>
              <th>Patient ID</th>
              <th>Name</th>
              <th>Age</th>
              <th>Barangay</th>
              <th>Time Submitted</th>
              <th>Category</th>
              <th>Plan</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="8" style={{ textAlign: "center", padding: 20 }}>Loading patients...</td></tr>
            ) : error ? (
              <tr><td colSpan="8" style={{ textAlign: "center", padding: 20, color: "crimson" }}>Error: {error}</td></tr>
            ) : filteredPatients.length === 0 ? (
              <tr><td colSpan="8" style={{ textAlign: "center", padding: 20 }}>No terminated patients found.</td></tr>
            ) : (
              filteredPatients.map((patient, index) => (
                <tr key={patient.$id || patient.id || index}>
                  <td style={{ color: "#8E2626", fontWeight: "700" }}>{patient.patientRecordId || patient.id}</td>
                  <td>{patient.lastName && patient.firstName ? `${patient.lastName}, ${patient.firstName}` : (patient.name || "")}</td>
                  <td>{patient.age}</td>
                  <td>{patient.barangay}</td>
                  <td style={{ color: "#8E2626", fontWeight: "700" }}>{formatTime(patient.consultationDate)}</td>
                  <td>
                    {(() => {
                      const cat = (patient.categoryOfExposure || "").toString().trim().toUpperCase();
                      const catClass =
                        cat === "I" ? "cat-1" :
                        cat === "II" ? "cat-2" :
                        cat === "III" ? "cat-3" : "";
                      return (
                        <span className={`records-category-badge ${catClass}`}>
                          {cat}
                        </span>
                      );
                    })()}
                  </td>
                  <td>{patient.plan}</td>
                  <td className="terminated-actions-cell">
                    <div className="abtc-records-action-stack">
                      <button className="abtc-records-view-btn" onClick={() => handleViewClick(patient)}>View</button>
                      <button
                        className="abtc-records-delete-btn"
                        onClick={() => openDeleteConfirm(patient)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
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
            onBack={handleCloseModal}
            onUpdatePatient={handleUpdatePatient}
            statusOnly={true}
            status="Terminated"
            showTerminationReason={true}
            terminationReason={selectedPatient.terminateReason || ""}
          />,
          document.body
        )}

        {showDeleteConfirm && (
          <div className="delete-overlay fade" role="dialog" aria-modal="true">
            <div className="delete-modal fade">
              <h3>Delete Record</h3>
              <p className="delete-warning">This action is permanent and removes important patient data.</p>
              <p className="delete-instruction">Are you sure you want to delete this record?</p>
              <div className="delete-actions">
                <button
                  className="delete-confirm-btn"
                  onClick={proceedToPhraseModal}
                  disabled={deleting}
                >
                  Yes, continue
                </button>
                <button className="delete-cancel-btn" onClick={closeAllDeleteModals} disabled={deleting}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {showDeletePhrase && (
          <div className="delete-overlay fade" role="dialog" aria-modal="true">
            <div className="delete-modal fade">
              <h3>Final Confirmation</h3>
              <p className="delete-warning">This is highly critical data. Deletion cannot be undone.</p>
              <p className="delete-instruction">Type the phrase below exactly to proceed:</p>
              <div className="delete-phrase">{confirmPhrase}</div>
              <input
                type="text"
                className="delete-input"
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
                placeholder="Type the confirmation phrase"
                disabled={deleting}
              />
              {deleteError ? <div className="delete-error">{deleteError}</div> : null}
              <div className="delete-actions">
                <button
                  className="delete-confirm-btn"
                  onClick={handleDelete}
                  disabled={deleting || deleteInput.trim() !== confirmPhrase}
                >
                  {deleting ? "Deleting..." : "Yes, delete this record"}
                </button>
                <button className="delete-cancel-btn" onClick={closeAllDeleteModals} disabled={deleting}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TerminatedPage;
