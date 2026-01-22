import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";
import { Client, Databases, Query } from "appwrite";
import searchIcon from "../../../images/search-icon.png";
import PatientDetails from "../Modals/new-submitted-form-modal";
import PEPOverlay from "../Modals/pep-overlay";
import BoosterOverlay from "../Modals/set-dose-booster";
import logo from "../../../images/RAVEN LOGO 2.png";
import "./ongoing-page.css";

// Initialize Appwrite
const client = new Client()
  .setEndpoint(process.env.REACT_APP_APPWRITE_ENDPOINT || "https://cloud.appwrite.io/v1")
  .setProject(process.env.REACT_APP_APPWRITE_PROJECT_ID);

const databases = new Databases(client);
const databaseId = process.env.REACT_APP_APPWRITE_DATABASE;

// BY DEFAULT, NEW SUBMITTED PATIENTS TAB IS OPEN
const Ongoing = () => {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [highlightedId, setHighlightedId] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [overdueCount, setOverdueCount] = useState(0);

  // Fetch ongoing patients on mount and set up periodic check for overdue records
  useEffect(() => {
    fetchOngoingPatients();
    
    // Set up automatic periodic check for overdue records (every 5 minutes)
    const overdueCheckInterval = setInterval(() => {
      console.log("🔍 Running automatic overdue check...");
      fetchOngoingPatients();
    }, 5 * 60 * 1000); // Check every 5 minutes
    
    return () => clearInterval(overdueCheckInterval);
  }, []);

  const fetchOngoingPatients = async () => {
    setIsRefreshing(true);
    setLoading(true);
    let transferredCount = 0;
    try {
      const response = await databases.listDocuments(
        databaseId,
        process.env.REACT_APP_APPWRITE_COLLECTION,
        [Query.equal("vaxStatus", "ongoing")]
      );
      
      // Fetch vaccination details for all patients to determine next dose
      const vaccinationCollectionId = process.env.REACT_APP_APPWRITE_VACCINATION_COLLECTION || "vaccinationdetails";
      const progressCollectionId = process.env.REACT_APP_APPWRITE_PROGRESS_COLLECTION || "patientvaccinationprogress";
      const doseOrder = ['day0', 'day3', 'day7', 'day14', 'd28'];
      const doseLabels = { day0: '1st', day3: '2nd', day7: '3rd', day14: '4th', d28: '5th' };
      const doseIntervals = { day0: 0, day3: 3, day7: 7, day14: 14, d28: 28 };
      
      const patientList = await Promise.all(response.documents.map(async (doc) => {
        let nextDose = "Follow-up";
        let scheduleDate = "As Scheduled";
        let isMissing = false;
        let nextDayKey = null;
        const completedDoses = new Set();
        let day0DateInCycle = null;
        const consultationDateRaw = doc.consultationDate || doc.timeSubmitted || null;
        const consultationDateObj = consultationDateRaw ? new Date(consultationDateRaw) : null;
        
        // Prefer patientVaccinationProgress for next dose info
        try {
          const progressResponse = await databases.listDocuments(
            databaseId,
            progressCollectionId,
            [Query.equal("patientRecordId", doc.patientRecordId)]
          );
          const progressDoc = progressResponse.documents?.[0];
          console.log(`📊 Progress response for ${doc.patientRecordId}:`, progressResponse.documents);
          
          if (progressDoc) {
            const progressDay = progressDoc.nextScheduleDay;
            console.log(`🔍 nextScheduleDay value: "${progressDay}" (type: ${typeof progressDay})`);
            
            if (progressDay !== null && progressDay !== undefined) {
              let dayKey = String(progressDay).trim().toLowerCase();
              
              // Normalize various formats to dayKey format
              const dayMapping = {
                '1': 'day0', 'first': 'day0', 'day0': 'day0',
                '2': 'day3', 'second': 'day3', 'day3': 'day3',
                '3': 'day7', 'third': 'day7', 'day7': 'day7',
                '4': 'day14', 'fourth': 'day14', 'day14': 'day14',
                '5': 'd28', 'fifth': 'd28', 'd28': 'd28',
                'completed': 'completed'
              };
              
              dayKey = dayMapping[dayKey] || dayKey;
              
              if (dayKey === "completed") {
                nextDose = "Completed";
                scheduleDate = "Ready for Review";
                nextDayKey = null;
                console.log(`✅ Marked as completed from progress`);
              } else if (doseLabels[dayKey]) {
                nextDayKey = dayKey;
                nextDose = doseLabels[dayKey];
                console.log(`✅ Using progress data: nextDose=${nextDose}, dayKey=${dayKey}`);
              } else {
                console.warn(`⚠️ Unknown dayKey format: ${dayKey}`);
              }
              
              // Get scheduled date
              if (progressDoc.nextScheduleDate) {
                scheduleDate = progressDoc.nextScheduleDate.split('T')[0];
                console.log(`📅 Using nextScheduleDate: ${scheduleDate}`);
              }
            } else {
              console.log(`⚠️ nextScheduleDay is empty/null`);
            }
          } else {
            console.log(`⚠️ No progress document found`);
          }
        } catch (err) {
          console.warn(`❌ Failed to fetch progress data for ${doc.patientRecordId}:`, err);
        }
        
        // Fallback to vaccinationdetails when progress is missing
        if (!nextDayKey && nextDose !== "Completed") {
          try {
            const vaccinationResponse = await databases.listDocuments(
              databaseId,
              vaccinationCollectionId,
              [Query.equal("patientRecordId", doc.patientRecordId)]
            );

            // Only consider doses as completed if ALL required fields are filled
            const records = vaccinationResponse.documents
              .filter((vaxDoc) => 
                vaxDoc.dateOfVaccination && 
                vaxDoc.typeOfVaccine && 
                vaxDoc.dose && 
                vaxDoc.routeAndSite && 
                vaxDoc.administeredBy
              )
              .map((vaxDoc) => ({
                dayKey: vaxDoc.dayKey,
                doseDate: new Date(vaxDoc.dateOfVaccination)
              }));

            let latestDay0Date = null;
            let latestAnyDate = null;
            records.forEach(({ dayKey, doseDate }) => {
              if (dayKey === 'day0' && (!latestDay0Date || doseDate > latestDay0Date)) {
                latestDay0Date = doseDate;
              }
              if (!latestAnyDate || doseDate > latestAnyDate) {
                latestAnyDate = doseDate;
              }
            });

            const cycleStart = latestDay0Date || latestAnyDate; // prefer day0; otherwise use freshest dose

            records.forEach(({ dayKey, doseDate }) => {
              if (!cycleStart || doseDate >= cycleStart) {
                completedDoses.add(dayKey);
                // Track the Day 0 date in this cycle as the base for all schedule calculations
                if (dayKey === 'day0' && (!day0DateInCycle || doseDate > day0DateInCycle)) {
                  day0DateInCycle = doseDate;
                }
              }
            });

            // Check if all 5 doses are completed
            const allDosesCompleted = doseOrder.every(dayKey => completedDoses.has(dayKey));
            
            if (allDosesCompleted) {
              nextDose = "Completed";
              scheduleDate = "Ready for Review";
            } else {
              // Find the next incomplete dose
              for (const dayKey of doseOrder) {
                if (!completedDoses.has(dayKey)) {
                  nextDose = doseLabels[dayKey];
                  nextDayKey = dayKey;
                  
                  // Calculate scheduled date based on Day 0 date (all doses are relative to Day 0)
                  const baseDate = day0DateInCycle || cycleStart || consultationDateObj;
                  if (baseDate && dayKey !== 'day0') {
                    const interval = doseIntervals[dayKey];
                    const scheduledDate = new Date(baseDate);
                    scheduledDate.setDate(scheduledDate.getDate() + interval);
                    scheduleDate = scheduledDate.toISOString().split('T')[0];
                  } else if (dayKey === 'day0') {
                    if (baseDate instanceof Date && !isNaN(baseDate)) {
                      scheduleDate = baseDate.toISOString().split('T')[0];
                    } else {
                      scheduleDate = "";
                    }
                  }
                  break;
                }
              }
            }
          } catch (err) {
            console.warn(`Failed to fetch vaccination data for ${doc.patientRecordId}:`, err);
          }
        }
        
        // Missing detection: if past 1-day grace and next dose not completed
        // Records stay in ONGOING while still under grace period (now <= graceDeadline)
        // Only move to MISSING after grace period expires (now > graceDeadline)
        if (nextDayKey && scheduleDate && !completedDoses.has(nextDayKey)) {
          // Parse the scheduled date properly (handle YYYY-MM-DD format)
          const [year, month, day] = scheduleDate.split('-').map(Number);
          const scheduledDateObj = new Date(year, month - 1, day);
          
          const graceDeadline = new Date(scheduledDateObj);
          graceDeadline.setDate(graceDeadline.getDate() + 1); // Grace period: 1 day after scheduled dose
          graceDeadline.setHours(23, 59, 59, 999);
          
          const now = new Date();
          now.setHours(0, 0, 0, 0);
          
          const daysOverdue = Math.floor((now - scheduledDateObj) / (1000 * 60 * 60 * 24));
          
          if (now > graceDeadline) {
            // Grace period has expired - move patient to Missing
            isMissing = true;
            const newCycle = (typeof doc.cycle === 'number' ? doc.cycle : 0) + 1;
            try {
              console.log(`🔍 ATTEMPTING TRANSFER for ${doc.patientRecordId}: docId=${doc.$id}, nextDose=${nextDayKey}, scheduledDate=${scheduleDate}, daysOverdue=${daysOverdue}`);
              await databases.updateDocument(
                databaseId,
                process.env.REACT_APP_APPWRITE_COLLECTION,
                doc.$id,
                {
                  vaxStatus: 'missing',
                  missedAt: new Date().toISOString(),
                  missedDose: nextDayKey,
                  cycle: newCycle
                }
              );
              transferredCount++;
              console.log(`✅ SUCCESS: Patient ${doc.patientRecordId} transferred to MISSING (dose: ${nextDayKey}, ${daysOverdue} days overdue)`);
            } catch (e) {
              console.error(`❌ FAILED to transfer ${doc.patientRecordId}: ${e.message}`);
              // Even if update fails, mark locally as isMissing to prevent display
              isMissing = true;
            }
          } else {
            const daysRemaining = Math.ceil((graceDeadline - now) / (1000 * 60 * 60 * 24));
            console.log(`⏳ Patient ${doc.patientRecordId} still under grace period (${daysRemaining} days remaining, scheduled: ${scheduleDate})`);
          }
        }
        
        return {
          id: doc.patientRecordId || doc.id,
          patientRecordId: doc.patientRecordId, // Ensure this is explicitly set
          $id: doc.$id,
          name: `${doc.lastName || ""}, ${doc.firstName || ""}`.trim(),
          age: doc.age || "N/A",
          barangay: doc.barangay || "N/A",
          plan: doc.vaccinationPlan || "PEP",
          nextDose,
          scheduleDate,
          isMissing,
          ...doc // Include all original data for modals
        };
      }));
      
      // Filter out records that were marked as missing (transferred)
      // This prevents them from displaying even if DB update hasn't taken full effect
      const filteredPatients = patientList.filter(patient => {
        if (patient.isMissing === true) {
          console.log(`🚫 Filtering out transferred patient: ${patient.patientRecordId}`);
          return false;
        }
        return true;
      });
      
      setPatients(filteredPatients);
      setOverdueCount(transferredCount);
      if (transferredCount > 0) {
        console.log(`✅ OVERDUE CHECK COMPLETE: ${transferredCount} patient(s) transferred to MISSING | ${filteredPatients.length} ongoing patients remaining`);
      } else {
        console.log(`✅ OVERDUE CHECK COMPLETE: No overdue patients | ${filteredPatients.length} ongoing patients`);
      }
    } catch (err) {
      console.error("❌ Error fetching ongoing patients:", err);
      setPatients([]);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleViewClick = (patientData) => {
    setSelectedPatient(patientData);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedPatient(null);
  };

  const navigate = useNavigate();
  const location = useLocation();

  // If navigated here with a target openId (from vaccination schedule), highlight row first then open modal
  useEffect(() => {
    const openId = location?.state?.openId;
    if (openId && patients.length) {
      const found = patients.find(p => p.id === openId || p.$id === openId);
      if (found) {
        const safeId = (found.id || found.$id || '').toString().replace(/[^a-zA-Z0-9_-]/g, '_');
        const rowElement = document.getElementById(`patient-row-${safeId}`);
        // set highlight state to apply CSS animation
        setHighlightedId(openId);

        // scroll into view if available
        if (rowElement && typeof rowElement.scrollIntoView === 'function') {
          rowElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        // After the highlight animation, open the modal
        const timer = setTimeout(() => {
          setSelectedPatient(found);
          setIsModalOpen(true);
          // clear highlight after opening
          setHighlightedId(null);
          // clear navigation state so it doesn't reopen on back/refresh
          try { navigate(location.pathname, { replace: true }); } catch (e) { /* ignore */ }
        }, 900); // match animation duration

        return () => clearTimeout(timer);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patients]);

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
    // Refresh the patient list to reflect any status changes
    fetchOngoingPatients();
  };
  const handleCloseBooster = () => {
    setShowBooster(false);
    setBoosterPatient(null);
    // Refresh the patient list
    fetchOngoingPatients();
  };

  return (
    <div className="ongoing-header-wrapper">
      <div className="ongoing-header">
      <div className="header-text">
        <h2>Ongoing Records</h2>
        <p className="subtext">This section provides a complete overview of all patient records.</p>
      </div>

       <div className="ongoing-header-image">
                <img src={logo} alt="RAVEN" />
              </div>
              </div>

        <div className="ongoing-tabs-verified">
        <button
          className={`ongoing-tab-verified ${location.pathname === "/patientRecords" ? "active" : ""}`}
          onClick={() => navigate("/patientRecords")}
        >
          New Submitted Patients
        </button>

        <button
          className={`ongoing-tab-verified ${location.pathname === "/patientRecords/verified" ? "active" : ""}`}
          onClick={() => navigate("/patientRecords/verified")}
        >
          Verified
        </button>

        <button
          className={`ongoing-tab-verified ongoing-tab-ongoing ${location.pathname === "/patientRecords/ongoing" ? "active" : ""}`}
          onClick={() => navigate("/patientRecords/ongoing")}
        >
          Ongoing
        </button>

        <button
          className={`ongoing-tab-verified ${location.pathname === "/patientRecords/missing" ? "active" : ""}`}
          onClick={() => navigate("/patientRecords/missing")}
        >
          Missing
        </button>

        <button
          className={`ongoing-tab-verified ${location.pathname === "/patientRecords/completed" ? "active" : ""}`}
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

      <div className="ongoing-records-table-section">
        <div className="records-search-bar">
          <img src={searchIcon} alt="search-icon" className="search-icon" />
          <input type="text" placeholder="Search name by ID" />
          <div className="buttons-group">
            <button 
              onClick={fetchOngoingPatients}
              disabled={isRefreshing}
              style={{
                padding: "8px 16px",
                backgroundColor: isRefreshing ? "#ccc" : "#8E2626",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: isRefreshing ? "not-allowed" : "pointer",
                fontWeight: "600"
              }}
            >
              {isRefreshing ? "Checking Overdue..." : "Check Overdue"}
            </button>
            {overdueCount > 0 && (
              <span style={{
                marginLeft: "12px",
                padding: "8px 12px",
                backgroundColor: "#fff3cd",
                border: "1px solid #ffc107",
                borderRadius: "4px",
                color: "#856404",
                fontWeight: "600"
              }}>
                ✓ {overdueCount} transferred to Missing
              </span>
            )}
          </div>
        </div>

        {loading ? (
          <div style={{ padding: "20px", textAlign: "center" }}>Loading patients...</div>
        ) : patients.length === 0 ? (
          <div style={{ padding: "20px", textAlign: "center" }}>No ongoing patients found.</div>
        ) : (
        <table className="ongoing-records-table">
          <thead>
            <tr>
              <th>Patient ID</th>
              <th>Name</th>
              <th>Age</th>
              <th>Barangay</th>
              <th>Category</th>
              <th>Plan</th>
              <th>Next Dose</th>
              <th>Schedule Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {patients.map((patient, index) => {
              const rowKey = (patient.id || patient.$id || index).toString();
              const safeRowKey = rowKey.replace(/[^a-zA-Z0-9_-]/g, '_');
              const isHighlighted = highlightedId && (highlightedId === patient.id || highlightedId === patient.$id);
              return (
                <tr id={`patient-row-${safeRowKey}`} key={patient.$id || index} className={isHighlighted ? 'highlighted-row' : ''}>
                  <td style={{ color: "#8E2626", fontWeight: "700" }}>{patient.id}</td>
                  <td>{patient.name}</td>
                  <td>{patient.age}</td>
                  <td>{patient.barangay}</td>
                  <td>
                    {(() => {
                      const cat = (patient.categoryOfExposure || "").toString().trim().toUpperCase();
                      if (!cat) return null;
                      const catClass =
                        cat === "I" ? "cat-1" :
                        cat === "II" ? "cat-2" :
                        cat === "III" ? "cat-3" : "";
                      return (
                        <span className={`ongoing-records-category-badge ${catClass}`}>
                          {cat}
                        </span>
                      );
                    })()}
                  </td>
                  <td>{patient.plan}</td>
                  <td>{patient.nextDose}</td>
                  <td>{patient.scheduleDate}</td>

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
              );
            })}
          </tbody>
        </table>
        )}

        {/* Render modals/overlays using createPortal to escape stacking context */}
        {isModalOpen && selectedPatient && createPortal(
          <PatientDetails 
            patient={selectedPatient} 
            onClose={handleCloseModal}
            onVerify={() => {}}
            onTerminate={() => {}}
            statusOnly={true}
            status="Ongoing"
          />,
          document.body
        )}

        {showPEP && pepPatient && createPortal(
          <PEPOverlay
            patient={pepPatient}
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

export default Ongoing;