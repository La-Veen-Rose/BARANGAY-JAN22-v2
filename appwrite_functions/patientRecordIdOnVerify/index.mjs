// Wrapper entrypoint.
// We keep the actual implementation in src/main.js (CommonJS) so it can be shared
// and uses process.env (Appwrite runtime vars).

import handler from './src/main.js';

export default handler;
