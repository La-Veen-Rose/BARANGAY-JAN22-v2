import React, { useEffect, useState } from "react";
import ConfirmationModal from "./confirmation-modal";
import AlertModal from "./alert-modal";
import CloseIcon from "../../../images/exit-button.png";
import { logAuditEvent } from "../../../utils/auditLogger";
import "./edit-patient-modal.css";

const EditableInput = ({
  label,
  value,
  onChange,
  type = "text",
  placeholder = "",
  multiline = false,
  wrapperClass = "",
  inputClass = "",
  disabled = false,
}) => {
  const content = (value ?? "").toString();
  const wrapper = wrapperClass ? `${wrapperClass}` : "";
  const inputCls = `edit-patient-input ${inputClass || ""}`;

  return (
    <div className={`edit-patient-field ${wrapper}`}>
      {label ? <label className="edit-patient-label">{label}</label> : null}
      {!multiline ? (
        <input
          type={type}
          className={inputCls}
          value={content}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
      ) : (
        <textarea
          className={`${inputCls} multiline`}
          value={content}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          rows={4}
        />
      )}
    </div>
  );
};

const EditPatientModal = ({
  patient,
  patientId,
  appwriteDatabaseId,
  appwriteCollectionId,
  onClose,
  onSaveSuccess,
}) => {
  const [formData, setFormData] = useState(patient || {});
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [showErrorAlert, setShowErrorAlert] = useState(false);

  const calculateAgeFromDob = (dob) => {
    if (!dob) return "";
    const date = new Date(dob);
    if (Number.isNaN(date.getTime())) return "";
    const today = new Date();
    let age = today.getFullYear() - date.getFullYear();
    const m = today.getMonth() - date.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < date.getDate())) {
      age--;
    }
    return age >= 0 ? String(age) : "";
  };

  const formatPhilippineNumber = (input) => {
    const digits = (input || "").replace(/\D/g, "");
    if (!digits) return "";

    if (digits.startsWith("63")) {
      return "63" + digits.slice(2, 12);
    }

    if (digits.startsWith("0")) {
      return "63" + digits.slice(1, 11);
    }

    if (digits.startsWith("9")) {
      return "63" + digits.slice(0, 10);
    }

    return digits.length > 12 ? digits.slice(0, 12) : digits;
  };

  const handleSetToday = (field) => {
    const today = new Date();
    const isoDate = today.toISOString().split("T")[0];
    handleFieldChange(field, isoDate);
  };

  const handleSetNowTime = (field) => {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    handleFieldChange(field, `${hours}:${minutes}`);
  };

  // Normalize "plan" for form usage: backend stores it as an array
  // but the UI works with a single selected value.
  const normalizePlanForForm = (rawPlan) => {
    if (Array.isArray(rawPlan)) {
      return rawPlan[0] || "";
    }
    if (rawPlan == null) return "";
    return String(rawPlan);
  };

  useEffect(() => {
    if (patient) {
      const formattedContact = formatPhilippineNumber(patient.contactNumber || "");
      const calculatedAge = calculateAgeFromDob(patient.dateOfBirth);
      setFormData({
        ...patient,
        contactNumber: formattedContact,
        age: calculatedAge ?? patient.age,
        plan: normalizePlanForForm(patient.plan),
      });
    }
  }, [patient]);

  const handleFieldChange = (field, value) => {
    setFormData((prev) => {
      let nextValue = value;

      if (field === "contactNumber") {
        nextValue = formatPhilippineNumber(value);
      } else if (typeof nextValue === "string") {
        nextValue = nextValue.toUpperCase();
      }

      const updated = {
        ...prev,
        [field]: nextValue,
      };

      if (field === "dateOfBirth") {
        updated.age = calculateAgeFromDob(value) ?? "";
      }

      return updated;
    });
  };


  const handleSaveClick = () => {
    setShowConfirmation(true);
  };

  const handleConfirmSave = async () => {
    setShowConfirmation(false);
    setIsSaving(true);
    setSaveError(null);

    try {
      const { Client, Databases } = await import("appwrite");
      const client = new Client()
        .setEndpoint(process.env.REACT_APP_APPWRITE_ENDPOINT || "https://sgp.cloud.appwrite.io/v1")
        .setProject(process.env.REACT_APP_APPWRITE_PROJECT || "693295e1001e3363b764");

      const databases = new Databases(client);
      const databaseId = appwriteDatabaseId || process.env.REACT_APP_APPWRITE_DATABASE;
      const collectionId = appwriteCollectionId || process.env.REACT_APP_APPWRITE_COLLECTION;

      // Prepare update data - remove system fields that shouldn't be updated
      const updateData = { ...formData };
      delete updateData.$id;
      delete updateData.$createdAt;
      delete updateData.$updatedAt;
      delete updateData.$permissions;
      delete updateData.visualNotes; // Don't update visual notes through this modal

      // Ensure "age" matches Appwrite's integer attribute requirement
      if (Object.prototype.hasOwnProperty.call(updateData, "age")) {
        const parsedAge = parseInt(updateData.age, 10);
        if (Number.isNaN(parsedAge)) {
          // If age cannot be parsed as an integer, omit it from the update
          delete updateData.age;
        } else {
          updateData.age = parsedAge;
        }
      }

      // Ensure woundDescription conforms to Appwrite's array attribute requirement
      if (Object.prototype.hasOwnProperty.call(updateData, "woundDescription")) {
        const raw = updateData.woundDescription;
        if (Array.isArray(raw)) {
          updateData.woundDescription = raw;
        } else if (raw == null || String(raw).trim() === "") {
          // Treat empty as an empty array
          updateData.woundDescription = [];
        } else {
          // Store the single description as a one-element array
          updateData.woundDescription = [String(raw)];
        }
      }

      // Ensure "plan" conforms to Appwrite's array attribute requirement
      if (Object.prototype.hasOwnProperty.call(updateData, "plan")) {
        const rawPlan = updateData.plan;
        if (Array.isArray(rawPlan)) {
          updateData.plan = rawPlan;
        } else if (rawPlan == null || String(rawPlan).trim() === "") {
          // Treat empty as an empty array
          updateData.plan = [];
        } else {
          // Store the single selected plan value as a one-element array
          updateData.plan = [String(rawPlan).trim()];
        }
      }

      // Strip deprecated fields removed from Appwrite schema
      delete updateData.passiveVaccine;
      delete updateData.passiveVaccineUnits;
      delete updateData.activeVaccine;
      delete updateData.activeVaccineOther;
      delete updateData.antibioticsText;
      delete updateData.antiInflammatoryMedication;

      await databases.updateDocument(
        databaseId,
        collectionId,
        patientId,
        updateData
      );

      // Re-fetch the saved document so the parent/view
      // always receives the latest values exactly as
      // stored in Appwrite (including any server-side
      // normalization or default fields).
      let refreshed = formData;
      try {
        refreshed = await databases.getDocument(databaseId, collectionId, patientId);
      } catch (fetchErr) {
        console.warn("EditPatientModal: failed to refetch updated document; falling back to local formData", fetchErr);
      }

      if (typeof onSaveSuccess === "function") {
        onSaveSuccess(refreshed);
      }

      // Log audit entry for this update (non-blocking)
      logAuditEvent({
        action: "update_patient_record",
        recordId: patientId,
        recordType: "PatientRecord",
        collectionId,
        description: "Patient record updated via Edit Patient modal",
      });

      onClose();
    } catch (err) {
      console.error("Failed to save patient record:", err);
      setSaveError(err.message || "Failed to save patient record");
      setShowErrorAlert(true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelConfirmation = () => {
    setShowConfirmation(false);
  };

  // Fields that should not be editable (pertinent visual notes and system fields)
  // (Reserved for future use if additional field restrictions are needed)

  return (
    <>
      <div className="edit-patient-overlay" onClick={onClose}>
        <div className="edit-patient-container" onClick={(e) => e.stopPropagation()}>
          <div className="edit-patient-header">
            <h1 className="edit-patient-title">EDIT PATIENT DETAILS</h1>
            <button
              className="edit-patient-close"
              title="Close"
              aria-label="Close"
              onClick={onClose}
            >
              <img src={CloseIcon} alt="Close" />
            </button>
          </div>

          <div className="edit-patient-content">
            {/* BASIC INFORMATION SECTION */}
            <section className="edit-patient-section">
              <h2 className="edit-patient-section-title">BASIC INFORMATION</h2>
              <div className="edit-patient-grid">
                <EditableInput
                  label="LAST NAME"
                  value={formData.lastName || ""}
                  onChange={(val) => handleFieldChange("lastName", val)}
                />
                <EditableInput
                  label="FIRST NAME"
                  value={formData.firstName || ""}
                  onChange={(val) => handleFieldChange("firstName", val)}
                />
                <EditableInput
                  label="MIDDLE NAME"
                  value={formData.middleName || ""}
                  onChange={(val) => handleFieldChange("middleName", val)}
                />
                <EditableInput
                  label="SUFFIX (IF APPLICABLE)"
                  value={formData.suffix || ""}
                  onChange={(val) => handleFieldChange("suffix", val)}
                  wrapperClass="suffix"
                />
                <EditableInput
                  label="SEX"
                  value={formData.sex || ""}
                  onChange={(val) => handleFieldChange("sex", val)}
                />
                <EditableInput
                  label="CIVIL STATUS"
                  value={formData.civilStatus || ""}
                  onChange={(val) => handleFieldChange("civilStatus", val)}
                />
                <EditableInput
                  label="DATE OF BIRTH"
                  value={formData.dateOfBirth ? formData.dateOfBirth.split("T")[0] : ""}
                  onChange={(val) => handleFieldChange("dateOfBirth", val)}
                  type="date"
                />
                <EditableInput
                  label="AGE"
                  value={formData.age || ""}
                  onChange={(val) => handleFieldChange("age", val)}
                  type="number"
                  disabled
                />
                <EditableInput
                  label="CONTACT NUMBER"
                  value={formData.contactNumber || ""}
                  onChange={(val) => handleFieldChange("contactNumber", val)}
                />
                
                <div className="edit-patient-field col-span-2">
                  <label className="edit-patient-label">DATE OF CONSULTATION</label>
                  <div className="input-with-action">
                    <input
                      type="date"
                      className="edit-patient-input"
                      value={formData.consultationDate ? formData.consultationDate.split("T")[0] : ""}
                      onChange={(e) => handleFieldChange("consultationDate", e.target.value)}
                    />
                    <button type="button" className="inline-action-btn" onClick={() => handleSetToday("consultationDate")}>
                      SET TODAY
                    </button>
                  </div>
                </div>
                <EditableInput
                  label="BARANGAY"
                  value={formData.barangay || ""}
                  onChange={(val) => handleFieldChange("barangay", val)}
                  disabled={true}
                  wrapperClass="col-span-2"
                />
                <EditableInput
                  label="MUNICIPALITY"
                  value={formData.city || ""}
                  onChange={(val) => handleFieldChange("city", val)}
                  disabled={true}
                  wrapperClass="col-span-2"
                />
                <EditableInput
                  label="STREET ADDRESS"
                  value={formData.purok || ""}
                  onChange={(val) => handleFieldChange("purok", val)}
                  wrapperClass="col-span-6"
                />
                <EditableInput
                  label="INTERVIEWED BY/REFERRED BY"
                  value={formData.interviewedReferredBy || ""}
                  onChange={(val) => handleFieldChange("interviewedReferredBy", val)}
                  disabled={true}
                />
              </div>
            </section>

            {/* PERTINENT DATA SECTION */}
            <section className="edit-patient-section">
              <h2 className="edit-patient-section-title">PERTINENT DATA</h2>
              <div className="edit-patient-grid">
                <EditableInput
                  label="TYPE OF BITING ANIMAL"
                  value={formData.animalType || ""}
                  onChange={(val) => handleFieldChange("animalType", val)}
                  wrapperClass="col-span-2"
                />
                <div className="edit-patient-field col-span-2">
                  <label className="edit-patient-label">DATE OF EXPOSURE</label>
                  <div className="input-with-action">
                    <input
                      type="date"
                      className="edit-patient-input"
                      value={formData.exposureDate ? formData.exposureDate.split("T")[0] : ""}
                      onChange={(e) => handleFieldChange("exposureDate", e.target.value)}
                    />
                    <button type="button" className="inline-action-btn" onClick={() => handleSetToday("exposureDate")}>
                      SET TODAY
                    </button>
                  </div>
                </div>
                <div className="edit-patient-field col-span-2">
                  <label className="edit-patient-label">TIME OF EXPOSURE</label>
                  <div className="input-with-action">
                    <input
                      type="time"
                      className="edit-patient-input"
                      value={formData.exposureTime || ""}
                      onChange={(e) => handleFieldChange("exposureTime", e.target.value)}
                    />
                    <button type="button" className="inline-action-btn" onClick={() => handleSetNowTime("exposureTime")}>
                      SET NOW
                    </button>
                  </div>
                </div>
                <EditableInput
                  label="PLACE OF INCIDENCE (Purok)"
                  value={formData.placeOfIncidence || ""}
                  onChange={(val) => handleFieldChange("placeOfIncidence", val)}
                  wrapperClass="col-span-2"
                />
                <EditableInput
                  label="STATUS OF BITING ANIMAL"
                  value={formData.animalStatus || ""}
                  onChange={(val) => handleFieldChange("animalStatus", val)}
                  wrapperClass="col-span-2"
                />
                <EditableInput
                  label="TYPE OF EXPOSURE"
                  value={formData.typeOfExposure || ""}
                  onChange={(val) => handleFieldChange("typeOfExposure", val)}
                  wrapperClass="col-span-2"
                />
                <EditableInput
                  label="ANIMAL IMMUNIZED?"
                  value={formData.animalImmunized || ""}
                  onChange={(val) => handleFieldChange("animalImmunized", val)}
                />
                <EditableInput
                  label="ANIMAL IMMUNIZED DATE"
                  value={formData.animalImmunizedDate ? formData.animalImmunizedDate.split("T")[0] : ""}
                  onChange={(val) => handleFieldChange("animalImmunizedDate", val)}
                  type="date"
                />
              </div>
            </section>

            {/* PERTINENT PAST MEDICAL HISTORY */}
            <section className="edit-patient-section">
              <h2 className="edit-patient-section-title">PERTINENT PAST MEDICAL HISTORY</h2>
              <div className="edit-patient-grid">
                <EditableInput
                  label="PREVIOUS IMM. (ANTI-RABIES)"
                  value={formData.prevAntiRabies || ""}
                  onChange={(val) => handleFieldChange("prevAntiRabies", val)}
                />
                <EditableInput
                  label="DATE GIVEN"
                  value={formData.prevAntiRabiesDate ? formData.prevAntiRabiesDate.split("T")[0] : ""}
                  onChange={(val) => handleFieldChange("prevAntiRabiesDate", val)}
                  type="date"
                />
                <EditableInput
                  label="HISTORY OF ALLERGIES"
                  value={formData.historyOfAllergies || ""}
                  onChange={(val) => handleFieldChange("historyOfAllergies", val)}
                  multiline
                  wrapperClass="col-span-2"
                />
              </div>
            </section>

            {/* PERTINENT PHYSICAL EXAMINATION FINDINGS */}
            <section className="edit-patient-section">
              <h2 className="edit-patient-section-title">PERTINENT PHYSICAL EXAMINATION FINDINGS</h2>
              <div className="edit-patient-grid">
                <EditableInput
                  label="WEIGHT"
                  value={formData.weight || ""}
                  onChange={(val) => handleFieldChange("weight", val)}
                />
                <EditableInput
                  label="HEIGHT"
                  value={formData.height || ""}
                  onChange={(val) => handleFieldChange("height", val)}
                />
                <EditableInput
                  label="BLOOD PRESSURE - SYSTOLIC (mmHg)"
                  value={formData.bpSystolic || ""}
                  onChange={(val) => handleFieldChange("bpSystolic", val)}
                />
                <EditableInput
                  label="BLOOD PRESSURE - DIASTOLIC (mmHg)"
                  value={formData.bpDiastolic || ""}
                  onChange={(val) => handleFieldChange("bpDiastolic", val)}
                />
                <EditableInput
                  label="TEMPERATURE"
                  value={formData.temp || ""}
                  onChange={(val) => handleFieldChange("temp", val)}
                />
                <EditableInput
                  label="DESCRIPTION OF WOUND"
                  value={formData.woundDescription || ""}
                  onChange={(val) => handleFieldChange("woundDescription", val)}
                  multiline
                  wrapperClass="col-span-2"
                />
                <EditableInput
                  label="INDUCED BLEEDING?"
                  value={formData.inducedBleeding || ""}
                  onChange={(val) => handleFieldChange("inducedBleeding", val)}
                />
                <EditableInput
                  label="SPONTANEOUS BLEEDING?"
                  value={formData.spontaneousBleeding || ""}
                  onChange={(val) => handleFieldChange("spontaneousBleeding", val)}
                />
                <EditableInput
                  label="LOCAL WOUND TREATMENT"
                  value={formData.localWoundTreatment || ""}
                  onChange={(val) => handleFieldChange("localWoundTreatment", val)}
                />
                <EditableInput
                  label="WASHED WITH WATER ONLY"
                  value={formData.washedWaterOnly || ""}
                  onChange={(val) => handleFieldChange("washedWaterOnly", val)}
                />
                <EditableInput
                  label="WASHED WITH WATER & SOAP"
                  value={formData.washedSoapWater || ""}
                  onChange={(val) => handleFieldChange("washedSoapWater", val)}
                  multiline
                  wrapperClass="col-span-2"
                />
                <EditableInput
                  label="TETANUS IMMUNIZATION?"
                  value={formData.tetanusImmunization || ""}
                  onChange={(val) => handleFieldChange("tetanusImmunization", val)}
                />
                <EditableInput
                  label="DATE GIVEN"
                  value={formData.tetanusDateGiven ? formData.tetanusDateGiven.split("T")[0] : ""}
                  onChange={(val) => handleFieldChange("tetanusDateGiven", val)}
                  type="date"
                />
                <EditableInput
                  label="HTIG"
                  value={formData.HTIG || ""}
                  onChange={(val) => handleFieldChange("HTIG", val)}
                />
                <EditableInput
                  label="DATE GIVEN"
                  value={formData.htigDateGiven ? formData.htigDateGiven.split("T")[0] : ""}
                  onChange={(val) => handleFieldChange("htigDateGiven", val)}
                  type="date"
                />
                <EditableInput
                  label="SITE INVOLVED"
                  value={formData.siteInvolved || ""}
                  onChange={(val) => handleFieldChange("siteInvolved", val)}
                  wrapperClass="col-span-2"
                />
                <div className="edit-patient-field">
                  <label className="edit-patient-label">CATEGORY OF EXPOSURE</label>
                  <select
                    className="edit-patient-input"
                    value={formData.categoryOfExposure || ""}
                    onChange={(e) => handleFieldChange("categoryOfExposure", e.target.value)}
                  >
                    <option value="">Select category</option>
                    <option value="I">I</option>
                    <option value="II">II</option>
                    <option value="III">III</option>
                  </select>
                </div>
                <EditableInput
                  label="ASSESSMENT/DIAGNOSIS"
                  value={formData.assessmentDiagnosis || ""}
                  onChange={(val) => handleFieldChange("assessmentDiagnosis", val)}
                  multiline
                  wrapperClass="col-span-2"
                />
                <div className="edit-patient-field col-span-2">
                  <label className="edit-patient-label">PLAN</label>
                  <select
                    className="edit-patient-input"
                    value={formData.plan || ""}
                    onChange={(e) => handleFieldChange("plan", e.target.value)}
                  >
                    <option value="">Select plan</option>
                    <option value="PREP">PREP</option>
                    <option value="PEP">PEP</option>
                    <option value="BOOSTER">BOOSTER</option>
                  </select>
                </div>
              </div>
            </section>

            {/* MEDICATIONS */}
            <section className="edit-patient-section">
              <h2 className="edit-patient-section-title">MEDICATIONS</h2>
              <div className="edit-patient-grid">
                <EditableInput
                  label="PASSIVE VACCINE"
                  value={formData.passiveVaccine || ""}
                  onChange={(val) => handleFieldChange("passiveVaccine", val)}
                />
                <EditableInput
                  label="NO. OF UNITS"
                  value={formData.passiveVaccineUnits || ""}
                  onChange={(val) => handleFieldChange("passiveVaccineUnits", val)}
                />
                <EditableInput
                  label="ACTIVE VACCINE"
                  value={formData.activeVaccine || ""}
                  onChange={(val) => handleFieldChange("activeVaccine", val)}
                />
                <EditableInput
                  label="OTHERS"
                  value={formData.activeVaccineOther || ""}
                  onChange={(val) => handleFieldChange("activeVaccineOther", val)}
                />
                <EditableInput
                  label="ANTIBIOTIC"
                  value={formData.antibioticsText || ""}
                  onChange={(val) => handleFieldChange("antibioticsText", val)}
                  multiline
                  wrapperClass="col-span-2"
                />
                <EditableInput
                  label="ANTI-INFLAMMATORY"
                  value={formData.antiInflammatoryMedication || ""}
                  onChange={(val) => handleFieldChange("antiInflammatoryMedication", val)}
                  multiline
                  wrapperClass="col-span-2"
                />
                <EditableInput
                  label="OTHERS"
                  value={formData.otherMed || ""}
                  onChange={(val) => handleFieldChange("otherMed", val)}
                  multiline
                  wrapperClass="col-span-2"
                />
                <EditableInput
                  label="PHYSICIAN'S NAME (IF APPLICABLE)"
                  value={formData.physicianName || ""}
                  onChange={(val) => handleFieldChange("physicianName", val)}
                  wrapperClass="col-span-3"
                />
              </div>
            </section>

            {saveError && (
              <div className="edit-patient-error">
                <p>Error: {saveError}</p>
              </div>
            )}
          </div>

          <div className="edit-patient-footer">
            <button
              className="edit-patient-btn-cancel"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              className="edit-patient-btn-save"
              onClick={handleSaveClick}
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>

      {showConfirmation && (
        <ConfirmationModal
          title="Confirm Changes"
          message="Once this patient record is being transferred, it cannot be edited anymore. Are you sure you want to save these changes?"
          onConfirm={handleConfirmSave}
          onCancel={handleCancelConfirmation}
          confirmText="Save"
          cancelText="Cancel"
        />
      )}

      {showErrorAlert && (
        <AlertModal
          title="Unable to save changes"
          message={
            saveError
              ? `We couldn't save this patient record because: "${saveError}". Please review the form and try again. If the problem continues, contact your system administrator.`
              : "We couldn't save this patient record due to an unexpected error. Please review the form and try again."
          }
          buttonText="Got it"
          onClose={() => setShowErrorAlert(false)}
        />
      )}
    </>
  );
};

export default EditPatientModal;
