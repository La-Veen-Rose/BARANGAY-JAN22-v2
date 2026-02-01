// Appwrite Cloud Function: generate patientRecordId when a record becomes verified
// Trigger: databases.*.collections.*.documents.*.update (patientRecords collection)
// Runtime: Node 18+

const sdk = require('node-appwrite');

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
  return endpoint.replace(/\/+$/, '');
};

const normalizeStatus = (value) => String(value || '').trim().toLowerCase();

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

const generateBarangayCode = (barangayNameOrCode) => {
  if (!barangayNameOrCode || String(barangayNameOrCode).trim() === '') {
    throw new Error('Barangay is required to generate code');
  }

  const trimmed = String(barangayNameOrCode).trim();
  const words = trimmed.split(/\s+/).filter(Boolean);

  // Normalize each word to alphanumeric only so punctuation doesn't affect the code.
  const cleanWord = (w) => String(w).replace(/[^A-Za-z0-9]/g, '');
  const cleanWords = words.map(cleanWord).filter(Boolean);

  if (cleanWords.length === 0) {
    throw new Error('Barangay is required to generate code');
  }

  // Rules:
  // - 1 word: first 3 letters
  // - 2+ words: first 3 letters of first word + 1st letter of each subsequent word
  let code = cleanWords[0].substring(0, 3);
  for (let i = 1; i < cleanWords.length; i += 1) {
    code += cleanWords[i].charAt(0);
  }
  return code.toUpperCase();
};

const encodeSuffix = (counterValue) => {
  const n = Number(counterValue) || 0;

  // 4 chars base36 gives 36^4 = 1,679,616 unique values.
  // Scramble the counter with a bijection mod 36^4 so it looks random
  // but stays collision-free per barangay+year.
  const MOD = 36 ** 4;
  if (n >= MOD) {
    return n.toString(36).toUpperCase();
  }

  // A must be coprime with 36 to be invertible mod 36^4.
  const A = 10007;
  const B = 7919;
  const scrambled = (n * A + B) % MOD;

  return scrambled
    .toString(36)
    .toUpperCase()
    .padStart(4, '0');
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

module.exports = async ({ req, res, log, error }) => {
  try {
    // Always emit at least one log line so that "No logs found" is actionable.
    // (Avoid printing secrets; only booleans + key names.)
    log('patientRecordIdOnVerify: start', {
      haveEventData: Boolean(process.env.APPWRITE_FUNCTION_EVENT_DATA),
      event: process.env.APPWRITE_FUNCTION_EVENT || null,
      executionId: process.env.APPWRITE_FUNCTION_EXECUTION_ID || null,
    });

    // Appwrite server SDK runtime vars
    const endpointPick = pickEnv(
      'APPWRITE_FUNCTION_ENDPOINT',
      'APPWRITE_ENDPOINT',
      'APPWRITE_ENDPOINT_ID',
      'APPWRITE_API_ENDPOINT',
      'APPWRITE_URL'
    );
    const projectPick = pickEnv('APPWRITE_FUNCTION_PROJECT_ID', 'APPWRITE_PROJECT_ID');
    // Prefer explicit API key (user-managed scopes) when provided.
    // Fall back to runtime key generated from Function Scopes.
    const apiKeyPick = pickEnv('APPWRITE_API_KEY', 'APPWRITE_FUNCTION_API_KEY');

    const endpoint = normalizeEndpoint(endpointPick.value);
    const projectId = projectPick.value;
    const apiKey = apiKeyPick.value;

    log('patientRecordIdOnVerify: env check', {
      haveEndpoint: Boolean(endpoint),
      haveProjectId: Boolean(projectId),
      haveApiKey: Boolean(apiKey),
      endpointKeyUsed: endpointPick.key || null,
      projectKeyUsed: projectPick.key || null,
      apiKeyKeyUsed: apiKeyPick.key || null,
    });

    if (!endpoint || !projectId || !apiKey) {
      return res.json(
        {
          error: 'Missing Appwrite runtime vars (endpoint/project/apiKey).',
          haveEndpoint: Boolean(endpoint),
          haveProjectId: Boolean(projectId),
          haveApiKey: Boolean(apiKey),
          endpointKeyUsed: endpointPick.key || null,
          projectKeyUsed: projectPick.key || null,
          apiKeyKeyUsed: apiKeyPick.key || null,
        },
        500
      );
    }

    const patientDatabaseId = process.env.PATIENT_DATABASE_ID;
    const patientRecordsCollectionId = process.env.PATIENT_RECORDS_COLLECTION_ID;
    const submissionCountersCollectionId = process.env.SUBMISSION_COUNTERS_COLLECTION_ID;

    if (!patientDatabaseId || !patientRecordsCollectionId || !submissionCountersCollectionId) {
      return res.json(
        {
          error: 'Missing required function variables.',
          need: [
            'PATIENT_DATABASE_ID',
            'PATIENT_RECORDS_COLLECTION_ID',
            'SUBMISSION_COUNTERS_COLLECTION_ID',
          ],
          have: {
            PATIENT_DATABASE_ID: Boolean(patientDatabaseId),
            PATIENT_RECORDS_COLLECTION_ID: Boolean(patientRecordsCollectionId),
            SUBMISSION_COUNTERS_COLLECTION_ID: Boolean(submissionCountersCollectionId),
          },
        },
        500
      );
    }

    const client = new sdk.Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
    const databases = new sdk.Databases(client);

    // Primary: event payload from Appwrite event trigger.
    // Fallback: manual execution via Console "Execute" using request body.
    const envEventData = process.env.APPWRITE_FUNCTION_EVENT_DATA;
    const payloadFromEnv = parseJsonBestEffort(envEventData);
    const payloadFromBody = parseJsonBestEffort(req?.body);
    const payload = payloadFromEnv || payloadFromBody || {};

    log('patientRecordIdOnVerify: payload source', {
      fromEnv: Boolean(payloadFromEnv),
      fromBody: Boolean(!payloadFromEnv && payloadFromBody),
      hasId: Boolean(payload?.$id),
    });

    if (!payload || typeof payload !== 'object') {
      return res.json({ error: 'No valid payload (event data or request body).' }, 400);
    }
    const previous = payload?.$previous || {};

    const statusNow = normalizeStatus(payload?.status);
    const statusPrev = normalizeStatus(previous?.status);

    // Only generate after physician verification.
    if (statusNow !== 'verified') {
      return res.json({ message: 'Not verified; skipping.' });
    }

    // Avoid re-running for already-assigned ids.
    const existingId = firstString(payload?.patientRecordId || payload?.patientRecordID);
    if (existingId) {
      return res.json({ message: 'patientRecordId already exists; skipping.', patientRecordId: existingId });
    }

    // Guard: only when transitioning to verified OR when prescription is newly attached.
    const newRx = firstString(payload?.prescription_images);
    const prevRx = firstString(previous?.prescription_images);
    const isVerifyTransition = statusPrev !== 'verified';
    const isNewPrescription = Boolean(newRx) && newRx !== prevRx;

    if (!isVerifyTransition && !isNewPrescription) {
      return res.json({ message: 'Verified update without transition/new prescription; skipping.' });
    }

    const barangayValue = firstString(payload?.barangayCode) || firstString(payload?.barangay);
    const barangayCode = generateBarangayCode(barangayValue);

    // Year created = year submitted/created (not year verified)
    const createdAtRaw = payload?.dateSubmitted || payload?.$createdAt || payload?.createdAt;
    const createdAt = createdAtRaw ? new Date(createdAtRaw) : new Date();
    const yearCreated = Number.isFinite(createdAt.getTime()) ? createdAt.getFullYear() : new Date().getFullYear();

    log('Generating patientRecordId...', { barangayCode, yearCreated, recordId: payload?.$id });

    const maxAttempts = 5;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      // 1) Find or create counter
      const counters = await databases.listDocuments(patientDatabaseId, submissionCountersCollectionId, [
        sdk.Query.equal('barangayCode', barangayCode),
        sdk.Query.equal('submissionYear', yearCreated),
        sdk.Query.limit(1),
      ]);

      const counterDoc = counters?.documents?.[0] || null;

      let nextCounter = 1;
      let counterDocId = '';

      if (counterDoc) {
        counterDocId = counterDoc.$id;
        nextCounter = (Number(counterDoc.patientRecordCurrent) || 0) + 1;

        await databases.updateDocument(patientDatabaseId, submissionCountersCollectionId, counterDocId, {
          patientRecordCurrent: nextCounter,
        });
      } else {
        const createdCounter = await databases.createDocument(
          patientDatabaseId,
          submissionCountersCollectionId,
          sdk.ID.unique(),
          {
            barangayCode,
            submissionYear: yearCreated,
            current: 0,
            patientRecordCurrent: 1,
          }
        );
        counterDocId = createdCounter.$id;
        nextCounter = 1;
      }

      // 2) Build ID and set on patient record
      const suffix = encodeSuffix(nextCounter);
      const patientRecordId = `PR-${yearCreated}-${barangayCode}-${suffix}`;

      try {
        await databases.updateDocument(patientDatabaseId, patientRecordsCollectionId, payload.$id, {
          patientRecordId,
        });

        return res.json({
          message: 'patientRecordId generated.',
          patientRecordId,
          attempt,
          counterDocId,
          recordId: payload.$id,
        });
      } catch (e) {
        const msg = String(e?.message || e);
        error(e);
        if (attempt < maxAttempts && /already exists|unique/i.test(msg)) {
          log('Collision detected; retrying...', { attempt, msg });
          continue;
        }
        return res.json({ error: 'Failed to set patientRecordId.', message: msg, attempt }, 500);
      }
    }

    return res.json({ error: 'Failed to generate patientRecordId after retries.' }, 500);
  } catch (err) {
    error(err);
    return res.json({ error: err?.message || String(err) }, 500);
  }
};
