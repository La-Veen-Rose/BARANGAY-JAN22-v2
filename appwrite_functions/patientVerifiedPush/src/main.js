// Appwrite Cloud Function: send push notification when a patient record becomes Verified
// CommonJS syntax so Appwrite's Node runtime can require() it safely.

const sdk = require('node-appwrite');

module.exports = async ({ req, res, log, error }) => {
  try {
    const client = new sdk.Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_ENDPOINT)
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
      .setKey(process.env.APPWRITE_FUNCTION_API_KEY);

    const databases = new sdk.Databases(client);

    // Event payload for database document update
    const payload = JSON.parse(process.env.APPWRITE_FUNCTION_EVENT_DATA || '{}');
    const { $id: documentId, status, purok, barangay } = payload;

    const old = payload.$previous || {};
    const oldStatus = old.status;

    // Only act when status changed TO Verified (and was not Verified before)
    if (!status || status.toLowerCase() !== 'verified' || oldStatus?.toLowerCase() === 'verified') {
      return res.json({ message: 'No status change to Verified; skipping.' });
    }

    // Find all health workers for this purok + barangay who have expoPushToken
    const staffDatabaseId = process.env.STAFF_DATABASE_ID;
    const staffCollectionId = process.env.HEALTH_WORKERS_COLLECTION_ID;

    const workersRes = await databases.listDocuments(staffDatabaseId, staffCollectionId, [
      sdk.Query.equal('purok', purok),
      sdk.Query.equal('barangay', barangay),
      sdk.Query.isNotNull('expoPushToken'),
    ]);

    const tokens = workersRes.documents
      .map((doc) => doc.expoPushToken)
      .filter(Boolean);

    if (!tokens.length) {
      return res.json({ message: 'No Expo push tokens found for this location.' });
    }

    const expoMessages = tokens.map((token) => ({
      to: token,
      title: 'Record Verified by City Health Office',
      body: 'A submitted patient record from your barangay has been verified. Prescriptions are now available.',
      data: {
        type: 'patient_verified',
        recordId: documentId,
        purok,
        barangay,
      },
    }));

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(expoMessages),
    });

    const result = await response.json();
    return res.json({ sent: expoMessages.length, result });
  } catch (err) {
    error(err);
    return res.json({ error: err.message }, 500);
  }
};
