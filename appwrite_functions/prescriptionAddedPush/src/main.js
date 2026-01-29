// Appwrite Cloud Function: notify the submitting BHW when a prescription is added to a patient record
// Trigger: databases.*.collections.*.documents.*.update (patientRecords collection)
// Runtime: Node 18+

const sdk = require('node-appwrite');

const fetchJsonWithTimeout = async (url, options, timeoutMs) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let json;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    return { ok: response.ok, status: response.status, json };
  } finally {
    clearTimeout(timeoutId);
  }
};

const pickEnv = (...keys) => {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim()) {
      return { key, value: value.trim() };
    }
  }
  return { key: '', value: '' };
};

const normalizeEndpoint = (raw) => {
  if (!raw) return '';
  let endpoint = String(raw).trim();
  if (!/^https?:\/\//i.test(endpoint)) {
    endpoint = `https://${endpoint}`;
  }
  endpoint = endpoint.replace(/\/+$/, '');
  return endpoint;
};

const firstString = (val) => {
  if (!val) return '';
  if (typeof val === 'string') return val.trim();
  if (Array.isArray(val)) {
    for (const v of val) {
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
  }
  return '';
};

const collectTokens = (doc) => {
  const tokens = [];
  if (!doc) return tokens;
  if (typeof doc.expoPushToken === 'string' && doc.expoPushToken) tokens.push(doc.expoPushToken);
  if (Array.isArray(doc.expoPushToken)) {
    for (const t of doc.expoPushToken) {
      if (typeof t === 'string' && t) tokens.push(t);
    }
  }
  if (Array.isArray(doc.expoPushTokens)) {
    for (const t of doc.expoPushTokens) {
      if (typeof t === 'string' && t) tokens.push(t);
    }
  }
  return [...new Set(tokens)];
};

module.exports = async ({ req, res, log, error }) => {
  try {
    const endpointPick = pickEnv(
      'APPWRITE_FUNCTION_ENDPOINT',
      'APPWRITE_ENDPOINT',
      'APPWRITE_API_ENDPOINT',
      'APPWRITE_URL'
    );
    const projectPick = pickEnv('APPWRITE_FUNCTION_PROJECT_ID', 'APPWRITE_PROJECT_ID');
    const apiKeyPick = pickEnv('APPWRITE_FUNCTION_API_KEY', 'APPWRITE_API_KEY');

    const endpoint = normalizeEndpoint(endpointPick.value);
    const projectId = projectPick.value;
    const apiKey = apiKeyPick.value;

    if (!endpoint || !projectId || !apiKey) {
      return res.json(
        {
          error: 'Missing required Appwrite runtime variables for server SDK.',
          haveEndpoint: Boolean(endpoint),
          haveProjectId: Boolean(projectId),
          haveApiKey: Boolean(apiKey),
          endpointKeyUsed: endpointPick.key || null,
          projectKeyUsed: projectPick.key || null,
          hint:
            'Ensure the function has access to Appwrite runtime vars (APPWRITE_FUNCTION_ENDPOINT/PROJECT_ID/API_KEY). If using custom vars, set APPWRITE_ENDPOINT + APPWRITE_PROJECT_ID + APPWRITE_API_KEY.',
        },
        500
      );
    }

    try {
      // eslint-disable-next-line no-new
      new URL(endpoint);
    } catch (e) {
      return res.json(
        {
          error: 'Invalid Appwrite endpoint URL.',
          endpointKeyUsed: endpointPick.key || null,
          endpointRaw: endpointPick.value || null,
          endpointNormalized: endpoint || null,
          hint: 'Endpoint must include protocol and /v1, e.g. https://cloud.appwrite.io/v1 or https://YOUR-DOMAIN/v1',
        },
        500
      );
    }

    const client = new sdk.Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);

    const databases = new sdk.Databases(client);

    const startedAt = Date.now();

    const payload = JSON.parse(process.env.APPWRITE_FUNCTION_EVENT_DATA || '{}');
    const previous = payload.$previous || {};

    const newFileId = firstString(payload.prescription_images);
    const prevFileId = firstString(previous.prescription_images);

    // Only act when a prescription file is newly added
    if (!newFileId) {
      return res.json({ message: 'No prescription file on record; skipping.' });
    }
    if (newFileId === prevFileId) {
      return res.json({ message: 'Prescription unchanged; skipping.' });
    }

    const staffDatabaseId = process.env.STAFF_DATABASE_ID;
    const healthWorkersCollectionId = process.env.HEALTH_WORKERS_COLLECTION_ID;

    if (!staffDatabaseId || !healthWorkersCollectionId) {
      return res.json({ message: 'Missing staff database or collection id; skipping.' });
    }

    const recordedByUserID = payload.recordedByUserID;
    const recordedByHWID = payload.recordedByHWID;

    let workerDoc = null;

    // Primary lookup: auth_user_id
    if (recordedByUserID) {
      const resByAuth = await databases.listDocuments(
        staffDatabaseId,
        healthWorkersCollectionId,
        [sdk.Query.equal('auth_user_id', recordedByUserID), sdk.Query.limit(1)]
      );
      workerDoc = resByAuth.documents?.[0] || null;
    }

    // Fallback: healthWorkerID
    if (!workerDoc && recordedByHWID) {
      const resByHW = await databases.listDocuments(
        staffDatabaseId,
        healthWorkersCollectionId,
        [sdk.Query.equal('healthWorkerID', recordedByHWID), sdk.Query.limit(1)]
      );
      workerDoc = resByHW.documents?.[0] || null;
    }

    if (!workerDoc) {
      return res.json({ message: 'Submitting BHW profile not found; skipping.' });
    }

    const tokens = collectTokens(workerDoc);
    if (!tokens.length) {
      return res.json({ message: 'No Expo push tokens found for submitting BHW.' });
    }

    const submissionID = payload.submissionID || '';
    const patientName = [payload.lastName, payload.firstName].filter(Boolean).join(', ');

    const title = 'Prescription is ready';
    const body = submissionID
      ? `Prescription added for ${submissionID}`
      : 'A prescription has been added to your submitted record.';

    const expoMessages = tokens.map((token) => ({
      to: token,
      sound: 'default',
      title,
      body,
      data: {
        type: 'prescription_added',
        recordId: payload.$id,
        submissionID,
        patientName,
        prescriptionFileId: newFileId,
      },
    }));

    const { ok, status: httpStatus, json } = await fetchJsonWithTimeout(
      'https://exp.host/--/api/v2/push/send',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(expoMessages),
      },
      20000
    );

    log('Expo response', { httpStatus, ok, result: json });

    if (!ok) {
      return res.json({ error: 'Expo push API returned non-2xx.', httpStatus, result: json }, 502);
    }

    log('Push complete', { sent: expoMessages.length, durationMs: Date.now() - startedAt });
    return res.json({ sent: expoMessages.length, result: json, durationMs: Date.now() - startedAt });
  } catch (err) {
    error(err);
    return res.json({ error: err.message }, 500);
  }
};
