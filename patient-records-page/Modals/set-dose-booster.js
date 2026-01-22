import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import CryptoJS from "crypto-js";
import Confetti from "react-confetti";
import "./set-dose-booster.css";

// Security: Encryption key for secure QR codes - MUST be defined in .env file
if (!process.env.REACT_APP_QR_ENCRYPTION_KEY) {
  throw new Error(
    "CRITICAL SECURITY ERROR: REACT_APP_QR_ENCRYPTION_KEY is not defined in environment variables. " +
    "Please create a .env file with a secure encryption key."
  );
}

const QR_ENCRYPTION_KEY = process.env.REACT_APP_QR_ENCRYPTION_KEY;

export default function BoosterOverlay({ patient = {}, onClose = () => {}, onSave = () => {}, readOnly = false, recordStatus = "default" }) {
  const [page, setPage] = useState(0); // 0..1 (two pages)
  const [generatedQRCode, setGeneratedQRCode] = useState(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [isVaccinationCompleted, setIsVaccinationCompleted] = useState(false);
  const [form, setForm] = useState({
    day0: { date: "", typeOfVaccine: "", dose: "", routeAndSite: "", administeredBy: "" },
    day3: { date: "", typeOfVaccine: "", dose: "", routeAndSite: "", administeredBy: "" },
  });

  // Load existing vaccination data on mount
  useEffect(() => {
    const loadExistingVaccinationData = async () => {
      const patientRecordId = patient?.patientRecordId;
      if (!patientRecordId) {
        console.log("Booster: No patientRecordId found, starting with empty form");
        return;
      }

      try {
        const { Client, Databases, Query } = await import("appwrite");
        const client = new Client()
          .setEndpoint(process.env.REACT_APP_APPWRITE_ENDPOINT || "https://sgp.cloud.appwrite.io/v1")
          .setProject(process.env.REACT_APP_APPWRITE_PROJECT || "693295e1001e3363b764");

        const databases = new Databases(client);
        const databaseId = process.env.REACT_APP_APPWRITE_DATABASE;
        const vaccinationCollectionId = process.env.REACT_APP_APPWRITE_VACCINATION_COLLECTION || "vaccinationdetails";

        console.log(`🔍 Booster: Loading existing vaccination data for ${patientRecordId}...`);

        const response = await databases.listDocuments(
          databaseId,
          vaccinationCollectionId,
          [Query.equal("patientRecordId", patientRecordId)]
        );

        if (response.documents && response.documents.length > 0) {
          console.log(`✅ Booster: Found ${response.documents.length} existing vaccination records`);
          
          const loadedForm = {
            day0: { date: "", typeOfVaccine: "", dose: "", routeAndSite: "", administeredBy: "" },
            day3: { date: "", typeOfVaccine: "", dose: "", routeAndSite: "", administeredBy: "" },
          };
          
          response.documents.forEach((doc) => {
            const dayKey = doc.dayKey;
            console.log(`Booster: Processing document for ${dayKey}:`, {
              dateOfVaccination: doc.dateOfVaccination,
              typeOfVaccine: doc.typeOfVaccine,
              dose: doc.dose,
              routeAndSite: doc.routeAndSite,
              administeredBy: doc.administeredBy
            });
            
            if (loadedForm[dayKey]) {
              // Convert ISO datetime to YYYY-MM-DD format for date input
              let dateValue = doc.dateOfVaccination || "";
              if (dateValue && dateValue.includes('T')) {
                dateValue = dateValue.split('T')[0]; // Extract just the date part
              }
              
              loadedForm[dayKey] = {
                date: dateValue,
                typeOfVaccine: doc.typeOfVaccine || "",
                dose: doc.dose || "",
                routeAndSite: doc.routeAndSite || "",
                administeredBy: doc.administeredBy || "",
              };
              console.log(`📥 Booster: Loaded ${dayKey}:`, JSON.stringify(loadedForm[dayKey]));
            }
          });

          setForm(loadedForm);
          console.log("✅ Booster: Vaccination data loaded into form", loadedForm);
        } else {
          console.log("Booster: No existing vaccination data found, starting fresh");
        }
      } catch (err) {
        console.error("❌ Booster: Failed to load vaccination data:", err);
      }
    };

    loadExistingVaccinationData();
  }, [patient?.patientRecordId]);

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

  const updateField = (dayKey, field, value) => {
    setForm((f) => {
      const updated = { ...f, [dayKey]: { ...f[dayKey], [field]: value } };
      
      // When Day 0 date is set, automatically calculate and set Day 3 date
      if (dayKey === "day0" && field === "date" && value) {
        const day0Date = new Date(value);
        const day3Date = new Date(day0Date);
        day3Date.setDate(day3Date.getDate() + 3);
        updated.day3 = { ...f.day3, date: day3Date.toISOString().split('T')[0] };
      }
      
      return updated;
    });
  };

  // Generate unique token for each QR code
  const generateUniqueToken = () => {
    return `${patient?.patientRecordId}-BOOSTER-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };

  // Generate encrypted QR code for vaccination card
  const generateBoosterQRCode = async () => {
    try {
      console.log("🔐 Generating BOOSTER QR Code...");
      
      // Minimal data - just enough to identify and validate
      const vaccinationData = {
        patientRecordId: patient?.patientRecordId,
        type: "BOOSTER",
        tokenId: generateUniqueToken(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };

      // Encrypt the data for security
      const jsonString = JSON.stringify(vaccinationData);
      const encryptedData = CryptoJS.AES.encrypt(jsonString, QR_ENCRYPTION_KEY).toString();
      
      // Create a signature to verify data integrity
      const signature = CryptoJS.SHA256(encryptedData).toString();
      
      // Final QR payload: encrypted data + signature with required fields
      const qrPayload = JSON.stringify({
        v: "1",
        data: encryptedData,
        sig: signature,
        key: "RAVEN_SECURE_QR_2025",
      });

      console.log("🔐 Generating SECURE BOOSTER QR with encrypted data (tokenId:", vaccinationData.tokenId, ")");
      console.log("📊 Original data size:", jsonString.length, "bytes");
      console.log("🔒 Encrypted data size:", encryptedData.length, "bytes");
      console.log("📋 Final QR payload structure: v, data, sig, key");

      const qrImage = await QRCode.toDataURL(qrPayload, {
        errorCorrectionLevel: "L",
        type: "image/png",
        quality: 1.0,
        margin: 4,
        width: 500,
      });

      setGeneratedQRCode(qrImage);
      console.log("✅ Secure BOOSTER QR Code generated successfully - secure and compliant");
    } catch (err) {
      console.error("❌ Failed to generate BOOSTER QR code:", err);
    }
  };

  const handleNext = async () => {
    if (page < 1) {
      // Save vaccination data when moving to page 1
      await saveVaccinationData();
      // Then generate QR code after saving is complete
      await generateBoosterQRCode();
      setPage(page + 1);
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
      const client = new Client()
        .setEndpoint(process.env.REACT_APP_APPWRITE_ENDPOINT || "https://sgp.cloud.appwrite.io/v1")
        .setProject(process.env.REACT_APP_APPWRITE_PROJECT || "693295e1001e3363b764");

      const databases = new Databases(client);
      const databaseId = process.env.REACT_APP_APPWRITE_DATABASE;
      const vaccinationCollectionId = process.env.REACT_APP_APPWRITE_VACCINATION_COLLECTION || "vaccinationdetails";
      const patientRecordId = patient?.patientRecordId;

      if (!patientRecordId) {
        console.error("❌ No patientRecordId found");
        return;
      }

      console.log("💾 Saving booster vaccination data for:", patientRecordId);

      // Save or update Day 0 vaccination
      if (form.day0.date) {
        const day0Data = {
          patientRecordId,
          dayKey: "day0",
          dateOfVaccination: form.day0.date,
          typeOfVaccine: form.day0.typeOfVaccine || "",
          dose: form.day0.dose || "",
          routeAndSite: form.day0.routeAndSite || "",
          administeredBy: form.day0.administeredBy || "",
        };

        // Check if record already exists
        const existingDay0 = await databases.listDocuments(
          databaseId,
          vaccinationCollectionId,
          [
            Query.equal("patientRecordId", patientRecordId),
            Query.equal("dayKey", "day0")
          ]
        );

        if (existingDay0.documents.length > 0) {
          // Update existing record
          await databases.updateDocument(
            databaseId,
            vaccinationCollectionId,
            existingDay0.documents[0].$id,
            day0Data
          );
          console.log("✅ Updated Day 0 vaccination record");
        } else {
          // Create new record
          await databases.createDocument(
            databaseId,
            vaccinationCollectionId,
            "unique()",
            day0Data
          );
          console.log("✅ Created Day 0 vaccination record");
        }
      }

      // Save or update Day 3 vaccination (if date is set)
      if (form.day3.date) {
        const day3Data = {
          patientRecordId,
          dayKey: "day3",
          dateOfVaccination: form.day3.date,
          typeOfVaccine: form.day3.typeOfVaccine || "",
          dose: form.day3.dose || "",
          routeAndSite: form.day3.routeAndSite || "",
          administeredBy: form.day3.administeredBy || "",
        };

        // Check if record already exists
        const existingDay3 = await databases.listDocuments(
          databaseId,
          vaccinationCollectionId,
          [
            Query.equal("patientRecordId", patientRecordId),
            Query.equal("dayKey", "day3")
          ]
        );

        if (existingDay3.documents.length > 0) {
          // Update existing record
          await databases.updateDocument(
            databaseId,
            vaccinationCollectionId,
            existingDay3.documents[0].$id,
            day3Data
          );
          console.log("✅ Updated Day 3 vaccination record");
        } else {
          // Create new record
          await databases.createDocument(
            databaseId,
            vaccinationCollectionId,
            "unique()",
            day3Data
          );
          console.log("✅ Created Day 3 vaccination record");
        }
      }

      // Check if both booster doses are completed
      const isDoseComplete = (dayKey) => {
        const dose = form[dayKey];
        return dose.date && dose.typeOfVaccine && dose.dose && dose.routeAndSite && dose.administeredBy;
      };
      
      const allDosesComplete = isDoseComplete('day0') && isDoseComplete('day3');
      
      // Set vaxStatus based on completion
      const newVaxStatus = allDosesComplete ? "completed" : "ongoing";

      // Update patient vaxStatus
      const patientCollectionId = process.env.REACT_APP_APPWRITE_COLLECTION;
      const patientDocumentId = patient?.$id;

      if (patientDocumentId) {
        await databases.updateDocument(
          databaseId,
          patientCollectionId,
          patientDocumentId,
          { vaxStatus: newVaxStatus }
        );
        console.log(`✅ Updated patient vaxStatus to '${newVaxStatus}'`);
      }

      console.log("✅ All booster vaccination data saved successfully");
      
      // Store completion status for modal message (will be shown when Finish is clicked)
      setIsVaccinationCompleted(allDosesComplete);
      
      // Call the parent's onSave callback
      onSave(form);
    } catch (err) {
      console.error("❌ Failed to save booster vaccination data:", err);
      alert("Failed to save vaccination data. Please try again.");
    }
  };

  const handleBack = () => {
    if (page > 0) setPage((p) => p - 1);
  };

  const renderDayRow = (label, dayKey) => {
    // Check if this day should be disabled (only applies to day3)
    let isDisabled = false;
    let disabledMessage = "";
    
    if (dayKey === "day3") {
      const day3Date = form.day3.date;
      if (day3Date) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const scheduledDate = new Date(day3Date);
        scheduledDate.setHours(0, 0, 0, 0);
        
        if (today < scheduledDate) {
          isDisabled = true;
          const options = { year: 'numeric', month: 'long', day: 'numeric' };
          disabledMessage = `This dose will be available on ${scheduledDate.toLocaleDateString('en-US', options)}`;
        }
      } else if (!form.day0.date) {
        isDisabled = true;
        disabledMessage = "Set Day 0 date first to schedule this dose";
      }
    }
    
    return (
      <div className="booster-day-row" key={dayKey}>
        <div className="booster-day-row-content">
          <div className="booster-day-label">{label}</div>
          <div className="booster-row-fields">
            <input
              type="date"
              className={`booster-input date-input ${isDisabled || readOnly ? 'disabled' : ''}`}
              value={form[dayKey].date}
              onChange={(e) => updateField(dayKey, "date", e.target.value)}
              aria-label={`${label} date`}
              disabled={isDisabled || readOnly}
              readOnly={dayKey === "day3" || readOnly}
            />
            <input
              type="text"
              className={`booster-input ${isDisabled || readOnly ? 'disabled' : ''}`}
              placeholder="Type of vaccine"
              value={form[dayKey].typeOfVaccine}
              onChange={(e) => updateField(dayKey, "typeOfVaccine", e.target.value)}
              disabled={isDisabled || readOnly}
            />
            <input
              type="text"
              className={`booster-input ${isDisabled || readOnly ? 'disabled' : ''}`}
              placeholder="Dose"
              value={form[dayKey].dose}
              onChange={(e) => updateField(dayKey, "dose", e.target.value)}
              disabled={isDisabled || readOnly}
            />
            <input
              type="text"
              className={`booster-input ${isDisabled || readOnly ? 'disabled' : ''}`}
              placeholder="Route and site"
              value={form[dayKey].routeAndSite}
              onChange={(e) => updateField(dayKey, "routeAndSite", e.target.value)}
              disabled={isDisabled || readOnly}
            />
            <input
              type="text"
              className={`booster-input ${isDisabled || readOnly ? 'disabled' : ''}`}
              placeholder="Administered by"
              value={form[dayKey].administeredBy}
              onChange={(e) => updateField(dayKey, "administeredBy", e.target.value)}
              disabled={isDisabled || readOnly}
            />
          </div>
        </div>
        {isDisabled && disabledMessage && (
          <div className="booster-disabled-message">
            <span className="booster-lock-icon">🔒</span> {disabledMessage}
          </div>
        )}
      </div>
    );
  }

  const renderPageContent = () => {
    if (page === 0) {
      return (
        <>
          {renderDayRow("DAY 0", "day0")}
          {renderDayRow("DAY 3", "day3")}
        </>
      );
    }

    // page === 1 -> QR scanning / finish
    return (
      <div className="booster-qr-page">
        <div className="booster-qr-left">
          <p className="booster-qr-instructions">
            For record validation, scan your official digital vaccination card using the generated QR Code.
          </p>
          <p style={{ marginTop: '15px', fontSize: '13px', color: '#666', lineHeight: '1.5' }}>
            🔒 <strong>Secure & Encrypted:</strong> This QR code contains encrypted vaccination data that can only be read by authorized RAVEN system scanners.
          </p>
        </div>
        <div className="booster-qr-right">
          {/* Display Generated QR Code */}
          {generatedQRCode ? (
            <div className="booster-qr-container">
              <img src={generatedQRCode} alt="Booster Vaccination Card QR Code" className="booster-qr-image" />
            </div>
          ) : (
            <div className="booster-qr-placeholder">
              <p style={{ color: '#8E2626', textAlign: 'center', padding: '20px' }}>Generating secure QR code...</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="booster-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Booster overlay">
      {showConfetti && (
        <Confetti
          width={window.innerWidth}
          height={window.innerHeight}
          recycle={false}
          numberOfPieces={500}
        />
      )}
      {showSuccessModal && (
        <div className="booster-warning-overlay" onClick={(e) => e.stopPropagation()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999999 }}>
          <div className="booster-warning-box" onClick={(e) => e.stopPropagation()} style={{ background: '#fff', padding: '30px', borderRadius: '12px', textAlign: 'center', maxWidth: '400px', boxShadow: '0 10px 40px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize: '48px', marginBottom: '15px' }}>🎉</div>
            <h3 style={{ color: '#8E2626', fontSize: '22px', fontWeight: 700, margin: '0 0 10px 0' }}>
              {isVaccinationCompleted ? 'Vaccination Completed!' : 'Vaccination Progress Started!'}
            </h3>
            <p style={{ fontSize: '15px', color: '#666', lineHeight: '1.6', margin: 0 }}>
              {isVaccinationCompleted 
                ? 'All required doses have been administered. This record will be automatically transferred to the Completed section.'
                : 'The vaccination card has been successfully created and the patient has been moved to the Ongoing section.'}
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}>
              <button 
                style={{ background: '#8E2626', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', minWidth: '120px' }}
                onClick={() => window.location.reload()}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="booster-modal" onClick={(e) => e.stopPropagation()}>
        <header className="booster-header">
          <div className="booster-title">{readOnly ? 'VACCINATION CARD (BOOSTER)' : 'SET DOSE (BOOSTER)'}</div>
          <button className="booster-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>

        {readOnly && recordStatus === "missing" && (
          <div style={{
            background: 'linear-gradient(135deg, #1e5128 0%, #2d6a4f 100%)',
            color: '#fff',
            padding: '12px 20px',
            margin: '0',
            borderBottom: '3px solid #52b788',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '13px',
            fontWeight: '600',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}>
            <span style={{ fontSize: '20px' }}>✅</span>
            <div>
              <div style={{ fontSize: '14px', fontWeight: '700', marginBottom: '2px' }}>Missing Vaccination Record (View-Only)</div>
              <div style={{ fontSize: '12px', fontWeight: '400', opacity: 0.95 }}>This vaccination card is for view-only. The patient must restart the booster schedule from Day 0.</div>
            </div>
          </div>
        )}

        <div className="booster-patient-row">
          <div className="booster-patient-name">
            Name: <strong>
              {patient.name || 
               (patient.lastName && patient.firstName 
                 ? `${patient.lastName}, ${patient.firstName}` 
                 : "—")}
            </strong>
          </div>
          <div className="booster-date-field">
            Date: <input
              type="date"
              className="booster-input date-input"
              value={form.day0.date}
              onChange={(e) => updateField("day0", "date", e.target.value)}
              disabled={readOnly}
            />
            <button
              type="button"
              className="booster-today-btn"
              onClick={() => updateField("day0", "date", new Date().toISOString().split('T')[0])}
              disabled={readOnly}
              title="Set to today"
            >
              Set Today's Date
            </button>
          </div>
        </div>

        <div className="booster-content">{renderPageContent()}</div>

        <footer className="booster-footer">
          <div className="booster-progress">
            <button
              className={`booster-dot ${page === 0 ? "active" : ""}`}
              onClick={() => setPage(0)}
              aria-label="Go to step 1"
            />
            <button
              className={`booster-dot ${page === 1 ? "active" : ""}`}
              onClick={() => setPage(1)}
              aria-label="Go to step 2"
            />
          </div>

          <div className="booster-actions">
            <button className="booster-cancel action-btn" onClick={onClose}>
              {readOnly ? 'Close' : 'Cancel'}
            </button>
            {!readOnly && page > 0 && (
              <button className="booster-back action-btn" onClick={handleBack}>
                Back
              </button>
            )}
            {!readOnly && (
              <button className="booster-next action-btn" onClick={handleNext}>
                {page === 1 ? "Finish" : "Next"}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}