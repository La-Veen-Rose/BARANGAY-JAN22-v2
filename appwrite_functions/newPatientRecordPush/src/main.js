// Appwrite Cloud Function: notify physicians when a new patient record is submitted (Pending)
// CommonJS syntax so Appwrite's Node runtime can require() it safely.

const sdk = require('node-appwrite');

const chunkArray = (arr, size) => {
  if (!Array.isArray(arr) || size <= 0) return [];
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
};

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
  // Remove trailing slash to avoid accidental double slashes
  endpoint = endpoint.replace(/\/+$/, '');
  return endpoint;
};

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
    const startedAt = Date.now();
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
      // Validate endpoint early to prevent opaque SDK errors.
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

    const payload = JSON.parse(process.env.APPWRITE_FUNCTION_EVENT_DATA || '{}');

    log('Event received', {
      event: process.env.APPWRITE_FUNCTION_EVENT || null,
      recordId: payload?.$id || null,
      status: payload?.status || null,
    });

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

    log('Listing physicians...', { staffDatabaseId, physicianCollectionId });

    const physiciansRes = await databases.listDocuments(staffDatabaseId, physicianCollectionId, [
      sdk.Query.limit(100),
    ]);

    log('Physicians listed', { count: physiciansRes?.documents?.length ?? 0 });

    const tokens = physiciansRes.documents.flatMap((doc) => collectTokensFromPhysicianDoc(doc));
    const uniqueTokens = [...new Set(tokens)].filter(Boolean);

    if (!uniqueTokens.length) {
      return res.json({ message: 'No physician Expo push tokens found.' });
    }

    // Expo recommends max 100 messages per request.
    const expoBatches = chunkArray(uniqueTokens, 100);
    log('Sending push notifications', { tokenCount: uniqueTokens.length, batches: expoBatches.length });

    const submissionID = payload.submissionID || '';
    const barangay = payload.barangay || '';
    const patientName = [payload.lastName, payload.firstName].filter(Boolean).join(', ');

    const title = 'New Patient Record Submitted';
    const body = submissionID
      ? `New pending record: ${submissionID}${barangay ? ' • ' + barangay : ''}`
      : `A new pending patient record was submitted${barangay ? ' • ' + barangay : ''}.`;

    const allResults = [];
    let sent = 0;

    for (let i = 0; i < expoBatches.length; i += 1) {
      const batchTokens = expoBatches[i];
      const expoMessages = batchTokens.map((token) => ({
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

      log('Sending Expo batch', { batch: i + 1, batchSize: expoMessages.length });

      const { ok, status: httpStatus, json } = await fetchJsonWithTimeout(
        'https://exp.host/--/api/v2/push/send',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(expoMessages),
        },
        20000
      );

      log('Expo response', { batch: i + 1, httpStatus, ok, result: json });

      allResults.push({ batch: i + 1, httpStatus, ok, result: json });
      sent += expoMessages.length;

      if (!ok) {
        return res.json(
          {
            error: 'Expo push API returned non-2xx.',
            httpStatus,
            batch: i + 1,
            result: json,
          },
          502
        );
      }
    }

    log('Push complete', { sent, batches: allResults.length, durationMs: Date.now() - startedAt });
    return res.json({ sent, batches: allResults.length, results: allResults, durationMs: Date.now() - startedAt });
  } catch (err) {
    error(err);
    return res.json({ error: err.message }, 500);
  }
};
