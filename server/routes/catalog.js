/**
 *  Routes: product catalogue, stores, and the main customer search.
 *
 *  GET /products              ?q=  fuzzy product search (linear scan + merge sort)
 *  GET /products/:id
 *  GET /products/:id/shops    ?lat&lng&limit&inStockOnly   shops ranked by distance
 *  GET /stores
 *  GET /stores/:id
 *  GET /search                ?q&lat&lng&limit             the customer's one-shot query
 */

const express = require('express');
const { getStore } = require('../lib/db');
const { MinHeap } = require('../lib/minheap');
const {
  haversineKm, formatDistance, etaMinutes, linearSearchProducts, binarySearchByKey, mergeSort,
} = require('../lib/geo');

const router = express.Router();

/** Fallback origin: Coimbatore Town Hall, used when the browser denies geolocation. */
const DEFAULT_ORIGIN = { lat: 11.0168, lng: 76.9558, label: 'Coimbatore (default)' };

function readOrigin(req) {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng, label: 'Your location' };
  return { ...DEFAULT_ORIGIN };
}

/**
 * Rank the shops that stock one product by distance from the customer.
 *
 * DSA: distances are computed with the Haversine formula, then the k closest
 * are pulled off a MinHeap — O(n + k log n) — instead of fully sorting.
 * In-stock shops always outrank out-of-stock ones at equal distance.
 */
function rankShops(rows, origin, { limit = 10, inStockOnly = false } = {}) {
  const metrics = { candidates: rows.length, distanceComputations: 0, heapExtractions: 0 };

  const scored = [];
  for (const row of rows) {
    if (inStockOnly && row.quantity <= 0) continue;
    const km = haversineKm(origin.lat, origin.lng, Number(row.store.latitude), Number(row.store.longitude));
    metrics.distanceComputations++;
    scored.push({
      store_id: row.store.store_id,
      store_name: row.store.name,
      category: row.store.category,
      address: row.store.address,
      city: row.store.city,
      phone: row.store.phone,
      latitude: Number(row.store.latitude),
      longitude: Number(row.store.longitude),
      rating: Number(row.store.rating),
      opens_at: row.store.opens_at,
      closes_at: row.store.closes_at,
      quantity: row.quantity,
      price: Number(row.price),
      inStock: row.quantity > 0,
      updated_at: row.updated_at,
      distanceKm: Number(km.toFixed(3)),
      distanceLabel: formatDistance(km),
      etaMin: etaMinutes(km),
      mapUrl: `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${row.store.latitude},${row.store.longitude}`,
    });
  }

  // Comparator: in-stock first, then nearest, then cheaper.
  const cmp = (a, b) => {
    if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
    if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
    return a.price - b.price;
  };

  const k = Math.min(limit, scored.length);
  const nearest = MinHeap.kSmallest(scored, k, cmp);
  metrics.heapExtractions = nearest.length;

  return { shops: nearest.map((s, i) => ({ ...s, rank: i + 1 })), metrics };
}

/* -------------------------------------------------------------------------- */

router.get('/products', async (req, res, next) => {
  try {
    const db = await getStore();
    const products = await db.listProducts();
    const term = String(req.query.q || '').trim();
    if (!term) return res.json({ count: products.length, products });

    // Exact-name fast path: binary search over a name-sorted index. O(log n)
    const sorted = mergeSort(products, (a, b) => a.name.localeCompare(b.name));
    const exact = binarySearchByKey(sorted, term, (p) => p.name);

    const matches = linearSearchProducts(products, term);
    const ordered = exact ? [exact, ...matches.filter((p) => p.product_id !== exact.product_id)] : matches;
    res.json({ query: term, count: ordered.length, exactMatch: Boolean(exact), products: ordered });
  } catch (err) { next(err); }
});

router.get('/products/:id', async (req, res, next) => {
  try {
    const db = await getStore();
    const product = await db.getProduct(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ product });
  } catch (err) { next(err); }
});

router.get('/products/:id/shops', async (req, res, next) => {
  try {
    const db = await getStore();
    const product = await db.getProduct(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const origin = readOrigin(req);
    const rows = await db.availabilityForProduct(product.product_id);
    const { shops, metrics } = rankShops(rows, origin, {
      limit: Number(req.query.limit) || 10,
      inStockOnly: req.query.inStockOnly === 'true',
    });

    res.json({
      product,
      origin,
      nearest: shops.find((s) => s.inStock) || shops[0] || null,
      totalShops: rows.length,
      inStockShops: rows.filter((r) => r.quantity > 0).length,
      shops,
      dsa: { algorithm: 'Haversine distance → MinHeap k-smallest extraction', ...metrics },
    });
  } catch (err) { next(err); }
});

router.get('/stores', async (req, res, next) => {
  try {
    const db = await getStore();
    const stores = await db.listStores();
    const origin = readOrigin(req);
    const withDistance = stores.map((s) => {
      const km = haversineKm(origin.lat, origin.lng, Number(s.latitude), Number(s.longitude));
      return { ...s, distanceKm: Number(km.toFixed(3)), distanceLabel: formatDistance(km), etaMin: etaMinutes(km) };
    });
    res.json({
      origin,
      count: withDistance.length,
      stores: mergeSort(withDistance, (a, b) => a.distanceKm - b.distanceKm),
    });
  } catch (err) { next(err); }
});

router.get('/stores/:id', async (req, res, next) => {
  try {
    const db = await getStore();
    const store = await db.getStore(req.params.id);
    if (!store) return res.status(404).json({ error: 'Store not found' });
    res.json({ store });
  } catch (err) { next(err); }
});

/**
 * The headline endpoint: one search term in, ranked product+shop results out.
 */
router.get('/search', async (req, res, next) => {
  try {
    const term = String(req.query.q || '').trim();
    if (!term) return res.status(400).json({ error: 'Missing search term. Use ?q=' });

    const db = await getStore();
    const origin = readOrigin(req);
    const limit = Number(req.query.limit) || 8;
    const inStockOnly = req.query.inStockOnly === 'true';

    const products = await db.listProducts();
    const matched = linearSearchProducts(products, term).slice(0, 6);

    const totals = { distanceComputations: 0, heapExtractions: 0, candidates: 0 };
    const results = [];

    for (const product of matched) {
      const rows = await db.availabilityForProduct(product.product_id);
      const { shops, metrics } = rankShops(rows, origin, { limit, inStockOnly });
      totals.distanceComputations += metrics.distanceComputations;
      totals.heapExtractions += metrics.heapExtractions;
      totals.candidates += metrics.candidates;
      results.push({
        product,
        nearest: shops.find((s) => s.inStock) || shops[0] || null,
        totalShops: rows.length,
        inStockShops: rows.filter((r) => r.quantity > 0).length,
        shops,
      });
    }

    res.json({
      query: term,
      origin,
      matchedProducts: results.length,
      results,
      dsa: {
        search: 'Linear scan over the catalogue with prefix-weighted scoring',
        sort: 'Merge sort (stable, O(n log n)) on relevance',
        ranking: 'Haversine distance → MinHeap k-smallest extraction, O(n + k log n)',
        ...totals,
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
