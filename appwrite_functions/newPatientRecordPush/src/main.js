// Appwrite Cloud Function: notify physicians when a new patient record is submitted (Pending)
// CommonJS syntax so Appwrite's Node runtime can require() it safely.

const sdk = require('node-appwrite');

const normalizeStatus = (value) => {
  if (!value) return 'Pending';
  const s = String(value).trim().toLowerCase();
  if (s === 'verified') return 'Verified';
  if (s === 'terminated') return 'Terminated';
  if (s === 'pending') return 'Pending';
  return 'Pending';
};

const collectTokensFromPhysicianDoc = (doc) => {
  const tokens = [];
  if (!doc) return tokens;

  if (typeof doc.expoPushToken === 'string' && doc.expoPushToken) tokens.push(doc.expoPushToken);
  if (Array.isArray(doc.expoPushTokens)) {
    for (const t of doc.expoPushTokens) {
      if (typeof t === 'string' && t) tokens.push(t);
    }
  }

  return [...new Set(tokens)];
};

module.exports = async ({ req, res, log, error }) => {
  try {
    const client = new sdk.Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_ENDPOINT)
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
      .setKey(process.env.APPWRITE_FUNCTION_API_KEY);

    const databases = new sdk.Databases(client);

    const payload = JSON.parse(process.env.APPWRITE_FUNCTION_EVENT_DATA || '{}');

    const status = normalizeStatus(payload.status);
    if (status !== 'Pending') {
      return res.json({ message: 'Record not Pending; skipping.' });
    }

    const staffDatabaseId = process.env.STAFF_DATABASE_ID;
    const physicianCollectionId = process.env.PHYSICIAN_ACCOUNTS_COLLECTION_ID;

    if (!staffDatabaseId) {
      return res.json({ message: 'Missing STAFF_DATABASE_ID; skipping.' });
    }
    if (!physicianCollectionId) {
      return res.json({ message: 'Missing PHYSICIAN_ACCOUNTS_COLLECTION_ID; skipping.' });
    }

    const physiciansRes = await databases.listDocuments(staffDatabaseId, physicianCollectionId, [
      sdk.Query.limit(100),
    ]);

    const tokens = physiciansRes.documents.flatMap((doc) => collectTokensFromPhysicianDoc(doc));
    const uniqueTokens = [...new Set(tokens)].filter(Boolean);

    if (!uniqueTokens.length) {
      return res.json({ message: 'No physician Expo push tokens found.' });
    }

    const submissionID = payload.submissionID || '';
    const barangay = payload.barangay || '';
    const patientName = [payload.lastName, payload.firstName].filter(Boolean).join(', ');

    const title = 'New Patient Record Submitted';
    const body = submissionID
      ? `New pending record: ${submissionID}${barangay ? ' • ' + barangay : ''}`
      : `A new pending patient record was submitted${barangay ? ' • ' + barangay : ''}.`;

    const expoMessages = uniqueTokens.map((token) => ({
      to: token,
      sound: 'default',
      title,
      body,
      data: {
        type: 'new_patient_record',
        focusStatus: 'Pending',
        recordId: payload.$id,
        submissionID,
        patientName,
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
