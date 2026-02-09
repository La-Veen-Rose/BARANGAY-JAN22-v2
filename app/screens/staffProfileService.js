import { account, databases, appwriteConfig, Query } from './appwriteConfig';

export const STAFF_ROLE = {
  BHW: 'bhw',
  PHYSICIAN: 'physician',
};

const normalizeLocationValue = (value) =>
  String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');

const COHORT_CACHE_TTL_MS = 5 * 60 * 1000;
const cohortCache = new Map();

const getBhwOwnerIdentityFromProfile = (profile) => {
  if (!profile) return { hwId: null, authUserId: null };
  const hwId =
    profile.healthWorkerId ||
    profile.healthWorkerID ||
    profile.healthWorkerIDNumber ||
    profile.$id ||
    null;
  const authUserId = profile.auth_user_id || null;
  return { hwId, authUserId };
};

const listAllDocuments = async (databaseId, collectionId, queries = [], options = {}) => {
  const limit = Number(options.limit) || 100;
  const maxDocs = Number(options.maxDocs) || 2000;

  let offset = 0;
  let all = [];
  while (all.length < maxDocs) {
    const res = await databases.listDocuments(
      databaseId,
      collectionId,
      [...queries, Query.limit(limit), Query.offset(offset)]
    );

    const docs = res.documents || [];
    all = all.concat(docs);
    offset += docs.length;
    if (docs.length < limit) break;
  }
  return all;
};

/**
 * Builds a Query filter that limits PatientRecords to those submitted by BHWs who
 * share the same purok + barangay (case-insensitive match against HealthWorkers table).
 *
 * This does NOT use the patient record's own purok/barangay fields.
 */
export async function getBhwAccessiblePatientRecordOwnerFilters(workerProfile) {
  // If no location on profile, fall back to own records.
  const purokNorm = normalizeLocationValue(workerProfile?.purok);
  const barangayNorm = normalizeLocationValue(workerProfile?.barangay);

  const buildOwnOwnerFilters = async () => {
    let currentUser = null;
    try {
      currentUser = await account.get();
    } catch {
      // ignore
    }

    const { hwId } = getBhwOwnerIdentityFromProfile(workerProfile);
    const orQueries = [];
    if (currentUser?.$id) orQueries.push(Query.equal('recordedByUserID', currentUser.$id));
    if (hwId) orQueries.push(Query.equal('recordedByHWID', hwId));

    if (orQueries.length === 0) return [];
    if (orQueries.length === 1) return [orQueries[0]];
    return [Query.or(orQueries)];
  };

  if (!purokNorm || !barangayNorm) {
    return buildOwnOwnerFilters();
  }

  const cacheKey = `${purokNorm}|${barangayNorm}`;
  const cached = cohortCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < COHORT_CACHE_TTL_MS) {
    return cached.filters;
  }

  try {
    const docs = await listAllDocuments(
      appwriteConfig.staffDatabaseId,
      appwriteConfig.healthWorkersCollectionId,
      [],
      { limit: 100, maxDocs: 2000 }
    );

    const matched = docs.filter((doc) => {
      const docPurok = normalizeLocationValue(doc?.purok);
      const docBarangay = normalizeLocationValue(doc?.barangay);
      return docPurok === purokNorm && docBarangay === barangayNorm;
    });

    const userIds = Array.from(
      new Set(matched.map((d) => d?.auth_user_id).filter(Boolean))
    );

    const hwIds = Array.from(
      new Set(
        matched
          .flatMap((d) => [
            d?.healthWorkerId,
            d?.healthWorkerID,
            d?.healthWorkerIDNumber,
            d?.$id,
          ])
          .filter(Boolean)
      )
    );

    const orQueries = [];
    if (userIds.length) orQueries.push(Query.equal('recordedByUserID', userIds));
    if (hwIds.length) orQueries.push(Query.equal('recordedByHWID', hwIds));

    const filters =
      orQueries.length === 0
        ? await buildOwnOwnerFilters()
        : orQueries.length === 1
          ? [orQueries[0]]
          : [Query.or(orQueries)];

    cohortCache.set(cacheKey, { ts: Date.now(), filters });
    return filters;
  } catch (e) {
    console.log('Cohort lookup failed; falling back to own records:', e?.message || String(e));
    return buildOwnOwnerFilters();
  }
}

export async function getCurrentStaffProfile() {
  const user = await account.get();

  // 1) Prefer BHW profile
  try {
    const bhwRes = await databases.listDocuments(
      appwriteConfig.staffDatabaseId,
      appwriteConfig.healthWorkersCollectionId,
      [Query.equal('auth_user_id', user.$id)]
    );

    if (bhwRes.documents && bhwRes.documents.length > 0) {
      return { user, role: STAFF_ROLE.BHW, profile: bhwRes.documents[0] };
    }
  } catch (e) {
    console.error('Error checking BHW profile:', e);
    // ignore and try physician
  }

  // 2) Physician profile
  if (!appwriteConfig.physicianAccountsCollectionId) {
    throw new Error(
      `Staff profile not found: physicianAccountsCollectionId is missing from environment configuration. ` +
      `User ID: ${user.$id}, Email: ${user.email}`
    );
  }

  try {
    const physicianRes = await databases.listDocuments(
      appwriteConfig.staffDatabaseId,
      appwriteConfig.physicianAccountsCollectionId,
      [Query.equal('auth_user_id', user.$id)]
    );

    if (physicianRes.documents && physicianRes.documents.length > 0) {
      return { user, role: STAFF_ROLE.PHYSICIAN, profile: physicianRes.documents[0] };
    }
  } catch (e) {
    console.error('Error checking Physician profile:', e);
  }

  // Provide detailed error message with user information
  throw new Error(
    `Staff profile not found for user ${user.email} (ID: ${user.$id}). ` +
    `User does not exist in either the health workers or physician accounts collection. ` +
    `Please ensure the user account is properly set up in the Appwrite dashboard.`
  );
}

export function getStaffDisplayName(profile, role) {
  if (!profile) return role === STAFF_ROLE.PHYSICIAN ? 'PHYSICIAN' : 'HEALTH WORKER';

  if (role === STAFF_ROLE.PHYSICIAN) {
    return (
      profile.Physician_Name ||
      profile.physicianName ||
      profile.fullName ||
      profile.name ||
      'PHYSICIAN'
    );
  }

  return profile.fullName || profile.name || 'HEALTH WORKER';
}

export function getStaffHeaderLocation(profile, role) {
  if (!profile) return 'Tagum City';

  // BHW shows assigned barangay
  if (role === STAFF_ROLE.BHW) {
    if (profile.barangay) return `${profile.barangay}, Tagum`;
    return 'Tagum City';
  }

  // Physician can show office or just Tagum City
  if (profile.office) return profile.office;
  return 'Tagum City';
}

export async function updateLastLoginAtForCurrentUser(options = {}) {
  const now = options?.now instanceof Date ? options.now : new Date();
  const lastLoginAt = now.toISOString();

  let user;
  try {
    user = await account.get();
  } catch (e) {
    // Not logged in yet (guest) or missing scopes.
    return { updatedHealthWorker: false, updatedPhysician: false, lastLoginAt };
  }

  const updateCollection = async (collectionId) => {
    if (!collectionId) return false;

    // 1) Prefer auth_user_id match
    let doc = null;
    try {
      const res = await databases.listDocuments(
        appwriteConfig.staffDatabaseId,
        collectionId,
        [Query.equal('auth_user_id', user.$id), Query.limit(1)]
      );
      doc = res.documents && res.documents[0];
    } catch {
      // ignore
    }

    // 2) Fallback: match by email
    if (!doc && user.email) {
      try {
        const res = await databases.listDocuments(
          appwriteConfig.staffDatabaseId,
          collectionId,
          [Query.equal('email', user.email), Query.limit(1)]
        );
        doc = res.documents && res.documents[0];
      } catch {
        // ignore
      }
    }

    if (!doc) return false;

    try {
      await databases.updateDocument(
        appwriteConfig.staffDatabaseId,
        collectionId,
        doc.$id,
        { lastLoginAt }
      );
      return true;
    } catch (e) {
      // If schema isn't deployed yet or permissions are missing, don't break login.
      console.log('Failed updating lastLoginAt:', e?.message || String(e));
      return false;
    }
  };

  const [updatedHealthWorker, updatedPhysician] = await Promise.all([
    updateCollection(appwriteConfig.healthWorkersCollectionId),
    updateCollection(appwriteConfig.physicianAccountsCollectionId),
  ]);

  return { updatedHealthWorker, updatedPhysician, lastLoginAt };
}

export async function updatePresenceForCurrentUser(options = {}) {
  const now = options?.now instanceof Date ? options.now : new Date();
  const lastSeenAt = options?.lastSeenAt instanceof Date
    ? options.lastSeenAt.toISOString()
    : options?.lastSeenAt || now.toISOString();
  const isOnline = typeof options?.isOnline === 'boolean' ? options.isOnline : true;

  let user;
  try {
    user = await account.get();
  } catch (e) {
    // Not logged in yet (guest) or missing scopes.
    return { updatedHealthWorker: false, updatedPhysician: false, isOnline, lastSeenAt };
  }

  const updateCollection = async (collectionId) => {
    if (!collectionId) return false;

    // 1) Prefer auth_user_id match
    let doc = null;
    try {
      const res = await databases.listDocuments(
        appwriteConfig.staffDatabaseId,
        collectionId,
        [Query.equal('auth_user_id', user.$id), Query.limit(1)]
      );
      doc = res.documents && res.documents[0];
    } catch {
      // ignore
    }

    // 2) Fallback: match by email
    if (!doc && user.email) {
      try {
        const res = await databases.listDocuments(
          appwriteConfig.staffDatabaseId,
          collectionId,
          [Query.equal('email', user.email), Query.limit(1)]
        );
        doc = res.documents && res.documents[0];
      } catch {
        // ignore
      }
    }

    if (!doc) return false;

    try {
      await databases.updateDocument(
        appwriteConfig.staffDatabaseId,
        collectionId,
        doc.$id,
        { isOnline, lastSeenAt }
      );
      return true;
    } catch (e) {
      // If schema isn't deployed yet or permissions are missing, don't break the app.
      console.log('Failed updating presence:', e?.message || String(e));
      return false;
    }
  };

  const [updatedHealthWorker, updatedPhysician] = await Promise.all([
    updateCollection(appwriteConfig.healthWorkersCollectionId),
    updateCollection(appwriteConfig.physicianAccountsCollectionId),
  ]);

  return { updatedHealthWorker, updatedPhysician, isOnline, lastSeenAt };
}
