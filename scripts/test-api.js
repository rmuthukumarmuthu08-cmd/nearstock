/**
 * NearStock — end-to-end API test.
 * Boots the Express app on an ephemeral port and exercises every route,
 * including the FIFO ordering guarantee of the request queue.
 *
 *   npm test
 */

const assert = require('assert');
const app = require('../server/app');
const { Queue } = require('../server/lib/queue');
const { MinHeap } = require('../server/lib/minheap');
const { haversineKm, mergeSort, linearSearchProducts } = require('../server/lib/geo');

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}\n      ${err.message}`);
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}\n      ${err.message}`);
  }
}

/* ------------------------------ unit tests -------------------------------- */

function unitTests() {
  console.log('\nData structures');

  check('Queue preserves FIFO order', () => {
    const q = new Queue(4);
    ['a', 'b', 'c'].forEach((x) => q.enqueue(x));
    assert.strictEqual(q.dequeue(), 'a');
    assert.strictEqual(q.dequeue(), 'b');
    assert.strictEqual(q.peek(), 'c');
    assert.strictEqual(q.size, 1);
  });

  check('Queue wraps around and grows without losing order', () => {
    const q = new Queue(2);
    for (let i = 0; i < 50; i++) q.enqueue(i);
    for (let i = 0; i < 50; i++) assert.strictEqual(q.dequeue(), i, `element ${i} out of order`);
    assert.ok(q.isEmpty());
  });

  check('Queue.remove keeps the remaining order intact', () => {
    const q = Queue.from([1, 2, 3, 4, 5]);
    assert.strictEqual(q.remove((x) => x === 3), 3);
    assert.deepStrictEqual(q.toArray(), [1, 2, 4, 5]);
  });

  check('Queue.positionOf reports a 1-based place in line', () => {
    const q = Queue.from(['x', 'y', 'z']);
    assert.strictEqual(q.positionOf((v) => v === 'z'), 3);
    assert.strictEqual(q.positionOf((v) => v === 'nope'), -1);
  });

  check('Queue dequeue on empty returns undefined', () => {
    assert.strictEqual(new Queue().dequeue(), undefined);
  });

  check('MinHeap extracts in ascending order', () => {
    const h = new MinHeap((a, b) => a - b);
    [9, 3, 7, 1, 8, 2].forEach((x) => h.push(x));
    const out = [];
    while (!h.isEmpty()) out.push(h.extractMin());
    assert.deepStrictEqual(out, [1, 2, 3, 7, 8, 9]);
  });

  check('MinHeap.kSmallest matches a full sort', () => {
    const data = Array.from({ length: 200 }, () => Math.round(Math.random() * 1000));
    const k = MinHeap.kSmallest(data, 5, (a, b) => a - b);
    const expected = data.slice().sort((a, b) => a - b).slice(0, 5);
    assert.deepStrictEqual(k, expected);
  });

  check('Merge sort is stable and correct', () => {
    const input = [{ k: 2, t: 'a' }, { k: 1, t: 'b' }, { k: 2, t: 'c' }, { k: 1, t: 'd' }];
    const out = mergeSort(input, (a, b) => a.k - b.k);
    assert.deepStrictEqual(out.map((o) => o.t), ['b', 'd', 'a', 'c']);
  });

  check('Haversine distance is accurate', () => {
    // Coimbatore Town Hall → Peelamedu is roughly 4-5 km
    const km = haversineKm(11.0025, 76.9640, 11.0245, 77.0028);
    assert.ok(km > 3.5 && km < 6, `expected ~4.7 km, got ${km.toFixed(2)}`);
    assert.strictEqual(haversineKm(11, 77, 11, 77), 0);
  });

  check('Product search ranks prefix matches first', () => {
    const products = [
      { product_id: 1, name: 'Whole Milk 1L', brand: 'X', category: 'Dairy' },
      { product_id: 2, name: 'Milk Chocolate', brand: 'Y', category: 'Snacks' },
      { product_id: 3, name: 'Bread', brand: 'Z', category: 'Bakery' },
    ];
    const out = linearSearchProducts(products, 'milk');
    assert.strictEqual(out.length, 2);
    assert.strictEqual(out[0].product_id, 2, 'prefix match should rank first');
  });
}

/* --------------------------- integration tests ---------------------------- */

async function integrationTests(base) {
  const get = async (p) => {
    const r = await fetch(base + p);
    const b = await r.json();
    if (!r.ok) throw new Error(`${p} → ${r.status} ${b.error}`);
    return b;
  };
  const send = async (method, p, body) => {
    const r = await fetch(base + p, {
      method, headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const b = await r.json();
    if (!r.ok) throw new Error(`${method} ${p} → ${r.status} ${b.error}`);
    return b;
  };

  console.log('\nAPI');

  await checkAsync('GET /api/health', async () => {
    assert.strictEqual((await get('/api/health')).status, 'ok');
  });

  await checkAsync('GET /api/meta reports a driver and counts', async () => {
    const m = await get('/api/meta');
    assert.ok(['mysql', 'memory'].includes(m.data.driver));
    assert.ok(m.stats.stores > 0 && m.stats.products > 0);
  });

  await checkAsync('GET /api/search ranks shops nearest-first', async () => {
    const r = await get('/api/search?q=milk&lat=11.0168&lng=76.9558&limit=5');
    assert.ok(r.results.length > 0, 'no products matched "milk"');
    const shops = r.results[0].shops.filter((s) => s.inStock);
    assert.ok(shops.length > 1, 'need at least two in-stock shops to check ordering');
    for (let i = 1; i < shops.length; i++) {
      assert.ok(shops[i].distanceKm >= shops[i - 1].distanceKm,
        `shop ${i} (${shops[i].distanceKm}km) is closer than shop ${i - 1} (${shops[i - 1].distanceKm}km)`);
    }
    assert.strictEqual(r.results[0].nearest.store_id, shops[0].store_id);
  });

  await checkAsync('Search origin changes which shop is nearest', async () => {
    const a = await get('/api/search?q=paracetamol&lat=10.9975&lng=76.9470');
    const b = await get('/api/search?q=paracetamol&lat=11.0810&lng=76.9420');
    assert.notStrictEqual(a.results[0].nearest.store_id, b.results[0].nearest.store_id,
      'the nearest shop should differ between two distant origins');
  });

  await checkAsync('GET /api/search rejects an empty term', async () => {
    const r = await fetch(base + '/api/search?q=');
    assert.strictEqual(r.status, 400);
  });

  await checkAsync('GET /api/stores is sorted by distance', async () => {
    const r = await get('/api/stores?lat=11.0168&lng=76.9558');
    for (let i = 1; i < r.stores.length; i++) {
      assert.ok(r.stores[i].distanceKm >= r.stores[i - 1].distanceKm);
    }
  });

  await checkAsync('GET /api/products/:id/shops returns availability', async () => {
    const r = await get('/api/products/3/shops?lat=11.0168&lng=76.9558');
    assert.ok(r.totalShops >= 1);
    assert.ok(r.shops[0].distanceLabel);
  });

  await checkAsync('Billing sync decrements stock and logs the event', async () => {
    const before = await get('/api/stores/1/inventory');
    const line = before.items.find((i) => i.quantity >= 3);
    const res = await send('POST', '/api/stores/1/billing-sync', { product_id: line.product_id, delta: -2, source: 'test' });
    assert.strictEqual(res.after, res.before - 2);
    const log = await get('/api/billing/recent?limit=5');
    assert.ok(log.events.some((e) => e.delta === -2), 'sync event not logged');
  });

  await checkAsync('Billing sync never drives stock negative', async () => {
    const inv = await get('/api/stores/1/inventory');
    const line = inv.items[0];
    const res = await send('POST', '/api/stores/1/billing-sync', { product_id: line.product_id, delta: -99999 });
    assert.strictEqual(res.after, 0);
    await send('PUT', '/api/stores/1/inventory', { product_id: line.product_id, quantity: line.quantity, price: line.price });
  });

  await checkAsync('PUT inventory updates quantity and price', async () => {
    await send('PUT', '/api/stores/3/inventory', { product_id: 18, quantity: 42, price: 133 });
    const inv = await get('/api/stores/3/inventory');
    const row = inv.items.find((i) => i.product_id === 18);
    assert.strictEqual(row.quantity, 42);
    assert.strictEqual(Number(row.price), 133);
  });

  await checkAsync('Queue serves requests strictly First In, First Out', async () => {
    const storeId = 9;
    // Drain whatever is already queued.
    for (;;) {
      const q = await get(`/api/stores/${storeId}/queue`);
      if (!q.length) break;
      await send('POST', `/api/stores/${storeId}/queue/next`, {});
    }

    const names = ['Alpha', 'Bravo', 'Charlie', 'Delta'];
    for (const name of names) {
      await send('POST', '/api/queue', { store_id: storeId, product_id: 21, customer_name: name, quantity: 1 });
    }

    const snapshot = await get(`/api/stores/${storeId}/queue`);
    assert.deepStrictEqual(snapshot.items.map((i) => i.customer_name), names, 'queue snapshot is not in arrival order');
    assert.strictEqual(snapshot.front.customer_name, 'Alpha');

    const peek = await get(`/api/stores/${storeId}/queue/peek`);
    assert.strictEqual(peek.front.customer_name, 'Alpha');

    for (const name of names) {
      const served = await send('POST', `/api/stores/${storeId}/queue/next`, {});
      assert.strictEqual(served.served.customer_name, name, `served out of order: expected ${name}`);
    }

    const empty = await fetch(base + `/api/stores/${storeId}/queue/next`, { method: 'POST' });
    assert.strictEqual(empty.status, 409, 'dequeue on an empty queue should be a 409');
  });

  await checkAsync('Cancelling a request preserves the order of the rest', async () => {
    const storeId = 10;
    for (;;) {
      const q = await get(`/api/stores/${storeId}/queue`);
      if (!q.length) break;
      await send('POST', `/api/stores/${storeId}/queue/next`, {});
    }
    const ids = [];
    for (const name of ['One', 'Two', 'Three']) {
      const r = await send('POST', '/api/queue', { store_id: storeId, product_id: 22, customer_name: name });
      ids.push(r.request.request_id);
    }
    await send('DELETE', `/api/stores/${storeId}/queue/${ids[1]}`);
    const after = await get(`/api/stores/${storeId}/queue`);
    assert.deepStrictEqual(after.items.map((i) => i.customer_name), ['One', 'Three']);

    for (;;) {
      const q = await get(`/api/stores/${storeId}/queue`);
      if (!q.length) break;
      await send('POST', `/api/stores/${storeId}/queue/next`, {});
    }
  });

  await checkAsync('Enqueue reports the correct position in line', async () => {
    const storeId = 7;
    for (;;) {
      const q = await get(`/api/stores/${storeId}/queue`);
      if (!q.length) break;
      await send('POST', `/api/stores/${storeId}/queue/next`, {});
    }
    const first = await send('POST', '/api/queue', { store_id: storeId, product_id: 16, customer_name: 'First' });
    const second = await send('POST', '/api/queue', { store_id: storeId, product_id: 16, customer_name: 'Second' });
    assert.strictEqual(first.positionInLine, 1);
    assert.strictEqual(second.positionInLine, 2);
    await send('POST', `/api/stores/${storeId}/queue/next`, {});
    await send('POST', `/api/stores/${storeId}/queue/next`, {});
  });

  await checkAsync('Queue rejects an unknown store', async () => {
    const r = await fetch(base + '/api/queue', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_id: 9999, product_id: 1, customer_name: 'Ghost' }),
    });
    assert.strictEqual(r.status, 404);
  });

  await checkAsync('Queue rejects a request with no customer name', async () => {
    const r = await fetch(base + '/api/queue', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_id: 1, product_id: 1 }),
    });
    assert.strictEqual(r.status, 400);
  });

  await checkAsync('Batch billing webhook applies every line', async () => {
    const r = await send('POST', '/api/billing/webhook', {
      store_id: 2, source: 'test-pos',
      lines: [{ product_id: 3, delta: -1 }, { product_id: 4, delta: -2 }],
    });
    assert.strictEqual(r.applied.length, 2);
    assert.strictEqual(r.failed.length, 0);
  });

  await checkAsync('Unknown API route returns a JSON 404', async () => {
    const r = await fetch(base + '/api/nope');
    assert.strictEqual(r.status, 404);
    assert.ok((await r.json()).error);
  });

  await checkAsync('Static pages are served', async () => {
    for (const p of ['/', '/shop.html', '/about.html', '/css/styles.css', '/js/customer.js']) {
      const r = await fetch(base + p);
      assert.strictEqual(r.status, 200, `${p} returned ${r.status}`);
    }
  });
}

/* ---------------------------------- run ----------------------------------- */

(async () => {
  console.log('NearStock test suite');
  unitTests();

  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    await integrationTests(base);
  } finally {
    server.close();
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
