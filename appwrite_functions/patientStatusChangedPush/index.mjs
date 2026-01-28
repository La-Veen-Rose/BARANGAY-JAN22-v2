// Appwrite Cloud Function: notify the BHW who submitted a record when its status changes
// Trigger: databases.*.collections.*.documents.*.update (patientRecords collection)
// Runtime: Node 18+

import sdk from 'node-appwrite';

const normalizeStatus = (value) => {
  if (!value) return null;
  const s = String(value).trim().toLowerCase();
  if (s === 'verified') return 'Verified';
  if (s === 'terminated') return 'Terminated';
  if (s === 'pending') return 'Pending';
  return null;
};

const collectTokens = (doc) => {
  const tokens = [];
  if (!doc) return tokens;

  if (typeof doc.expoPushToken === 'string' && doc.expoPushToken) {
    tokens.push(doc.expoPushToken);
  }
  if (Array.isArray(doc.expoPushTokens)) {
    for (const t of doc.expoPushTokens) {
      if (typeof t === 'string' && t) tokens.push(t);
    }
  }

  return [...new Set(tokens)];
};

export default async ({ req, res, log, error }) => {
  try {
    const client = new sdk.Client()
      .setEndpoint(req.variables.APPWRITE_FUNCTION_ENDPOINT)
      .setProject(req.variables.APPWRITE_FUNCTION_PROJECT_ID)
      .setKey(req.variables.APPWRITE_FUNCTION_API_KEY);

    const databases = new sdk.Databases(client);

    const payload = JSON.parse(req.variables.APPWRITE_FUNCTION_EVENT_DATA || '{}');
    const previous = payload.$previous || {};

    const documentId = payload.$id;
    const newStatus = normalizeStatus(payload.status);
    const oldStatus = normalizeStatus(previous.status);

    // Only act on transitions to Verified/Terminated
    if (!newStatus || (newStatus !== 'Verified' && newStatus !== 'Terminated')) {
      return res.json({ message: 'Status not Verified/Terminated; skipping.' });
    }
    if (oldStatus === newStatus) {
      return res.json({ message: 'Status unchanged; skipping.' });
    }

    const recordedByUserID = payload.recordedByUserID;
    if (!recordedByUserID) {
      return res.json({ message: 'Missing recordedByUserID; cannot target BHW; skipping.' });
    }

    const staffDatabaseId = req.variables.STAFF_DATABASE_ID;
    const healthWorkersCollectionId = req.variables.HEALTH_WORKERS_COLLECTION_ID;

    const workerRes = await databases.listDocuments(staffDatabaseId, healthWorkersCollectionId, [
      sdk.Query.equal('auth_user_id', recordedByUserID),
      sdk.Query.limit(1),
    ]);

    const workerDoc = workerRes.documents?.[0];
    const tokens = collectTokens(workerDoc);

    if (!tokens.length) {
      return res.json({ message: 'No Expo push tokens found for submitting BHW.' });
    }

    const submissionID = payload.submissionID || '';
    const patientName = [payload.lastName, payload.firstName].filter(Boolean).join(', ');

    let title;
    let body;
    if (newStatus === 'Verified') {
      title = 'Record Verified';
      body = submissionID
        ? `Submission ${submissionID} has been verified.`
        : 'A submitted patient record has been verified.';
    } else {
      title = 'Record Terminated';
      const reason = payload.terminateReason || payload.terminationReason || '';
      body = submissionID
        ? `Submission ${submissionID} was terminated.${reason ? ' Reason: ' + reason : ''}`
        : `A submitted patient record was terminated.${reason ? ' Reason: ' + reason : ''}`;
    }

    const expoMessages = tokens.map((token) => ({
      to: token,
      sound: 'default',
      title,
      body,
      data: {
        type: 'patient_status_changed',
        recordId: documentId,
        focusStatus: newStatus,
        submissionID,
        patientName,
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
