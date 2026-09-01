/**
 * ============================================================================
 *  NearStock — Queue (FIFO) : the core data structure of this project
 * ============================================================================
 *
 *  Implemented from scratch as a CIRCULAR ARRAY (ring buffer) rather than
 *  using JavaScript's Array.push / Array.shift, because Array.shift() is
 *  O(n) — it re-indexes every remaining element. A circular buffer gives
 *  true O(1) enqueue and O(1) dequeue, which is the whole point of a Queue.
 *
 *      front ─┐                        ┌─ rear
 *             v                        v
 *      [ _ , R1 , R2 , R3 , _ , _ , _ , _ ]
 *              ^ dequeue here    enqueue here ^
 *
 *  Operations and their complexity:
 *    enqueue(item)  O(1)   add to the rear
 *    dequeue()      O(1)   remove from the front  (First In, First Out)
 *    peek()         O(1)   look at the front without removing
 *    isEmpty()      O(1)
 *    isFull()       O(1)   (before an automatic resize)
 *    size           O(1)
 *
 *  When the ring fills up we grow the backing array to 2x and re-linearise
 *  it — amortised O(1) per insertion.
 */

class Queue {
  /** @param {number} initialCapacity */
  constructor(initialCapacity = 16) {
    this._buf = new Array(Math.max(2, initialCapacity));
    this._front = 0;   // index of the first (oldest) element
    this._rear = 0;    // index where the next element will be written
    this._count = 0;   // number of live elements
  }

  get size() { return this._count; }
  get capacity() { return this._buf.length; }

  isEmpty() { return this._count === 0; }
  isFull() { return this._count === this._buf.length; }

  /** Add to the rear. O(1) amortised. */
  enqueue(item) {
    if (this.isFull()) this._grow();
    this._buf[this._rear] = item;
    this._rear = (this._rear + 1) % this._buf.length;  // wrap around
    this._count++;
    return item;
  }

  /** Remove and return the front (oldest) item. O(1). */
  dequeue() {
    if (this.isEmpty()) return undefined;
    const item = this._buf[this._front];
    this._buf[this._front] = undefined;               // release the reference
    this._front = (this._front + 1) % this._buf.length;
    this._count--;
    return item;
  }

  /** Look at the front item without removing it. O(1). */
  peek() {
    return this.isEmpty() ? undefined : this._buf[this._front];
  }

  /** Look at the rear item. O(1). */
  peekRear() {
    if (this.isEmpty()) return undefined;
    const idx = (this._rear - 1 + this._buf.length) % this._buf.length;
    return this._buf[idx];
  }

  /**
   * 1-based position of the first item matching `predicate`, or -1.
   * Used to tell a customer "you are 3rd in line". O(n).
   */
  positionOf(predicate) {
    for (let i = 0; i < this._count; i++) {
      const item = this._buf[(this._front + i) % this._buf.length];
      if (predicate(item)) return i + 1;
    }
    return -1;
  }

  /**
   * Remove the first item matching `predicate` (a cancellation).
   * A pure queue does not support this; we rebuild the ring to keep
   * FIFO order intact. O(n).
   */
  remove(predicate) {
    const kept = [];
    let removed;
    while (!this.isEmpty()) {
      const item = this.dequeue();
      if (removed === undefined && predicate(item)) removed = item;
      else kept.push(item);
    }
    for (const item of kept) this.enqueue(item);
    return removed;
  }

  /** Snapshot in FIFO order, front first. O(n). Does not mutate. */
  toArray() {
    const out = new Array(this._count);
    for (let i = 0; i < this._count; i++) {
      out[i] = this._buf[(this._front + i) % this._buf.length];
    }
    return out;
  }

  clear() {
    this._buf = new Array(this._buf.length);
    this._front = this._rear = this._count = 0;
  }

  /** Build a Queue from an array, preserving order. */
  static from(items = []) {
    const q = new Queue(Math.max(16, items.length * 2));
    for (const item of items) q.enqueue(item);
    return q;
  }

  /** Double the backing array and re-linearise. O(n), happens rarely. */
  _grow() {
    const next = new Array(this._buf.length * 2);
    for (let i = 0; i < this._count; i++) {
      next[i] = this._buf[(this._front + i) % this._buf.length];
    }
    this._buf = next;
    this._front = 0;
    this._rear = this._count;
  }
}

module.exports = { Queue };
