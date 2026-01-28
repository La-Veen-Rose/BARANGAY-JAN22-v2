import { Query } from 'appwrite';
import { account, databases, appwriteConfig } from './appwriteConfig';

export const STAFF_ROLE = {
  BHW: 'bhw',
  PHYSICIAN: 'physician',
};

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
    // ignore and try physician
  }

  // 2) Physician profile
  if (!appwriteConfig.physicianAccountsCollectionId) {
    throw new Error('Staff profile not found (physicianAccountsCollectionId missing).');
  }

  const physicianRes = await databases.listDocuments(
    appwriteConfig.staffDatabaseId,
    appwriteConfig.physicianAccountsCollectionId,
    [Query.equal('auth_user_id', user.$id)]
  );

  if (physicianRes.documents && physicianRes.documents.length > 0) {
    return { user, role: STAFF_ROLE.PHYSICIAN, profile: physicianRes.documents[0] };
  }

  throw new Error('Staff profile not found.');
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
