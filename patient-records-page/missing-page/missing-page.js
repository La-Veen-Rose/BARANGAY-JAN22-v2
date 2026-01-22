import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";
import { Client, Databases, Query } from "appwrite";
import searchIcon from "../../../images/search-icon.png";
import PatientDetails from "../Modals/new-submitted-form-modal";
import PEPOverlay from "../Modals/pep-overlay";
import BoosterOverlay from "../Modals/set-dose-booster";
import logo from "../../../images/RAVEN LOGO 2.png";
import "./missing-page.css";

// Initialize Appwrite
const client = new Client()
  .setEndpoint(process.env.REACT_APP_APPWRITE_ENDPOINT || "https://cloud.appwrite.io/v1")
  .setProject(process.env.REACT_APP_APPWRITE_PROJECT_ID);

const databases = new Databases(client);
const databaseId = process.env.REACT_APP_APPWRITE_DATABASE;

// BY DEFAULT, NEW SUBMITTED PATIENTS TAB IS OPEN
const Missing = () => {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");

  const navigate = useNavigate();
  const location = useLocation();

  // Compute the next scheduled dose and date for a patient
  const computeNextSchedule = useCallback(async (doc) => {
    const vaccinationCollectionId = process.env.REACT_APP_APPWRITE_VACCINATION_COLLECTION || "vaccinationdetails";
    const progressCollectionId = process.env.REACT_APP_APPWRITE_PROGRESS_COLLECTION || "patientvaccinationprogress";
    const doseOrder = ["day0", "day3", "day7", "day14", "d28"];
    const doseIntervals = { day0: 0, day3: 3, day7: 7, day14: 14, d28: 28 };

    let scheduledDate = null;
    let nextDayKey = null;

    // Try progress collection first
    try {
      const progressRes = await databases.listDocuments(
        databaseId,
        progressCollectionId,
        [Query.equal("patientRecordId", doc.patientRecordId)]
      );

      const progressDoc = progressRes.documents?.[0];
      if (progressDoc && progressDoc.nextScheduleDay) {
        const progressDay = String(progressDoc.nextScheduleDay).trim().toLowerCase();
        const dayMapping = {
          "1": "day0", first: "day0", day0: "day0",
          "2": "day3", second: "day3", day3: "day3",
          "3": "day7", third: "day7", day7: "day7",
          "4": "day14", fourth: "day14", day14: "day14",
          "5": "d28", fifth: "d28", d28: "d28",
        };

        nextDayKey = dayMapping[progressDay] || progressDay;
        if (doseOrder.includes(nextDayKey) && progressDoc.nextScheduleDate) {
          scheduledDate = new Date(progressDoc.nextScheduleDate);
        }
      }
    } catch (err) {
      console.warn(`Progress lookup failed for ${doc.patientRecordId}:`, err);
    }

    // Fallback: derive from vaccination records
    if (!scheduledDate || !nextDayKey) {
      try {
        const vaxRes = await databases.listDocuments(
          databaseId,
          vaccinationCollectionId,
          [Query.equal("patientRecordId", doc.patientRecordId)]
        );

        const records = vaxRes.documents
          .filter((v) => v.dateOfVaccination && v.typeOfVaccine && v.dose && v.routeAndSite && v.administeredBy)
          .map((v) => ({ dayKey: v.dayKey, doseDate: new Date(v.dateOfVaccination) }));

        const completed = new Set();
        let day0Date = null;
        records.forEach(({ dayKey, doseDate }) => {
          completed.add(dayKey);
          if (dayKey === "day0" && (!day0Date || doseDate > day0Date)) {
            day0Date = doseDate;
          }
        });

        for (const dk of doseOrder) {
          if (!completed.has(dk)) {
            nextDayKey = dk;
            break;
          }
        }

        if (nextDayKey && day0Date && nextDayKey !== "day0") {
          scheduledDate = new Date(day0Date);
          scheduledDate.setDate(scheduledDate.getDate() + doseIntervals[nextDayKey]);
        }
      } catch (err) {
        console.warn(`Vaccination lookup failed for ${doc.patientRecordId}:`, err);
      }
    }

    return { scheduledDate, nextDayKey };
  }, []);

  // Sweep ongoing patients: if overdue beyond grace, mark as missing and return the overdue list (even if update fails)
  const sweepOngoingToMissing = useCallback(async () => {
    const doseLabels = { day0: "1st", day3: "2nd", day7: "3rd", day14: "4th", d28: "5th" };
    const overdueDocs = [];

    try {
      const ongoingRes = await databases.listDocuments(
        databaseId,
        process.env.REACT_APP_APPWRITE_COLLECTION,
        [Query.equal("vaxStatus", "ongoing")]
      );

      console.log(`🔍 Sweeping ${ongoingRes.documents.length} ongoing patients for grace period violations...`);

      for (const doc of ongoingRes.documents) {
        try {
          const { scheduledDate, nextDayKey } = await computeNextSchedule(doc);
          if (!scheduledDate || !nextDayKey) continue;

          const graceDeadline = new Date(scheduledDate);
          graceDeadline.setDate(graceDeadline.getDate() + 1);
          // Allow the whole grace day to elapse (23:59:59.999)
          graceDeadline.setHours(23, 59, 59, 999);
          const now = new Date();

          if (now > graceDeadline) {
            const newCycle = (typeof doc.cycle === "number" ? doc.cycle : 0) + 1;
            const stampedDoc = {
              ...doc,
              missedAt: doc.missedAt || new Date().toISOString(),
              missedDose: doc.missedDose || nextDayKey,
              vaxStatus: "missing",
              cycle: newCycle,
            };

            overdueDocs.push({
              ...stampedDoc,
              // pre-format common fields to avoid losing data when update fails
              dosedMissed: doseLabels[nextDayKey] || nextDayKey,
            });

            try {
              await databases.updateDocument(
                databaseId,
                process.env.REACT_APP_APPWRITE_COLLECTION,
                doc.$id || doc.id,
                {
                  vaxStatus: "missing",
                  lastEvent: "missing",
                  missedAt: stampedDoc.missedAt,
                  missedDose: nextDayKey,
                  cycle: newCycle,
                }
              );
              console.log(`➡️ Moved ${doc.patientRecordId} to missing (missed ${nextDayKey}, grace deadline: ${graceDeadline.toLocaleDateString()})`);
            } catch (updateErr) {
              console.warn(`Failed to update ${doc.patientRecordId} to missing; will still display locally:`, updateErr);
            }
          } else {
            console.log(`✅ ${doc.patientRecordId} within grace period (deadline: ${graceDeadline.toLocaleDateString()})`);
          }
        } catch (innerErr) {
          console.warn("Sweep error for patient", doc.patientRecordId, innerErr);
        }
      }
    } catch (err) {
      console.warn("Sweep ongoing to missing failed:", err);
    }

    return overdueDocs;
  }, [computeNextSchedule]);

  const fetchMissingPatients = useCallback(async () => {
    setLoading(true);
    try {
      // Ensure statuses are up-to-date before fetching missing; keep overdue locally even if update fails
      const overdueDocs = await sweepOngoingToMissing();

      const response = await databases.listDocuments(
        databaseId,
        process.env.REACT_APP_APPWRITE_COLLECTION,
        [Query.equal("vaxStatus", "missing")]
      );
      
      const doseLabels = { day0: "1st", day3: "2nd", day7: "3rd", day14: "4th", d28: "5th" };
      const byId = new Map();

      // Merge server missing docs first
      [...response.documents, ...overdueDocs].forEach((doc) => {
        const key = doc.patientRecordId || doc.id || doc.$id;
        if (!key || byId.has(key)) return;
        byId.set(key, doc);
      });

      // Filter out patients still within grace period
      const now = new Date();
      const filteredDocs = [];
      
      for (const doc of Array.from(byId.values())) {
        // Re-check if patient is truly past grace period
        const { scheduledDate, nextDayKey } = await computeNextSchedule(doc);
        
        if (scheduledDate && nextDayKey) {
          const graceDeadline = new Date(scheduledDate);
          graceDeadline.setDate(graceDeadline.getDate() + 1);
          graceDeadline.setHours(23, 59, 59, 999);
          
          if (now > graceDeadline) {
            filteredDocs.push(doc);
          } else {
            console.log(`⏳ Skipping ${doc.patientRecordId}: still within grace period (deadline: ${graceDeadline.toLocaleString()})`);
            // Move back to ongoing if incorrectly marked as missing
            try {
              await databases.updateDocument(
                databaseId,
                process.env.REACT_APP_APPWRITE_COLLECTION,
                doc.$id || doc.id,
                { vaxStatus: "ongoing" }
              );
              console.log(`🔄 Moved ${doc.patientRecordId} back to ongoing`);
            } catch (err) {
              console.warn(`Failed to revert ${doc.patientRecordId} to ongoing:`, err);
            }
          }
        } else {
          // No schedule info, keep them in missing
          filteredDocs.push(doc);
        }
      }

      const patientList = await Promise.all(filteredDocs.map(async (doc) => {
        // Calculate the next scheduled dose date with grace period
        const { scheduledDate, nextDayKey } = await computeNextSchedule(doc);
        let dateMissed = "N/A";
        let doseMissedLabel = "Follow-up dose";
        
        if (scheduledDate) {
          // Add 1 day grace period to the scheduled date
          const graceDeadline = new Date(scheduledDate);
          graceDeadline.setDate(graceDeadline.getDate() + 1);
          dateMissed = graceDeadline.toLocaleDateString();
        }
        
        // Convert dose key to readable label (1st, 2nd, 3rd, etc.)
        if (nextDayKey) {
          doseMissedLabel = doseLabels[nextDayKey] || nextDayKey;
        } else if (doc.missedDose) {
          doseMissedLabel = doseLabels[doc.missedDose] || doc.missedDose;
        }
        
        return {
          id: doc.patientRecordId || doc.id,
          $id: doc.$id,
          name: `${doc.lastName || ""}, ${doc.firstName || ""}`.trim(),
          age: doc.age || "N/A",
          barangay: doc.barangay || "N/A",
          plan: doc.vaccinationPlan || doc.plan || "PEP",
          dosedMissed: doseMissedLabel,
          dateMissed: dateMissed,
          category: " II",
          ...doc // Include all original data for modals
        };
      }));
      
      setPatients(patientList);
      console.log(`✅ Fetched ${patientList.length} missing patients (filtered by grace period)`);
    } catch (err) {
      console.error("❌ Error fetching missing patients:", err);
      setPatients([]);
    } finally {
      setLoading(false);
    }
  }, [sweepOngoingToMissing, computeNextSchedule]);

  // Manual refresh handler
  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchMissingPatients();
    setRefreshing(false);
  };

  // Fetch missing patients on mount
  useEffect(() => {
    // Initial fetch
    fetchMissingPatients();

    // Auto-refresh every 2 minutes to catch newly missing patients
    const intervalId = setInterval(() => {
      console.log("🔄 Auto-refreshing missing patients...");
      fetchMissingPatients();
    }, 120000); // 2 minutes

    // Cleanup interval on unmount
    return () => clearInterval(intervalId);
  }, [fetchMissingPatients]);

  const handleViewClick = (patientData) => {
    setSelectedPatient(patientData);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedPatient(null);
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
  };
  const handleCloseBooster = () => {
    setShowBooster(false);
    setBoosterPatient(null);
  };

  // Derived filtered list by ID or name
  const filtered = (patients || []).filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const id = (p.id || "").toString().toLowerCase();
    const name = (p.name || "").toString().toLowerCase();
    return id.includes(q) || name.includes(q);
  });

  return (
    <div className="missing-header-wrapper">
      <div className="missing-header">
        <div className="header-text">
        <h2>Missing Records</h2>
        <p className="subtext">This section provides a complete overview of all patient records.</p>
      </div>
        <div className="missing-header-image">
                  <img src={logo} alt="RAVEN" />
                </div>
                </div>

        <div className="missing-tabs-verified">
              <button
                className={`missing-tab-verified ${location.pathname === "/patientRecords" ? "active" : ""}`}
                onClick={() => navigate("/patientRecords")}
              >
                New Submitted Patients
              </button>

              <button
                className={`missing-tab-verified ${location.pathname === "/patientRecords/verified" ? "active" : ""}`}
                onClick={() => navigate("/patientRecords/verified")}
              >
                Verified
              </button>

              <button
                className={`missing-tab-verified ${location.pathname === "/patientRecords/ongoing" ? "active" : ""}`}
                onClick={() => navigate("/patientRecords/ongoing")}
              >
                Ongoing
              </button>

              <button
                className={`missing-tab-verified ${location.pathname === "/patientRecords/missing" ? "active" : ""}`}
                onClick={() => navigate("/patientRecords/missing")}
              >
                Missing
              </button>

              <button
                className={`missing-tab-verified ${location.pathname === "/patientRecords/completed" ? "active" : ""}`}
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

      <div className="missing-records-table-section">
        <div className="missing-records-search-controls">
          <div className="missing-records-search-bar">
            <img src={searchIcon} alt="search-icon" className="missing-records-search-icon" />
            <input 
              type="text" 
              placeholder="Search by ID or Name" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button 
            onClick={handleRefresh} 
            disabled={refreshing || loading}
            className="missing-records-refresh-btn"
            style={{
              backgroundColor: refreshing ? "#d0d0d0" : "#a83232",
              cursor: refreshing || loading ? "not-allowed" : "pointer",
            }}
            title="Refresh to check for newly missing patients"
          >
            {refreshing ? "Refreshing..." : "🔄 Refresh"}
          </button>
        </div>

        {loading ? (
          <div style={{ padding: "20px", textAlign: "center" }}>Loading patients...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "20px", textAlign: "center" }}>
            {patients.length === 0 ? "No missing patients found." : "No patients match your search."}
          </div>
        ) : (
        <table className="missing-records-table">
          <thead>
            <tr>
              <th>Patient ID</th>
              <th>Name</th>
              <th>Age</th>
              <th>Barangay</th>
              <th>Plan </th>
              <th>Dose Missed</th>
              <th>Date Missed</th>
              <th>Category</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((patient, index) => (
              <tr key={patient.$id || index}>
                <td>{patient.id}</td>
                <td>{patient.name}</td>
                <td>{patient.age}</td>
                <td>{patient.barangay}</td>
                <td>{patient.plan}</td>
                <td>{patient.dosedMissed}</td>
                <td>{patient.dateMissed}</td>
                <td>
                  <span className="missing-records-category-badge">{patient.category}</span>
                </td>

                {/* Actions: Vax Card viewable but not editable on missing records */}
                <td>
                  <div className="missing-records-actions-group">
                    <button className="missing-records-view-btn" onClick={() => handleViewClick(patient)}>
                      View
                    </button>
                    <button className="missing-records-vax-btn" onClick={() => handleVaxCardClick(patient)} title="View only - Cannot edit missing records">
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
          <PatientDetails patient={selectedPatient} onClose={handleCloseModal} />,
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

export default Missing;