import React, { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import CloseIcon from "../../../images/exit-button.png";
import EditIcon from "../../../images/edit.png";
import DownloadIcon from "../../../images/download.png";
import PrintIcon from "../../../images/printing.png";
import html2pdf from "html2pdf.js";
import EditPatientModal from "./edit-patient-modal";
import "./new-submitted-form-modal.css";

const DEFAULT_FALLBACK = {
  lastName: "",
  firstName: "",
  middleName: "",
  suffix: "",
  sex: "",
  civilStatus: "",
  age: "",
  dateOfBirth: "",
  contactNumber: "",
  consultationDate: "",
  streetAddress: "",
  barangay: "",
  municipality: "",
  interviewedReferredBy: "",

  animalType: "",
  exposureDate: "",
  exposureTime: "",
  placeOfIncidence: "",
  animalStatus: "",
  typeOfExposure: "",
  animalImmunized: "",
  animalImmunizedDate: "",

  prevAntiRabies: "",
  prevAntiRabiesDate: "",
  historyAllergies: "",

  weight: "",
  height: "",
  bpSystolic: "",
  bpDiastolic: "",
  temp: "",
  woundDescription: "",
  spontaneousBleeding: "",
  inducedBleeding: "",
  localWoundTreatment: "",
  tandok: "",
  appliedGarlic: "",
  tetanustetanusImmunization: "",
  tetanusDateGiven: "",
  HTIG: "",
  htigDateGiven: "",
  siteInvolved: "",
  categoryOfExposure: "",
  assessmentDiagnosis: "",
  plan: "",
  passiveVaccine: "",
  passiveVaccineUnits: "",
  activeVaccine: "",
  activeVaccineOther: "",
  antibioticsText: "",
  antiInflammatoryMedication: "",
  otherMed: "",
  physicianName: "",
  woundImages: [],

  patientRecordId: "",
  submissionId: "",
  visualNotes: new Array(5).fill({ id: null, url: null }),
};

/* InfoInput: display-only (if value empty, renders empty visual box but no text) */
const InfoInput = ({
  label,
  value,
  labelClass,
  wrapperClass,
  inputClass,
  multiline = false,
}) => {
  const content = (value ?? "").toString();
  const wrapper = wrapperClass ? `${wrapperClass}` : "";
  const displayClass = `patient-display-input display-only ${inputClass || ""}`;

  const hasContent = content.trim() !== "";

  return (
    <div className={`patient-display-field ${wrapper}`}>
      {label ? <label className={`patient-display-label ${labelClass || ""}`}>{label}</label> : null}
      {!multiline ? (
        <div className={displayClass} role="textbox" aria-readonly="true" title={hasContent ? content : ""}>
          {hasContent ? <p>{content}</p> : <p className="empty" aria-hidden />}
        </div>
      ) : (
        <div
          className={displayClass}
          role="textbox"
          aria-readonly="true"
          style={{ minHeight: 84, alignItems: "flex-start", paddingTop: 10 }}
          title={hasContent ? content : ""}
        >
          {hasContent ? <p>{content}</p> : <p className="empty" aria-hidden />}
        </div>
      )}
    </div>
  );
};

/* Helper: shallow compare notes by id/url to avoid unnecessary state updates */
function notesEqualByIdUrl(a = [], b = []) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] || {};
    const bi = b[i] || {};
    if (ai.url !== bi.url || ai.id !== bi.id) return false;
  }
  return true;
}

const VisualNotes = ({ notes = [], onOpenImage, appwriteClient, storageBucketId }) => {
  const [resolvedNotes, setResolvedNotes] = React.useState([]);

  useEffect(() => {
    let cancelled = false;

    // Resolve notes -> attach url when possible using Appwrite Storage
    const resolveNotes = async () => {
      if (!notes || notes.length === 0) {
        if (!cancelled && !notesEqualByIdUrl(resolvedNotes, [])) setResolvedNotes([]);
        return;
      }

      console.log("VisualNotes: Input notes:", notes);

      // Check if any note needs resolution
      const needsResolution = notes.some(n => n && !n.url && (n.fileId || n.$id || n.id));
      console.log("VisualNotes: needsResolution:", needsResolution);
      
      if (!needsResolution) {
        // If nothing to resolve, set resolvedNotes only if different
        console.log("VisualNotes: No resolution needed, using notes as-is");
        if (!cancelled) {
          setResolvedNotes((prev) => {
            return notesEqualByIdUrl(prev, notes) ? prev : notes;
          });
        }
        return;
      }

      // Build client/bucket from env if not provided
      let client = appwriteClient;
      let bucketId = storageBucketId || process.env.REACT_APP_APPWRITE_BUCKET_ID || "";
      console.log("VisualNotes: bucketId from env:", bucketId, "storageBucketId:", storageBucketId);
      
      if (!client) {
        try {
          const { Client } = await import("appwrite");
          client = new Client()
            .setEndpoint(process.env.REACT_APP_APPWRITE_ENDPOINT || "")
            .setProject(process.env.REACT_APP_APPWRITE_PROJECT || "");
        } catch (e) {
          console.warn("Unable to construct Appwrite client for Storage", e);
        }
      }
      if (!client || !bucketId) {
        console.warn("VisualNotes: Missing client or bucketId, cannot resolve URLs");
        if (!cancelled) {
          setResolvedNotes((prev) => (notesEqualByIdUrl(prev, notes) ? prev : notes));
        }
        return;
      }

      try {
        const { Storage, Query } = await import("appwrite");
        const storage = new Storage(client);
        console.log("VisualNotes: Storage client created, bucketId:", bucketId);

        // If incoming values look like filenames (e.g., wound_*.jpg), build a quick lookup from bucket
        const needsFilenameLookup = (notes || []).some((n) => {
          const fid = n && (n.fileId || n.$id || n.id);
          return fid && /\.(jpg|jpeg|png|gif|webp)$/i.test(String(fid));
        });

        let fileMapByName = {};
        if (needsFilenameLookup) {
          try {
            // Get first page (default 25). If you expect more, we can paginate later.
            const list = await storage.listFiles(bucketId, [Query.limit(100)]);
            (list.files || list.documents || []).forEach((f) => {
              // SDK returns `files` in newer versions, `documents` in some shapes
              const name = f.name || f.filename || f.key || "";
              const id = f.$id || f.id;
              if (name && id) fileMapByName[name] = id;
            });
          } catch (e) {
            console.warn("Failed to list files for filename lookup", e);
          }
        }

        const mapped = await Promise.all((notes || []).map(async (n) => {
          if (!n) return { id: null, url: null };
          if (n.url) return n;

          let fileId = n.fileId || n.$id || n.id;
          if (!fileId) return { ...n, url: null };

          // Normalize to string and reject obviously invalid IDs (e.g., phrases with spaces)
          const fileIdStr = String(fileId).trim();
          if (!fileIdStr || /\s/.test(fileIdStr)) {
            console.warn("Skipping visual note with invalid file id:", fileIdStr);
            return { ...n, url: null };
          }

          // If the value looks like a filename, try to map to an actual file $id
          const baseName = fileIdStr.split(/[/\\]/).pop();
          if (/\.(jpg|jpeg|png|gif|webp)$/i.test(baseName) && fileMapByName[baseName]) {
            fileId = fileMapByName[baseName];
          }

          try {
            // Get endpoint and project from env (or client if available)
            const endpoint = process.env.REACT_APP_APPWRITE_ENDPOINT || "https://sgp.cloud.appwrite.io/v1";
            const project = process.env.REACT_APP_APPWRITE_PROJECT || "693295e1001e3363b764";
            
            // Construct the file view URL directly
            // For public bucket access (file security disabled), use mode=public
            // For private access with user session, use mode=admin
            const url = `${endpoint}/storage/buckets/${bucketId}/files/${fileIdStr}/view?project=${project}&mode=public`;

            console.log("Constructed image URL for file", fileIdStr, ":", url);
            return { ...n, url };
          } catch (err) {
            console.warn("Failed to resolve file URL for", fileId, err);
            return { ...n, url: null };
          }
        }));

        if (!cancelled) {
          setResolvedNotes((prev) => {
            return notesEqualByIdUrl(prev, mapped) ? prev : mapped;
          });
        }
      } catch (err) {
        console.warn("Failed to load Appwrite Storage to resolve visual notes", err);
        if (!cancelled) setResolvedNotes((prev) => (notesEqualByIdUrl(prev, notes) ? prev : notes));
      }
    };

    resolveNotes();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, appwriteClient, storageBucketId]);

  // Render - section has border and is display-only.
  return (
    <section className="visual-notes-section" aria-labelledby="visual-notes-title">
      <h2 id="visual-notes-title" className="patient-section-title-card visual-title">PERTINENT VISUAL NOTES</h2>

      <div className="visual-grid" role="list" aria-label="Visual notes">
        {(resolvedNotes && resolvedNotes.length > 0 ? resolvedNotes : new Array(8).fill(null)).map((note, idx) => {
          const hasImage = note && note.url;
          if (hasImage) {
            console.log(`Visual slot ${idx + 1} has image:`, note);
          }
          // Use a div instead of button to avoid any "add" behavior; only allow opening if image exists.
          return (
            <div
              key={idx}
              role="listitem"
              className={"visual-slot" + (hasImage ? " visual-slot-filled" : " visual-slot-empty")}
              onClick={(e) => {
                if (hasImage) {
                  e.preventDefault();
                  if (onOpenImage) onOpenImage(note, idx);
                  else window.open(note.url, "_blank");
                }
              }}
              aria-label={hasImage ? `Open image ${idx + 1}` : `Empty visual slot ${idx + 1}`}
              tabIndex={hasImage ? 0 : -1}
            >
              {hasImage ? (
                <img
                  src={note.url}
                  alt={`Visual note ${idx + 1}`}
                  className="visual-slot-img"
                  loading="lazy"
                  onError={(e) => {
                    console.warn(`Failed to load image from ${note.url}:`, e);
                  }}
                  onLoad={(e) => {
                    console.log(`Successfully loaded image from ${note.url}`);
                  }}
                />
              ) : (
                // Empty slot: visually blank box (no "+" button)
                <div className="visual-slot-blank" aria-hidden />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};

const VisualFooter = ({
  submissionId,
  onTerminate,
  onBack,
  onVerify,
  statusOnly,
  status,
  primaryActionLabel,
  onPrimaryAction,
}) => {
  if (statusOnly && status) {
    return (
      <div className="visual-footer">
        <div className="submission-id">
          <label className="submission-label">PATIENT SUBMISSION ID</label>
          <div className="submission-input" role="status" aria-live="polite">{submissionId || "N/A"}</div>
        </div>

        <div className="visual-footer-actions">
          <div className="status-badge" style={{
            backgroundColor: "transparent",
            color: "#8E2626",
            padding: "10px 20px",
            borderRadius: "8px",
            fontWeight: "600",
            fontSize: "16px",
            textAlign: "center"
          }}>
            {status}
          </div>
          <button className="btn btn-back" type="button" onClick={() => { if (typeof onBack === "function") onBack(); }}>Back to Records</button>
        </div>
      </div>
    );
  }

  return (
    <div className="visual-footer">
      <div className="submission-id">
        <label className="submission-label">PATIENT SUBMISSION ID</label>
        <div className="submission-input" role="status" aria-live="polite">{submissionId || "N/A"}</div>
      </div>

      <div className="visual-footer-actions">
        <button className="btn btn-terminate" type="button" onClick={() => { if (typeof onTerminate === "function") onTerminate(); }}>TERMINATE</button>
        <button className="btn btn-back" type="button" onClick={() => { if (typeof onBack === "function") onBack(); }}>Back to Records</button>
        <button
          className="btn btn-verify"
          type="button"
          onClick={() => {
            const handler = typeof onPrimaryAction === "function" ? onPrimaryAction : onVerify;
            if (typeof handler === "function") handler();
          }}
        >
          {primaryActionLabel || "Verify Record"}
        </button>
      </div>
    </div>
  );
};

const PatientDetails = (props) => {
  const {
    patient: patientProp,
    patientId,
    mobileApiBaseUrl,
    mobileAuthToken,
    appwriteClient,
    appwriteDatabaseId,
    appwriteCollectionId,
    onClose,
    onTerminate,
    onBack,
    onVerify,
    onOpenImage,
    onUpdatePatient,
    statusOnly,
    status,
    showTerminationReason,
    terminationReason,
    hidePrescriptionSection,
    primaryActionLabel,
    onPrimaryAction,
    onViewPrescription,
  } = props;

  const [patient, setPatient] = useState(patientProp || DEFAULT_FALLBACK);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const contentRef = useRef(null);

  useEffect(() => {
    if (patientProp) setPatient(patientProp);
  }, [patientProp]);

  useEffect(() => {
    let cancelled = false;
    const fetchPatient = async () => {
      if (!patientId || patientProp) return;
      setLoading(true);
      setError(null);

      const mobileApiBase = (mobileApiBaseUrl
        || process.env.REACT_APP_MOBILE_API_BASE_URL
        || ""
      ).replace(/\/$/, "");

      const tryFetchFromMobile = async () => {
        if (!mobileApiBase) return null;
        const url = `${mobileApiBase}/submissions/${patientId}`;
        const resp = await fetch(url, {
          headers: mobileAuthToken ? { Authorization: `Bearer ${mobileAuthToken}` } : undefined,
        });

        if (!resp.ok) {
          throw new Error(`Mobile API request failed (${resp.status})`);
        }

        return resp.json();
      };

      const tryFetchFromAppwrite = async () => {
        const { Client, Databases } = await import("appwrite");
        const client = appwriteClient || (new Client()
          .setEndpoint(process.env.REACT_APP_APPWRITE_ENDPOINT || "https://sgp.cloud.appwrite.io/v1")
          .setProject(process.env.REACT_APP_APPWRITE_PROJECT || "693295e1001e3363b764")
        );

        const databaseId = appwriteDatabaseId || process.env.REACT_APP_APPWRITE_DATABASE;
        const collectionId = appwriteCollectionId || process.env.REACT_APP_APPWRITE_COLLECTION;
        if (!databaseId || !collectionId) {
          throw new Error("Appwrite databaseId and collectionId must be provided via props or env variables.");
        }

        const databases = new Databases(client);
        return databases.getDocument(databaseId, collectionId, patientId);
      };

      try {
        let data = null;

        // Prefer mobile API (data submitted from the phone app)
        if (mobileApiBase) {
          try {
            data = await tryFetchFromMobile();
          } catch (mobileErr) {
            console.warn("Mobile API fetch failed, will fall back to Appwrite if configured", mobileErr);
            if (!appwriteClient && !appwriteDatabaseId && !appwriteCollectionId
              && !process.env.REACT_APP_APPWRITE_DATABASE) {
              // No Appwrite fallback available, rethrow to show the error in UI
              throw mobileErr;
            }
          }
        }

        // Fallback to Appwrite if mobile fetch is unavailable or fails
        if (!data) {
          data = await tryFetchFromAppwrite();
        }

        if (!data) throw new Error("No patient data returned.");
        console.log("PatientDetails: Loaded patient data:", data);
        if (!cancelled) setPatient({ ...DEFAULT_FALLBACK, ...data });
      } catch (err) {
        console.error("Failed to fetch patient record", err);
        if (!cancelled) setError(err.message || String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchPatient();

    return () => { cancelled = true; };
  }, [patientId, patientProp, mobileApiBaseUrl, mobileAuthToken, appwriteClient, appwriteDatabaseId, appwriteCollectionId]);

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

  // Helper function to format time as HH:MM AM/PM
  const formatTime = (timeString) => {
    if (!timeString) return "";
    try {
      const date = new Date(timeString);
      if (isNaN(date.getTime())) return timeString; // Return original if invalid
      
      let hours = date.getHours();
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12; // Convert to 12-hour format
      
      return `${hours}:${minutes} ${ampm}`;
    } catch (e) {
      return timeString;
    }
  };

  const handleEditClick = () => {
    // Extra safety: only allow editing from the Verified section
    if (status !== "Verified") return;
    setShowEditModal(true);
  };

  const handleCloseEditModal = () => {
    setShowEditModal(false);
  };

  const handleEditSaveSuccess = (updatedData) => {
    setPatient(updatedData);
    setShowEditModal(false);
    // Notify parent component to update the patient in the table
    if (typeof onUpdatePatient === "function") {
      onUpdatePatient(patientId, updatedData);
    }
  };

  const d = patient || DEFAULT_FALLBACK;

  // woundImages or for photo fetching
  const mapWoundImagesToVisualNotes = (woundImagesInput) => {
    console.log("mapWoundImagesToVisualNotes called with:", woundImagesInput);
    
    // Normalize to an array of entries
    let list = [];
    if (!woundImagesInput) {
      list = [];
    } else if (Array.isArray(woundImagesInput)) {
      list = woundImagesInput;
    } else if (typeof woundImagesInput === "string") {
      const trimmed = woundImagesInput.trim();
      list = trimmed ? [trimmed] : [];
    } else if (typeof woundImagesInput === "object") {
      // Some backends might send an object with a single path/id
      // Try common keys before giving up
      const candidate = woundImagesInput.fileId
        || woundImagesInput.$id
        || woundImagesInput.id
        || woundImagesInput.url
        || woundImagesInput.path
        || "";
      list = candidate ? [candidate] : [];
    }

    console.log("mapWoundImagesToVisualNotes normalized list:", list);

    if (list.length === 0) {
      return new Array(5).fill({ id: null, url: null });
    }

    // Map strings to note objects; preserve objects as-is
    const notes = list.map((item) => {
      if (item && typeof item === "object") {
        // Ensure at least one identifier is present; leave url to resolver
        const fileId = item.fileId || item.$id || item.id || item.url || null;
        return { id: fileId, fileId, url: item.url || null };
      }
      const val = String(item);
      return { id: val, fileId: val, url: null };
    });
    
    console.log("mapWoundImagesToVisualNotes final notes:", notes);

    // Ensure exactly 5 slots
    return notes.slice(0, 5).concat(
      new Array(Math.max(0, 5 - notes.length)).fill({ id: null, url: null })
    );
  };

  // PDF Download Handler
  const handleDownloadPDF = () => {
    if (!contentRef.current) return;

    const element = contentRef.current;
    const patientName = `${d.firstName || "Patient"}_${d.lastName || "Record"}`.replace(/\s+/g, "_");
    const timestamp = new Date().toISOString().split("T")[0];
    const filename = `${patientName}_${timestamp}.pdf`;

    const opt = {
      margin: [15, 15, 15, 15],
      filename: filename,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { 
        scale: 2, 
        logging: false,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff"
      },
      jsPDF: { 
        orientation: "portrait", 
        unit: "mm", 
        format: "a4",
        compress: true
      },
      pagebreak: { 
        mode: ["avoid-all", "css", "legacy"],
        before: [".page-break"]
      }
    };

    html2pdf()
      .set(opt)
      .from(element)
      .save()
      .catch(err => console.error("PDF generation failed:", err));
  };

  // Print Handler - use in-page print so full CSS (including @media print)
  // is applied for a formal government-form layout.
  const handlePrint = () => {
    if (!contentRef.current) return;
    window.print();
  };

  return (
    <div className="patient-overlay" onClick={onClose}>
      <div className="patient-container" onClick={(e) => e.stopPropagation()}>
        <div className="patient-header">
          <h1 className="patient-title">PATIENT DETAILS</h1>

          <div className="patient-header-right">
            <div className="patient-actions">
              {statusOnly && status === "Verified" && (
                <button 
                  className="patient-btn-action" 
                  title="Edit Record" 
                  aria-label="Edit Record" 
                  onClick={handleEditClick}
                >
                  <img src={EditIcon} alt="Edit" />
                </button>
              )}
              {statusOnly && status === "Verified" && typeof onViewPrescription === "function" && (
                <button
                  className="patient-btn-action"
                  title="View Prescription"
                  aria-label="View Prescription"
                  onClick={onViewPrescription}
                >
                  Rx
                </button>
              )}
              <button 
                className="patient-btn-action" 
                title="Print Record" 
                aria-label="Print Record" 
                onClick={handlePrint}
              >
                <img src={PrintIcon} alt="Print" />
              </button>
              <button 
                className="patient-btn-action" 
                title="Download PDF" 
                aria-label="Download PDF" 
                onClick={handleDownloadPDF}
              >
                <img src={DownloadIcon} alt="Download PDF" />
              </button>
            </div>

            <button className="patient-close" title="Close" aria-label="Close" onClick={onClose}>
              <img src={CloseIcon} alt="Close" />
            </button>
          </div>
        </div> 

        <div ref={contentRef} className="patient-content-printable">

        {/* On-screen detailed layout */}
        <div className="patient-form-screen">

        <section className="patient-section-info">
          <h2 className="patient-section-title-info">BASIC INFORMATION</h2>
          <div className="patient-info-grid">
            <InfoInput label="LAST NAME" value={d.lastName} />
            <InfoInput label="FIRST NAME" value={d.firstName} />
            <InfoInput label="MIDDLE NAME" value={d.middleName} />
            <InfoInput label="SUFFIX (if applicable)" value={d.suffix} labelClass="suffix" />
            <InfoInput label="SEX" value={d.sex} />
            <InfoInput label="CIVIL STATUS" value={d.civilStatus} />
            <InfoInput label="AGE" value={d.age} />
            <InfoInput label="DATE OF BIRTH" value={formatDate(d.dateOfBirth)} />
            <InfoInput label="CONTACT NUMBER" value={d.contactNumber} />
            <InfoInput label="DATE OF CONSULTATION" value={formatDate(d.consultationDate)} />
            <InfoInput label="STREET ADDRESS" value={d.purok + ", " + d.barangay + ", " + d.city} wrapperClass="span-2" />
            <InfoInput label="BARANGAY" value={d.barangay} />
            <InfoInput label="MUNICIPALITY" value={d.city} />
            <InfoInput label="INTERVIEWED BY/REFERRED BY" value={d.interviewedReferredBy} />
          </div>
        </section>

        <section className="patient-section-card">
          <h2 className="patient-section-title-card">PERTINENT DATA</h2>
          <div className="patient-info-grid">
            <InfoInput label="TYPE OF BITING ANIMAL" value={d.animalType} wrapperClass="col-span-2" />
            <InfoInput label="DATE OF EXPOSURE" value={formatDate(d.exposureDate)} wrapperClass="col-span-2" />
            <InfoInput label="TIME OF EXPOSURE" value={formatTime(d.exposureTime)} wrapperClass="col-span-2" />

            <InfoInput label="PLACE OF INCIDENCE (Purok)" value={d.placeOfIncidence} wrapperClass="col-span-2" />
            <InfoInput label="STATUS OF BITING ANIMAL" value={d.animalStatus} wrapperClass="col-span-2" />
            <InfoInput label="TYPE OF EXPOSURE" value={d.typeOfExposure} wrapperClass="col-span-2" />

            {/* compact label + two small boxes */}
            <div className="label-row-wrapper col-span-6">
              <label className="patient-display-label">Immunization Received by BITING ANIMAL:</label>
              <div className="small-boxes-row">
                <div className="small">
                  <div className="patient-display-input display-only">
                    {d.animalImmunized ? <p>{d.animalImmunized}</p> : <p className="empty" aria-hidden />}
                  </div>
                </div>
                <div className="small">
                  <div className="patient-display-input display-only">
                    {d.animalImmunizedDate ? <p>{formatDate(d.animalImmunizedDate)}</p> : <p className="empty" aria-hidden />}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <h2 className="patient-section-title-card" style={{ marginTop: 18 }}>PERTINENT PAST MEDICAL HISTORY</h2>
          <div className="past-med-section">
            <div className="past-med-row">
              <label className="patient-display-label">PREVIOUS IMM. (ANTI-RABIES) OF PATIENT:</label>

              <div className="small-boxes-row" aria-hidden={false}>
                <div className="small">
                  <div className="patient-display-input display-only">
                    {d.prevAntiRabies ? <p>{d.prevAntiRabies}</p> : <p className="empty" aria-hidden />}
                  </div>
                </div>

                <div className="small">
                  <div className="patient-display-input display-only">
                    {d.prevAntiRabiesDate ? <p>{formatDate(d.prevAntiRabiesDate)}</p> : <p className="empty" aria-hidden />}
                  </div>
                </div>
              </div>
            </div>

            <div className="past-med-row">
              <label className="patient-display-label">HISTORY ALLERGIES OF THE PATIENT:</label>

              <div
                className="patient-display-input display-only allergies"
                role="textbox"
                aria-readonly="true"
                title={d.historyOfAllergies || ""}
              >
                {d.historyOfAllergies ? <p>{d.historyOfAllergies}</p> : <p className="empty" aria-hidden />}
              </div>
            </div>
          </div>
        </section>

        <section className="physical-section">
          <h2 className="patient-section-title-card">PERTINENT PHYSICAL EXAMINATION FINDINGS</h2>

          <div className="physical-grid">
            <InfoInput label="WEIGHT" value={d.weight} wrapperClass="col-span-2" />
            <InfoInput label="HEIGHT" value={d.height} wrapperClass="col-span-2" />
            <div className="patient-display-field bp-group col-span-8">
              <label className="patient-display-label">BLOOD PRESSURE</label>
              <div className="bp-row">
                <div className="bp-item">
                  <div className="patient-display-input"><p>{d.bpSystolic || d.bp || ""}</p></div>
                  <div className="bp-helper">Systolic (mmHg)</div>
                </div>
                <div className="bp-item">
                  <div className="patient-display-input"><p>{d.bpDiastolic || d.bp || ""}</p></div>
                  <div className="bp-helper">Diastolic (mmHg)</div>
                </div>
              </div>
            </div>

            <InfoInput label="TEMPERATURE" value={d.temp} onChange={()=>{}} wrapperClass="col-span-2" />

            {/* Description of wound spans wider to avoid awkward gaps */}
            <InfoInput
              label="DESCRIPTION OF WOUND"
              value={d.woundDescription}
              onChange={()=>{}}
              wrapperClass="col-span-6"
            />

            {/* Make the bleeding fields span 2 columns each so their boxes align vertically with row 1 */}
            <InfoInput
              label="INDUCED BLEEDING?"
              value={d.inducedBleeding}
              onChange={()=>{}}
              wrapperClass="col-span-2 small-input"
            />

            <InfoInput
              label="SPONTANEOUS BLEED?"
              value={d.spontaneousBleeding}
              onChange={()=>{}}
              wrapperClass="col-span-2 small-input"
            />
            <InfoInput label="LOCAL WOUND TREATMENT" value={d.localWoundTreatment} onChange={()=>{}} wrapperClass="col-span-3" />

            <InfoInput label="WASHED WITH WATER ONLY" value={d.washedWaterOnly} onChange={()=>{}} wrapperClass="col-span-3" />

            <InfoInput label="WASHED WITH WATER & SOAP" value={d.washedSoapWater} onChange={()=>{}} wrapperClass="col-span-6 multiline" />

            <InfoInput label="TETANUS IMMUN.?" value={d.tetanusImmunization} wrapperClass="col-span-2" />
            <InfoInput label="DATE GIVEN" value={formatDate(d.tetanusDateGiven)} wrapperClass="col-span-2" />
            <InfoInput label="HTIG" value={d.HTIG} wrapperClass="col-span-2" />
            <InfoInput label="DATE GIVEN" value={formatDate(d.htigDateGiven)} wrapperClass="col-span-2" />
            <InfoInput label="SITE INVOLVED" value={d.siteInvolved} wrapperClass="col-span-12" />
          </div>
        </section>

        {!hidePrescriptionSection && (
          <section className="prescription-summary-section">
            <h2 className="patient-section-title-card">PRESCRIPTION DETAILS</h2>
            <div className="physical-grid prescription-summary-grid">
              <div className="category-exposure">
                <label className="patient-display-label">CATEGORY OF EXPOSURE</label>
                <div className="patient-display-input display-only">
                  {d.categoryOfExposure ? <p>{d.categoryOfExposure}</p> : <p className="empty" aria-hidden />}
                </div>
              </div>

              <div className="assessment">
                <label className="patient-display-label">ASSESSMENT</label>
                <div className="patient-display-input display-only multiline">
                  {d.assessmentDiagnosis ? <p>{d.assessmentDiagnosis}</p> : <p className="empty" aria-hidden />}
                </div>
              </div>

              <div className="plan">
                <label className="patient-display-label">PLAN</label>
                <div className="patient-display-input display-only">
                  {d.plan ? <p>{d.plan}</p> : <p className="empty" aria-hidden />}
                </div>
              </div>

              <InfoInput label="PASSIVE VACCINE" value={d.passiveVaccine} wrapperClass="col-span-2" />
              <InfoInput label="NO. OF UNITS" value={d.passiveVaccineUnits} wrapperClass="col-span-2" />
              <InfoInput label="ACTIVE VACCINE" value={d.activeVaccine} wrapperClass="col-span-2" />
              <InfoInput label="OTHERS" value={d.activeVaccineOther} wrapperClass="col-span-2" />

              <InfoInput label="ANTIBIOTIC" value={d.antibioticsText} wrapperClass="col-span-6" />
              <InfoInput label="ANTI-INFLAMMATORY" value={d.antiInflammatoryMedication} wrapperClass="col-span-4" />
              <InfoInput label="OTHERS" value={d.otherMed} wrapperClass="col-span-2" />

              <InfoInput label="PHYSICIAN'S NAME (IF APPLICABLE)" value={d.physicianName} wrapperClass="col-span-12" />
            </div>
          </section>
        )}

          <VisualNotes notes={mapWoundImagesToVisualNotes(d.woundImages) || d.visualNotes} onOpenImage={(note, idx) => {
          if (note && note.url) window.open(note.url, "_blank");
          if (onOpenImage) onOpenImage(note, idx);
              }} appwriteClient={appwriteClient} storageBucketId={process.env.REACT_APP_APPWRITE_BUCKET_ID} />

                {showTerminationReason ? (
                  <section className="termination-reason-card" aria-labelledby="termination-reason-title">
                    <h2 id="termination-reason-title" className="patient-section-title-card" style={{ marginTop: 12 }}>TERMINATION REASON</h2>
                    <div className="termination-reason-body" role="note">
                      {terminationReason ? terminationReason : "No reason provided."}
                    </div>
                  </section>
                ) : null}

        {loading && <div style={{ marginTop: 12 }}>Loading patient...</div>}
        {error && <div style={{ marginTop: 12, color: "crimson" }}>Error: {error}</div>}
        </div>

        {/* Print-only government form layout matching the official
            Animal Bite Treatment Center Patient Health Record form */}
        <div className="abtc-print-only">
          <div className="abtc-form">
            <header className="abtc-header">
              <div className="abtc-header-left">
                <div>Republic of the Philippines</div>
                <div>Province of Davao del Norte</div>
                <div>City of Tagum</div>
                <div className="abtc-header-office">CITY HEALTH OFFICE</div>
              </div>
              <div className="abtc-header-right">
                <div className="abtc-logo-box">&nbsp;</div>
              </div>
            </header>

            <h1 className="abtc-title">ANIMAL BITE TREATMENT CENTER PATIENT HEALTH RECORD</h1>

            {/* BASIC INFORMATION ROWS */}
            <section className="abtc-section">
              <div className="abtc-row">
                <span className="abtc-label">Name:</span>
                <span className="abtc-line abtc-line-wide">
                  {`${d.lastName || ""}, ${d.firstName || ""} ${d.middleName || ""}`.trim()}
                </span>
                <span className="abtc-label">Age:</span>
                <span className="abtc-line abtc-line-small">{d.age || ""}</span>
                <span className="abtc-label">Date of Birth:</span>
                <span className="abtc-line abtc-line-small">{formatDate(d.dateOfBirth) || ""}</span>
              </div>

              <div className="abtc-row">
                <span className="abtc-label">Sex:</span>
                <span className={"abtc-box " + (d.sex === "Male" ? "checked" : "")}>
                  <span className="abtc-box-inner" /> Male
                </span>
                <span className={"abtc-box " + (d.sex === "Female" ? "checked" : "")}>
                  <span className="abtc-box-inner" /> Female
                </span>
                <span className="abtc-label">Status:</span>
                <span className={"abtc-box " + (d.civilStatus === "Single" ? "checked" : "")}>
                  <span className="abtc-box-inner" /> Single
                </span>
                <span className={"abtc-box " + (d.civilStatus === "Married" ? "checked" : "")}>
                  <span className="abtc-box-inner" /> Married
                </span>
                <span className={"abtc-box " + (d.civilStatus === "Widow" || d.civilStatus === "Widowed" ? "checked" : "")}>
                  <span className="abtc-box-inner" /> Widow
                </span>
              </div>

              <div className="abtc-row">
                <span className="abtc-label">Address:</span>
                <span className="abtc-line abtc-line-wide">
                  {[d.purok, d.barangay, d.city].filter(Boolean).join(", ")}
                </span>
                <span className="abtc-label">Contact No.:</span>
                <span className="abtc-line abtc-line-small">{d.contactNumber || ""}</span>
              </div>

              <div className="abtc-row">
                <span className="abtc-label">Interviewed &amp; Referred by:</span>
                <span className="abtc-line abtc-line-wide">{d.interviewedReferredBy || ""}</span>
                <span className="abtc-label">Date &amp; Time of Consultation:</span>
                <span className="abtc-line abtc-line-small">
                  {formatDate(d.consultationDate) || ""}
                  {d.consultationTime ? ` / ${formatTime(d.consultationTime)}` : ""}
                </span>
              </div>
            </section>

            {/* PERTINENT DATA */}
            <section className="abtc-section">
              <div className="abtc-section-title">PERTINENT DATA</div>

              <div className="abtc-row">
                <span className="abtc-label">Type of Biting Animal:</span>
                <span className="abtc-line abtc-line-wide">{d.animalType || ""}</span>
                <span className="abtc-label">Place of Incidence (Purok):</span>
                <span className="abtc-line abtc-line-small">{d.placeOfIncidence || ""}</span>
              </div>

              <div className="abtc-row">
                <span className="abtc-label">Date of Exposure:</span>
                <span className="abtc-line abtc-line-small">{formatDate(d.exposureDate) || ""}</span>
                <span className="abtc-label">Time of Exposure:</span>
                <span className="abtc-line abtc-line-small">{formatTime(d.exposureTime) || ""}</span>
                <span className="abtc-label">Status of Biting Animal:</span>
                <span className="abtc-line abtc-line-small">{d.animalStatus || ""}</span>
              </div>

              <div className="abtc-row">
                <span className="abtc-label">Type of Exposure:</span>
                <span className="abtc-line abtc-line-wide">{d.typeOfExposure || ""}</span>
              </div>

              <div className="abtc-row">
                <span className="abtc-label">Immunization received by BITING ANIMAL:</span>
                <span className="abtc-line abtc-line-small">{d.animalImmunized || ""}</span>
                <span className="abtc-label">Date:</span>
                <span className="abtc-line abtc-line-small">{formatDate(d.animalImmunizedDate) || ""}</span>
              </div>
            </section>

            {/* PAST MEDICAL HISTORY */}
            <section className="abtc-section">
              <div className="abtc-section-title">PERTINENT PAST MEDICAL HISTORY</div>
              <div className="abtc-row">
                <span className="abtc-label">Previous Immunization (Anti-Rabies) of Patient:</span>
                <span className="abtc-line abtc-line-small">{d.prevAntiRabies || ""}</span>
                <span className="abtc-label">Date:</span>
                <span className="abtc-line abtc-line-small">{formatDate(d.prevAntiRabiesDate) || ""}</span>
              </div>
              <div className="abtc-row abtc-row-multiline">
                <span className="abtc-label">History of Allergies of Patient:</span>
                <span className="abtc-line abtc-line-wide abtc-line-textarea">{d.historyOfAllergies || ""}</span>
              </div>
            </section>

            {/* PHYSICAL EXAMINATION */}
            <section className="abtc-section">
              <div className="abtc-section-title">PERTINENT PHYSICAL EXAMINATION FINDINGS</div>

              <div className="abtc-row">
                <span className="abtc-label">Weight (kg):</span>
                <span className="abtc-line abtc-line-small">{d.weight || ""}</span>
                <span className="abtc-label">Height (cm):</span>
                <span className="abtc-line abtc-line-small">{d.height || ""}</span>
                <span className="abtc-label">BP:</span>
                <span className="abtc-line abtc-line-small">{d.bp || `${d.bpSystolic || ""}/${d.bpDiastolic || ""}`}</span>
                <span className="abtc-label">Temp.:</span>
                <span className="abtc-line abtc-line-small">{d.temp || ""}</span>
              </div>

              <div className="abtc-row abtc-row-multiline">
                <span className="abtc-label">Description of Wound:</span>
                <span className="abtc-line abtc-line-wide abtc-line-textarea">{d.woundDescription || ""}</span>
              </div>

              <div className="abtc-row">
                <span className="abtc-label">Spontaneous Bleeding:</span>
                <span className="abtc-line abtc-line-small">{d.spontaneousBleeding || ""}</span>
                <span className="abtc-label">Induced Bleeding:</span>
                <span className="abtc-line abtc-line-small">{d.inducedBleeding || ""}</span>
              </div>

              <div className="abtc-row">
                <span className="abtc-label">Local Wound Treatment:</span>
                <span className="abtc-line abtc-line-small">{d.localWoundTreatment || ""}</span>
                <span className="abtc-label">Washed w/ Water Only:</span>
                <span className="abtc-line abtc-line-small">{d.washedWaterOnly || ""}</span>
              </div>

              <div className="abtc-row abtc-row-multiline">
                <span className="abtc-label">Washed w/ Soap &amp; Water:</span>
                <span className="abtc-line abtc-line-wide abtc-line-textarea">{d.washedSoapWater || ""}</span>
              </div>

              <div className="abtc-row">
                <span className="abtc-label">Tetanus Immunization:</span>
                <span className="abtc-line abtc-line-small">{d.tetanusImmunization || ""}</span>
                <span className="abtc-label">Date Given:</span>
                <span className="abtc-line abtc-line-small">{formatDate(d.tetanusDateGiven) || ""}</span>
                <span className="abtc-label">HTIG:</span>
                <span className="abtc-line abtc-line-small">{d.HTIG || ""}</span>
                <span className="abtc-label">Date Given:</span>
                <span className="abtc-line abtc-line-small">{formatDate(d.htigDateGiven) || ""}</span>
              </div>

              <div className="abtc-row abtc-row-multiline">
                <span className="abtc-label">Site Involved:</span>
                <span className="abtc-line abtc-line-wide abtc-line-textarea">{d.siteInvolved || ""}</span>
              </div>
            </section>

            {/* CATEGORY OF EXPOSURE, ASSESSMENT, PLAN, TREATMENT */}
            {!hidePrescriptionSection && (
              <section className="abtc-section">
                <div className="abtc-row">
                  <span className="abtc-label">Category of Exposure:</span>
                  <span className="abtc-line abtc-line-small">{d.categoryOfExposure || ""}</span>
                </div>

                <div className="abtc-row abtc-row-multiline">
                  <span className="abtc-label">Assessment:</span>
                  <span className="abtc-line abtc-line-wide abtc-line-textarea">{d.assessmentDiagnosis || ""}</span>
                </div>

                <div className="abtc-row abtc-row-multiline">
                  <span className="abtc-label">Plan:</span>
                  <span className="abtc-line abtc-line-wide abtc-line-textarea">{d.plan || ""}</span>
                </div>

                <div className="abtc-row">
                  <span className="abtc-label">Passive Vaccine (CPEP/ERIG):</span>
                  <span className="abtc-line abtc-line-small">{d.passiveVaccine || ""}</span>
                  <span className="abtc-label">No. of Units:</span>
                  <span className="abtc-line abtc-line-small">{d.passiveVaccineUnits || ""}</span>
                </div>

                <div className="abtc-row">
                  <span className="abtc-label">Active Vaccine (CCV/PVRV/CPV):</span>
                  <span className="abtc-line abtc-line-small">{d.activeVaccine || ""}</span>
                  <span className="abtc-label">Others:</span>
                  <span className="abtc-line abtc-line-small">{d.activeVaccineOther || ""}</span>
                </div>

                <div className="abtc-row">
                  <span className="abtc-label">Antibiotic:</span>
                  <span className="abtc-line abtc-line-small">{d.antibioticsText || ""}</span>
                  <span className="abtc-label">Analgesic/Anti-inflammatory:</span>
                  <span className="abtc-line abtc-line-small">{d.antiInflammatoryMedication || ""}</span>
                  <span className="abtc-label">Others:</span>
                  <span className="abtc-line abtc-line-small">{d.otherMed || ""}</span>
                </div>

                <div className="abtc-row abtc-row-signature">
                  <div className="abtc-signature-block">
                    <div className="abtc-signature-line" />
                    <div className="abtc-signature-label">Physician (Name &amp; Signature)</div>
                    <div className="abtc-signature-name">{d.physicianName || ""}</div>
                  </div>
                </div>
              </section>
            )}

            {showTerminationReason && (
              <section className="abtc-section">
                <div className="abtc-section-title">TERMINATION REASON</div>
                <div className="abtc-row abtc-row-multiline">
                  <span className="abtc-line abtc-line-wide abtc-line-textarea">
                    {terminationReason || "No reason provided."}
                  </span>
                </div>
              </section>
            )}
          </div>
        </div>
        </div>

        <VisualFooter
          submissionId = {d.submissionID || "N/A"}
          onTerminate={() => { if (typeof onTerminate === "function") onTerminate(patientId); }}
          onBack={() => { if (typeof onBack === "function") onBack(); }}
          onVerify={() => { if (typeof onVerify === "function") onVerify(patientId); }}
          primaryActionLabel={primaryActionLabel}
          onPrimaryAction={onPrimaryAction ? () => onPrimaryAction(patientId) : undefined}
          statusOnly={statusOnly}
          status={status}
        />
      </div>

      {showEditModal && createPortal(
        <EditPatientModal
          patient={patient}
          patientId={patientId}
          appwriteDatabaseId={appwriteDatabaseId}
          appwriteCollectionId={appwriteCollectionId}
          onClose={handleCloseEditModal}
          onSaveSuccess={handleEditSaveSuccess}
        />,
        document.body
      )}
    </div>
  );
};

export default PatientDetails;