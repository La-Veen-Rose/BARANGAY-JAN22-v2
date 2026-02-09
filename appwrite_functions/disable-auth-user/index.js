const { Client, Users } = require('node-appwrite');

const parsePayload = (input) => {
  if (!input) return {};
  if (typeof input === 'object') return input;
  if (typeof input !== 'string') return {};
  try {
    return JSON.parse(input);
  } catch {
    return {};
  }
};

const pickEnv = (req, key, fallback) => {
  const fromReq = req?.variables && req.variables[key];
  if (typeof fromReq === 'string' && fromReq.trim()) return fromReq.trim();
  const fromEnv = process.env[fallback || key];
  if (typeof fromEnv === 'string' && fromEnv.trim()) return fromEnv.trim();
  return '';
};

module.exports = async ({ req, res, log, error }) => {
  const payload = parsePayload(req?.body);
  const { authUserId, reason } = payload || {};

  if (!authUserId) {
    return res.json({ error: 'authUserId required' }, 400);
  }

  const endpoint = pickEnv(req, 'APPWRITE_FUNCTION_ENDPOINT', 'APPWRITE_ENDPOINT');
  const projectId = pickEnv(req, 'APPWRITE_FUNCTION_PROJECT_ID', 'APPWRITE_PROJECT_ID');
  const apiKey = pickEnv(req, 'APPWRITE_FUNCTION_API_KEY', 'APPWRITE_API_KEY');

  if (!endpoint || !projectId || !apiKey) {
    return res.json({ error: 'Missing Appwrite env vars' }, 500);
  }

  const client = new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(apiKey);

  const users = new Users(client);

  try {
    await users.updateStatus(authUserId, false);

    return res.json({
      ok: true,
      message: `User ${authUserId} disabled`,
      reason: reason || 'Account locked',
    });
  } catch (err) {
    if (typeof error === 'function') {
      error('Failed to disable user', { message: err?.message || String(err) });
    }
    return res.json({ error: err?.message || 'Failed to disable user' }, 500);
  }
};
