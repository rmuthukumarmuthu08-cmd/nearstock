/**
 * ============================================================================
 *  NearStock — Express application
 * ============================================================================
 *  Exported (not listened on) so the same app object can be used by:
 *    • server/index.js  → a normal Node HTTP server for local development
 *    • api/index.js     → a Vercel serverless function in production
 */

const path = require('path');
const express = require('express');
const cors = require('cors');

require('dotenv').config();

const { getStore, driverInfo } = require('./lib/db');
const catalogRoutes = require('./routes/catalog');
const inventoryRoutes = require('./routes/inventory');
const queueRoutes = require('./routes/queue');

const app = express();

app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true }));

/**
 * Vercel rewrites /api/* onto this single function. Depending on how the
 * rewrite resolves, req.url may arrive as "/api/search" or as "/search".
 * Mounting the router at both roots makes the app agnostic to that.
 */
const api = express.Router();

api.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'NearStock API', time: new Date().toISOString() });
});

api.get('/meta', async (req, res, next) => {
  try {
    const db = await getStore();
    res.json({
      service: 'NearStock',
      version: require('../package.json').version,
      data: driverInfo(),
      stats: await db.stats(),
      dsa: {
        primary: 'Queue (FIFO) — circular array, O(1) enqueue/dequeue',
        supporting: ['MinHeap for k-nearest shops', 'Merge sort for ranking', 'Linear + binary search for the catalogue'],
      },
    });
  } catch (err) { next(err); }
});

api.post('/admin/reset', async (req, res, next) => {
  try {
    const db = await getStore();
    await db.reset();
    res.json({ ok: true, message: 'Demo data reset to its seeded state.' });
  } catch (err) { next(err); }
});

api.use(catalogRoutes);
api.use(inventoryRoutes);
api.use(queueRoutes);

app.use('/api', api);
app.use('/', api);

// Static frontend (local dev; on Vercel /public is served by the CDN).
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

app.use((req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
  res.status(404).sendFile(path.join(__dirname, '..', 'public', '404.html'), (err) => {
    if (err) res.status(404).type('txt').send('Not found');
  });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error('[nearstock]', err);
  res.status(status).json({ error: err.message || 'Internal server error' });
});

module.exports = app;
