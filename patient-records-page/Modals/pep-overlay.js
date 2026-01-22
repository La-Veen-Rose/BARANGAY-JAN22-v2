import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import CryptoJS from "crypto-js";
import Confetti from "react-confetti";
import { logAuditEvent } from "../../../utils/auditLogger";
import "./pep-overlay.css";

// Security: Encryption key for secure QR codes - MUST be defined in .env file
if (!process.env.REACT_APP_QR_ENCRYPTION_KEY) {
  throw new Error(
    "CRITICAL SECURITY ERROR: REACT_APP_QR_ENCRYPTION_KEY is not defined in environment variables. " +
    "Please create a .env file with a secure encryption key."
  );
}

const QR_ENCRYPTION_KEY = process.env.REACT_APP_QR_ENCRYPTION_KEY;

// Secure endpoints from environment only - NO HARDCODED IDs
const getAppwriteConfig = () => ({
  endpoint: process.env.REACT_APP_APPWRITE_ENDPOINT,
  project:
    process.env.REACT_APP_APPWRITE_PROJECT_ID ||
    process.env.REACT_APP_APPWRITE_PROJECT,
});

const hasRequiredAppwriteConfig = () => {
  const { endpoint, project } = getAppwriteConfig();
  return Boolean(endpoint && project);
};

export default function PEPOverlay({ patient = {}, onClose = () => {}, readOnly = false, recordStatus = "default" }) {
  const [page, setPage] = useState(0); // 0 = form, 1 = QR code
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [generatedQRCode, setGeneratedQRCode] = useState(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [isVaccinationCompleted, setIsVaccinationCompleted] = useState(false);
  const [showMissingDosesModal, setShowMissingDosesModal] = useState(false);
  const [missedDoseDetails, setMissedDoseDetails] = useState({ missedDoses: [], daysOverdue: 0 });
  const [animalDiedToggle, setAnimalDiedToggle] = useState(false); // Dedicated toggle state
  const [patientDocId, setPatientDocId] = useState(null);
  const [showAnimalDiedConfirm, setShowAnimalDiedConfirm] = useState(false);
  const [pendingToggleValue, setPendingToggleValue] = useState(null);

  const [form, setForm] = useState({
    day0: { date: "", typeOfVaccine: "", dose: "", routeAndSite: "", administeredBy: "" },
    day3: { date: "", typeOfVaccine: "", dose: "", routeAndSite: "", administeredBy: "" },
    day7: { date: "", typeOfVaccine: "", dose: "", routeAndSite: "", administeredBy: "" },
    day14: { date: "", typeOfVaccine: "", dose: "", routeAndSite: "", administeredBy: "", checked: false },
    d28: { date: "", typeOfVaccine: "", dose: "", routeAndSite: "", administeredBy: "", checked: false },
  });

  // Track who activated the animalDied toggle
  const [animalDiedActivatedBy, setAnimalDiedActivatedBy] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [canModifyAnimalDied, setCanModifyAnimalDied] = useState(true);

  // Security: avoid leaking sensitive IDs in production.
  // Enable verbose logs only when explicitly opted-in via REACT_APP_DEBUG_LOGS=true.
  const DEBUG_LOGS =
    process.env.NODE_ENV !== "production" &&
    String(process.env.REACT_APP_DEBUG_LOGS || "").toLowerCase() === "true";

  const redactId = (value) => {
    if (!value) return "—";
    const str = String(value);
    if (str.length <= 8) return "***";
    return `${str.slice(0, 4)}…${str.slice(-4)}`;
  };

  const debug = (...args) => {
    if (DEBUG_LOGS) console.log(...args);
  };

  const toIsoDateTime = (dateStr) => {
    if (!dateStr) return null;
    // Appwrite `datetime` expects an ISO 8601 string.
    // Input is typically YYYY-MM-DD from <input type="date">.
    if (typeof dateStr === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return `${dateStr}T00:00:00.000Z`;
    }

    const parsed = new Date(dateStr);
    // If parsing fails, return null so we don't send an invalid value.
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
  };

  const isAdministeredVaccinationRow = (doc) => {
    if (!doc) return false;
    return Boolean(
      doc.dateOfVaccination &&
        doc.typeOfVaccine &&
        doc.dose &&
        doc.routeAndSite &&
        doc.administeredBy
    );
  };

  const syncTotalsForPatient = async ({
    databases,
    databaseId,
    vaccinationCollectionId,
    patientRecordId,
    totalDoses,
    Query,
  }) => {
    const allRows = await databases.listDocuments(databaseId, vaccinationCollectionId, [
      Query.equal("patientRecordId", patientRecordId),
    ]);

    const dosesCompleted = (allRows.documents || []).filter(isAdministeredVaccinationRow).length;

    for (const row of allRows.documents || []) {
      await databases.updateDocument(databaseId, vaccinationCollectionId, row.$id, {
        totalDoses,
        dosesCompleted,
      });
    }

    return { dosesCompleted, rowCount: (allRows.documents || []).length };
  };


  useEffect(() => {
  const loadAnimalDiedFromDB = async () => {
    try {
      // Validate required environment variables
      if (!process.env.REACT_APP_APPWRITE_ENDPOINT || !process.env.REACT_APP_APPWRITE_PROJECT_ID) {
        throw new Error(
          "Missing Appwrite configuration. Ensure REACT_APP_APPWRITE_ENDPOINT and " +
          "REACT_APP_APPWRITE_PROJECT_ID are defined in .env file."
        );
      }

      const { Client, Databases } = await import("appwrite");

      const client = new Client()
        .setEndpoint(process.env.REACT_APP_APPWRITE_ENDPOINT)
        .setProject(process.env.REACT_APP_APPWRITE_PROJECT_ID);

      const databases = new Databases(client);

      const databaseId = process.env.REACT_APP_APPWRITE_DATABASE;
      const patientCollectionId = "PatientRecords";
      const docId = patient?.$id;

      debug("🔍 PEP: Loading animalDied from DB, docId:", redactId(docId));

      if (!docId) {
        debug("❌ PEP: No docId provided, skipping DB load");
        return;
      }

      const doc = await databases.getDocument(
        databaseId,
        patientCollectionId,
        docId
      );

      debug("📄 PEP: Document loaded (redacted)");
      debug("✅ PEP: animalDied value from DB:", doc.animalDied);

      setAnimalDiedToggle(!!doc.animalDied);
      setPatientDocId(doc.$id);
      
      debug("✅ PEP: animalDiedToggle set to:", !!doc.animalDied);
    } catch (err) {
      console.error("❌ Failed to load animalDied:", err);
    }
  };

  loadAnimalDiedFromDB();
}, [patient]);
//

useEffect(() => {
  if (!patientDocId) return;

  let unsubscribe;

  (async () => {
    const { Client } = await import("appwrite");

    const client = new Client()
      .setEndpoint(process.env.REACT_APP_APPWRITE_ENDPOINT)
      .setProject(process.env.REACT_APP_APPWRITE_PROJECT_ID);

    unsubscribe = client.subscribe(
      `databases.${process.env.REACT_APP_APPWRITE_DATABASE}.collections.PatientRecords.documents.${patientDocId}`,
      (event) => {
        if (typeof event.payload?.animalDied === "boolean") {
          setAnimalDiedToggle(event.payload.animalDied);
        }
      }
    );
  })();

  return () => unsubscribe && unsubscribe();
}, [patientDocId]);
//




  const isFormDirty = (formState) => {
    const dayKeys = ["day0", "day3", "day7", "day14", "d28"];
    for (const key of dayKeys) {
      const day = formState[key];
      if (!day) continue;
      if (day.date || day.typeOfVaccine || day.dose || day.routeAndSite || day.administeredBy) {
        return true;
      }
    }
    if (animalDiedToggle) return true;
    return false;
  };

  // Check if vaccination schedule has missed doses
  const checkForMissingDoses = (formData) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const missedDoses = [];
    const gracePeriodDays = 1; // Allow 1-day grace period before marking as missing
    
    // Check Day 0 - if scheduled date exists but dose not completed and is overdue
    if (formData.day0.date) {
      const day0Date = new Date(formData.day0.date);
      day0Date.setHours(0, 0, 0, 0);
      const daysOverdue = Math.floor((today - day0Date) / (1000 * 60 * 60 * 24));
      
      const day0Complete = formData.day0.date && 
                          formData.day0.typeOfVaccine && 
                          formData.day0.dose && 
                          formData.day0.routeAndSite && 
                          formData.day0.administeredBy;
      
      if (!day0Complete && daysOverdue > gracePeriodDays) {
        missedDoses.push({ dose: 'Day 0', daysOverdue, scheduledDate: formData.day0.date });
      }
    }
    
    // Check Day 3
    if (formData.day3.date) {
      const day3Date = new Date(formData.day3.date);
      day3Date.setHours(0, 0, 0, 0);
      const daysOverdue = Math.floor((today - day3Date) / (1000 * 60 * 60 * 24));
      
      const day3Complete = formData.day3.date && 
                          formData.day3.typeOfVaccine && 
                          formData.day3.dose && 
                          formData.day3.routeAndSite && 
                          formData.day3.administeredBy;
      
      if (!day3Complete && daysOverdue > gracePeriodDays) {
        missedDoses.push({ dose: 'Day 3', daysOverdue, scheduledDate: formData.day3.date });
      }
    }
    
    // Check Day 7
    if (formData.day7.date) {
      const day7Date = new Date(formData.day7.date);
      day7Date.setHours(0, 0, 0, 0);
      const daysOverdue = Math.floor((today - day7Date) / (1000 * 60 * 60 * 24));
      
      const day7Complete = formData.day7.date && 
                          formData.day7.typeOfVaccine && 
                          formData.day7.dose && 
                          formData.day7.routeAndSite && 
                          formData.day7.administeredBy;
      
      if (!day7Complete && daysOverdue > gracePeriodDays) {
        missedDoses.push({ dose: 'Day 7', daysOverdue, scheduledDate: formData.day7.date });
      }
    }
    
    return missedDoses;
  };

  // Load existing vaccination data on mount
  useEffect(() => {
    const loadExistingVaccinationData = async () => {
      // Try multiple fields to get the correct patientRecordId
      const patientRecordId = patient?.patientRecordId || patient?.id;
      
      debug("🔍 PEP: Patient object received (redacted ids):", {
        patientRecordId: redactId(patient?.patientRecordId),
        id: redactId(patient?.id),
        $id: redactId(patient?.$id),
      });
      
      if (!patientRecordId) {
        debug("PEP: No patientRecordId found, starting with empty form");
        return;
      }

      try {
        // Validate required environment variables
        if (!process.env.REACT_APP_APPWRITE_ENDPOINT || !process.env.REACT_APP_APPWRITE_PROJECT_ID) {
          throw new Error(
            "Missing Appwrite configuration. Ensure REACT_APP_APPWRITE_ENDPOINT and " +
            "REACT_APP_APPWRITE_PROJECT_ID are defined in .env file."
          );
        }

        const { Client, Databases, Query } = await import("appwrite");
        const client = new Client()
          .setEndpoint(process.env.REACT_APP_APPWRITE_ENDPOINT)
          .setProject(process.env.REACT_APP_APPWRITE_PROJECT_ID);

        const databases = new Databases(client);
        const databaseId = process.env.REACT_APP_APPWRITE_DATABASE;
        const vaccinationCollectionId = process.env.REACT_APP_APPWRITE_VACCINATION_COLLECTION || "vaccinationdetails";

        debug(
          `🔍 PEP: Loading existing vaccination data for patientRecordId: ${redactId(patientRecordId)}...`
        );

        const response = await databases.listDocuments(
          databaseId,
          vaccinationCollectionId,
          [Query.equal("patientRecordId", patientRecordId)]
        );

        if (response.documents && response.documents.length > 0) {
          debug(`✅ PEP: Found ${response.documents.length} existing vaccination records`);
          
          const loadedForm = {
            day0: { date: "", typeOfVaccine: "", dose: "", routeAndSite: "", administeredBy: "" },
            day3: { date: "", typeOfVaccine: "", dose: "", routeAndSite: "", administeredBy: "" },
            day7: { date: "", typeOfVaccine: "", dose: "", routeAndSite: "", administeredBy: "" },
            day14: { date: "", typeOfVaccine: "", dose: "", routeAndSite: "", administeredBy: "" },
            d28: { date: "", typeOfVaccine: "", dose: "", routeAndSite: "", administeredBy: "" },
          };
          
          const checkboxUpdates = {}; // Track checkbox-only updates
          
          response.documents.forEach((doc) => {
            const dayKey = doc.dayKey;
            debug(`PEP: Processing document for ${dayKey} (fields redacted)`);
            
            if (loadedForm[dayKey]) {
              // Convert ISO datetime to YYYY-MM-DD format for date input
              let dateValue = doc.dateOfVaccination || "";
              if (dateValue && dateValue.includes('T')) {
                dateValue = dateValue.split('T')[0]; // Extract just the date part
              }
              
              // For day14 and d28: only load if there's actual date data
              // Skip loading checkbox-only records to preserve auto-calculated dates
              if ((dayKey === "day14" || dayKey === "d28") && !dateValue && !doc.typeOfVaccine) {
                debug(`⏭️ PEP: Found ${dayKey} checkbox-only record, will update checkbox separately`);
                // Store checkbox update separately - if there's a date, it means it's checked
                checkboxUpdates[dayKey] = !!dateValue;
              } else {
                // Normal load for other days or complete day14/d28 records
                loadedForm[dayKey] = {
                  date: dateValue,
                  typeOfVaccine: doc.typeOfVaccine || "",
                  dose: doc.dose || "",
                  routeAndSite: doc.routeAndSite || "",
                  administeredBy: doc.administeredBy || "",
                  checked: !!dateValue  // If there's a dateOfVaccination, it's checked
                };
              }
              debug(`📥 PEP: Loaded ${dayKey}`);
            }
          });

          setForm(prev => {
            // Merge loaded data, then update checkboxes separately
            const merged = { ...prev, ...loadedForm };
            
            // Auto-calculate day14 and d28 dates if day0 has a date
            if (merged.day0.date) {
              const day0Date = new Date(merged.day0.date);
              
              // Day 14: +14 days from Day 0
              const day14Date = new Date(day0Date);
              day14Date.setDate(day14Date.getDate() + 14);
              merged.day14 = { ...merged.day14, date: day14Date.toISOString().split('T')[0] };
              
              // Day 28: +28 days from Day 0
              const d28Date = new Date(day0Date);
              d28Date.setDate(d28Date.getDate() + 28);
              merged.d28 = { ...merged.d28, date: d28Date.toISOString().split('T')[0] };
            }
            
            // Apply checkbox-only updates without overwriting dates
            Object.keys(checkboxUpdates).forEach(dayKey => {
              merged[dayKey] = { ...merged[dayKey], checked: checkboxUpdates[dayKey] };
            });
            return merged;
          });
          debug("✅ PEP: Vaccination data loaded into form");
          
          // Check for missing doses after loading data
          if (!readOnly) {
            const missedDoses = checkForMissingDoses(loadedForm);
            if (missedDoses.length > 0) {
              const maxDaysOverdue = Math.max(...missedDoses.map(d => d.daysOverdue));
              setMissedDoseDetails({ missedDoses, daysOverdue: maxDaysOverdue });
              setShowMissingDosesModal(true);
            }
          }
        } else {
          debug("PEP: No existing vaccination data found, starting fresh");
        }
      } catch (err) {
        console.error("❌ PEP: Failed to load vaccination data:", err);
      }
    };

    loadExistingVaccinationData();
  }, [patient, readOnly]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && page < 1) setPage((p) => p + 1);
      if (e.key === "ArrowLeft" && page > 0) setPage((p) => p - 1);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, page]);

  // Handle animalDied toggle - show confirmation modal
  const handleAnimalDiedChange = () => {
    setPendingToggleValue(!animalDiedToggle);
    setShowAnimalDiedConfirm(true);
  };

  // Confirm and save animal died change
  const confirmAnimalDiedChange = async () => {
    try {
      if (!patientDocId) {
        setShowAnimalDiedConfirm(false);
        return;
      }

      // Validate required environment variables
      if (!process.env.REACT_APP_APPWRITE_ENDPOINT || !process.env.REACT_APP_APPWRITE_PROJECT_ID) {
        throw new Error(
          "Missing Appwrite configuration. Ensure REACT_APP_APPWRITE_ENDPOINT and " +
          "REACT_APP_APPWRITE_PROJECT_ID are defined in .env file."
        );
      }

      const { Client, Databases } = await import("appwrite");

      const client = new Client()
        .setEndpoint(process.env.REACT_APP_APPWRITE_ENDPOINT)
        .setProject(process.env.REACT_APP_APPWRITE_PROJECT_ID);

      const databases = new Databases(client);

      const databaseId = process.env.REACT_APP_APPWRITE_DATABASE;
      const patientCollectionId = "PatientRecords";

      await databases.updateDocument(
        databaseId,
        patientCollectionId,
        patientDocId,
        { animalDied: pendingToggleValue }
      );

      console.log("✅ Animal died status updated:", pendingToggleValue);

      // Log audit entry for animalDied status update (non-blocking)
      logAuditEvent({
        action: "update_patient_animal_status",
        recordId: patientDocId,
        recordType: "PatientRecord",
        collectionId: patientCollectionId,
        description: `Updated animalDied status to ${pendingToggleValue ? "true" : "false"} via PEP overlay`,
      });
      
      // Immediately update local state (realtime listener will also confirm this)
      setAnimalDiedToggle(pendingToggleValue);
      setShowAnimalDiedConfirm(false);
      setPendingToggleValue(null);
    } catch (err) {
      console.error("❌ Failed to update animalDied:", err);
      setShowAnimalDiedConfirm(false);
      setPendingToggleValue(null);
    }
  };


  const updateField = (dayKey, field, value) => {
    setForm((f) => {
      const updated = { ...f, [dayKey]: { ...f[dayKey], [field]: value } };
      
      // When Day 0 date is set, automatically calculate and suggest dates for subsequent doses
      if (dayKey === "day0" && field === "date" && value) {
        const day0Date = new Date(value);
        
        // Day 3: +3 days from Day 0
        const day3Date = new Date(day0Date);
        day3Date.setDate(day3Date.getDate() + 3);
        updated.day3 = { ...f.day3, date: day3Date.toISOString().split('T')[0] };
        
        // Day 7: +7 days from Day 0
        const day7Date = new Date(day0Date);
        day7Date.setDate(day7Date.getDate() + 7);
        updated.day7 = { ...f.day7, date: day7Date.toISOString().split('T')[0] };
        
        // Day 14: +14 days from Day 0
        const day14Date = new Date(day0Date);
        day14Date.setDate(day14Date.getDate() + 14);
        updated.day14 = { ...f.day14, date: day14Date.toISOString().split('T')[0] };
        
        // Day 28: +28 days from Day 0
        const d28Date = new Date(day0Date);
        d28Date.setDate(d28Date.getDate() + 28);
        updated.d28 = { ...f.d28, date: d28Date.toISOString().split('T')[0] };
      }
      
      // Immediately save checkbox state for day14/d28 to database
      if ((dayKey === "day14" || dayKey === "d28") && field === "checked") {
        debug(`🔔 Checkbox changed for ${dayKey}:`, value);
        debug(`📅 Current form[${dayKey}].date:`, form[dayKey]?.date);
        saveCheckboxStateToDB(dayKey, value);
      }
      
      return updated;
    });
  };

  // Save just the checkbox state to database without requiring full data
  const saveCheckboxStateToDB = async (dayKey, isChecked) => {
    try {
      debug(`🔄 saveCheckboxStateToDB called for ${dayKey}:`, isChecked);
      debug(`📅 form[${dayKey}].date:`, form[dayKey].date);
      debug(
        `patientDocId: ${redactId(patientDocId)}, patient.patientRecordId: ${redactId(
          patient?.patientRecordId
        )}`
      );

      if (!patientDocId) {
        console.warn(`⚠️ No patientDocId available for ${dayKey} checkbox save`);
        return;
      }

      const patientRecordId = patient?.patientRecordId;
      if (!patientRecordId) {
        console.warn(`⚠️ No patientRecordId available for ${dayKey} checkbox save`);
        return;
      }

      // Validate environment variables
      if (!process.env.REACT_APP_APPWRITE_ENDPOINT || !process.env.REACT_APP_APPWRITE_PROJECT_ID) {
        console.warn("Missing Appwrite configuration for checkbox save");
        return;
      }

      const { Client, Databases, Query } = await import("appwrite");
      const client = new Client()
        .setEndpoint(process.env.REACT_APP_APPWRITE_ENDPOINT)
        .setProject(process.env.REACT_APP_APPWRITE_PROJECT_ID);

      const databases = new Databases(client);
      const databaseId = process.env.REACT_APP_APPWRITE_DATABASE;
      const vaccinationCollectionId = process.env.REACT_APP_APPWRITE_VACCINATION_COLLECTION || "vaccinationdetails";

      debug(
        `🔍 Checking for existing ${dayKey} record for patientRecordId: ${redactId(patientRecordId)}`
      );

      // Check if record exists for this day
      const existingRecords = await databases.listDocuments(
        databaseId,
        vaccinationCollectionId,
        [
          Query.equal("patientRecordId", patientRecordId),
          Query.equal("dayKey", dayKey)
        ]
      );

      debug(`📊 Found ${existingRecords.documents.length} existing record(s) for ${dayKey}`);
      
      // Also check if an identical record already exists (same date)
      const identicalRecords = existingRecords.documents.filter(
        (doc) =>
          (doc.dateOfVaccination ? doc.dateOfVaccination.toString().slice(0, 10) : "") ===
            form[dayKey].date &&
          isChecked
      );
      
      if (identicalRecords.length > 0) {
        debug(
          `⚠️ Identical ${dayKey} record already exists with date ${form[dayKey].date}, skipping create`
        );
        return;
      }

      if (existingRecords.documents.length > 0) {
        // Calculate total doses for ALL records of this patient
        let totalDoses = 3; // day0, day3, day7 are always required
        
        // Check which optional days will be checked
        const day14Checked = dayKey === "day14" ? isChecked : form.day14.checked;
        const d28Checked = dayKey === "d28" ? isChecked : form.d28.checked;
        
        if (day14Checked) totalDoses++;
        if (d28Checked) totalDoses++;
        
        // Update existing record with calculated date and totalDoses for ALL records of this patient
        await databases.updateDocument(
          databaseId,
          vaccinationCollectionId,
          existingRecords.documents[0].$id,
          { 
            dateOfVaccination: isChecked ? toIsoDateTime(form[dayKey].date) : null,
            totalDoses: totalDoses
          }
        );
        
        // Update ALL other records for this patient with the same totalDoses
        for (let i = 1; i < existingRecords.documents.length; i++) {
          await databases.updateDocument(
            databaseId,
            vaccinationCollectionId,
            existingRecords.documents[i].$id,
            { totalDoses: totalDoses }
          );
        }
        
        debug(`✅ Updated ${dayKey} record and all patient records with totalDoses:`, totalDoses);

        await syncTotalsForPatient({
          databases,
          databaseId,
          vaccinationCollectionId,
          patientRecordId,
          totalDoses,
          Query,
        });
      } else if (isChecked && form[dayKey].date) {
        // Calculate total doses: base 3 (day0,3,7) + 1 for day14 if checked + 1 for d28 if checked
        let totalDoses = 3; // day0, day3, day7 are always required
        
        // Check which optional days are scheduled
        if (form.day14.date && (form.day14.checked || dayKey === "day14")) {
          totalDoses++;
        }
        if (form.d28.date && (form.d28.checked || dayKey === "d28")) {
          totalDoses++;
        }
        
        // Calculate next vaccine info
        let nextVaccineDay = "";
        let nextVaccineDate = null;
        
        if (dayKey === "day14") {
          // If day14 is being scheduled, next is d28 (if also scheduled) or completed
          if (form.d28.date && form.d28.checked) {
            nextVaccineDay = "D 28/30";
            nextVaccineDate = form.d28.date;
          } else {
            nextVaccineDay = "Completed";
          }
        } else if (dayKey === "d28") {
          nextVaccineDay = "Completed";
          nextVaccineDate = null;
        }
        
        // Create a new record when checkbox is checked (and no existing record)
        const newRecord = {
          patientRecordId,
          dayKey,
          dateOfVaccination: toIsoDateTime(form[dayKey].date), // Save the calculated date
          typeOfVaccine: "",
          dose: "",
          routeAndSite: "",
          administeredBy: "",
          totalDoses: totalDoses,
          dosesCompleted: 0,
          nextVaccineDate: toIsoDateTime(nextVaccineDate),
          nextVaccineDay: nextVaccineDay
        };
        
        await databases.createDocument(
          databaseId,
          vaccinationCollectionId,
          "unique()",
          newRecord
        );

        await syncTotalsForPatient({
          databases,
          databaseId,
          vaccinationCollectionId,
          patientRecordId,
          totalDoses,
          Query,
        });

        debug(
          `✅ Created new ${dayKey} row in vaccinationDetails with date: ${form[dayKey].date} totalDoses=${totalDoses}`
        );
      }
    } catch (err) {
      console.error(`❌ Failed to save ${dayKey} checkbox state:`, err);
      console.error("Error details:", err.message, err.stack);
    }
  };

  const clearAllLocalInputs = () => {
    setForm({
      day0: { date: "", typeOfVaccine: "", dose: "", routeAndSite: "", administeredBy: "" },
      day3: { date: "", typeOfVaccine: "", dose: "", routeAndSite: "", administeredBy: "" },
      day7: { date: "", typeOfVaccine: "", dose: "", routeAndSite: "", administeredBy: "" },
      day14: { date: "", typeOfVaccine: "", dose: "", routeAndSite: "", administeredBy: "", checked: false },
      d28: { date: "", typeOfVaccine: "", dose: "", routeAndSite: "", administeredBy: "", checked: false },
    });
    setShowClearConfirm(false);
  };

  // Generate encrypted QR code with minimal essential data
  // Helper function to determine the next incomplete dose
  const getNextDoseInfo = () => {
    const doseOrder = [
      { key: 'day0', label: 'Day 0' },
      { key: 'day3', label: 'Day 3' },
      { key: 'day7', label: 'Day 7' },
      { key: 'day14', label: 'Day 14' },
      { key: 'd28', label: 'D 28/30' }
    ];
    
    // Find the first incomplete dose (missing any required field)
    for (const dose of doseOrder) {
      const doseData = form[dose.key];
      const isComplete = doseData.date && 
                        doseData.typeOfVaccine && 
                        doseData.dose && 
                        doseData.routeAndSite && 
                        doseData.administeredBy;
      
      // For Day 14 and Day 28, only check if animalDied is true
      if ((dose.key === 'day14' || dose.key === 'd28') && !animalDiedToggle) {
        continue;
      }
      
      if (!isComplete) {
        return {
          nextVaccineDay: dose.label,
          nextVaccineDate: doseData.date || null
        };
      }
    }
    
    // All doses completed
    return {
      nextVaccineDay: 'Completed',
      nextVaccineDate: null
    };
  };

  const generatePEPQRCode = async () => {
    try {
      debug("🔐 Generating Encrypted PEP QR Code...");
      
      const patientRecordId = patient?.patientRecordId;
      
      if (!patientRecordId) {
        console.error("❌ No patient record ID available");
        return;
      }

      // Generate unique token for this QR
      const generateUniqueToken = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Minimal data - just enough to identify and validate
      const vaccinationData = {
        patientRecordId,
        type: "PEP",
        tokenId: generateUniqueToken(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };

      // Encrypt the data
      const jsonString = JSON.stringify(vaccinationData);
      const encryptedData = CryptoJS.AES.encrypt(jsonString, QR_ENCRYPTION_KEY).toString();
      
      // Create signature for integrity verification
      const signature = CryptoJS.SHA256(encryptedData).toString();
      
      // QR payload with required fields
      const qrPayload = JSON.stringify({
        v: "1",
        data: encryptedData,
        sig: signature,
        key: process.env.REACT_APP_QR_KEY_NAME || "default",
      });

      debug("🔐 PEP QR generated (tokenId redacted):", redactId(vaccinationData.tokenId));
      debug("📊 Original data size:", jsonString.length, "bytes");
      debug("🔒 Encrypted payload size:", encryptedData.length, "bytes");
      debug("📋 Final QR payload structure: v, data, sig, key");

      const qrImage = await QRCode.toDataURL(qrPayload, {
        errorCorrectionLevel: "L",
        type: "image/png",
        quality: 1.0,
        margin: 4,
        width: 500,
      });

      setGeneratedQRCode(qrImage);
      debug("✅ Encrypted PEP QR Code generated - secure and compliant");
    } catch (err) {
      console.error("❌ Failed to generate PEP QR code:", err);
    }
  };

  const handleNext = async () => {
    if (page === 0) {
      try {
        debug("📝 Saving vaccination data and moving to QR code page...");

        if (!readOnly) {
          const saved = await saveVaccinationData();
          if (!saved) return;
        }

        setPage(1);
        // Generate QR code after page change
        await generatePEPQRCode();
        debug("✅ QR code generated");
      } catch (err) {
        console.error("❌ Error generating QR code:", err);
        alert("Error generating QR code. Check console.");
      }
    } else {
      // Finish - show success modal and close
      setShowConfetti(true);
      setShowSuccessModal(true);
      // Modal will close after user sees the success message
    }
  };

  const saveVaccinationData = async () => {
    try {
      const { Client, Databases, Query } = await import("appwrite");
      const config = getAppwriteConfig();

      if (!config.endpoint || !config.project) {
        alert(
          "Missing Appwrite configuration. Please set REACT_APP_APPWRITE_ENDPOINT and " +
            "REACT_APP_APPWRITE_PROJECT_ID (or REACT_APP_APPWRITE_PROJECT)."
        );
        return false;
      }

      const client = new Client()
        .setEndpoint(config.endpoint)
        .setProject(config.project);

      const databases = new Databases(client);
      const databaseId = process.env.REACT_APP_APPWRITE_DATABASE;
      const vaccinationCollectionId = process.env.REACT_APP_APPWRITE_VACCINATION_COLLECTION || "vaccinationdetails";
      const patientRecordId = patient?.patientRecordId;

      if (!patientRecordId) {
        console.error("❌ No patientRecordId found");
        onClose();
        return;
      }

      debug("💾 Saving PEP vaccination data for:", redactId(patientRecordId));

      // Determine which days to save based on toggle switch and checkbox states
      let dayKeysToSave = ["day0", "day3", "day7"]; // Always save these days
      
      // If toggle switch is activated
      if (animalDiedToggle) {
        // Add day14 if checkbox is checked
        if (form.day14.checked) {
          dayKeysToSave.push("day14");
        }
        // Add d28 if checkbox is checked
        if (form.d28.checked) {
          dayKeysToSave.push("d28");
        }
      }
      
      debug("📋 Days to save:", dayKeysToSave);

      // Calculate totalDoses based on toggle switch and checkbox states
      let totalDoses = 3; // Base: day 0, 3, 7
      if (animalDiedToggle) {
        if (form.day14.checked) totalDoses++; // Add day 14
        if (form.d28.checked) totalDoses++; // Add day 28
      }
      debug("💊 Total doses for this plan:", totalDoses);

      // Calculate dosesCompleted - count how many days are fully administered (all fields filled)
      const isDoseComplete = (dayKey) => {
        const dose = form[dayKey];
        return dose.date && dose.typeOfVaccine && dose.dose && dose.routeAndSite && dose.administeredBy;
      };
      
      let dosesCompleted = 0;
      for (const dayKey of dayKeysToSave) {
        if (isDoseComplete(dayKey)) {
          dosesCompleted++;
        }
      }
      debug("✅ Doses completed:", dosesCompleted);

      // First, update ALL existing vaccination records for this patient with new totalDoses
      const allExistingRecords = await databases.listDocuments(
        databaseId,
        vaccinationCollectionId,
        [Query.equal("patientRecordId", patientRecordId)]
      );

      debug(`🔄 Updating ${allExistingRecords.documents.length} existing records with new totalDoses: ${totalDoses}`);
      
      for (const existingRecord of allExistingRecords.documents) {
        await databases.updateDocument(
          databaseId,
          vaccinationCollectionId,
          existingRecord.$id,
          { totalDoses: totalDoses }
        );
      }

      // Save or update each day's vaccination data
      for (const dayKey of dayKeysToSave) {
        if (form[dayKey].date) {
          // Get next dose info
          const nextDoseInfo = getNextDoseInfo();
          
          const vaccinationData = {
            patientRecordId,
            dayKey,
            dateOfVaccination: toIsoDateTime(form[dayKey].date),
            typeOfVaccine: form[dayKey].typeOfVaccine || "",
            dose: form[dayKey].dose || "",
            routeAndSite: form[dayKey].routeAndSite || "",
            administeredBy: form[dayKey].administeredBy || "",
            totalDoses: totalDoses,
            dosesCompleted: dosesCompleted,
            nextVaccineDate: toIsoDateTime(nextDoseInfo.nextVaccineDate) || null,
            nextVaccineDay: nextDoseInfo.nextVaccineDay,
          };

          // Check if record already exists
          const existingRecords = await databases.listDocuments(
            databaseId,
            vaccinationCollectionId,
            [
              Query.equal("patientRecordId", patientRecordId),
              Query.equal("dayKey", dayKey)
            ]
          );

          if (existingRecords.documents.length > 0) {
            // Update existing record
            await databases.updateDocument(
              databaseId,
              vaccinationCollectionId,
              existingRecords.documents[0].$id,
              vaccinationData
            );
            debug(`✅ Updated ${dayKey} vaccination record with next vaccine info`);
          } else {
            // Create new record
            await databases.createDocument(
              databaseId,
              vaccinationCollectionId,
              "unique()",
              vaccinationData
            );
            debug(`✅ Created ${dayKey} vaccination record with next vaccine info`);
          }
        }
      }

      // Check if all required doses are completed
      let allRequiredDosesComplete = false;
      
      if (animalDiedToggle) {
        // If animal died, check which days are being saved
        const requiredDays = ["day0", "day3", "day7"];
        if (form.day14.checked) requiredDays.push("day14");
        if (form.d28.checked) requiredDays.push("d28");
        
        // All required days must be complete
        allRequiredDosesComplete = requiredDays.every(day => isDoseComplete(day));
      } else {
        // If animal didn't die, only Day 0, 3, and 7 are required
        allRequiredDosesComplete = isDoseComplete('day0') && 
                                   isDoseComplete('day3') && 
                                   isDoseComplete('day7');
      }
      
      // Set vaxStatus based on completion
      const newVaxStatus = allRequiredDosesComplete ? "completed" : "ongoing";

      // Update patient vaxStatus only
      const patientCollectionId = process.env.REACT_APP_APPWRITE_COLLECTION || "PatientRecords";
      const patientDocumentId = patientDocId || patient?.$id;

      if (patientDocumentId) {
        await databases.updateDocument(
          databaseId,
          patientCollectionId,
          patientDocumentId,
          { vaxStatus: newVaxStatus }
        );
        debug(`✅ Updated patient vaxStatus to '${newVaxStatus}'`);

        // Log audit entry for vaccination status change (non-blocking)
        logAuditEvent({
          action: "update_vaccination_status",
          recordId: patientDocumentId,
          recordType: "PatientRecord",
          collectionId: patientCollectionId,
          description: `PEP overlay set vaxStatus to '${newVaxStatus}'`,
        });
      }

      debug("✅ All PEP vaccination data saved successfully");

      // Ensure totals are consistent across *all* rows for this patient
      // and compute dosesCompleted by counting administered rows.
      const syncResult = await syncTotalsForPatient({
        databases,
        databaseId,
        vaccinationCollectionId,
        patientRecordId,
        totalDoses,
        Query,
      });

      debug(
        `📌 Synced totals for patient ${redactId(patientRecordId)}: totalDoses=${totalDoses}, dosesCompleted=${syncResult.dosesCompleted}, rows=${syncResult.rowCount}`
      );
      
      // Store completion status for modal message (will be shown when Finish is clicked)
      setIsVaccinationCompleted(allRequiredDosesComplete);

      return true;
    } catch (err) {
      console.error("❌ Failed to save PEP vaccination data:", err);
      alert(`Failed to save vaccination data: ${err.message || 'Unknown error'}`);

      return false;
    }
  };

  const handleBack = () => {
    if (page > 0) setPage(page - 1);
  };

  const handleTransferToMissing = async () => {
    try {
      const { Client, Databases } = await import("appwrite");
      const config = getAppwriteConfig();
      const client = new Client()
        .setEndpoint(config.endpoint)
        .setProject(config.project);

      const databases = new Databases(client);
      const databaseId = process.env.REACT_APP_APPWRITE_DATABASE;
      const patientCollectionId = process.env.REACT_APP_APPWRITE_COLLECTION || "PatientRecords";
      const patientDocumentId = patientDocId || patient?.$id;

      if (!patientDocumentId) {
        console.error("❌ No patient document ID found");
        return;
      }

      debug("🔄 Transferring patient to missing section due to missed doses...");

      // Update patient vaxStatus to "missing"
      await databases.updateDocument(
        databaseId,
        patientCollectionId,
        patientDocumentId,
        { vaxStatus: "missing" }
      );

      debug("✅ Patient transferred to missing section");
      
      // Close modal and reload page to reflect changes
      setShowMissingDosesModal(false);
      onClose();
      window.location.reload();
    } catch (err) {
      console.error("❌ Failed to transfer patient to missing section:", err);
      alert("Failed to update patient status. Please try again.");
    }
  };

  const renderDayRow = (label, dayKey, dayOffset = null) => {
    // Determine if this row should be disabled
    let isDisabled = false;
    let disabledMessage = "";
    
    // Day 0 is always enabled
    if (dayKey !== "day0") {
      // Check if Day 0 has been completed (all fields filled)
      const day0Complete = form.day0.date && 
                          form.day0.typeOfVaccine && 
                          form.day0.dose && 
                          form.day0.routeAndSite && 
                          form.day0.administeredBy;
      
      if (!day0Complete) {
        isDisabled = true;
        disabledMessage = "Complete Day 0 dose first to unlock this row";
      } else if (dayKey === "day3") {
        // Day 3: check if it's unlockable based on suggested date
        const suggestedDate = form.day3.date;
        if (!suggestedDate) {
          isDisabled = true;
          disabledMessage = "Complete Day 0 dose first to unlock this row";
        } else {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const scheduledDate = new Date(suggestedDate);
          scheduledDate.setHours(0, 0, 0, 0);
          
          if (today < scheduledDate) {
            isDisabled = true;
            const options = { year: 'numeric', month: 'long', day: 'numeric' };
            disabledMessage = `This dose will be available on ${scheduledDate.toLocaleDateString('en-US', options)}`;
          }
        }
      } else if (dayKey === "day7") {
        // Day 7: check if Day 3 is complete
        const day3Complete = form.day3.date && 
                            form.day3.typeOfVaccine && 
                            form.day3.dose && 
                            form.day3.routeAndSite && 
                            form.day3.administeredBy;
        
        if (!day3Complete) {
          isDisabled = true;
          disabledMessage = "Complete Day 3 dose first to unlock this row";
        } else {
          // Check if it's unlockable based on suggested date
          const suggestedDate = form.day7.date;
          if (!suggestedDate) {
            isDisabled = true;
            disabledMessage = "Complete Day 3 dose first to unlock this row";
          } else {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const scheduledDate = new Date(suggestedDate);
            scheduledDate.setHours(0, 0, 0, 0);
            
            if (today < scheduledDate) {
              isDisabled = true;
              const options = { year: 'numeric', month: 'long', day: 'numeric' };
              disabledMessage = `This dose will be available on ${scheduledDate.toLocaleDateString('en-US', options)}`;
            }
          }
        }
      } else if (dayKey === "day14" || dayKey === "d28") {
        // Day 14 and Day 28 - show calculated dates always, but require toggle + Day 7 completion to edit
        const day7Complete = form.day7.date && 
                            form.day7.typeOfVaccine && 
                            form.day7.dose && 
                            form.day7.routeAndSite && 
                            form.day7.administeredBy;
        
        if (!day7Complete) {
          isDisabled = true;
          disabledMessage = "Complete Day 7 dose first to unlock this row";
        } else if (!animalDiedToggle) {
          isDisabled = true;
          disabledMessage = "Activate 'animal died during observation' to unlock this row";
        } else if (dayKey === "day14") {
          // Check if it's unlockable based on suggested date
          const suggestedDate = form.day14.date;
          if (!suggestedDate) {
            isDisabled = true;
            disabledMessage = "Complete Day 7 dose first to unlock this row";
          } else {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const scheduledDate = new Date(suggestedDate);
            scheduledDate.setHours(0, 0, 0, 0);
            
            if (today < scheduledDate) {
              isDisabled = true;
              const options = { year: 'numeric', month: 'long', day: 'numeric' };
              disabledMessage = `This dose will be available on ${scheduledDate.toLocaleDateString('en-US', options)}`;
            }
          }
        } else if (dayKey === "d28") {
          // Day 28: check if Day 14 is complete
          const day14Complete = form.day14.date && 
                               form.day14.typeOfVaccine && 
                               form.day14.dose && 
                               form.day14.routeAndSite && 
                               form.day14.administeredBy;
          
          if (!day14Complete) {
            isDisabled = true;
            disabledMessage = "Complete Day 14 dose first to unlock this row";
          } else {
            // Check if it's unlockable based on suggested date
            const suggestedDate = form.d28.date;
            if (!suggestedDate) {
              isDisabled = true;
              disabledMessage = "Complete Day 14 dose first to unlock this row";
            } else {
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const scheduledDate = new Date(suggestedDate);
              scheduledDate.setHours(0, 0, 0, 0);
              
              if (today < scheduledDate) {
                isDisabled = true;
                const options = { year: 'numeric', month: 'long', day: 'numeric' };
                disabledMessage = `This dose will be available on ${scheduledDate.toLocaleDateString('en-US', options)}`;
              }
            }
          }
        }
      }
    }
    
    return (
      <div className="pep-day-row" key={dayKey}>
        <div className="pep-day-row-content">
          <div className="pep-day-label">{label}</div>
          <div className="pep-row-fields">
            <input
              type="date"
              className={`pep-input date-input ${readOnly || (dayKey === "day14" || dayKey === "d28" ? !form[dayKey].checked : isDisabled) ? 'disabled' : ''}`}
              value={form[dayKey].date}
              onChange={(e) => updateField(dayKey, "date", e.target.value)}
              aria-label={`${label} date`}
              disabled={readOnly || (dayKey === "day14" || dayKey === "d28" ? !form[dayKey].checked : isDisabled)}
              readOnly={(dayKey !== "day0" && !isDisabled) || readOnly}
            />
            <input
              type="text"
              className={`pep-input ${readOnly || (dayKey === "day14" || dayKey === "d28" ? !form[dayKey].checked : isDisabled) ? 'disabled' : ''}`}
              placeholder="Type of vaccine"
              value={form[dayKey].typeOfVaccine}
              onChange={(e) => updateField(dayKey, "typeOfVaccine", e.target.value)}
              disabled={readOnly || (dayKey === "day14" || dayKey === "d28" ? !form[dayKey].checked : isDisabled)}
            />
            <input
              type="text"
              className={`pep-input ${readOnly || (dayKey === "day14" || dayKey === "d28" ? !form[dayKey].checked : isDisabled) ? 'disabled' : ''}`}
              placeholder="Dose"
              value={form[dayKey].dose}
              onChange={(e) => updateField(dayKey, "dose", e.target.value)}
              disabled={readOnly || (dayKey === "day14" || dayKey === "d28" ? !form[dayKey].checked : isDisabled)}
            />
            <input
              type="text"
              className={`pep-input ${readOnly || (dayKey === "day14" || dayKey === "d28" ? !form[dayKey].checked : isDisabled) ? 'disabled' : ''}`}
              placeholder="Route and site"
              value={form[dayKey].routeAndSite}
              onChange={(e) => updateField(dayKey, "routeAndSite", e.target.value)}
              disabled={readOnly || (dayKey === "day14" || dayKey === "d28" ? !form[dayKey].checked : isDisabled)}
            />
            <input
              type="text"
              className={`pep-input ${readOnly || (dayKey === "day14" || dayKey === "d28" ? !form[dayKey].checked : isDisabled) ? 'disabled' : ''}`}
              placeholder="Administered by"
              value={form[dayKey].administeredBy}
              onChange={(e) => updateField(dayKey, "administeredBy", e.target.value)}
              disabled={readOnly || (dayKey === "day14" || dayKey === "d28" ? !form[dayKey].checked : isDisabled)}
            />
          </div>
        </div>
        {isDisabled && disabledMessage && (
          <div className="pep-disabled-message">
            <span className="pep-lock-icon">🔒</span> {disabledMessage}
          </div>
        )}
        {(dayKey === "day14" || dayKey === "d28") && (
          <div className="pep-day-checkbox-row">
            <label className="pep-day-checkbox-label">
              <input
                type="checkbox"
                checked={form[dayKey].checked || false}
                onChange={(e) => updateField(dayKey, "checked", e.target.checked)}
                disabled={readOnly || !animalDiedToggle || (form[dayKey].checked && (form[dayKey].date || form[dayKey].typeOfVaccine || form[dayKey].dose || form[dayKey].routeAndSite || form[dayKey].administeredBy))}
              />
              <span>{dayKey === "day14" ? "Check Day 14" : "Check Day 28/30"}</span>
            </label>
          </div>
        )}
        {(dayKey === "day14" || dayKey === "d28") && form[dayKey].checked && animalDiedToggle && !(form.day7.date && form.day7.typeOfVaccine && form.day7.dose && form.day7.routeAndSite && form.day7.administeredBy) && (
          <div className="pep-warning-message">
            <span className="pep-warning-icon">⚠️</span> Complete Day 0, Day 3, Day 7 first to enable this schedule
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="pep-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="PEP overlay">
      {showConfetti && (
        <Confetti
          width={window.innerWidth}
          height={window.innerHeight}
          recycle={false}
          numberOfPieces={500}
        />
      )}
      {showAnimalDiedConfirm && (
        <div className="pep-warning-overlay" onClick={(e) => e.stopPropagation()}>
          <div className="pep-warning-box" onClick={(e) => e.stopPropagation()}>
            <div className="pep-warning-icon">❓</div>
            <h3 className="pep-warning-title">
              {pendingToggleValue ? "Confirm Animal Death" : "Revoke Animal Death Status"}
            </h3>
            <p className="pep-warning-text">
              {pendingToggleValue
                ? "Are you sure the animal died during observation? This will unlock Day 14 and Day 28/30 vaccination schedules."
                : "Are you sure? Revoking this status will disable Day 14 and Day 28/30 vaccination entries."}
            </p>
            <div style={{ display: "flex", gap: "10px", marginTop: "12px", justifyContent: "center" }}>
              <button
                className="pep-warning-btn"
                onClick={() => {
                  setShowAnimalDiedConfirm(false);
                  setPendingToggleValue(null);
                }}
              >
                Cancel
              </button>
              <button
                className="pep-warning-btn"
                style={{ background: "#8E2626" }}
                onClick={confirmAnimalDiedChange}
              >
                {pendingToggleValue ? "Yes, Confirm" : "Yes, Revoke"}
              </button>
            </div>
          </div>
        </div>
      )}
      {showSuccessModal && (
        <div className="pep-warning-overlay" onClick={(e) => e.stopPropagation()}>
          <div className="pep-warning-box" onClick={(e) => e.stopPropagation()}>
            <div className="pep-warning-icon" style={{ fontSize: '48px' }}>🎉</div>
            <h3 className="pep-warning-title">
              {isVaccinationCompleted ? 'Vaccination Completed!' : 'Vaccination Progress Started!'}
            </h3>
            <p className="pep-warning-text" style={{ fontSize: '15px', marginTop: '10px' }}>
              {isVaccinationCompleted 
                ? 'All required doses have been administered. This record will be automatically transferred to the Completed section.'
                : 'The vaccination card has been successfully created and the patient has been moved to the Ongoing section.'}
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}>
              <button 
                className="pep-warning-btn" 
                style={{ background: '#8E2626', minWidth: '120px' }}
                onClick={() => window.location.reload()}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
      {showMissingDosesModal && (
        <div className="pep-warning-overlay" onClick={(e) => e.stopPropagation()}>
          <div className="pep-warning-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div className="pep-warning-icon" style={{ fontSize: '48px' }}>⚠️</div>
            <h3 className="pep-warning-title" style={{ color: '#8E2626' }}>
              Vaccination Schedule Overdue
            </h3>
            <p className="pep-warning-text" style={{ fontSize: '15px', marginTop: '10px', lineHeight: '1.6' }}>
              This patient has missed one or more scheduled doses and is now significantly overdue:
            </p>
            <div style={{ 
              background: '#fff3cd', 
              border: '1px solid #ffc107', 
              borderRadius: '8px', 
              padding: '12px 16px', 
              marginTop: '12px',
              marginBottom: '12px'
            }}>
              {missedDoseDetails.missedDoses.map((missed, index) => (
                <div key={index} style={{ 
                  fontSize: '14px', 
                  color: '#856404',
                  marginBottom: index < missedDoseDetails.missedDoses.length - 1 ? '8px' : '0'
                }}>
                  <strong>{missed.dose}</strong> - Scheduled for {new Date(missed.scheduledDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                  <br />
                  <span style={{ fontSize: '13px' }}>({missed.daysOverdue} days overdue)</span>
                </div>
              ))}
            </div>
            <p className="pep-warning-text" style={{ fontSize: '14px', marginTop: '10px', fontWeight: '600' }}>
              ⚕️ Medical Protocol: The patient needs to restart the vaccination schedule from Day 0.
            </p>
            <p className="pep-warning-text" style={{ fontSize: '13px', marginTop: '8px', color: '#666' }}>
              This record will be transferred to the <strong>Missing</strong> section for follow-up and rescheduling.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}>
              <button 
                className="pep-warning-btn" 
                style={{ background: '#8E2626', minWidth: '140px' }}
                onClick={handleTransferToMissing}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
      {showClearConfirm && (
        <div className="pep-warning-overlay" onClick={() => setShowClearConfirm(false)}>
          <div className="pep-warning-box" onClick={(e) => e.stopPropagation()}>
            <div className="pep-warning-icon">🧹</div>
            <h3 className="pep-warning-title">Clear all local inputs?</h3>
            <p className="pep-warning-text">This only clears the fields on this screen and does not delete any previously saved records.</p>
            <div style={{ display: "flex", gap: "10px", marginTop: "12px", justifyContent: "center" }}>
              <button className="pep-warning-btn" onClick={() => setShowClearConfirm(false)}>
                Cancel
              </button>
              <button className="pep-warning-btn" style={{ background: "#8E2626" }} onClick={clearAllLocalInputs}>
                Clear inputs
              </button>
            </div>
          </div>
        </div>
      )}

      {showCancelConfirm && (
        <div className="pep-warning-overlay" onClick={() => setShowCancelConfirm(false)}>
          <div className="pep-warning-box" onClick={(e) => e.stopPropagation()}>
            <div className="pep-warning-icon">❔</div>
            <h3 className="pep-warning-title">Discard changes?</h3>
            <p className="pep-warning-text">You have unsaved entries on this vaccination card. Canceling will close the form without saving them.</p>
            <div style={{ display: "flex", gap: "10px", marginTop: "12px", justifyContent: "center" }}>
              <button className="pep-warning-btn" onClick={() => setShowCancelConfirm(false)}>
                Keep editing
              </button>
              <button className="pep-warning-btn" style={{ background: "#8E2626" }} onClick={onClose}>
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div className="pep-modal" onClick={(e) => e.stopPropagation()}>
        <header className="pep-header">
          <div className="pep-title">{readOnly ? 'VACCINATION CARD (PEP)' : 'SET DOSE (PEP)'}</div>
          <button className="pep-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>

        {readOnly && (
          <div style={{
            background:
              recordStatus === 'missing'
                ? 'linear-gradient(135deg, #8E2626 0%, #B02A2A 100%)'
                : 'linear-gradient(135deg, #1e5128 0%, #2d6a4f 100%)',
            color: '#fff',
            padding: '16px 24px',
            margin: '0',
            borderBottom:
              recordStatus === 'missing' ? '3px solid #F2A6A6' : '3px solid #52b788',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontSize: '14px',
            fontWeight: '600',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}>
            <span style={{ fontSize: '24px' }}>{recordStatus === 'missing' ? '⚠️' : '✅'}</span>
            <div>
              <div style={{ fontSize: '15px', fontWeight: '700', marginBottom: '4px' }}>
                {recordStatus === 'missing' ? 'Missing Vaccination Record (View-Only)' : 'Completed Vaccination Record'}
              </div>
              <div style={{ fontSize: '13px', fontWeight: '400', opacity: 0.95 }}>
                {recordStatus === 'missing'
                  ? 'This vaccination card is for view-only. The patient must restart the vaccination series from Day 0. No changes can be made on this record.'
                  : 'This record has been marked as completed. All fields are read-only and no further changes can be made.'}
              </div>
            </div>
          </div>
        )}

        <div className="pep-patient-row">
          <div className="pep-patient-name">
            Name: <strong>{patient.lastName && patient.firstName ? `${patient.lastName}, ${patient.firstName}` : patient.name || "—"}</strong>
          </div>
          <div className="pep-date-field">
            Date: <input
              type="date"
              className="pep-input date-input"
              value={form.day0.date}
              onChange={(e) => updateField("day0", "date", e.target.value)}
              disabled={readOnly}
            />
            <button
              className="pep-set-today-btn"
              onClick={() => {
                const today = new Date().toISOString().split('T')[0];
                updateField("day0", "date", today);
              }}
              title="Set to today's date"
              disabled={readOnly}
            >
              Set Today's Date
            </button>
          </div>
        </div>

        <div className="pep-content">
          {page === 0 ? (
            // Page 0: Form
            <>
              {renderDayRow("DAY 0", "day0")}
              {renderDayRow("DAY 3", "day3")}
              {renderDayRow("DAY 7", "day7")}

              <div className="pep-toggle-row">
                <div className="pep-toggle-switch-container">
                  <button
                    className={`pep-toggle-switch ${animalDiedToggle ? 'active' : 'inactive'}`}
                    onClick={handleAnimalDiedChange}
                    aria-pressed={animalDiedToggle}
                    disabled={readOnly}
                    type="button"
                  >
                    <span className="pep-toggle-slider"></span>
                  </button>
                  <span className="pep-toggle-label">
                    Activate if the animal died during observation
                    {animalDiedToggle && <span style={{ color: '#2e7d32', fontWeight: 'bold', marginLeft: '8px' }}>✓ (Confirmed)</span>}
                  </span>
                </div>
              </div>

              {renderDayRow("DAY 14", "day14")}
              {renderDayRow("D 28/30", "d28")}
            </>
          ) : (
            // Page 1: QR Code
            <div className="pep-qr-page">
              <div className="pep-qr-left">
                <p className="pep-qr-instructions">
                  Scan once for live access to your vaccination card.
                </p>
                <div className="pep-next-dose-info">
                  <h4>📅 Next Scheduled Dose</h4>
                  <div className="pep-dose-details">
                    {(() => {
                      // Determine the next incomplete dose
                      const doseOrder = [
                        { key: 'day0', label: 'Day 0' },
                        { key: 'day3', label: 'Day 3' },
                        { key: 'day7', label: 'Day 7' },
                        { key: 'day14', label: 'Day 14' },
                        { key: 'd28', label: 'Day 28' }
                      ];
                      
                      // Find the first incomplete dose (missing any required field)
                      for (const dose of doseOrder) {
                        const doseData = form[dose.key];
                        const isComplete = doseData.date && 
                                          doseData.typeOfVaccine && 
                                          doseData.dose && 
                                          doseData.routeAndSite && 
                                          doseData.administeredBy;
                        
                        // For Day 14 and Day 28, only check if animalDied is true
                        if ((dose.key === 'day14' || dose.key === 'd28') && !animalDiedToggle) {
                          continue;
                        }
                        
                        if (!isComplete) {
                          return (
                            <>
                              <strong>{dose.label}</strong>
                              <span>{doseData.date ? new Date(doseData.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Not scheduled'}</span>
                            </>
                          );
                        }
                      }
                      
                      // All doses completed
                      return (
                        <>
                          <strong>All Doses Completed</strong>
                          <span>Vaccination schedule finished</span>
                        </>
                      );
                    })()}
                  </div>
                </div>
                <p style={{ marginTop: '15px', fontSize: '13px', color: '#666', lineHeight: '1.5' }}>
                  🔄 <strong>Dynamic Record:</strong> Your vaccination card automatically updates as you receive new doses. No need to scan again for future visits.
                </p>
              </div>
              <div className="pep-qr-right">
                {generatedQRCode ? (
                  <div className="pep-qr-container">
                    <img src={generatedQRCode} alt="PEP Vaccination Card QR Code" className="pep-qr-image" />
                  </div>
                ) : (
                  <div className="pep-qr-placeholder">
                    <p style={{ color: '#8E2626', textAlign: 'center', padding: '20px' }}>Generating QR code...</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <footer className="pep-footer">
          <div className="pep-progress">
            <button
              className={`pep-dot ${page === 0 ? 'active' : ''}`}
              onClick={() => setPage(0)}
              aria-label="Go to step 1"
            />
            <button
              className={`pep-dot ${page === 1 ? 'active' : ''}`}
              onClick={() => setPage(1)}
              aria-label="Go to step 2"
            />
          </div>

          <div className="pep-actions">
            {!readOnly && page === 0 && (
              <button className="pep-clear-all action-btn" onClick={() => setShowClearConfirm(true)}>
                Clear inputs
              </button>
            )}
            <button
              className="pep-cancel action-btn"
              onClick={() => {
                if (!readOnly && isFormDirty(form)) {
                  setShowCancelConfirm(true);
                } else {
                  onClose();
                }
              }}
            >
              {readOnly ? 'Close' : 'Cancel'}
            </button>
            {!readOnly && page > 0 && (
              <button className="pep-back action-btn" onClick={handleBack}>
                Back
              </button>
            )}
            {readOnly && page > 0 && (
              <button className="pep-back action-btn" onClick={handleBack}>
                Back
              </button>
            )}
            {!readOnly && (
              <button className="pep-next action-btn" onClick={handleNext}>
                {page === 1 ? "Finish" : "Next"}
              </button>
            )}
            {readOnly && page === 0 && (
              <button className="pep-next action-btn" onClick={() => setPage(1)}>
                View QR Code
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}