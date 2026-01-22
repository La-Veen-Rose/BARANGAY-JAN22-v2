import React from "react";
import "./completed-modal.css";


const mockPatientData = {
  lastName: "DELA CRUZ",
  firstName: "KENNETH CARL IVAN",
  middleName: "GOZUM",
  suffix: "N/A",
  sex: "MALE",
  civilStatus: "SINGLE",
  age: 21,
  dateOfBirth: "OCT. 1, 2004",
  contactNumber: "(+63) 912 234 2934",
  dateOfConsultation: "NOVEMBER 9, 2025",
  streetAddress: "111 20 GUHO ST., BERMUDEZ PLAINS SUBDIVISION",
  barangay: "APOKON",
  municipality: "TAGUM",
  referredBy: "DR. LUZVIMINDA B. CABALARZON",
  previousImmunization: "OCTOBER 12, 2025",
  allergies: "PEANUTS, CHEESE, MILK",
  animal: "DOG",
  dateOfExposure: "NOVEMBER 8, 2025",
  timeOfExposure: "10:30:32 A.M.",
  placeOfIncidence: "PUROK 4-H",
  statusOfBitingAnimal: "ALIVE",
  weight: "58 KG",
  height: "157 CM",
  bloodPressure: "PULSE",
  temperature: "37 C",
  descriptionOfWound: "ABRASION",
  spontaneousBleeding: "WITH",
  inducedBleeding: "YES",
  localWoundTreatment: "NO",
  tetanousImmunization: "YES",
  HTIG: "YES",
  tandok: "YES",
  appliedGarlic: "YES",
  plan: "PEP",
  passiveVaccine: "ERIG | 2 UNITS",
  activeVaccine: "PVRV",
  antibiotic: "PVRV",
  antiInflammatory: "PVRV",
  others: "TT",
  physiciansName: "NOT APPLICABLE",
  dateGiven: "11/14/25",
  siteInvolve: "APOKON",
  category: "II",
  assessment: "SIKO KNOWS",
  visualNotes: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]
};

const InfoDisplay = ({ label, value }) => (
  <div className="patient-display-field">
    <div className="patient-display-label">{label}</div>
    <div className="patient-display-value">{value}</div>
  </div>
);

const CompletedPatients = ({ patient = mockPatientData, onClose }) => {
  const d = patient;

  return (
    <div className="patient-overlay" onClick={onClose}>
      <div className="patient-container" onClick={e => e.stopPropagation()}>
        <button className="patient-close" onClick={onClose}>×</button>
        <h1 className="patient-title">Patient Details</h1>
        
        <section className="patient-section">
          <h2 className="patient-section-title">BASIC INFORMATION</h2>
          <div className="patient-info-grid">
            <InfoDisplay label="Last Name" value={d.lastName} />
            <InfoDisplay label="First Name" value={d.firstName} />
            <InfoDisplay label="Middle Name" value={d.middleName} />
            <InfoDisplay label="Suffix" value={d.suffix} />
            <InfoDisplay label="Sex" value={d.sex} />
            <InfoDisplay label="Civil Status" value={d.civilStatus} />
            <InfoDisplay label="Age" value={d.age} />
            <InfoDisplay label="Date of Birth" value={d.dateOfBirth} />
            <InfoDisplay label="Contact Number" value={d.contactNumber} />
            <InfoDisplay label="Consultation Date" value={d.dateOfConsultation} />
            <InfoDisplay label="Street Address" value={d.streetAddress} />
            <InfoDisplay label="Barangay" value={d.barangay} />
            <InfoDisplay label="Municipality" value={d.municipality} />
            <InfoDisplay label="Referred By" value={d.referredBy} />
          </div>
        </section>
        
        <section className="patient-section">
          <h2 className="patient-section-title">PERTINENT MEDICAL HISTORY</h2>
          <div className="patient-info-row">
            <InfoDisplay label="Previous Immunization" value={d.previousImmunization} />
            <InfoDisplay label="Allergies" value={d.allergies} />
          </div>
        </section>
        
        <section className="patient-section">
          <h2 className="patient-section-title">PERTINENT DATA</h2>
          <div className="patient-info-row">
            <InfoDisplay label="Type of Biting Animal" value={d.animal} />
            <InfoDisplay label="Date of Exposure" value={d.dateOfExposure} />
            <InfoDisplay label="Time of Exposure" value={d.timeOfExposure} />
            <InfoDisplay label="Place of Incidence" value={d.placeOfIncidence} />
            <InfoDisplay label="Status of Animal" value={d.statusOfBitingAnimal} />
          </div>
        </section>
        
        <section className="patient-section">
          <h2 className="patient-section-title">PERTINENT PHYSICAL EXAMINATION FINDINGS</h2>
          <div className="patient-info-grid">
            <InfoDisplay label="Weight" value={d.weight} />
            <InfoDisplay label="Height" value={d.height} />
            <InfoDisplay label="Blood Pressure" value={d.bloodPressure} />
            <InfoDisplay label="Temperature" value={d.temperature} />
            <InfoDisplay label="Description of Wound" value={d.descriptionOfWound} />
            <InfoDisplay label="Spontaneous Bleeding" value={d.spontaneousBleeding} />
            <InfoDisplay label="Induced Bleeding" value={d.inducedBleeding} />
            <InfoDisplay label="Local Wound Treatment" value={d.localWoundTreatment} />
            <InfoDisplay label="Tetanous Immunization" value={d.tetanousImmunization} />
            <InfoDisplay label="HTIG" value={d.HTIG} />
            <InfoDisplay label="Tandok" value={d.tandok} />
            <InfoDisplay label="Applied Garlic, etc." value={d.appliedGarlic} />
            <InfoDisplay label="Plan" value={d.plan} />
            <InfoDisplay label="Passive Vaccine" value={d.passiveVaccine} />
            <InfoDisplay label="Active Vaccine" value={d.activeVaccine} />
            <InfoDisplay label="Antibiotic" value={d.antibiotic} />
            <InfoDisplay label="Anti-Inflammatory" value={d.antiInflammatory} />
            <InfoDisplay label="Others" value={d.others} />
            <InfoDisplay label="Physician's Name" value={d.physiciansName} />
            <InfoDisplay label="Date Given" value={d.dateGiven} />
            <InfoDisplay label="Site Involve" value={d.siteInvolve} />
            <InfoDisplay label="Category" value={d.category} />
            <InfoDisplay label="Assessment" value={d.assessment} />
          </div>
        </section>
      

        <section className="patient-section">
          <h2 className="patient-section-title">PERTINENT VISUAL NOTES</h2>
          {d.visualNotes?.map(note => (
              <div key={note.id} className="patient-note-placeholder">
                Image {note.id}
              </div>
            ))}
        </section>

        <footer className="patient-footer">
          <button className="patient-btn" onClick={onClose}>Cancel</button>
          <button className="patient-btn primary" onClick={() => alert("Verified!")}>Verify</button>
        </footer>
      </div>
    </div>
  );
};

export default CompletedPatients;