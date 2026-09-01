/**
 *  Routes: the customer request Queue — the project's core DSA.
 *
 *  POST   /queue                        enqueue  O(1)   join the line
 *  GET    /stores/:id/queue             snapshot in FIFO order (front first)
 *  GET    /stores/:id/queue/peek        peek     O(1)   who is next?
 *  POST   /stores/:id/queue/next        dequeue  O(1)   serve the front
 *  DELETE /stores/:id/queue/:requestId  cancel   O(n)   leave the line
 *  GET    /stores/:id/queue/history     recently processed requests
 *  GET    /queues                       every store's line (dashboard overview)
 */

const express = require('express');
const { getStore } = require('../lib/db');

const router = express.Router();

router.post('/queue', async (req, res, next) => {
  try {
    const { store_id, product_id, customer_name, customer_phone, quantity, note } = req.body || {};
    if (!store_id || !product_id || !customer_name) {
      return res.status(400).json({ error: 'store_id, product_id and customer_name are required' });
    }

    const db = await getStore();
    const [store, product] = await Promise.all([db.getStore(store_id), db.getProduct(product_id)]);
    if (!store) return res.status(404).json({ error: 'Store not found' });
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const result = await db.enqueueRequest({
      store_id, product_id, customer_name, customer_phone, quantity, note,
    });

    res.status(201).json({
      ok: true,
      request: result.request,
      store: { store_id: store.store_id, name: store.name, phone: store.phone },
      product: { product_id: product.product_id, name: product.name, image_emoji: product.image_emoji },
      positionInLine: result.positionInLine,
      queueLength: result.queueLength,
      message: result.positionInLine === 1
        ? `You are next in line at ${store.name}.`
        : `You are #${result.positionInLine} in line at ${store.name}.`,
      dsa: { operation: 'enqueue', structure: 'Queue (circular array)', complexity: 'O(1)' },
    });
  } catch (err) { next(err); }
});

router.get('/stores/:id/queue', async (req, res, next) => {
  try {
    const db = await getStore();
    const store = await db.getStore(req.params.id);
    if (!store) return res.status(404).json({ error: 'Store not found' });
    const items = await db.listQueue(store.store_id);
    res.json({
      store,
      length: items.length,
      front: items[0] || null,
      rear: items[items.length - 1] || null,
      items,
      dsa: { structure: 'Queue (FIFO)', note: 'items[0] is the front — the request that has waited longest.' },
    });
  } catch (err) { next(err); }
});

router.get('/stores/:id/queue/peek', async (req, res, next) => {
  try {
    const db = await getStore();
    const store = await db.getStore(req.params.id);
    if (!store) return res.status(404).json({ error: 'Store not found' });
    const front = await db.peekQueue(store.store_id);
    res.json({ front, dsa: { operation: 'peek', complexity: 'O(1)' } });
  } catch (err) { next(err); }
});

router.post('/stores/:id/queue/next', async (req, res, next) => {
  try {
    const db = await getStore();
    const store = await db.getStore(req.params.id);
    if (!store) return res.status(404).json({ error: 'Store not found' });

    const served = await db.dequeueRequest(store.store_id);
    if (!served) return res.status(409).json({ error: 'Queue is empty — nothing to serve.' });

    const remaining = await db.listQueue(store.store_id);
    res.json({
      ok: true,
      served,
      remaining: remaining.length,
      nextUp: remaining[0] || null,
      dsa: { operation: 'dequeue', structure: 'Queue (circular array)', complexity: 'O(1)' },
    });
  } catch (err) { next(err); }
});

router.delete('/stores/:id/queue/:requestId', async (req, res, next) => {
  try {
    const db = await getStore();
    const cancelled = await db.cancelRequest(req.params.id, req.params.requestId);
    if (!cancelled) return res.status(404).json({ error: 'Request not found in this queue' });
    const remaining = await db.listQueue(req.params.id);
    res.json({
      ok: true, cancelled, remaining: remaining.length,
      dsa: { operation: 'remove', note: 'Rebuilds the ring buffer to preserve FIFO order', complexity: 'O(n)' },
    });
  } catch (err) { next(err); }
});

router.get('/stores/:id/queue/history', async (req, res, next) => {
  try {
    const db = await getStore();
    res.json({ history: await db.queueHistory(req.params.id, Number(req.query.limit) || 15) });
  } catch (err) { next(err); }
});

router.get('/queues', async (req, res, next) => {
  try {
    const db = await getStore();
    const queues = await db.listAllQueues();
    res.json({
      totalWaiting: queues.reduce((n, q) => n + q.items.length, 0),
      queues,
    });
  } catch (err) { next(err); }
});

module.exports = router;
