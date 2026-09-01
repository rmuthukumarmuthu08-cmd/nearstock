/**
 * Vercel catch-all API function.
 * Every /api/* request lands here and is handled by the same Express app that
 * server/index.js runs locally, so routing behaves identically in both places.
 */
module.exports = require('../server/app');
