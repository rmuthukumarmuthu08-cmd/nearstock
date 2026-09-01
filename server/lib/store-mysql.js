/**
 * ============================================================================
 *  NearStock — MySQL data store
 * ============================================================================
 *
 *  Active whenever a connection is configured:
 *      DATABASE_URL=mysql://user:pass@host:3306/nearstock?ssl={"rejectUnauthorized":true}
 *  or the discrete variables DB_HOST / DB_USER / DB_PASSWORD / DB_NAME / DB_PORT.
 *
 *  Same interface as store-memory.js. The FIFO ordering of the request queue
 *  is enforced in SQL by `ORDER BY position ASC` over rows with status
 *  'waiting' — the `position` column is the monotonically increasing ticket
 *  number, so "dequeue" is literally "the smallest position still waiting".
 */

const mysql = require('mysql2/promise');

let pool = null;

function buildPool() {
  const common = {
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_POOL_SIZE || 5),
    queueLimit: 0,
    enableKeepAlive: true,
    timezone: 'Z',
    decimalNumbers: true,
  };
  if (process.env.DATABASE_URL) {
    return mysql.createPool({ uri: process.env.DATABASE_URL, ...common });
  }
  return mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'nearstock',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
    ...common,
  });
}

async function init() {
  if (!pool) pool = buildPool();
  const conn = await pool.getConnection();      // throws if unreachable
  await conn.query('SELECT 1');
  conn.release();
}

const q = async (sql, params = []) => {
  const [rows] = await pool.query(sql, params);
  return rows;
};

/* ------------------------------- reads ---------------------------------- */

const listStores = () => q('SELECT * FROM stores WHERE is_active = TRUE ORDER BY name');
const listProducts = () => q('SELECT * FROM products ORDER BY name');
const getStore = async (id) => (await q('SELECT * FROM stores WHERE store_id = ?', [id]))[0] || null;
const getProduct = async (id) => (await q('SELECT * FROM products WHERE product_id = ?', [id]))[0] || null;

async function availabilityForProduct(productId) {
  const rows = await q(
    `SELECT s.*, i.quantity, i.price, i.updated_at
       FROM inventory i
       JOIN stores s ON s.store_id = i.store_id
      WHERE i.product_id = ? AND s.is_active = TRUE`,
    [productId]
  );
  return rows.map(({ quantity, price, updated_at, ...store }) => ({ store, quantity, price, updated_at }));
}

async function storeInventory(storeId) {
  const rows = await q(
    `SELECT i.*, p.name, p.brand, p.category, p.unit, p.base_price, p.barcode, p.image_emoji
       FROM inventory i
       JOIN products p ON p.product_id = i.product_id
      WHERE i.store_id = ?
      ORDER BY p.name`,
    [storeId]
  );
  return rows.map((r) => ({
    inventory_id: r.inventory_id,
    store_id: r.store_id,
    product_id: r.product_id,
    quantity: r.quantity,
    price: r.price,
    updated_at: r.updated_at,
    product: {
      product_id: r.product_id, name: r.name, brand: r.brand, category: r.category,
      unit: r.unit, base_price: r.base_price, barcode: r.barcode, image_emoji: r.image_emoji,
    },
  }));
}

/* ------------------------------ inventory -------------------------------- */

async function upsertInventory(storeId, productId, quantity, price) {
  const product = await getProduct(productId);
  if (!product) throw Object.assign(new Error('Unknown product'), { status: 404 });
  const finalPrice = price != null ? Number(price) : product.base_price;
  await q(
    `INSERT INTO inventory (store_id, product_id, quantity, price)
          VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
          quantity = COALESCE(VALUES(quantity), quantity),
          price    = VALUES(price)`,
    [storeId, productId, Math.max(0, Math.round(Number(quantity ?? 0))), finalPrice]
  );
  return (await q('SELECT * FROM inventory WHERE store_id = ? AND product_id = ?', [storeId, productId]))[0];
}

async function applyBillingDelta(storeId, productId, delta, source = 'pos') {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[row]] = await conn.query(
      'SELECT * FROM inventory WHERE store_id = ? AND product_id = ? FOR UPDATE',
      [storeId, productId]
    );
    if (!row) throw Object.assign(new Error('Product not stocked by this store'), { status: 404 });

    const before = row.quantity;
    const after = Math.max(0, before + Math.round(Number(delta)));
    await conn.query('UPDATE inventory SET quantity = ? WHERE inventory_id = ?', [after, row.inventory_id]);
    await conn.query(
      'INSERT INTO billing_sync (store_id, product_id, delta, source) VALUES (?, ?, ?, ?)',
      [storeId, productId, Math.round(Number(delta)), source]
    );
    await conn.commit();
    return { before, after, row: { ...row, quantity: after } };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

const recentBillingSync = (limit = 20) =>
  q(
    `SELECT b.*, s.name AS store_name, p.name AS product_name
       FROM billing_sync b
       JOIN stores s   ON s.store_id   = b.store_id
       JOIN products p ON p.product_id = b.product_id
      ORDER BY b.sync_id DESC LIMIT ?`,
    [Number(limit)]
  );

/* -------------------------------- queue ---------------------------------- */

async function enqueueRequest({ store_id, product_id, customer_name, customer_phone, quantity, note }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[{ nextPos }]] = await conn.query(
      'SELECT COALESCE(MAX(position), 0) + 1 AS nextPos FROM request_queue'
    );
    const [res] = await conn.query(
      `INSERT INTO request_queue
         (store_id, product_id, customer_name, customer_phone, quantity, note, position, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'waiting')`,
      [store_id, product_id, customer_name, customer_phone || '', Math.max(1, Number(quantity) || 1), note || '', nextPos]
    );
    const [[{ len }]] = await conn.query(
      "SELECT COUNT(*) AS len FROM request_queue WHERE store_id = ? AND status = 'waiting'",
      [store_id]
    );
    await conn.commit();
    const [[request]] = await pool.query('SELECT * FROM request_queue WHERE request_id = ?', [res.insertId]);
    return { request, queueLength: len, positionInLine: len };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** FIFO: the waiting row with the smallest ticket number. */
async function dequeueRequest(storeId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[front]] = await conn.query(
      `SELECT * FROM request_queue
        WHERE store_id = ? AND status = 'waiting'
        ORDER BY position ASC LIMIT 1 FOR UPDATE`,
      [storeId]
    );
    if (!front) { await conn.commit(); return null; }
    await conn.query(
      "UPDATE request_queue SET status = 'fulfilled', processed_at = NOW() WHERE request_id = ?",
      [front.request_id]
    );
    await conn.commit();
    return { ...front, status: 'fulfilled', processed_at: new Date().toISOString() };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function cancelRequest(storeId, requestId) {
  const res = await q(
    "UPDATE request_queue SET status = 'cancelled', processed_at = NOW() WHERE request_id = ? AND store_id = ? AND status = 'waiting'",
    [requestId, storeId]
  );
  if (!res.affectedRows) return null;
  return (await q('SELECT * FROM request_queue WHERE request_id = ?', [requestId]))[0];
}

async function peekQueue(storeId) {
  const rows = await q(
    "SELECT * FROM request_queue WHERE store_id = ? AND status = 'waiting' ORDER BY position ASC LIMIT 1",
    [storeId]
  );
  return rows[0] || null;
}

async function listQueue(storeId) {
  const rows = await q(
    `SELECT r.*, p.name AS product_name, p.image_emoji, p.unit
       FROM request_queue r
       JOIN products p ON p.product_id = r.product_id
      WHERE r.store_id = ? AND r.status = 'waiting'
      ORDER BY r.position ASC`,
    [storeId]
  );
  return rows.map((r, i) => ({
    ...r,
    positionInLine: i + 1,
    product: { product_id: r.product_id, name: r.product_name, image_emoji: r.image_emoji, unit: r.unit },
  }));
}

async function listAllQueues() {
  const stores = await listStores();
  const out = [];
  for (const store of stores) {
    const items = await listQueue(store.store_id);
    if (items.length) out.push({ store, items });
  }
  return out;
}

async function queueHistory(storeId, limit = 15) {
  return q(
    `SELECT r.*, p.name AS product_name, p.image_emoji
       FROM request_queue r
       JOIN products p ON p.product_id = r.product_id
      WHERE r.store_id = ? AND r.status <> 'waiting'
      ORDER BY r.processed_at DESC LIMIT ?`,
    [storeId, Number(limit)]
  );
}

async function stats() {
  const [[a]] = [await q('SELECT COUNT(*) AS c FROM stores WHERE is_active = TRUE')];
  const [[b]] = [await q('SELECT COUNT(*) AS c FROM products')];
  const [[c]] = [await q('SELECT COUNT(*) AS c, COALESCE(SUM(quantity),0) AS units FROM inventory')];
  const [[d]] = [await q("SELECT COUNT(*) AS c FROM request_queue WHERE status = 'waiting'")];
  const [[e]] = [await q("SELECT COUNT(*) AS c FROM request_queue WHERE status = 'fulfilled'")];
  return {
    stores: a.c, products: b.c, inventoryLines: c.c, totalUnits: Number(c.units),
    waitingRequests: d.c, fulfilledRequests: e.c,
  };
}

async function reset() {
  throw Object.assign(new Error('Reset is disabled when running against MySQL'), { status: 400 });
}

module.exports = {
  driver: 'mysql',
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
