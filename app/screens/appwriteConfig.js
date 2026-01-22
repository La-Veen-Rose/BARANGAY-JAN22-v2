import { Client, Account, Databases, Storage, Functions, ID } from 'appwrite';

// --- APPWRITE INITIALIZATION ---
// We access environment variables directly using process.env
const client = new Client()
  .setEndpoint(process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT)
  .setProject(process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID);

// --- DATABASE & STORAGE CONFIG ---
export const appwriteConfig = {
  patientDatabaseId: process.env.EXPO_PUBLIC_PATIENT_DATABASE_ID,
  staffDatabaseId: process.env.EXPO_PUBLIC_STAFF_DATABASE_ID,
  patientRecordsCollectionId: process.env.EXPO_PUBLIC_PATIENT_RECORDS_COLLECTION_ID,
  healthWorkersCollectionId: process.env.EXPO_PUBLIC_HEALTH_WORKERS_COLLECTION_ID,
  submissionCountersCollectionId: process.env.EXPO_PUBLIC_SUBMISSION_COUNTERS_COLLECTION_ID,
  imagesBucketId: process.env.EXPO_PUBLIC_IMAGES_BUCKET_ID,
  // Optional dedicated bucket for generated prescriptions
  // Falls back to images bucket if not provided so the app still works
  prescriptionBucketId: process.env.EXPO_PUBLIC_PRESCRIPTION_BUCKET_ID || process.env.EXPO_PUBLIC_IMAGES_BUCKET_ID,
  progressCollectionId: process.env.EXPO_PUBLIC_PROGRESS_COLLECTION_ID,
  vaccinationCollectionId: process.env.EXPO_PUBLIC_VACCINATION_COLLECTION_ID,
  rabedDatabaseId: process.env.EXPO_PUBLIC_RABED_DATABASE_ID,
  rabedCollectionId: process.env.EXPO_PUBLIC_RABED_COLLECTION_ID,
};

// --- EXPORT SERVICES ---
export const account = new Account(client);
export const databases = new Databases(client);
export const storage = new Storage(client);
export const functions = new Functions(client);
export { ID };

export default client;