import React, { useEffect, useRef, useState } from "react";
import CloseIcon from "../../../images/exit-button.png";
import WatermarkLogo from "../../../images/CITY HEALTH OFFICE LOGO.png";
import DownloadIcon from "../../../images/download.png";
import PrintIcon from "../../../images/printing.png";
import html2pdf from "html2pdf.js";
import html2canvas from "html2canvas";
import "./prescription-modal.css";

const SAVED_SIGNATURE_KEY = "raven-signature";

const SignatureModal = ({ onClose, onSave }) => {
  const canvasRef = useRef(null);
  const isDrawing = useRef(false);
  const lastPoint = useRef({ x: 0, y: 0 });

  const getPosition = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const e = event.touches ? event.touches[0] : event;
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handleStart = (event) => {
    event.preventDefault();
    isDrawing.current = true;
    lastPoint.current = getPosition(event);
  };

  const handleMove = (event) => {
    if (!isDrawing.current) return;
    event.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const { x, y } = getPosition(event);

    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(x, y);
    ctx.stroke();

    lastPoint.current = { x, y };
  };

  const handleEnd = (event) => {
    event && event.preventDefault();
    isDrawing.current = false;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  useEffect(() => {
    clearCanvas();
  }, []);

  const handleSave = () => {
    const canvas = canvasRef.current;
    const dataUrl = canvas.toDataURL("image/png");
    onSave(dataUrl);
  };

  return (
    <div className="signature-overlay" onClick={onClose}>
      <div className="signature-container" onClick={(e) => e.stopPropagation()}>
        <h2 className="signature-title">Draw Physician's Signature</h2>
        <canvas
          ref={canvasRef}
          className="signature-canvas"
          width={500}
          height={200}
          onMouseDown={handleStart}
          onMouseMove={handleMove}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchStart={handleStart}
          onTouchMove={handleMove}
          onTouchEnd={handleEnd}
        />
        <div className="signature-actions">
          <button type="button" className="prescription-btn secondary" onClick={clearCanvas}>
            Clear
          </button>
          <div className="signature-actions-right">
            <button type="button" className="prescription-btn secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="prescription-btn primary" onClick={handleSave}>
              Save Signature
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const PRESCRIPTION_BUCKET_ID =
  process.env.REACT_APP_APPWRITE_PRESCRIPTION_BUCKET_ID ||
  "69704ff6000e3c4f30fb"; // default to known prescription bucket id

const APPWRITE_ENDPOINT_FALLBACK = "https://sgp.cloud.appwrite.io/v1";
const APPWRITE_PROJECT_FALLBACK = "693295e1001e3363b764";

const PrescriptionPreviewModal = ({ patient, prescription, onClose, onBack, onVerify }) => {
  const templateRef = useRef(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSignatureOpen, setIsSignatureOpen] = useState(false);
  const [signatureNotice, setSignatureNotice] = useState("");

  const [localPrescription, setLocalPrescription] = useState(() => prescription || {});

  useEffect(() => {
    setLocalPrescription(prescription || {});
  }, [prescription]);

  const displayName = [patient?.firstName, patient?.middleName, patient?.lastName]
    .filter(Boolean)
    .join(" ") || "N/A";

  const fullAddress = [patient?.purok, patient?.barangay, patient?.city]
    .filter(Boolean)
    .join(", ");

  const today = new Date();
  const formattedDate = today.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const authNumber =
    patient?.patientRecordId ||
    patient?.patientRecordID ||
    patient?.submissionId ||
    patient?.$id ||
    patient?.id ||
    "N/A";

  const safeLastName = (patient?.lastName || "Patient").replace(/\s+/g, "_");

  const generateJpg = async () => {
    if (!templateRef.current) return;
    const element = templateRef.current;
    const filename = `${safeLastName}_Prescription.jpg`;

    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });

      const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Failed to generate prescription JPG:", err);
    }
  };

  const generatePdf = async () => {
    if (!templateRef.current) return;
    const element = templateRef.current;
    const filename = `${safeLastName}_Prescription.pdf`;

    const opt = {
      margin: [15, 15, 15, 15],
      filename,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: {
        scale: 2,
        logging: false,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
      },
      jsPDF: {
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true,
      },
    };

    await html2pdf().set(opt).from(element).save();
  };

  // Generate a high-quality JPG from the template and upload it
  // to the dedicated prescription bucket in Appwrite Storage.
  // Returns the created fileId on success, or null on failure.
  const uploadPrescriptionImageToBucket = async () => {
    if (!templateRef.current) return null;

    // If bucket or endpoint/project are not configured, silently skip upload
    const bucketId = PRESCRIPTION_BUCKET_ID;
    const endpoint = process.env.REACT_APP_APPWRITE_ENDPOINT || APPWRITE_ENDPOINT_FALLBACK;
    const project = process.env.REACT_APP_APPWRITE_PROJECT || APPWRITE_PROJECT_FALLBACK;

    if (!bucketId || !endpoint || !project) {
      console.warn("Prescription upload skipped: missing Appwrite storage configuration");
      return null;
    }

    const element = templateRef.current;

    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });

      const dataUrl = canvas.toDataURL("image/jpeg", 0.95);

      // Convert data URL to Blob in a browser-safe way
      const res = await fetch(dataUrl);
      const blob = await res.blob();

      const filename = `${safeLastName}_Prescription.jpg`;
      const formData = new FormData();

      // Use the authNumber (patientRecordId/submissionId) as fileId when possible
      const candidateId =
        (authNumber && authNumber !== "N/A" && String(authNumber).trim()) || "";
      if (candidateId) {
        formData.append("fileId", String(candidateId));
      }

      formData.append("file", blob, filename);

      const uploadResponse = await fetch(
        `${endpoint}/storage/buckets/${bucketId}/files`,
        {
          method: "POST",
          headers: {
            "X-Appwrite-Project": project,
          },
          body: formData,
        }
      );

      if (!uploadResponse.ok) {
        const text = await uploadResponse.text();
        console.warn(
          "Failed to upload prescription image to Appwrite:",
          uploadResponse.status,
          text
        );
        return null;
      }

      const json = await uploadResponse.json();
      console.log("✅ Prescription image uploaded to Appwrite bucket", bucketId, "fileId=", json.$id);
      return json.$id || null;
    } catch (err) {
      console.error("Error uploading prescription image to bucket:", err);
      return null;
    }
  };

  const handleVerifyClick = async () => {
    if (isVerifying) return;
    setIsVerifying(true);
    try {
      let prescriptionField = null;

      // Try to upload the rendered prescription to Appwrite Storage.
      // This is best-effort and should not block verification if it fails.
      try {
        prescriptionField = await uploadPrescriptionImageToBucket();
      } catch (uploadErr) {
        console.warn("Prescription upload failed but verification will continue:", uploadErr);
      }

      if (typeof onVerify === "function") {
        const payload = {
          ...(localPrescription || {}),
        };

        // Align with Appwrite schema: field name is `prescriptionField` (string)
        if (prescriptionField) {
          payload.prescriptionField = prescriptionField;
        }

        await onVerify(payload);
      }
    } catch (err) {
      console.error("Failed to generate prescription PDF or verify record:", err);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      await generatePdf();
    } catch (err) {
      console.error("Failed to generate prescription PDF:", err);
    } finally {
      setIsDownloading(false);
    }
  };

  const p = localPrescription || {};

  let effectiveSignature = p.physicianSignature || "";
  if (!effectiveSignature && typeof window !== "undefined") {
    try {
      const saved = window.localStorage.getItem(SAVED_SIGNATURE_KEY);
      if (saved) {
        effectiveSignature = saved;
      }
    } catch (err) {
      // ignore storage errors in preview
    }
  }

  const handleSignatureSaved = (dataUrl) => {
    setLocalPrescription((prev) => ({ ...prev, physicianSignature: dataUrl }));
    try {
      window.localStorage.setItem(SAVED_SIGNATURE_KEY, dataUrl);
    } catch (err) {
      console.warn("Unable to persist signature to localStorage:", err);
    }
    setIsSignatureOpen(false);
  };

  const handleUseSavedSignature = () => {
    try {
      const saved = window.localStorage.getItem(SAVED_SIGNATURE_KEY);
      if (saved) {
        setLocalPrescription((prev) => ({ ...prev, physicianSignature: saved }));
        setSignatureNotice("Saved signature has been applied.");
        window.setTimeout(() => setSignatureNotice(""), 2500);
        return;
      }

      // If there's no saved signature, fall back to drawing a new one.
      // Optional: inform the user why the modal opened.
      // eslint-disable-next-line no-alert
      window.alert(
        "No saved signature found. Please create one in Settings or draw a new signature now."
      );
      setIsSignatureOpen(true);
    } catch (err) {
      console.error("Unable to load saved signature:", err);
      setIsSignatureOpen(true);
    }
  };

  return (
    <div className="prescription-overlay" onClick={onClose}>
      <div className="prescription-container" onClick={(e) => e.stopPropagation()}>
        <header className="prescription-header">
          <h1 className="prescription-title">PRESCRIPTION PREVIEW</h1>
          <div className="prescription-header-actions">
            <button
              className="prescription-icon-btn"
              type="button"
              title="Save as JPG"
              onClick={generateJpg}
              disabled={isVerifying || isDownloading}
            >
              <img src={PrintIcon} alt="Save as JPG" />
            </button>
            <button
              className="prescription-icon-btn"
              type="button"
              title="Download PDF"
              onClick={handleDownloadPdf}
              disabled={isVerifying || isDownloading}
            >
              <img src={DownloadIcon} alt="Download PDF" />
            </button>
            <button
              className="prescription-close"
              title="Close"
              aria-label="Close"
              onClick={onClose}
            >
              <img src={CloseIcon} alt="Close" />
            </button>
          </div>
        </header>

        <section className="prescription-body prescription-body-preview">
          <div
            ref={templateRef}
            className="prescription-print-template"
          >
            <img
              src={WatermarkLogo}
              alt="City Health Office watermark"
              className="rx-watermark"
            />
            <div className="rx-header">
              <h1 className="rx-doctor-name">CITY HEALTH OFFICE</h1>
              <div className="rx-specialty">ANIMAL BITE CENTER</div>
            </div>

            <div className="rx-clinic-row">
              <div className="rx-clinic-block">
                <div className="rx-clinic-title">CLINIC:</div>
                <div className="rx-clinic-text">ANIMAL BITE TREATMENT CENTER</div>
                <div className="rx-clinic-text">Mabini St., Corner Ernesto Punsalan St., Magugpo South, Tagum City</div>
                <div className="rx-clinic-text">Contact No.: 0912-293-3855 | 0923-345-8565</div>
              </div>
              <div className="rx-clinic-block rx-clinic-hours">
                <div className="rx-clinic-title">CLINIC HOURS:</div>
                <div className="rx-clinic-text">MON-FRI: 8-10 AM, 1-4 PM</div>
                <div className="rx-clinic-text">SATURDAY: 9-11 AM</div>
              </div>
            </div>

            <div className="rx-divider" />

            <div className="rx-info-lines">
              <div className="rx-info-row">
                <span className="rx-label">Name:</span>
                <span className="rx-line rx-line-wide">{displayName}</span>
                <span className="rx-label">Date:</span>
                <span className="rx-line">{formattedDate}</span>
              </div>
              <div className="rx-info-row">
                <span className="rx-label">Address:</span>
                <span className="rx-line rx-line-wide">{fullAddress || ""}</span>
              </div>
              <div className="rx-info-row">
                <span className="rx-label">Age:</span>
                <span className="rx-line">{patient?.age ?? ""}</span>
                <span className="rx-label">Sex:</span>
                <span className="rx-line">{patient?.sex ?? ""}</span>
                <span className="rx-label">Rx No.:</span>
                <span className="rx-line rx-line-wide">{authNumber}</span>
              </div>
            </div>

            <div className="rx-body-row">
              <div className="rx-symbol">Rx</div>
              <div className="rx-prescription-text">
                <div className="rx-top-block">
                  <p className="rx-line-item"><strong>Category of Exposure:</strong> {p.categoryOfExposure || "N/A"}</p>
                  <p className="rx-line-item"><strong>Plan:</strong> {p.plan || "N/A"}</p>
                  <p className="rx-line-item"><strong>Assessment:</strong> {p.assessmentDiagnosis || "N/A"}</p>
                </div>

                <div className="rx-columns">
                  <div className="rx-column">
                    <p className="rx-section-label">Vaccination</p>
                    <p className="rx-line-item"><strong>Passive Vaccine:</strong> {Array.isArray(p.passiveVaccine) ? p.passiveVaccine.join(", ") : (p.passiveVaccine || "N/A")}</p>
                    <p className="rx-line-item"><strong>No. of Units:</strong> {p.passiveVaccineUnits || "N/A"}</p>
                    <p className="rx-line-item"><strong>Active Vaccine:</strong> {Array.isArray(p.activeVaccine) ? p.activeVaccine.join(", ") : (p.activeVaccine || "N/A")}</p>
                    <p className="rx-line-item"><strong>Others:</strong> {p.activeVaccineOther || "N/A"}</p>
                  </div>

                  <div className="rx-column">
                    <p className="rx-section-label">Medications</p>
                    <p className="rx-line-item"><strong>Antibiotic:</strong> {p.antibioticsText || "N/A"}</p>
                    <p className="rx-line-item"><strong>Anti-inflammatory:</strong> {p.antiInflammatoryMedication || "N/A"}</p>
                    <p className="rx-line-item"><strong>Others:</strong> {p.otherMed || "N/A"}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rx-footer">
              <div className="rx-lic-block">
                <div>Lic. No. ________________________</div>
                <div>PTR No. ________________________</div>
                <div>S2 No. ________________________</div>
              </div>
              <div className="rx-signature-block">
                {effectiveSignature && (
                  <div className="signature-image-wrapper">
                    <img
                      src={effectiveSignature}
                      alt="Physician signature"
                      className="signature-image"
                    />
                  </div>
                )}
                <div className="signature-line">______________________________</div>
                <div className="signature-name">{p.physicianName || "Juan Y. Dela Cruz, M.D."}</div>
                <div className="signature-note">Digitally authorized prescription (e-signature/stamp)</div>
              </div>
            </div>
          </div>
        </section>

        <footer className="prescription-footer">
          {typeof onVerify === "function" && (
            <button
              className="prescription-btn secondary"
              type="button"
              onClick={onBack || onClose}
              disabled={isVerifying}
            >
              Back to Edit
            </button>
          )}
          <div className="prescription-footer-right">
            <button
              className="prescription-btn secondary prescription-signature-btn"
              type="button"
              onClick={handleUseSavedSignature}
              disabled={isVerifying || isDownloading}
            >
              {signatureNotice || "Signature"}
            </button>
            {typeof onVerify === "function" && (
              <button
                className="prescription-btn primary"
                type="button"
                onClick={handleVerifyClick}
                disabled={isVerifying || isDownloading}
              >
                {isVerifying ? "Verifying..." : "Verify"}
              </button>
            )}
          </div>
        </footer>

        {isSignatureOpen && (
          <SignatureModal
            onClose={() => setIsSignatureOpen(false)}
            onSave={handleSignatureSaved}
          />
        )}
      </div>
    </div>
  );
};

export default PrescriptionPreviewModal;
