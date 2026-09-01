/**
 * ============================================================================
 *  NearStock — geo + searching/sorting helpers
 * ============================================================================
 *  Distance:  Haversine great-circle formula (Earth as a sphere, r = 6371 km).
 *  Sorting:   merge sort, written out rather than Array.prototype.sort, so the
 *             O(n log n) divide-and-conquer step is visible in the codebase.
 *  Searching: linear substring scan for the fuzzy product search, plus a
 *             binary search over a sorted-by-name index for exact lookups.
 */

const EARTH_RADIUS_KM = 6371;

const toRad = (deg) => (deg * Math.PI) / 180;

/**
 * Great-circle distance between two lat/lng points, in kilometres.
 * O(1).
 */
function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(a));
}

/** Human-readable distance: "450 m" / "2.4 km". */
function formatDistance(km) {
  if (!Number.isFinite(km)) return '—';
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

/**
 * Rough walking/driving time estimate, in minutes.
 * Assumes 22 km/h average city speed (Coimbatore traffic) with a 2 min floor.
 */
function etaMinutes(km) {
  return Math.max(2, Math.round((km / 22) * 60));
}

/* -------------------------------------------------------------------------- */
/*  SORTING — merge sort, O(n log n) worst case, stable                        */
/* -------------------------------------------------------------------------- */

function mergeSort(arr, compare) {
  if (arr.length <= 1) return arr.slice();
  const mid = arr.length >> 1;
  const left = mergeSort(arr.slice(0, mid), compare);
  const right = mergeSort(arr.slice(mid), compare);
  return merge(left, right, compare);
}

function merge(left, right, compare) {
  const out = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    // <= keeps the sort stable: equal elements retain their original order
    out.push(compare(left[i], right[j]) <= 0 ? left[i++] : right[j++]);
  }
  while (i < left.length) out.push(left[i++]);
  while (j < right.length) out.push(right[j++]);
  return out;
}

/* -------------------------------------------------------------------------- */
/*  SEARCHING                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Fuzzy product search: linear scan, O(n * m).
 * Returns matches scored so that a prefix hit outranks a mid-string hit.
 */
function linearSearchProducts(products, rawQuery) {
  const q = String(rawQuery || '').trim().toLowerCase();
  if (!q) return [];
  const tokens = q.split(/\s+/);
  const scored = [];

  for (const p of products) {
    const haystack = `${p.name} ${p.brand || ''} ${p.category || ''}`.toLowerCase();
    let score = 0;
    let matchedAll = true;

    for (const t of tokens) {
      const idx = haystack.indexOf(t);
      if (idx === -1) { matchedAll = false; break; }
      score += idx === 0 ? 100 : 100 - Math.min(idx, 60);
      if (p.name.toLowerCase().startsWith(t)) score += 40;
    }
    if (!matchedAll) continue;
    if (p.barcode === q) score += 500;
    scored.push({ product: p, score });
  }

  return mergeSort(scored, (a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name))
    .map((s) => s.product);
}

/**
 * Binary search over an array sorted ascending by `key`. O(log n).
 * Used for exact product-name lookups on the pre-sorted catalogue index.
 */
function binarySearchByKey(sortedArr, target, keyOf) {
  let lo = 0;
  let hi = sortedArr.length - 1;
  const needle = String(target).toLowerCase();
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const midKey = String(keyOf(sortedArr[mid])).toLowerCase();
    if (midKey === needle) return sortedArr[mid];
    if (midKey < needle) lo = mid + 1;
    else hi = mid - 1;
  }
  return null;
}

module.exports = {
  EARTH_RADIUS_KM,
  haversineKm,
  formatDistance,
  etaMinutes,
  mergeSort,
  linearSearchProducts,
  binarySearchByKey,
};
