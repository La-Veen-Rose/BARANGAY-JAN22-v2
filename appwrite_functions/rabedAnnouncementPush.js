// Appwrite Cloud Function: send push notification when a new RabEd announcement is created
// Runtime: Node 18 (or newer)

import sdk from 'node-appwrite';

export default async ({ req, res, log, error }) => {
  try {
    const client = new sdk.Client()
      .setEndpoint(req.variables.APPWRITE_FUNCTION_ENDPOINT)
      .setProject(req.variables.APPWRITE_FUNCTION_PROJECT_ID)
      .setKey(req.variables.APPWRITE_FUNCTION_API_KEY);

    const databases = new sdk.Databases(client);

    const payload = JSON.parse(req.variables.APPWRITE_FUNCTION_EVENT_DATA || '{}');
    const { content } = payload;

    // Fetch all health workers that have a push token
    const staffDatabaseId = req.variables.STAFF_DATABASE_ID;
    const staffCollectionId = req.variables.HEALTH_WORKERS_COLLECTION_ID;

    const workersRes = await databases.listDocuments(staffDatabaseId, staffCollectionId, [
      sdk.Query.isNotNull('expoPushToken'),
    ]);

    const tokens = workersRes.documents
      .map((doc) => doc.expoPushToken)
      .filter(Boolean);

    if (!tokens.length) {
      return res.json({ message: 'No Expo push tokens found.' });
    }

    const messageBody = content || 'City Health Office posted a new RabEd announcement.';

    const expoMessages = tokens.map((token) => ({
      to: token,
      title: 'New RabEd Announcement',
      body: messageBody,
      data: {
        type: 'rabed_announcement',
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
