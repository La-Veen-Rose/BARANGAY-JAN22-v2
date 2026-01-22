import React, { useEffect, useState } from "react";
import CloseIcon from "../../../images/exit-button.png";
import "./prescription-modal.css";

const PrescriptionModal = ({ patient, onClose, onBack, onSubmit }) => {
  const initial = patient || {};
  const [formData, setFormData] = useState({
    categoryOfExposure: initial.categoryOfExposure || "",
    assessmentDiagnosis: initial.assessmentDiagnosis || "",
    plan: Array.isArray(initial.plan) ? (initial.plan[0] || "") : (initial.plan || ""),
    passiveVaccineERIG: initial.passiveVaccineERIG || false,
    passiveVaccineHRIG: initial.passiveVaccineHRIG || false,
    passiveVaccineUnits: initial.passiveVaccineUnits || "",
    activeVaccinePVRV: initial.activeVaccinePVRV || false,
    activeVaccinePCECV: initial.activeVaccinePCECV || false,
    activeVaccineOther: initial.activeVaccineOther || "",
    antibioticsText: initial.antibioticsText || "",
    antiInflammatoryMedication: initial.antiInflammatoryMedication || "",
    otherMed: initial.otherMed || "",
    physicianName: initial.physicianName || "",
    physicianSignature: initial.physicianSignature || "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSignatureOpen] = useState(false); // legacy state no longer used, kept for stability

  // Automatically populate physician's name from the currently logged-in user
  // stored in localStorage under the "user" key (set during login).
  useEffect(() => {
    try {
      const storedUser = window.localStorage.getItem("user");
      if (!storedUser) return;

      const user = JSON.parse(storedUser);
      const userName = (user?.name || "").toString().toUpperCase();

      if (!userName) return;

      setFormData((prev) => {
        // Do not override if a physician name is already present (e.g., editing).
        if (prev.physicianName && prev.physicianName.trim() !== "") {
          return prev;
        }
        return { ...prev, physicianName: userName };
      });
    } catch (err) {
      console.warn("Unable to auto-fill physician name from localStorage user:", err);
    }
  }, []);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleCheckboxChange = (field) => {
    setFormData((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const handleNext = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (typeof onSubmit === "function") {
        await onSubmit(formData);
      }
    } catch (err) {
      console.error("Failed to complete prescription flow:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayName = [patient?.firstName, patient?.middleName, patient?.lastName]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="prescription-overlay" onClick={onClose}>
      <div className="prescription-container" onClick={(e) => e.stopPropagation()}>
        <header className="prescription-header">
          <h1 className="prescription-title">PRESCRIPTION DETAILS</h1>
          <button
            className="prescription-close"
            title="Close"
            aria-label="Close"
            onClick={onClose}
          >
            <img src={CloseIcon} alt="Close" />
          </button>
        </header>

        <section className="prescription-body">
          <div className="prescription-row two-cols">
            <div className="prescription-field">
              <label className="prescription-label">CATEGORY OF EXPOSURE</label>
              <select
                className="prescription-input"
                value={formData.categoryOfExposure}
                onChange={(e) => handleChange("categoryOfExposure", e.target.value)}
              >
                <option value="">Select category</option>
                <option value="I">I</option>
                <option value="II">II</option>
                <option value="III">III</option>
              </select>
            </div>

            <div className="prescription-field">
              <label className="prescription-label">PLAN</label>
              <select
                className="prescription-input"
                value={formData.plan}
                onChange={(e) => handleChange("plan", e.target.value)}
              >
                <option value="">Select plan</option>
                <option value="PREP">PREP</option>
                <option value="PEP">PEP</option>
                <option value="BOOSTER">BOOSTER</option>
              </select>
            </div>
          </div>

          <div className="prescription-row">
            <div className="prescription-field full">
              <label className="prescription-label">ASSESSMENT</label>
              <textarea
                className="prescription-input multiline"
                value={formData.assessmentDiagnosis}
                onChange={(e) => handleChange("assessmentDiagnosis", e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <div className="prescription-row vaccine-section">
            <div className="prescription-field vaccine-group">
              <label className="prescription-label">PASSIVE VACCINE</label>
              <div className="checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.passiveVaccineERIG}
                    onChange={() => handleCheckboxChange("passiveVaccineERIG")}
                  />
                  <span>ERIG</span>
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.passiveVaccineHRIG}
                    onChange={() => handleCheckboxChange("passiveVaccineHRIG")}
                  />
                  <span>HRIG</span>
                </label>
              </div>
            </div>
            <div className="prescription-field">
              <label className="prescription-label">NO. OF UNITS</label>
              <input
                className="prescription-input"
                value={formData.passiveVaccineUnits}
                onChange={(e) => handleChange("passiveVaccineUnits", e.target.value)}
              />
            </div>
          </div>

          <div className="prescription-row vaccine-section">
            <div className="prescription-field vaccine-group">
              <label className="prescription-label">ACTIVE VACCINE</label>
              <div className="checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.activeVaccinePVRV}
                    onChange={() => handleCheckboxChange("activeVaccinePVRV")}
                  />
                  <span>PVRV</span>
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.activeVaccinePCECV}
                    onChange={() => handleCheckboxChange("activeVaccinePCECV")}
                  />
                  <span>PCECV</span>
                </label>
              </div>
            </div>
            <div className="prescription-field">
              <label className="prescription-label">OTHERS</label>
              <input
                className="prescription-input"
                value={formData.activeVaccineOther}
                onChange={(e) => handleChange("activeVaccineOther", e.target.value)}
              />
            </div>
          </div>

          <div className="prescription-row three-cols">
            <div className="prescription-field">
              <label className="prescription-label">ANTIBIOTIC</label>
              <textarea
                className="prescription-input multiline"
                value={formData.antibioticsText}
                onChange={(e) => handleChange("antibioticsText", e.target.value)}
                rows={2}
              />
            </div>
            <div className="prescription-field">
              <label className="prescription-label">ANTI-INFLAMMATORY</label>
              <textarea
                className="prescription-input multiline"
                value={formData.antiInflammatoryMedication}
                onChange={(e) => handleChange("antiInflammatoryMedication", e.target.value)}
                rows={2}
              />
            </div>
            <div className="prescription-field">
              <label className="prescription-label">OTHERS</label>
              <textarea
                className="prescription-input multiline"
                value={formData.otherMed}
                onChange={(e) => handleChange("otherMed", e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <div className="prescription-row">
            <div className="prescription-field full">
              <label className="prescription-label">PHYSICIAN'S NAME (IF APPLICABLE)</label>
              <input
                className="prescription-input prescription-signature-input"
                value={formData.physicianName}
                onChange={(e) => handleChange("physicianName", e.target.value)}
              />
            </div>
          </div>
        </section>

        <footer className="prescription-footer">
          <button
            className="prescription-btn secondary"
            type="button"
            onClick={onBack || onClose}
            disabled={isSubmitting}
          >
            Back to Details
          </button>
          <button
            className="prescription-btn primary"
            type="button"
            onClick={handleNext}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Generating..." : "Next"}
          </button>
        </footer>

      </div>
    </div>
  );
};

export default PrescriptionModal;