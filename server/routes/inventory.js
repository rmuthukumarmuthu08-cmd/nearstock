/**
 *  Routes: shop-side inventory and the billing-system bridge.
 *
 *  GET  /stores/:id/inventory
 *  PUT  /stores/:id/inventory            { product_id, quantity, price }
 *  POST /stores/:id/billing-sync         { product_id, delta, source }
 *  POST /billing/webhook                 { store_id, lines: [{product_id, delta}] }
 *  GET  /billing/recent
 *
 *  The webhook is what a real POS/billing terminal would call after each sale:
 *  it pushes stock deltas, and the customer app sees the new numbers instantly.
 */

const express = require('express');
const { getStore } = require('../lib/db');

const router = express.Router();

router.get('/stores/:id/inventory', async (req, res, next) => {
  try {
    const db = await getStore();
    const store = await db.getStore(req.params.id);
    if (!store) return res.status(404).json({ error: 'Store not found' });
    const items = await db.storeInventory(store.store_id);
    res.json({
      store,
      count: items.length,
      totalUnits: items.reduce((n, i) => n + i.quantity, 0),
      outOfStock: items.filter((i) => i.quantity === 0).length,
      lowStock: items.filter((i) => i.quantity > 0 && i.quantity <= 5).length,
      items,
    });
  } catch (err) { next(err); }
});

router.put('/stores/:id/inventory', async (req, res, next) => {
  try {
    const { product_id, quantity, price } = req.body || {};
    if (!product_id) return res.status(400).json({ error: 'product_id is required' });

    const db = await getStore();
    const store = await db.getStore(req.params.id);
    if (!store) return res.status(404).json({ error: 'Store not found' });

    const row = await db.upsertInventory(store.store_id, product_id, quantity, price);
    res.json({ ok: true, inventory: row });
  } catch (err) { next(err); }
});

router.post('/stores/:id/billing-sync', async (req, res, next) => {
  try {
    const { product_id, delta, source } = req.body || {};
    if (!product_id || delta === undefined) {
      return res.status(400).json({ error: 'product_id and delta are required' });
    }
    const db = await getStore();
    const store = await db.getStore(req.params.id);
    if (!store) return res.status(404).json({ error: 'Store not found' });

    const result = await db.applyBillingDelta(store.store_id, product_id, delta, source || 'pos');
    res.json({ ok: true, ...result });
  } catch (err) { next(err); }
});

/** Batch push — the shape a real billing terminal would post at end of sale. */
router.post('/billing/webhook', async (req, res, next) => {
  try {
    const { store_id, lines, source } = req.body || {};
    if (!store_id || !Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ error: 'store_id and a non-empty lines[] are required' });
    }
    const db = await getStore();
    const store = await db.getStore(store_id);
    if (!store) return res.status(404).json({ error: 'Store not found' });

    const applied = [];
    const failed = [];
    for (const line of lines) {
      try {
        const r = await db.applyBillingDelta(store.store_id, line.product_id, line.delta, source || 'pos');
        applied.push({ product_id: line.product_id, before: r.before, after: r.after });
      } catch (err) {
        failed.push({ product_id: line.product_id, reason: err.message });
      }
    }
    res.json({ ok: failed.length === 0, store: store.name, applied, failed });
  } catch (err) { next(err); }
});

router.get('/billing/recent', async (req, res, next) => {
  try {
    const db = await getStore();
    res.json({ events: await db.recentBillingSync(Number(req.query.limit) || 20) });
  } catch (err) { next(err); }
});

module.exports = router;
