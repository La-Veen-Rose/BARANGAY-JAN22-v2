import { databases, functions, appwriteConfig, ID } from './appwriteConfig';
import { getCurrentStaffProfile, STAFF_ROLE } from './staffProfileService';

const canWriteDirect = () =>
  Boolean(appwriteConfig.itManagementDatabaseId && appwriteConfig.activityLogsCollectionId);

const canUseFunction = () => Boolean(appwriteConfig.activityLoggerFunctionId);

const toIso = (value) => {
  if (value instanceof Date) return value.toISOString();
  return new Date().toISOString();
};

const resolveUserMeta = async ({ staffRole, workerProfile } = {}) => {
  // If caller already has the profile+role, use it to avoid extra reads.
  if (staffRole && workerProfile) {
    if (staffRole === STAFF_ROLE.PHYSICIAN || staffRole === 'physician') {
      return {
        userRole: 'Physician',
        userName: workerProfile?.Physician_Name || null,
      };
    }

    return {
      userRole: 'BHW',
      userName: workerProfile?.fullName || null,
    };
  }

  // Otherwise, resolve from current session.
  const staff = await getCurrentStaffProfile();
  const role = staff?.role;
  const profile = staff?.profile;

  if (role === STAFF_ROLE.PHYSICIAN) {
    return {
      userRole: 'Physician',
      userName: profile?.Physician_Name || null,
    };
  }

  return {
    userRole: 'BHW',
    userName: profile?.fullName || null,
  };
};

export const logActivity = async ({
  action,
  description,
  now,
  staffRole,
  workerProfile,
} = {}) => {
  const safeAction = String(action || '').trim();
  const safeDescription = String(description || '').trim();
  if (!safeAction || !safeDescription) return { skipped: true, reason: 'missing_fields' };

  let meta = { userRole: 'Unknown', userName: null };
  try {
    meta = await resolveUserMeta({ staffRole, workerProfile });
  } catch (e) {
    // If we can't resolve staff details, still try to log a row.
    console.log('Activity log meta resolve skipped:', e?.message || String(e));
  }

  const payload = {
    userName: meta.userName || meta.userRole || 'Unknown',
    userRole: meta.userRole || 'Unknown',
    timestamp: toIso(now),
    action: safeAction,
    description: safeDescription,
  };

  // Prefer server-side function if configured (usually better for permissions).
  if (canUseFunction()) {
    try {
      await functions.createExecution(
        appwriteConfig.activityLoggerFunctionId,
        JSON.stringify(payload)
      );
      return { skipped: false, via: 'function' };
    } catch (e) {
      console.log(
        'Activity log function failed; falling back to direct write:',
        e?.message || String(e)
      );
      // fall through to direct write
    }
  }

  if (!canWriteDirect()) return { skipped: true, reason: 'missing_config' };

  try {
    await databases.createDocument(
      appwriteConfig.itManagementDatabaseId,
      appwriteConfig.activityLogsCollectionId,
      ID.unique(),
      payload
    );
    return { skipped: false, via: 'database' };
  } catch (e) {
    console.log('Activity log write skipped:', e?.message || String(e));
    return { skipped: true, reason: 'write_failed' };
  }
};
