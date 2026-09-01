/**
 * Vercel serverless entry point.
 * vercel.json rewrites every /api/* request onto this function, and the
 * Express app inside handles the routing exactly as it does locally.
 */
module.exports = require('../server/app');
