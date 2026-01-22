import { Client, Databases, Query } from "appwrite";

// Initialize Appwrite
const client = new Client()
  .setEndpoint(process.env.REACT_APP_APPWRITE_ENDPOINT || "https://cloud.appwrite.io/v1")
  .setProject(process.env.REACT_APP_APPWRITE_PROJECT_ID);

const databases = new Databases(client);
const databaseId = process.env.REACT_APP_APPWRITE_DATABASE;

/**
 * Compute vaccination status based on saved vaccination days
 * @param {Object} patientRecord - Patient record from database
 * @returns {Promise<string>} - One of: "vaxNotStarted", "ongoing", "completed", "missing"
 */
export const computeVaxStatus = async (patientRecord) => {
  const patientRecordId = patientRecord.patientRecordId || patientRecord.id;
  const existingStatus = (patientRecord.vaxStatus || "").toLowerCase();
  const plan = (patientRecord.vaccinationPlan || patientRecord.plan || "").toLowerCase();
  const isBoosterPlan = plan.includes("booster");
  const animalStatusText = (patientRecord.animalStatus || "").toLowerCase();
  const animalDied = Boolean(
    patientRecord.animalDied === true ||
    patientRecord.animalDied === "true" ||
    animalStatusText.includes("died") ||
    animalStatusText.includes("dead")
  );
  
  if (!patientRecordId) {
    console.error("❌ computeVaxStatus: No patientRecordId found");
    return "vaxNotStarted";
  }

  try {
    // Fetch all vaccination records for this patient
    const vaccinationResponse = await databases.listDocuments(
      databaseId,
      process.env.REACT_APP_APPWRITE_VACCINATION_COLLECTION || "vaccinationdetails",
      [Query.equal("patientRecordId", patientRecordId)]
    );

    const vaccinationRecords = vaccinationResponse.documents;
    
    if (!vaccinationRecords || vaccinationRecords.length === 0) {
      console.log(`📊 No vaccination records found for ${patientRecordId}`);
      return "vaxNotStarted";
    }

    // Extract which days have been saved
    const savedDays = new Set();
    vaccinationRecords.forEach((record) => {
      if (record.dayKey && record.dateOfVaccination) {
        savedDays.add(record.dayKey);
      }
    });

    console.log(`📊 Saved days for ${patientRecordId}:`, Array.from(savedDays).sort());

    // Booster plan: complete when Day 0 and Day 3 are present
    if (isBoosterPlan) {
      const boosterRequired = ["day0", "day3"];
      const boosterComplete = boosterRequired.every((day) => savedDays.has(day));

      if (boosterComplete) {
        console.log(`✅ Booster complete for ${patientRecordId}`);
        return "completed";
      }

      if (existingStatus === "missing") {
        return "missing";
      }

      if (savedDays.size > 0) {
        console.log(`⏳ Booster ongoing for ${patientRecordId}`);
        return "ongoing";
      }

      return "vaxNotStarted";
    }

    // PEP plan: base days are 0, 3, 7; extend to 14 and 28 when animal died
    const pepBaseDays = ["day0", "day3", "day7"];
    const pepExtendedDays = ["day14", "d28"];
    const pepRequired = animalDied ? [...pepBaseDays, ...pepExtendedDays] : pepBaseDays;
    const pepComplete = pepRequired.every((day) => savedDays.has(day));

    if (pepComplete) {
      console.log(`✅ PEP complete for ${patientRecordId} (animalDied=${animalDied})`);
      return "completed";
    }

    if (existingStatus === "missing") {
      return "missing";
    }

    if (savedDays.size > 0) {
      console.log(`⏳ PEP ongoing for ${patientRecordId}`);
      return "ongoing";
    }

    return "vaxNotStarted";
  } catch (err) {
    console.error(`❌ Error computing vaxStatus for ${patientRecordId}:`, err);
    return "vaxNotStarted";
  }
};

/**
 * Update a patient's vaxStatus based on their vaccination records
 * @param {Object} patientRecord - Patient record from database
 * @returns {Promise<string>} - Updated vaxStatus
 */
export const updateVaxStatus = async (patientRecord) => {
  const newStatus = await computeVaxStatus(patientRecord);
  const patientId = patientRecord.$id || patientRecord.id;

  try {
    await databases.updateDocument(
      databaseId,
      process.env.REACT_APP_APPWRITE_COLLECTION,
      patientId,
      { vaxStatus: newStatus }
    );
    console.log(`✅ Updated vaxStatus to '${newStatus}' for patient ${patientRecord.patientRecordId}`);
    return newStatus;
  } catch (err) {
    console.error(`❌ Failed to update vaxStatus:`, err);
    throw err;
  }
};
