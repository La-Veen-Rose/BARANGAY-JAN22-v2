import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { account, databases, appwriteConfig } from '../screens/appwriteConfig';
import { Query } from 'appwrite';

// Ask for permissions and get Expo push token
export async function registerForPushNotificationsAsync() {
  try {
    let token;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Push notification permission not granted');
      return null;
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId ??
      null;

    if (!projectId) {
      console.error(
        'Expo projectId is missing. Configure EAS project ID in app.json (extra.eas.projectId) or your build settings.'
      );
      return null;
    }

    token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    console.log('Expo push token:', token);
    return token;
  } catch (error) {
    console.error('Error registering for push notifications:', error);
    return null;
  }
}

// Store the Expo push token in the logged-in health worker profile document
export async function savePushTokenForCurrentUser(expoPushToken) {
  if (!expoPushToken) return;

  try {
    const user = await account.get();

    // Find corresponding health worker profile by auth_user_id
    const staffRes = await databases.listDocuments(
      appwriteConfig.staffDatabaseId,
      appwriteConfig.healthWorkersCollectionId,
      [Query.equal('auth_user_id', user.$id)]
    );

    let workerDoc = staffRes.documents && staffRes.documents[0];

    // Fallback: lookup by email if needed
    if (!workerDoc) {
      const emailRes = await databases.listDocuments(
        appwriteConfig.staffDatabaseId,
        appwriteConfig.healthWorkersCollectionId,
        [Query.equal('email', user.email)]
      );
      workerDoc = emailRes.documents && emailRes.documents[0];
    }

    if (!workerDoc) {
      console.log('Health worker profile not found for current user; cannot save push token.');
      return;
    }

    if (workerDoc.expoPushToken === expoPushToken) {
      // No change
      return;
    }

    await databases.updateDocument(
      appwriteConfig.staffDatabaseId,
      appwriteConfig.healthWorkersCollectionId,
      workerDoc.$id,
      { expoPushToken }
    );

    console.log('Saved Expo push token to worker profile');
  } catch (error) {
    console.error('Error saving Expo push token:', error);
  }
}
