/**
 * ============================================================================
 *  NearStock — MinHeap (binary heap) : used to find the nearest shop
 * ============================================================================
 *
 *  Once we know the distance from the customer to every shop that stocks a
 *  product, "which shop is nearest?" is a minimum-extraction problem.
 *
 *  A MinHeap gives us:
 *    build(array)  O(n)        — Floyd's bottom-up heapify, cheaper than n pushes
 *    extractMin()  O(log n)    — pop the closest shop
 *    peek()        O(1)        — the nearest shop, without removing it
 *
 *  For "the k nearest shops" we extract k times: O(n + k log n).
 *  That beats a full sort (O(n log n)) whenever k is small — which is the
 *  common case, since a customer usually only cares about the top 3–5.
 *
 *  Array representation of the tree (0-indexed):
 *      parent(i) = (i - 1) >> 1
 *      left(i)   = 2i + 1
 *      right(i)  = 2i + 2
 */

class MinHeap {
  /**
   * @param {(a:any, b:any) => number} compare  negative if a should come first
   */
  constructor(compare = (a, b) => a - b) {
    this._cmp = compare;
    this._a = [];
  }

  get size() { return this._a.length; }
  isEmpty() { return this._a.length === 0; }
  peek() { return this._a[0]; }

  /** O(log n) */
  push(value) {
    this._a.push(value);
    this._siftUp(this._a.length - 1);
    return this;
  }

  /** Remove and return the smallest element. O(log n) */
  extractMin() {
    if (this._a.length === 0) return undefined;
    const min = this._a[0];
    const last = this._a.pop();
    if (this._a.length > 0) {
      this._a[0] = last;
      this._siftDown(0);
    }
    return min;
  }

  /** Floyd's heapify — turn an unordered array into a heap in O(n). */
  static build(items, compare) {
    const h = new MinHeap(compare);
    h._a = items.slice();
    for (let i = (h._a.length >> 1) - 1; i >= 0; i--) h._siftDown(i);
    return h;
  }

  /** The k smallest elements, in ascending order. O(n + k log n). */
  static kSmallest(items, k, compare) {
    const heap = MinHeap.build(items, compare);
    const out = [];
    const limit = Math.min(k, heap.size);
    for (let i = 0; i < limit; i++) out.push(heap.extractMin());
    return out;
  }

  _siftUp(i) {
    const a = this._a;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this._cmp(a[i], a[parent]) >= 0) break;
      [a[i], a[parent]] = [a[parent], a[i]];
      i = parent;
    }
  }

  _siftDown(i) {
    const a = this._a;
    const n = a.length;
    for (;;) {
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      let smallest = i;
      if (l < n && this._cmp(a[l], a[smallest]) < 0) smallest = l;
      if (r < n && this._cmp(a[r], a[smallest]) < 0) smallest = r;
      if (smallest === i) break;
      [a[i], a[smallest]] = [a[smallest], a[i]];
      i = smallest;
    }
  }
}

module.exports = { MinHeap };
