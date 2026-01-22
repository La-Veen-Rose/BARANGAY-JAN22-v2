import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";
import searchIcon from "../../../images/search-icon.png";
import PatientDetails from "../Modals/new-submitted-form-modal";
import PrescriptionPreviewModal from "../Modals/prescription-preview-modal";
import PEPOverlay from "../Modals/pep-overlay";
import BoosterOverlay from "../Modals/set-dose-booster";
import logo from "../../../images/RAVEN LOGO 2.png";
import "./verified-page.css";

// BY DEFAULT, NEW SUBMITTED PATIENTS TAB IS OPEN
const VerifiedRecords = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Table data and UI state
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [showPrescriptionPreview, setShowPrescriptionPreview] = useState(false);
  const [search, setSearch] = useState("");

  const handleViewClick = (patientData) => {
    setSelectedPatient(patientData);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedPatient(null);
  };

  const handleViewPrescription = () => {
    if (!selectedPatient) return;
    setShowPrescriptionPreview(true);
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

  // Fetch only verified records on mount and when route changes
  useEffect(() => {
    fetchVerified();
  }, [location.pathname]);

  const fetchVerified = async () => {
    setLoading(true);
    setError(null);
    try {
      const { Client, Databases, Query } = await import("appwrite");
      const client = new Client()
        .setEndpoint(process.env.REACT_APP_APPWRITE_ENDPOINT || "https://sgp.cloud.appwrite.io/v1")
        .setProject(process.env.REACT_APP_APPWRITE_PROJECT || "693295e1001e3363b764");

      const databases = new Databases(client);
      const databaseId = process.env.REACT_APP_APPWRITE_DATABASE;
      const collectionId = process.env.REACT_APP_APPWRITE_COLLECTION;
      
      const resp = await databases.listDocuments(
        databaseId,
        collectionId,
        [Query.equal("status", "verified")]
      );

      console.log("Verified page: fetched documents:", resp.documents?.length);
      console.log("Verified page: sample doc:", resp.documents?.[0]);

      // Show only records that have not entered the vaccination workflow yet.
      // Any record whose vaxStatus is "ongoing", "missing" or "completed" will
      // instead appear in the Ongoing / Missing / Completed pages and must not
      // be duplicated here.
      const verifiedPatients = (resp.documents || []).filter((doc) => {
        const vax = (doc.vaxStatus || "").toString().toLowerCase();
        const hide = vax === "ongoing" || vax === "missing" || vax === "completed";
        const shouldShow = !hide;
        console.log(`Record ${doc.$id}: vaxStatus="${doc.vaxStatus}", shouldShow=${shouldShow}`);
        return shouldShow;
      });
      
      console.log("Verified page: after vaxStatus filter:", verifiedPatients.length);
      
      setPatients(verifiedPatients);
    } catch (err) {
      console.error("Failed to fetch verified records:", err);
      setError(err.message || "Failed to load verified records");
    } finally {
      setLoading(false);
    }
  };

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
    // Refresh verified list - patient may have moved to ongoing
    fetchVerified();
  };
  const handleCloseBooster = () => {
    setShowBooster(false);
    setBoosterPatient(null);
    // Refresh verified list
    fetchVerified();
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

  // Derived filtered list by ID or name
  const filtered = (patients || []).filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const id = (p.$id || p.id || "").toString().toLowerCase();
    const name = (p.lastName && p.firstName
      ? `${p.lastName}, ${p.firstName}`
      : p.name || "").toString().toLowerCase();
    return id.includes(q) || name.includes(q);
  });

  return (
    <div className="verified-header-wrapper">
      <div className="verified-header">
        <div className="header-text">
        <h2>Verified Records</h2>
        <p className="subtext">This section provides a complete overview of all patient records.</p>
      </div>

        <div className="header-image">
          <img src={logo} alt="RAVEN" />
        </div>
        </div>

        <div className="records-tabs-verified">
              <button
                className={`records-tab-verified ${location.pathname === "/patientRecords" ? "active" : ""}`}
                onClick={() => navigate("/patientRecords")}
              >
                New Submitted Patients
              </button>

              <button
                className={`records-tab-verified ${location.pathname === "/patientRecords/verified" ? "active" : ""}`}
                onClick={() => navigate("/patientRecords/verified")}
              >
                Verified
              </button>

              <button
                className={`records-tab-verified records-tab-ongoing ${location.pathname === "/patientRecords/ongoing" ? "active" : ""}`}
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

      <div className="verified-records-table-section">
        <div className="verified-records-search-bar">
          <img src={searchIcon} alt="search-icon" className="search-icon" />
          <input
            type="text"
            placeholder="Search by ID or Name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <table className="verified-records-table">
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
              <tr><td colSpan="8" style={{ textAlign: "center", padding: 20 }}>Loading verified records...</td></tr>
            ) : error ? (
              <tr><td colSpan="8" style={{ textAlign: "center", padding: 20, color: "crimson" }}>Error: {error}</td></tr>
            ) : patients.length === 0 ? (
              <tr><td colSpan="8" style={{ textAlign: "center", padding: 20 }}>No verified records</td></tr>
            ) : (
            filtered.map((patient, index) => (
              <tr key={patient.$id || patient.id || index}>
                <td>{patient.patientRecordId || "N/A"}</td>
                <td>{patient.lastName && patient.firstName ? `${patient.lastName}, ${patient.firstName}` : patient.name || ""}</td>
                <td>{patient.age || ""}</td>
                <td>{patient.barangay || ""}</td>
                <td>{formatTime(patient.consultationDate || patient.timeSubmitted || "")}</td>
                <td>
                  {(() => {
                    // Category comes from the prescription fields saved on verification
                    const rawCat = patient.categoryOfExposure;
                    const cat = (Array.isArray(rawCat) ? rawCat[0] : rawCat || "")
                      .toString()
                      .trim()
                      .toUpperCase();
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
                <td>
                  {(() => {
                    // Plan is stored by the prescription as an array attribute in Appwrite;
                    // display a clean string based on those values.
                    const rawPlan = patient.plan;
                    if (Array.isArray(rawPlan)) {
                      return rawPlan.join(", ");
                    }
                    return rawPlan || "";
                  })()}
                </td>

                {/* Single actions TD with single Vax Card button */}
                <td>
                  <div className="verified-records-actions-group">
                    <button className="verified-records-view-btn" onClick={() => handleViewClick(patient)}>
                      View
                    </button>
                    <button className="verified-records-vax-btn" onClick={() => handleVaxCardClick(patient)}>
                      Vax Card
                    </button>
                  </div>
                </td>
              </tr>
            )))}
          </tbody>
        </table>

        {/* Render modals/overlays using createPortal to escape stacking context */}
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
            status="Verified"
            onViewPrescription={handleViewPrescription}
          />,
          document.body
        )}

        {showPrescriptionPreview && selectedPatient && createPortal(
          <PrescriptionPreviewModal
            patient={selectedPatient}
            prescription={selectedPatient}
            onClose={() => setShowPrescriptionPreview(false)}
            onBack={() => setShowPrescriptionPreview(false)}
            onVerify={null}
          />,
          document.body
        )}

        {showPEP && pepPatient && createPortal(
          <PEPOverlay
            patient={pepPatient}
            onClose={() => {
              handleClosePEP();
            }}
            // Saving now happens inside PEPOverlay; keep this as a no-op log
            onSave={(data) => {
              console.log("PEP form data:", data);
            }}
          />,
          document.body
        )}

        {showBooster && boosterPatient && createPortal(
          <BoosterOverlay
            patient={boosterPatient}
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

export default VerifiedRecords;