import { databases, appwriteConfig, ID, Query, account, functions } from './appwriteConfig';

const SECURITY_EVENT_TYPES = {
  failed: 'Failed login',
  locked: 'Account locked',
  unregistered: 'Unregistered user',
  success: 'Successful login',
};

const SECURITY_EVENT_DETAILS = {
  failed: 'Failed login attempt',
  locked: 'Account locked after 5 multiple failed login attempts',
  unregistered: 'Unregistered user attempt to login',
  success: 'Successfully logged in',
};

const UNKNOWN_IDENTIFIER = 'unknown';

const ensureLoggingSession = async () => {
  try {
    await account.get();
    return true;
  } catch {
    // No active session; try anonymous so we can write audit rows
  }

  try {
    await account.createAnonymousSession();
    return true;
  } catch (error) {
    console.log('Security log session skipped:', error?.message || String(error));
    return false;
  }
};

const canLog = () =>
  Boolean(appwriteConfig.itManagementDatabaseId && appwriteConfig.securityEventsCollectionId);

const safeListDocuments = async (databaseId, collectionId, queries) => {
  if (!databaseId || !collectionId) return { documents: [] };
  const hasSession = await ensureLoggingSession();
  if (!hasSession) return { documents: [] };
  try {
    return await databases.listDocuments(databaseId, collectionId, queries);
  } catch (error) {
    console.log('Security log query skipped:', error?.message || String(error));
    return { documents: [] };
  }
};

const getNextAttemptCount = async ({ userEmail, authUserId }) => {
  if (!canLog()) return 1;

  try {
    const filters = authUserId
      ? [Query.equal('auth_user_id', authUserId)]
      : [Query.equal('userEmail', userEmail)];

    const res = await safeListDocuments(
      appwriteConfig.itManagementDatabaseId,
      appwriteConfig.securityEventsCollectionId,
      [
        ...filters,
        Query.orderDesc('$createdAt'),
        Query.limit(1),
      ]
    );

    const latest = res.documents && res.documents[0];
    const lastCount = Number(latest?.attemptCount) || 0;
    return lastCount + 1;
  } catch (error) {
    console.log('Security attempt count fallback:', error?.message || String(error));
    return 1;
  }
};

const resolveAuthUserMatch = async (identifier) => {
  const normalized = String(identifier || '').trim();
  if (!normalized) return { matched: false, authUserId: null };

  const checks = [
    safeListDocuments(
      appwriteConfig.staffDatabaseId,
      appwriteConfig.healthWorkersCollectionId,
      [Query.equal('healthWorkerID', normalized), Query.limit(1)]
    ),
    safeListDocuments(
      appwriteConfig.staffDatabaseId,
      appwriteConfig.healthWorkersCollectionId,
      [Query.equal('email', normalized), Query.limit(1)]
    ),
  ];

  if (appwriteConfig.physicianAccountsCollectionId) {
    checks.push(
      safeListDocuments(
        appwriteConfig.staffDatabaseId,
        appwriteConfig.physicianAccountsCollectionId,
        [Query.equal('email', normalized), Query.limit(1)]
      )
    );
  }

  const results = await Promise.all(checks);
  const matchedDoc = results.find((res) => res.documents && res.documents.length > 0)?.documents?.[0];
  const authUserId = matchedDoc?.auth_user_id || null;

  return { matched: Boolean(matchedDoc), authUserId };
};

const writeSecurityEvent = async (payload) => {
  if (!canLog()) return { skipped: true };

  const hasSession = await ensureLoggingSession();
  if (!hasSession) return { skipped: true };

  try {
    await databases.createDocument(
      appwriteConfig.itManagementDatabaseId,
      appwriteConfig.securityEventsCollectionId,
      ID.unique(),
      payload
    );
    return { skipped: false };
  } catch (error) {
    console.log('Security log write skipped:', error?.message || String(error));
    return { skipped: true };
  }
};

const disableAuthUser = async ({ authUserId, reason }) => {
  if (!appwriteConfig.disableAuthUserFunctionId || !authUserId) return;
  try {
    await functions.createExecution(
      appwriteConfig.disableAuthUserFunctionId,
      JSON.stringify({ authUserId, reason })
    );
  } catch (error) {
    console.log('Disable auth user skipped:', error?.message || String(error));
  }
};

export const isIdentifierRegistered = async (identifier) => {
  const resolved = await resolveAuthUserMatch(identifier);
  return resolved.matched;
};

export const logFailedLoginEvent = async ({ userEmail, accessPoint, authUserId }) => {
  const emailForLog = String(userEmail || '').trim() || UNKNOWN_IDENTIFIER;
  let resolvedAuthUserId = authUserId || null;
  let isMatched = Boolean(authUserId);

  if (!isMatched) {
    const resolved = await resolveAuthUserMatch(emailForLog);
    resolvedAuthUserId = resolved.authUserId;
    isMatched = resolved.matched;
  }

  const nextAttempt = await getNextAttemptCount({
    userEmail: emailForLog,
    authUserId: resolvedAuthUserId,
  });

  let eventType = SECURITY_EVENT_TYPES.failed;
  let details = SECURITY_EVENT_DETAILS.failed;

  if (!isMatched) {
    eventType = SECURITY_EVENT_TYPES.unregistered;
    details = SECURITY_EVENT_DETAILS.unregistered;
  } else if (nextAttempt >= 5) {
    eventType = SECURITY_EVENT_TYPES.locked;
    details = SECURITY_EVENT_DETAILS.locked;
  }

  await writeSecurityEvent({
    timestamp: new Date().toISOString(),
    userEmail: emailForLog,
    auth_user_id: resolvedAuthUserId,
    accessPoint: accessPoint || null,
    eventType,
    attemptCount: nextAttempt,
    details,
  });

  if (eventType === SECURITY_EVENT_TYPES.locked && resolvedAuthUserId) {
    await disableAuthUser({
      authUserId: resolvedAuthUserId,
      reason: details,
    });
  }

  return { eventType, attemptCount: nextAttempt };
};

export const logSuspiciousLoginEvent = async ({ attemptedIdentifier, accessPoint }) => {
  return logFailedLoginEvent({ userEmail: attemptedIdentifier, accessPoint, authUserId: null });
};

export const logSuccessfulLoginEvent = async ({ userEmail, accessPoint, authUserId }) => {
  const emailForLog = String(userEmail || '').trim() || UNKNOWN_IDENTIFIER;

  await writeSecurityEvent({
    timestamp: new Date().toISOString(),
    userEmail: emailForLog,
    auth_user_id: authUserId || null,
    accessPoint: accessPoint || null,
    eventType: SECURITY_EVENT_TYPES.success,
    attemptCount: null,
    details: SECURITY_EVENT_DETAILS.success,
  });

  return { eventType: SECURITY_EVENT_TYPES.success };
};
