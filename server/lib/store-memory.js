/**
 * ============================================================================
 *  NearStock — in-memory data store (the zero-config fallback)
 * ============================================================================
 *
 *  Used when no MySQL connection is configured (i.e. on a bare Vercel deploy).
 *  It implements exactly the same interface as store-mysql.js, so the API
 *  routes never know which one they are talking to.
 *
 *  The per-store customer request queues are real `Queue` instances — the
 *  circular-array FIFO from lib/queue.js — so the Queue data structure is
 *  genuinely doing the work, not just being described.
 *
 *  State is mirrored to a JSON snapshot in the OS temp directory so that it
 *  survives across requests within the same serverless instance. It is NOT a
 *  substitute for a real database; set DATABASE_URL to switch to MySQL.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const seed = require('../data/seed');
const { Queue } = require('./queue');

const SNAPSHOT = path.join(os.tmpdir(), 'nearstock-state.json');

const state = {
  users: [],
  stores: [],
  products: [],
  inventory: [],      // { inventory_id, store_id, product_id, quantity, price, updated_at }
  billingSync: [],    // { sync_id, store_id, product_id, delta, source, synced_at }
  queues: new Map(),  // store_id -> Queue of request objects
  history: [],        // requests that have left the queue (fulfilled/cancelled)
  seq: { inventory: 1, request: 1, sync: 1, position: 1 },
};

let ready = false;

/* ------------------------------------------------------------------ */
/*  bootstrap                                                          */
/* ------------------------------------------------------------------ */

function loadSeed() {
  state.users = seed.users.map((u) => ({ ...u }));
  state.stores = seed.stores.map((s) => ({ ...s, is_active: true }));
  state.products = seed.products.map((p) => ({ ...p }));
  state.inventory = seed.inventoryTuples.map(([store_id, product_id, quantity, price]) => ({
    inventory_id: state.seq.inventory++,
    store_id,
    product_id,
    quantity,
    price,
    updated_at: new Date().toISOString(),
  }));
  state.billingSync = [];
  state.queues = new Map();
  state.history = [];

  for (const q of seed.queueSeed) {
    const request = {
      request_id: state.seq.request++,
      store_id: q.store_id,
      product_id: q.product_id,
      customer_name: q.customer_name,
      customer_phone: q.customer_phone,
      quantity: q.quantity,
      note: q.note || '',
      position: state.seq.position++,
      status: q.status,
      enqueued_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
      processed_at: q.status === 'waiting' ? null : new Date().toISOString(),
    };
    if (request.status === 'waiting') queueFor(request.store_id).enqueue(request);
    else state.history.push(request);
  }
}

function queueFor(storeId) {
  const id = Number(storeId);
  if (!state.queues.has(id)) state.queues.set(id, new Queue(16));
  return state.queues.get(id);
}

function persist() {
  try {
    const plain = {
      inventory: state.inventory,
      billingSync: state.billingSync,
      history: state.history,
      seq: state.seq,
      queues: [...state.queues.entries()].map(([id, q]) => [id, q.toArray()]),
    };
    fs.writeFileSync(SNAPSHOT, JSON.stringify(plain));
  } catch { /* snapshotting is best-effort */ }
}

function restore() {
  try {
    if (!fs.existsSync(SNAPSHOT)) return false;
    const raw = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
    if (!raw || !Array.isArray(raw.inventory) || raw.inventory.length === 0) return false;
    state.inventory = raw.inventory;
    state.billingSync = raw.billingSync || [];
    state.history = raw.history || [];
    state.seq = raw.seq || state.seq;
    state.queues = new Map();
    for (const [id, items] of raw.queues || []) state.queues.set(Number(id), Queue.from(items));
    return true;
  } catch {
    return false;
  }
}

async function init() {
  if (ready) return;
  loadSeed();
  restore();            // overlay any snapshot from an earlier request
  ready = true;
}

/* ------------------------------------------------------------------ */
/*  reads                                                              */
/* ------------------------------------------------------------------ */

const listStores = async () => state.stores.filter((s) => s.is_active);
const listProducts = async () => state.products.slice();
const getStore = async (id) => state.stores.find((s) => s.store_id === Number(id)) || null;
const getProduct = async (id) => state.products.find((p) => p.product_id === Number(id)) || null;

/** Every active store that stocks `productId`, with its quantity and price. */
async function availabilityForProduct(productId) {
  const pid = Number(productId);
  const rows = [];
  for (const inv of state.inventory) {
    if (inv.product_id !== pid) continue;
    const store = state.stores.find((s) => s.store_id === inv.store_id && s.is_active);
    if (!store) continue;
    rows.push({ store, quantity: inv.quantity, price: inv.price, updated_at: inv.updated_at });
  }
  return rows;
}

/** Full inventory line-items for one store, joined with the product record. */
async function storeInventory(storeId) {
  const sid = Number(storeId);
  return state.inventory
    .filter((inv) => inv.store_id === sid)
    .map((inv) => ({
      ...inv,
      product: state.products.find((p) => p.product_id === inv.product_id) || null,
    }))
    .filter((r) => r.product);
}

/* ------------------------------------------------------------------ */
/*  writes — inventory                                                 */
/* ------------------------------------------------------------------ */

async function upsertInventory(storeId, productId, quantity, price) {
  const sid = Number(storeId);
  const pid = Number(productId);
  let row = state.inventory.find((i) => i.store_id === sid && i.product_id === pid);
  if (!row) {
    const product = await getProduct(pid);
    if (!product) throw Object.assign(new Error('Unknown product'), { status: 404 });
    row = {
      inventory_id: state.seq.inventory++,
      store_id: sid,
      product_id: pid,
      quantity: 0,
      price: price != null ? Number(price) : product.base_price,
      updated_at: new Date().toISOString(),
    };
    state.inventory.push(row);
  }
  if (quantity != null) row.quantity = Math.max(0, Math.round(Number(quantity)));
  if (price != null) row.price = Number(price);
  row.updated_at = new Date().toISOString();
  persist();
  return row;
}

/** A push from the shop's billing/POS system: negative delta = sold. */
async function applyBillingDelta(storeId, productId, delta, source = 'pos') {
  const sid = Number(storeId);
  const pid = Number(productId);
  const row = state.inventory.find((i) => i.store_id === sid && i.product_id === pid);
  if (!row) throw Object.assign(new Error('Product not stocked by this store'), { status: 404 });

  const before = row.quantity;
  row.quantity = Math.max(0, row.quantity + Math.round(Number(delta)));
  row.updated_at = new Date().toISOString();

  state.billingSync.push({
    sync_id: state.seq.sync++,
    store_id: sid,
    product_id: pid,
    delta: Math.round(Number(delta)),
    source,
    synced_at: new Date().toISOString(),
  });
  persist();
  return { before, after: row.quantity, row };
}

async function recentBillingSync(limit = 20) {
  return state.billingSync
    .slice(-limit)
    .reverse()
    .map((s) => ({
      ...s,
      store: state.stores.find((x) => x.store_id === s.store_id) || null,
      product: state.products.find((x) => x.product_id === s.product_id) || null,
    }));
}

/* ------------------------------------------------------------------ */
/*  writes — the request Queue (FIFO)                                  */
/* ------------------------------------------------------------------ */

async function enqueueRequest({ store_id, product_id, customer_name, customer_phone, quantity, note }) {
  const request = {
    request_id: state.seq.request++,
    store_id: Number(store_id),
    product_id: Number(product_id),
    customer_name,
    customer_phone: customer_phone || '',
    quantity: Math.max(1, Number(quantity) || 1),
    note: note || '',
    position: state.seq.position++,
    status: 'waiting',
    enqueued_at: new Date().toISOString(),
    processed_at: null,
  };
  const q = queueFor(request.store_id);
  q.enqueue(request);                                   // O(1)
  persist();
  return { request, queueLength: q.size, positionInLine: q.size };
}

/** Serve the front of the line — the definition of FIFO. O(1). */
async function dequeueRequest(storeId) {
  const q = queueFor(storeId);
  const request = q.dequeue();
  if (!request) return null;
  request.status = 'fulfilled';
  request.processed_at = new Date().toISOString();
  state.history.push(request);
  persist();
  return request;
}

async function cancelRequest(storeId, requestId) {
  const q = queueFor(storeId);
  const removed = q.remove((r) => r.request_id === Number(requestId));
  if (!removed) return null;
  removed.status = 'cancelled';
  removed.processed_at = new Date().toISOString();
  state.history.push(removed);
  persist();
  return removed;
}

async function peekQueue(storeId) {
  return queueFor(storeId).peek() || null;
}

/** Snapshot of one store's waiting line, front first. */
async function listQueue(storeId) {
  const q = queueFor(storeId);
  return q.toArray().map((r, i) => ({
    ...r,
    positionInLine: i + 1,
    product: state.products.find((p) => p.product_id === r.product_id) || null,
  }));
}

async function listAllQueues() {
  const out = [];
  for (const store of state.stores) {
    const items = await listQueue(store.store_id);
    if (items.length) out.push({ store, items });
  }
  return out;
}

async function queueHistory(storeId, limit = 15) {
  const sid = Number(storeId);
  return state.history
    .filter((r) => r.store_id === sid)
    .slice(-limit)
    .reverse()
    .map((r) => ({ ...r, product: state.products.find((p) => p.product_id === r.product_id) || null }));
}

async function stats() {
  const totalUnits = state.inventory.reduce((sum, i) => sum + i.quantity, 0);
  let waiting = 0;
  for (const q of state.queues.values()) waiting += q.size;
  return {
    stores: state.stores.filter((s) => s.is_active).length,
    products: state.products.length,
    inventoryLines: state.inventory.length,
    totalUnits,
    waitingRequests: waiting,
    fulfilledRequests: state.history.filter((r) => r.status === 'fulfilled').length,
  };
}

/** Reset to the pristine seed dataset — handy during a live demo. */
async function reset() {
  state.seq = { inventory: 1, request: 1, sync: 1, position: 1 };
  loadSeed();
  try { fs.existsSync(SNAPSHOT) && fs.unlinkSync(SNAPSHOT); } catch { /* ignore */ }
  return true;
}

module.exports = {
  driver: 'memory',
  init,
  listStores,
  listProducts,
  getStore,
  getProduct,
  availabilityForProduct,
  storeInventory,
  upsertInventory,
  applyBillingDelta,
  recentBillingSync,
  enqueueRequest,
  dequeueRequest,
  cancelRequest,
  peekQueue,
  listQueue,
  listAllQueues,
  queueHistory,
  stats,
  reset,
};
