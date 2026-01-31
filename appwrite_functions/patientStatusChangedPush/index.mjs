// Appwrite Cloud Function: notify the BHW who submitted a record when its status changes
// Trigger: databases.*.collections.*.documents.*.update (patientRecords collection)
// Runtime: Node 18+

import * as sdk from 'node-appwrite';

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

const parseJsonBestEffort = (input) => {
  if (!input) return null;
  if (typeof input === 'object') return input;
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
};

const extractEventPayload = (raw) => {
  // Appwrite event data is typically the document object.
  // Some environments may wrap it (e.g., { payload: {...} }).
  if (!raw || typeof raw !== 'object') return {};
  if (raw.payload && typeof raw.payload === 'object') return raw.payload;
  return raw;
};

const resolveSubmittingWorkerDoc = async ({ databases, users, staffDatabaseId, healthWorkersCollectionId, recordedByUserID, payload, log }) => {
  // 1) Prefer schema: health_workers.auth_user_id == Appwrite user id
  try {
    const res = await databases.listDocuments(staffDatabaseId, healthWorkersCollectionId, [
      sdk.Query.equal('auth_user_id', recordedByUserID),
      sdk.Query.limit(1),
    ]);
    const doc = res.documents?.[0];
    if (doc) return doc;
  } catch (e) {
    log('Worker lookup by auth_user_id failed', { message: e?.message || String(e) });
  }

  // 2) Fallback: match HealthWorker by recordedByHWID (your app stores this on the patient record)
  const recordedByHWID = payload?.recordedByHWID;
  if (recordedByHWID) {
    // Try common schema: healthWorkerID == recordedByHWID
    try {
      const res = await databases.listDocuments(staffDatabaseId, healthWorkersCollectionId, [
        sdk.Query.equal('healthWorkerID', recordedByHWID),
        sdk.Query.limit(1),
      ]);
      const doc = res.documents?.[0];
      if (doc) return doc;
    } catch (e) {
      log('Worker lookup by healthWorkerID failed', { message: e?.message || String(e) });
    }

    // If recordedByHWID is actually the HealthWorkers document id, query by $id
    try {
      const res = await databases.listDocuments(staffDatabaseId, healthWorkersCollectionId, [
        sdk.Query.equal('$id', recordedByHWID),
        sdk.Query.limit(1),
      ]);
      const doc = res.documents?.[0];
      if (doc) return doc;
    } catch (e) {
      log('Worker lookup by $id failed', { message: e?.message || String(e) });
    }
  }

  // 2) Fallback: resolve user's email then match health_workers.email
  try {
    const user = await users.get(recordedByUserID);
    const email = user?.email;
    if (email) {
      const res = await databases.listDocuments(staffDatabaseId, healthWorkersCollectionId, [
        sdk.Query.equal('email', email),
        sdk.Query.limit(1),
      ]);
      const doc = res.documents?.[0];
      if (doc) return doc;
    }
  } catch (e) {
    log('Worker lookup by Appwrite user email failed', { message: e?.message || String(e) });
  }

  // 3) Last-resort: if the record itself stores an email, try that.
  const fallbackEmail = payload?.recordedByEmail || payload?.bhwEmail || payload?.email;
  if (fallbackEmail) {
    try {
      const res = await databases.listDocuments(staffDatabaseId, healthWorkersCollectionId, [
        sdk.Query.equal('email', fallbackEmail),
        sdk.Query.limit(1),
      ]);
      const doc = res.documents?.[0];
      if (doc) return doc;
    } catch (e) {
      log('Worker lookup by payload email failed', { message: e?.message || String(e) });
    }
  }

  return null;
};

export default async ({ req, res, log, error }) => {
  try {
    log('patientStatusChangedPush: start', {
      executionId: process.env.APPWRITE_FUNCTION_EXECUTION_ID || null,
      trigger: process.env.APPWRITE_FUNCTION_TRIGGER || null,
      event: process.env.APPWRITE_FUNCTION_EVENT || null,
      haveEventData: Boolean(process.env.APPWRITE_FUNCTION_EVENT_DATA),
      eventDataBytes: process.env.APPWRITE_FUNCTION_EVENT_DATA
        ? Buffer.byteLength(String(process.env.APPWRITE_FUNCTION_EVENT_DATA), 'utf8')
        : 0,
    });

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
    const users = new sdk.Users(client);

    // Primary: event trigger payload
    // Fallback: manual console execution where payload is provided as request body
    const payloadFromEnvRaw = parseJsonBestEffort(process.env.APPWRITE_FUNCTION_EVENT_DATA);
    const payloadFromBodyRaw = parseJsonBestEffort(req?.body);
    const payload = extractEventPayload(payloadFromEnvRaw || payloadFromBodyRaw || {});

    log('patientStatusChangedPush: payload source', {
      fromEnv: Boolean(payloadFromEnvRaw),
      fromBody: Boolean(!payloadFromEnvRaw && payloadFromBodyRaw),
      payloadKeys: payload && typeof payload === 'object' ? Object.keys(payload).slice(0, 20) : [],
      hasId: Boolean(payload?.$id),
      hasPrevious: Boolean(payload?.$previous),
    });

    const startedAt = Date.now();
    const previous = payload.$previous || {};

    const documentId = payload.$id;
    const newStatus = normalizeStatus(payload.status);
    const oldStatus = normalizeStatus(previous.status);

    log('Event received', {
      event: process.env.APPWRITE_FUNCTION_EVENT || null,
      recordId: documentId || null,
      status: payload?.status || null,
      recordedByUserID: payload?.recordedByUserID || null,
      recordedByHWID: payload?.recordedByHWID || null,
    });

    if (!documentId) {
      return res.json({
        message: 'No document payload received. If running manually, pass the document JSON in the request body. If expecting event trigger, verify function is attached to the database update event.',
      });
    }

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

    const staffDatabaseId = process.env.STAFF_DATABASE_ID;
    const healthWorkersCollectionId = process.env.HEALTH_WORKERS_COLLECTION_ID;

    if (!staffDatabaseId || !healthWorkersCollectionId) {
      return res.json({ message: 'Missing staff database or collection id; skipping.' });
    }

    const workerDoc = await resolveSubmittingWorkerDoc({
      databases,
      users,
      staffDatabaseId,
      healthWorkersCollectionId,
      recordedByUserID,
      payload,
      log,
    });
    const tokens = collectTokens(workerDoc);

    if (!tokens.length) {
      return res.json({
        message: 'No Expo push tokens found for submitting BHW.',
        workerFound: Boolean(workerDoc),
        workerId: workerDoc?.$id || null,
      });
    }

    const statusMessages = {
      Terminated: {
        title: 'Patient record has been terminated',
        body: 'The attending physician closed this case; review the notes for next steps.',
      },
      Verified: {
        title: 'Patient record has been verified',
        body: 'The physician verified the record details.',
      },
    };

    const { title, body } = statusMessages[newStatus] || statusMessages.Verified;

    log('patientStatusChangedPush: notification copy', {
      recordId: documentId,
      newStatus,
      title,
      body,
      tokenCount: tokens.length,
    });

    const expoMessages = tokens.map((token) => ({
      to: token,
      sound: 'default',
      title,
      body,
      data: {
        type: 'patient_status_changed',
        recordId: documentId,
        focusStatus: newStatus,
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

    if (!ok) {
      return res.json({ error: 'Expo push API returned non-2xx.', httpStatus, result: json }, 502);
    }

    return res.json({ sent: expoMessages.length, result: json, durationMs: Date.now() - startedAt });
  } catch (err) {
    error(err);
    return res.json({ error: err.message }, 500);
  }
};
