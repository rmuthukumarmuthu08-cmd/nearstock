/* ==========================================================================
   NearStock — shop dashboard
   ========================================================================== */

const el = (id) => document.getElementById(id);

const state = {
  storeId: store.get('shopStoreId', 2),
  stores: [],
  inventory: [],
  filter: '',
  // Mirrors the server-side ring buffer so the visual matches the real structure.
  ring: { capacity: 12, front: 0, size: 0 },
};

/* ------------------------------ store picker ------------------------------ */

async function loadStores() {
  const { stores } = await API.get('/stores');
  state.stores = stores;
  const sel = el('store-select');
  sel.innerHTML = stores.map((s) => `<option value="${s.store_id}">${esc(s.name)}</option>`).join('');
  if (!stores.some((s) => s.store_id === state.storeId)) state.storeId = stores[0].store_id;
  sel.value = String(state.storeId);
  paintStoreHeader();
}

function paintStoreHeader() {
  const s = state.stores.find((x) => x.store_id === state.storeId);
  el('store-name').textContent = s ? s.name : '—';
  el('store-address').textContent = s ? `${s.address}, ${s.city} · ${s.phone}` : '—';
}

/* --------------------------------- stats ---------------------------------- */

function renderStats(inv, queueLength) {
  const totalUnits = inv.reduce((n, i) => n + i.quantity, 0);
  const out = inv.filter((i) => i.quantity === 0).length;
  const low = inv.filter((i) => i.quantity > 0 && i.quantity <= 5).length;
  const value = inv.reduce((n, i) => n + i.quantity * Number(i.price), 0);

  el('stats').innerHTML = [
    { k: 'SKUs listed',      v: inv.length,                s: 'products on NearStock' },
    { k: 'Units in stock',   v: totalUnits.toLocaleString('en-IN'), s: 'across all products' },
    { k: 'Stock value',      v: money(Math.round(value)),  s: 'at current prices' },
    { k: 'Low / out',        v: `${low} / ${out}`,         s: '≤5 units / zero' },
    { k: 'Waiting requests', v: queueLength,               s: 'in the FIFO queue' },
  ].map((c) => `<div class="card stat"><div class="k">${esc(c.k)}</div><div class="v">${esc(c.v)}</div><div class="s">${esc(c.s)}</div></div>`).join('');
}

/* ------------------------------- inventory -------------------------------- */

async function loadInventory() {
  const data = await API.get(`/stores/${state.storeId}/inventory`);
  state.inventory = data.items;
  renderInventory();
  populateBillingProducts();
  return data;
}

function stockColor(q) {
  if (q <= 0) return '#d03b3b';
  if (q <= 5) return '#fab219';
  return '#0ca30c';
}

function renderInventory() {
  const tbody = document.querySelector('#inv-table tbody');
  const term = state.filter.toLowerCase();
  const rows = state.inventory.filter((i) =>
    !term || `${i.product.name} ${i.product.brand} ${i.product.category}`.toLowerCase().includes(term));

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty">No products match that filter.</td></tr>';
    return;
  }

  const maxQ = Math.max(...rows.map((r) => r.quantity), 1);

  tbody.innerHTML = rows.map((i) => `
    <tr data-product="${i.product_id}">
      <td>
        <strong>${esc(i.product.name)}</strong>
        <div style="font-size:11.5px;color:var(--ink-3);margin-top:3px">
          ${esc(i.product.brand)} · ${esc(i.product.category)} · ${esc(timeAgo(i.updated_at))}
        </div>
        <div class="stockbar"><i style="width:${(i.quantity / maxQ) * 100}%;background:${stockColor(i.quantity)}"></i></div>
      </td>
      <td class="num"><input type="number" min="0" value="${i.quantity}" data-qty aria-label="Quantity"></td>
      <td class="num"><input type="number" min="0" step="0.5" value="${Number(i.price)}" data-price aria-label="Price"></td>
      <td style="text-align:right;white-space:nowrap">
        ${stockBadge(i.quantity)}
        <button class="btn btn-sm" data-save type="button" style="margin-left:6px">Save</button>
      </td>
    </tr>`).join('');

  tbody.querySelectorAll('[data-save]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const tr = btn.closest('tr');
      btn.disabled = true;
      try {
        await API.put(`/stores/${state.storeId}/inventory`, {
          product_id: Number(tr.dataset.product),
          quantity: Number(tr.querySelector('[data-qty]').value),
          price: Number(tr.querySelector('[data-price]').value),
        });
        toast('Inventory updated', 'Customers see the new count immediately.', 'ok');
        await refresh();
      } catch (err) {
        toast('Update failed', err.message, 'err');
        btn.disabled = false;
      }
    });
  });
}

function populateBillingProducts() {
  const sel = el('bill-product');
  const current = sel.value;
  sel.innerHTML = state.inventory
    .map((i) => `<option value="${i.product_id}">${esc(i.product.name)} — ${i.quantity} in stock</option>`)
    .join('');
  if (current && state.inventory.some((i) => String(i.product_id) === current)) sel.value = current;
}

async function billingSync(sign) {
  const product_id = Number(el('bill-product').value);
  const units = Math.max(1, Number(el('bill-qty').value) || 1);
  if (!product_id) return;
  try {
    const res = await API.post(`/stores/${state.storeId}/billing-sync`, {
      product_id, delta: sign * units, source: sign < 0 ? 'pos-sale' : 'pos-restock',
    });
    toast(sign < 0 ? 'Sale recorded' : 'Restocked', `Stock moved ${res.before} → ${res.after} units.`, 'ok');
    await refresh();
  } catch (err) {
    toast('Sync failed', err.message, 'err');
  }
}

/* ----------------------------- ring buffer -------------------------------- */

/**
 * Draws the queue's backing circular array: `capacity` slots around a circle,
 * the occupied span filled, with the front and rear pointers marked.
 */
function drawRingBuffer(size) {
  const svg = el('ringbuf');
  if (!svg) return;

  const cap = state.ring.capacity;
  const front = state.ring.front % cap;
  const cx = 125, cy = 125, R = 92, slotR = 13.5;
  const parts = [];

  for (let i = 0; i < cap; i++) {
    const angle = (i / cap) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(angle) * R;
    const y = cy + Math.sin(angle) * R;

    const offset = (i - front + cap) % cap;
    const occupied = offset < size;
    const isFront = occupied && offset === 0;
    const cls = isFront ? 'slot-front' : occupied ? 'slot-full' : 'slot-empty';

    parts.push(`<circle class="slot ${cls}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${slotR}"></circle>`);
    parts.push(`<text class="ptr" x="${x.toFixed(1)}" y="${(y + 3.5).toFixed(1)}" fill="${occupied ? '#ffffff' : '#6d88ac'}" style="font-size:9px">${i}</text>`);

    if (isFront) {
      const lx = cx + Math.cos(angle) * (R + 26);
      const ly = cy + Math.sin(angle) * (R + 26);
      parts.push(`<text class="ptr ptr-front" x="${lx.toFixed(1)}" y="${(ly + 3).toFixed(1)}">front</text>`);
    }
    if (i === (front + size) % cap) {
      const lx = cx + Math.cos(angle) * (R + 26);
      const ly = cy + Math.sin(angle) * (R + 26);
      parts.push(`<text class="ptr ptr-rear" x="${lx.toFixed(1)}" y="${(ly + 3).toFixed(1)}">rear</text>`);
    }
  }

  parts.push(`<text class="core-n" x="${cx}" y="${cy + 5}" style="font-size:32px">${size}</text>`);
  parts.push(`<text class="core-l" x="${cx}" y="${cy + 24}">IN QUEUE</text>`);

  svg.innerHTML = parts.join('');
}

/* --------------------------------- queue ---------------------------------- */

function renderQueue(data) {
  const strip = el('queue-strip');
  el('queue-count').textContent = data.length
    ? `${data.length} customer${data.length === 1 ? '' : 's'} waiting`
    : 'Queue is empty';
  el('serve-next').disabled = data.length === 0;

  state.ring.size = data.length;
  drawRingBuffer(data.length);

  if (!data.length) {
    strip.innerHTML = `<div class="empty" style="width:100%;padding:30px">${icon('clock')}<br>No one is waiting. New requests land at the rear of the queue.</div>`;
    return;
  }

  strip.innerHTML = data.items.map((r, idx) => `
    ${idx > 0 ? `<div class="qarrow">${icon('chevron')}</div>` : ''}
    <div class="qcard ${idx === 0 ? 'front' : ''}" style="animation-delay:${idx * 60}ms">
      ${idx === 0 ? '' : `<button class="btn btn-sm btn-ghost qx" data-cancel="${r.request_id}" title="Remove from queue">${icon('close')}</button>`}
      <div class="qpos">${idx === 0 ? 'front · next' : `position ${idx + 1}`}</div>
      <div class="qname">${esc(r.customer_name)}</div>
      <div class="qprod">${esc(r.product ? r.product.name : '')} × ${r.quantity}</div>
      ${r.note ? `<div class="qprod" style="font-style:italic;color:var(--ink-3)">“${esc(r.note)}”</div>` : ''}
      <div class="qtime">ticket #${r.position} · ${esc(timeAgo(r.enqueued_at))}</div>
    </div>`).join('');

  strip.querySelectorAll('[data-cancel]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await API.del(`/stores/${state.storeId}/queue/${btn.dataset.cancel}`);
        toast('Removed from queue', 'Remaining requests keep their FIFO order.', 'ok');
        await refresh();
      } catch (err) {
        toast('Could not remove', err.message, 'err');
        btn.disabled = false;
      }
    });
  });
}

async function serveNext() {
  const btn = el('serve-next');
  btn.disabled = true;
  try {
    const res = await API.post(`/stores/${state.storeId}/queue/next`, {});
    // Advance the visual front pointer exactly as the real ring buffer does.
    state.ring.front = (state.ring.front + 1) % state.ring.capacity;
    toast('Served', `${res.served.customer_name} — ticket #${res.served.position} fulfilled. ${res.remaining} still waiting.`, 'ok');
    await refresh();
  } catch (err) {
    toast('Nothing to serve', err.message, 'err');
  } finally {
    btn.disabled = false;
  }
}

async function peekFront() {
  try {
    const { front } = await API.get(`/stores/${state.storeId}/queue/peek`);
    if (!front) return toast('Queue is empty', 'peek() returned undefined.', '');
    toast('peek() — O(1)', `${front.customer_name}, ticket #${front.position}, ${front.quantity} unit(s).`, '');
  } catch (err) {
    toast('Peek failed', err.message, 'err');
  }
}

function renderHistory(history) {
  const host = el('history');
  if (!history.length) {
    host.innerHTML = `<div class="empty" style="padding:24px">${icon('clock')}<br>No requests served yet.</div>`;
    return;
  }
  host.innerHTML = `<div class="table-scroll"><table><tbody>${history.map((h) => `
    <tr>
      <td><strong>${esc(h.customer_name)}</strong>
        <div style="font-size:11.5px;color:var(--ink-3)">${esc((h.product && h.product.name) || h.product_name || '')} × ${h.quantity}</div></td>
      <td style="text-align:right">
        <span class="badge ${h.status === 'fulfilled' ? 'badge-stock' : 'badge-muted'}">${esc(h.status)}</span>
        <div style="font-size:11px;color:var(--ink-3);margin-top:3px">${esc(timeAgo(h.processed_at))}</div>
      </td>
    </tr>`).join('')}</tbody></table></div>`;
}

function renderSyncLog(events) {
  const tbody = document.querySelector('#sync-table tbody');
  if (!events.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">No sync events yet — record a sale above.</td></tr>';
    return;
  }
  tbody.innerHTML = events.map((e) => {
    const storeName = e.store ? e.store.name : (e.store_name || '');
    const productName = e.product ? e.product.name : (e.product_name || '');
    const positive = e.delta > 0;
    return `<tr>
      <td>${esc(storeName)}</td>
      <td>${esc(productName)}</td>
      <td class="num" style="color:${positive ? '#0a7d0a' : '#b32e2e'};font-weight:700">${positive ? '+' : ''}${e.delta}</td>
      <td><span class="badge badge-muted">${esc(e.source)}</span></td>
      <td style="color:var(--ink-3)">${esc(timeAgo(e.synced_at))}</td>
    </tr>`;
  }).join('');
}

/* --------------------------------- refresh -------------------------------- */

let refreshing = false;

async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    const [inv, queue, history, sync] = await Promise.all([
      loadInventory(),
      API.get(`/stores/${state.storeId}/queue`),
      API.get(`/stores/${state.storeId}/queue/history`),
      API.get('/billing/recent?limit=12'),
    ]);
    renderStats(inv.items, queue.length);
    renderQueue(queue);
    renderHistory(history.history || []);
    renderSyncLog(sync.events || []);
  } catch (err) {
    toast('Could not load the dashboard', err.message, 'err');
  } finally {
    refreshing = false;
  }
}

/* ----------------------------------- boot --------------------------------- */

async function init() {
  el('logo-mark').innerHTML = icon('shop');
  el('loc-ico').innerHTML = icon('shop');
  el('refresh-ico').innerHTML = icon('refresh');
  el('sale-ico').innerHTML = icon('sale');
  el('restock-ico').innerHTML = icon('restock');

  drawRingBuffer(0);
  await loadStores();
  await refresh();

  el('store-select').addEventListener('change', async (e) => {
    state.storeId = Number(e.target.value);
    store.set('shopStoreId', state.storeId);
    state.ring.front = 0;
    paintStoreHeader();
    await refresh();
  });

  el('refresh').addEventListener('click', refresh);
  el('serve-next').addEventListener('click', serveNext);
  el('peek').addEventListener('click', peekFront);
  el('bill-sell').addEventListener('click', () => billingSync(-1));
  el('bill-restock').addEventListener('click', () => billingSync(1));

  el('inv-filter').addEventListener('input', (e) => { state.filter = e.target.value; renderInventory(); });

  el('reset-demo').addEventListener('click', async () => {
    if (!confirm('Reset all demo data back to its seeded state?')) return;
    try {
      await API.post('/admin/reset', {});
      state.ring.front = 0;
      toast('Demo data reset', 'Inventory and queues are back to their seeded values.', 'ok');
      await refresh();
    } catch (err) {
      toast('Reset unavailable', err.message, 'err');
    }
  });

  setInterval(() => { if (!document.hidden) refresh(); }, 12000);
}

document.addEventListener('DOMContentLoaded', init);
