import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";
import { Client, Databases, Query } from "appwrite";
import searchIcon from "../../../images/search-icon.png";
import PatientDetails from "../Modals/new-submitted-form-modal";
import PEPOverlay from "../Modals/pep-overlay";
import BoosterOverlay from "../Modals/set-dose-booster";
import logo from "../../../images/RAVEN LOGO 2.png";
import "./completed-page.css";

// Initialize Appwrite
const client = new Client()
  .setEndpoint(process.env.REACT_APP_APPWRITE_ENDPOINT || "https://cloud.appwrite.io/v1")
  .setProject(process.env.REACT_APP_APPWRITE_PROJECT_ID);

const databases = new Databases(client); 
const databaseId = process.env.REACT_APP_APPWRITE_DATABASE;

// BY DEFAULT, NEW SUBMITTED PATIENTS TAB IS OPEN
const Completed = () => {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);

  // Fetch completed patients on mount
  useEffect(() => {
    const fetchCompletedPatients = async () => {
      setLoading(true);
      try {
        const response = await databases.listDocuments(
          databaseId,
          process.env.REACT_APP_APPWRITE_COLLECTION,
          [Query.equal("vaxStatus", "completed")]
        );
        
        const patientList = response.documents.map((doc) => {
          return {
            id: doc.patientRecordId || doc.id,
            patientRecordId: doc.patientRecordId, // Ensure this is explicitly set for overlay loading
            $id: doc.$id,
            name: `${doc.lastName || ""}, ${doc.firstName || ""}`.trim(),
            age: doc.age || "N/A",
            barangay: doc.barangay || "N/A",
            dateCompleted: doc.$updatedAt ? new Date(doc.$updatedAt).toLocaleString() : "N/A",
            category: "—",
            plan: doc.vaccinationPlan || "PEP",
            ...doc // Include all original data for modals
          };
        });

        setPatients(patientList);
        console.log(`✅ Fetched ${patientList.length} completed patients`);
      } catch (err) {
        console.error("❌ Error fetching completed patients:", err);
        setPatients([]);
      } finally {
        setLoading(false);
      }
    };

    fetchCompletedPatients();
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

  const navigate = useNavigate();
  const location = useLocation();

  // Overlay state
  const [showPEP, setShowPEP] = useState(false);
  const [pepPatient, setPepPatient] = useState(null);
  const [showBooster, setShowBooster] = useState(false);
  const [boosterPatient, setBoosterPatient] = useState(null);

  // Single handler that chooses the overlay by reading patient.plan
  const handleVaxCardClick = (patientData) => {
    const plan = (patientData?.plan || "").toString().trim().toLowerCase();

    if (plan.includes("pep")) {
      setPepPatient(patientData);
      setShowPEP(true);
    } else if (plan.includes("booster")) {
      setBoosterPatient(patientData);
      setShowBooster(true);
    } else {
      // Fallback: default to PEP
      setPepPatient(patientData);
      setShowPEP(true);
    }
  };

  // Close handlers
  const handleClosePEP = () => {
    setShowPEP(false);
    setPepPatient(null);
  };
  const handleCloseBooster = () => {
    setShowBooster(false);
    setBoosterPatient(null);
  };

  return (
    
    <div className="completed-header-wrapper">
      {/* HEADER SECTION */}
      <div className="completed-header">
        <div className="header-text">
          <h2>Completed Records</h2>
          <p className="subtext">This section provides a complete overview of all patient records.</p>
        </div>
        <div className="completed-header-image">
          <img src={logo} alt="RAVEN" />
        </div>
      </div>

      {/* TABS SECTION */}
      <div className="completed-tabs-verified">
        <button
          className={`completed-tab-verified ${location.pathname === "/patientRecords" ? "active" : ""}`}
          onClick={() => navigate("/patientRecords")}
        >
          New Submitted Patients
        </button>

        <button
          className={`completed-tab-verified ${location.pathname === "/patientRecords/verified" ? "active" : ""}`}
          onClick={() => navigate("/patientRecords/verified")}
        >
          Verified 
        </button>

        <button
          className={`completed-tab-verified completed-tab-ongoing ${location.pathname === "/patientRecords/ongoing" ? "active" : ""}`}
          onClick={() => navigate("/patientRecords/ongoing")}
        >
          Ongoing
        </button>

        <button
          className={`completed-tab-verified ${location.pathname === "/patientRecords/missing" ? "active" : ""}`}
          onClick={() => navigate("/patientRecords/missing")}
        >
          Missing
        </button>

        <button
          className={`completed-tab-verified ${location.pathname === "/patientRecords/completed" ? "active" : ""}`}
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

      {/* TABLE SECTION */}
      <div className="ongoing-records-table-section">
        {/* Search Bar */}
        <div className="records-search-bar">
          <img src={searchIcon} alt="search-icon" className="search-icon" />
          <input type="text" placeholder="Search by name or ID" />
        </div>

        {loading ? (
          <div style={{ padding: "20px", textAlign: "center" }}>Loading patients...</div>
        ) : patients.length === 0 ? (
          <div style={{ padding: "20px", textAlign: "center" }}>No completed patients found.</div>
        ) : (
        <table className="ongoing-records-table">
          <thead>
            <tr>
              <th>Patient ID</th>
              <th>Name</th>
              <th>Age</th>
              <th>Barangay</th>
              <th>Date Completed</th>
              <th>Category</th>
              <th>Plan</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {patients.map((patient, index) => (
              <tr key={patient.$id || index}>
                <td style={{ color: "#8E2626", fontWeight: "700" }}>{patient.id}</td>
                <td>{patient.name}</td>
                <td>{patient.age}</td>
                <td>{patient.barangay}</td>
                <td>{patient.dateCompleted}</td>
                <td>
                  {(() => {
                    const cat = (patient.category || "").toString().trim().toUpperCase();
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

                {/* Single actions TD with single Vax Card button */}
                <td>
                  <div className="ongoing-records-action-buttons">
                    <button className="ongoing-records-view-btn" onClick={() => handleViewClick(patient)}>
                      View
                    </button>
                    <button className="ongoing-records-vax-btn" onClick={() => handleVaxCardClick(patient)}>
                      Vax Card
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        )}

        {/* Render modals/overlays using createPortal to escape stacking context */}
        {isModalOpen && selectedPatient && createPortal(
          <PatientDetails 
            patient={selectedPatient} 
            patientId={selectedPatient.$id || selectedPatient.id}
            appwriteDatabaseId={process.env.REACT_APP_APPWRITE_DATABASE}
            appwriteCollectionId={process.env.REACT_APP_APPWRITE_COLLECTION}
            onClose={handleCloseModal}
            onUpdatePatient={handleUpdatePatient}
          />,
          document.body
        )}

        {showPEP && pepPatient && createPortal(
          <PEPOverlay
            patient={pepPatient}
            readOnly={true}
            onClose={() => {
              handleClosePEP();
            }}
            onSave={(data) => {
              console.log("PEP saved (front-end only):", data);
              handleClosePEP();
            }}
          />,
          document.body
        )}

        {showBooster && boosterPatient && createPortal(
          <BoosterOverlay
            patient={boosterPatient}
            readOnly={true}
            onClose={() => {
              handleCloseBooster();
            }}
            onSave={(data) => {
              console.log("Booster saved (front-end only):", data);
              handleCloseBooster();
            }}
          />,
          document.body
        )}
      </div>
    </div>
  );
};

export default Completed;