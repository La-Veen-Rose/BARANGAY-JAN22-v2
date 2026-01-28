import { Client, Account, Databases, Storage, Functions, ID } from 'appwrite';

// --- RAW ENV EXPORTS (for REST calls that need explicit endpoint/project id) ---
export const APPWRITE_ENDPOINT = process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT;
export const APPWRITE_PROJECT_ID = process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID;

// --- APPWRITE INITIALIZATION ---
// We access environment variables directly using process.env
const client = new Client()
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT_ID);

// --- DATABASE & STORAGE CONFIG ---
export const appwriteConfig = {
  patientDatabaseId: process.env.EXPO_PUBLIC_PATIENT_DATABASE_ID,
  staffDatabaseId: process.env.EXPO_PUBLIC_STAFF_DATABASE_ID,
  patientRecordsCollectionId: process.env.EXPO_PUBLIC_PATIENT_RECORDS_COLLECTION_ID,
  healthWorkersCollectionId: process.env.EXPO_PUBLIC_HEALTH_WORKERS_COLLECTION_ID,
  // Physician accounts (collection/table name in Appwrite: "physician_accounts")
  // Set this in your Expo env as the collection ID.
  physicianAccountsCollectionId: process.env.EXPO_PUBLIC_PHYSICIAN_ACCOUNTS_COLLECTION_ID,
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