/* ==========================================================================
   NearStock — customer app
   ========================================================================== */

const PRESETS = [
  { label: 'Town Hall, Coimbatore',      lat: 11.0025, lng: 76.9640 },
  { label: 'Gandhipuram',                lat: 11.0183, lng: 76.9668 },
  { label: 'RS Puram',                   lat: 11.0060, lng: 76.9490 },
  { label: 'Peelamedu (PSG Tech)',       lat: 11.0245, lng: 77.0028 },
  { label: 'Ramanathapuram',             lat: 10.9975, lng: 76.9470 },
  { label: 'Saibaba Colony',             lat: 11.0290, lng: 76.9490 },
  { label: 'Thudiyalur',                 lat: 11.0810, lng: 76.9420 },
  { label: 'Singanallur',                lat: 10.9980, lng: 77.0290 },
];

const state = {
  origin: store.get('origin', { lat: 11.0168, lng: 76.9558, label: 'Coimbatore (default)' }),
  inStockOnly: false,
  lastQuery: '',
  myRequests: store.get('myRequests', []),
  customer: store.get('customer', { name: '', phone: '' }),
};

const el = (id) => document.getElementById(id);

/* ------------------------------ location ---------------------------------- */

function paintLocation() {
  el('loc-label').textContent = state.origin.label;
  el('loc-coords').textContent = `${state.origin.lat.toFixed(4)}, ${state.origin.lng.toFixed(4)}`;
}

function setOrigin(origin, { rerun = true } = {}) {
  state.origin = origin;
  store.set('origin', origin);
  paintLocation();
  loadStores();
  if (rerun && state.lastQuery) runSearch(state.lastQuery);
}

function initPresets() {
  const sel = el('loc-preset');
  PRESETS.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = p.label;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => {
    const p = PRESETS[Number(sel.value)];
    if (p) setOrigin({ lat: p.lat, lng: p.lng, label: p.label });
    sel.value = '';
  });
}

function useGps() {
  const btn = el('use-gps');
  if (!navigator.geolocation) {
    toast('Location unavailable', 'This browser does not expose GPS. Pick a landmark instead.', 'err');
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Locating…';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      btn.disabled = false;
      btn.textContent = 'Use my location';
      setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'Your current location' });
      toast('Location updated', 'Distances are now measured from where you are.', 'ok');
    },
    (err) => {
      btn.disabled = false;
      btn.textContent = 'Use my location';
      toast('Could not get your location',
        err.code === 1 ? 'Permission was denied — pick a landmark instead.' : err.message, 'err');
    },
    { enableHighAccuracy: true, timeout: 9000, maximumAge: 60000 }
  );
}

/* ------------------------------- search ----------------------------------- */

async function runSearch(term) {
  const q = String(term || '').trim();
  if (!q) return;
  state.lastQuery = q;
  el('q').value = q;

  const section = el('results-section');
  const host = el('results');
  section.hidden = false;
  el('intro-section').hidden = true;
  host.innerHTML = '<div class="card"><div class="empty"><span class="spinner"></span><br>Searching nearby shops…</div></div>';
  el('results-heading').textContent = `Results for “${q}”`;
  el('results-hint').textContent = '';

  const params = new URLSearchParams({
    q,
    lat: String(state.origin.lat),
    lng: String(state.origin.lng),
    limit: '8',
    inStockOnly: String(state.inStockOnly),
  });

  try {
    const data = await API.get(`/search?${params}`);
    renderResults(data);
  } catch (err) {
    host.innerHTML = `<div class="card"><div class="empty"><span class="big">⚠️</span>${esc(err.message)}</div></div>`;
  }
}

function renderResults(data) {
  const host = el('results');
  el('results-hint').textContent =
    `${data.matchedProducts} product${data.matchedProducts === 1 ? '' : 's'} matched · distances from ${data.origin.label}`;

  if (!data.results.length) {
    host.innerHTML = `<div class="card"><div class="empty">
      <span class="big">🔍</span>
      No product in the catalogue matches “${esc(data.query)}”.<br>
      Try a shorter term, or a brand name like “Amul” or “boAt”.
    </div></div>`;
    el('dsa-note').hidden = true;
    return;
  }

  host.innerHTML = data.results.map(renderProductCard).join('');

  const d = data.dsa;
  el('dsa-note').hidden = false;
  el('dsa-note').innerHTML =
    `<b>DSA trace</b> — catalogue scanned with a linear search, ranked by merge sort; ` +
    `${d.candidates} stocking shop${d.candidates === 1 ? '' : 's'} evaluated, ` +
    `${d.distanceComputations} Haversine distance computation${d.distanceComputations === 1 ? '' : 's'}, ` +
    `${d.heapExtractions} MinHeap extraction${d.heapExtractions === 1 ? '' : 's'} to pull the nearest shops ` +
    `(<b>O(n + k log n)</b> instead of a full <b>O(n log n)</b> sort).`;

  host.querySelectorAll('[data-request]').forEach((btn) => {
    btn.addEventListener('click', () => openRequestModal(btn.dataset.store, btn.dataset.product, btn.dataset.storeName, btn.dataset.productName));
  });
}

function renderProductCard(result) {
  const p = result.product;
  const shops = result.shops;

  const rows = shops.length
    ? shops.map((s) => {
        const nearest = result.nearest && s.store_id === result.nearest.store_id;
        return `
        <li class="shop ${nearest ? 'is-nearest' : ''} ${s.inStock ? '' : 'is-out'}">
          <span class="shop-rank">${nearest ? '🥇' : s.rank}</span>
          <div class="shop-main">
            <div class="shop-name">
              ${esc(s.store_name)}
              ${nearest ? '<span class="badge badge-nearest">Nearest available</span>' : ''}
              ${stockBadge(s.quantity)}
            </div>
            <div class="shop-meta">
              ${esc(s.category)} · ${esc(s.address)} · ⭐ ${s.rating.toFixed(1)} · open ${esc(s.opens_at)}–${esc(s.closes_at)}
            </div>
          </div>
          <div class="shop-dist">
            <div class="km">${esc(s.distanceLabel)}</div>
            <div class="eta">~${s.etaMin} min away</div>
          </div>
          <div class="shop-actions">
            <span class="shop-price">${money(s.price)}</span>
            <a class="btn btn-sm" href="${esc(s.mapUrl)}" target="_blank" rel="noopener">Directions</a>
            <button class="btn btn-sm btn-accent" type="button"
              data-request data-store="${s.store_id}" data-product="${p.product_id}"
              data-store-name="${esc(s.store_name)}" data-product-name="${esc(p.name)}">
              ${s.inStock ? 'Reserve' : 'Request'}
            </button>
          </div>
        </li>`;
      }).join('')
    : `<li><div class="empty">No shop nearby currently lists this product${state.inStockOnly ? ' in stock' : ''}.</div></li>`;

  return `
    <article class="card result">
      <div class="result-head">
        <div class="result-emoji">${esc(p.image_emoji || '📦')}</div>
        <div class="result-title">
          <h3>${esc(p.name)}</h3>
          <div class="meta">${esc(p.brand || '')} · ${esc(p.category)} · per ${esc(p.unit)} · MRP ${money(p.base_price)}</div>
        </div>
        <div class="result-summary">
          <strong>${result.inStockShops}</strong>
          of ${result.totalShops} shops have it
        </div>
      </div>
      <ul class="shoplist">${rows}</ul>
    </article>`;
}

/* ------------------------------ requests ---------------------------------- */

function openRequestModal(storeId, productId, storeName, productName) {
  openModal({
    title: 'Join the request queue',
    subtitle: `${productName} · ${storeName}`,
    confirmLabel: 'Place request',
    bodyHtml: `
      <div class="field">
        <label for="rq-name">Your name</label>
        <input id="rq-name" value="${esc(state.customer.name)}" placeholder="e.g. Nirmal R" required>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="rq-phone">Phone</label>
          <input id="rq-phone" value="${esc(state.customer.phone)}" placeholder="98xxxxxxxx" inputmode="tel">
        </div>
        <div class="field" style="max-width:110px">
          <label for="rq-qty">Quantity</label>
          <input id="rq-qty" type="number" min="1" value="1">
        </div>
      </div>
      <div class="field">
        <label for="rq-note">Note for the shop <span style="font-weight:400">(optional)</span></label>
        <input id="rq-note" placeholder="e.g. will collect before 7pm">
      </div>
      <div class="dsa-note">
        <b>Queue · enqueue · O(1)</b> — your request is added to the rear of this shop's
        circular-array queue and served strictly First In, First Out.
      </div>`,
    onConfirm: async (body) => {
      const name = body.querySelector('#rq-name').value.trim();
      if (!name) { toast('Name required', 'Tell the shop who is collecting.', 'err'); return true; }

      const phone = body.querySelector('#rq-phone').value.trim();
      const quantity = Number(body.querySelector('#rq-qty').value) || 1;
      const note = body.querySelector('#rq-note').value.trim();

      state.customer = { name, phone };
      store.set('customer', state.customer);

      const res = await API.post('/queue', {
        store_id: Number(storeId), product_id: Number(productId),
        customer_name: name, customer_phone: phone, quantity, note,
      });

      state.myRequests.unshift({
        request_id: res.request.request_id,
        store_id: Number(storeId),
        store_name: storeName,
        product_name: productName,
        quantity,
        position: res.positionInLine,
        placed_at: new Date().toISOString(),
      });
      state.myRequests = state.myRequests.slice(0, 10);
      store.set('myRequests', state.myRequests);

      toast('Request placed', res.message, 'ok');
      renderMyRequests();
      loadStores();
      return false;
    },
  });
}

async function renderMyRequests() {
  const section = el('requests-section');
  const host = el('my-requests');
  if (!state.myRequests.length) { section.hidden = true; return; }
  section.hidden = false;

  // Ask each relevant store for its live queue so positions stay accurate.
  const storeIds = [...new Set(state.myRequests.map((r) => r.store_id))];
  const queues = new Map();
  await Promise.all(storeIds.map(async (id) => {
    try { queues.set(id, await API.get(`/stores/${id}/queue`)); } catch { /* ignore */ }
  }));

  const rows = state.myRequests.map((r) => {
    const q = queues.get(r.store_id);
    const live = q && q.items.find((i) => i.request_id === r.request_id);
    const status = live
      ? `<span class="badge badge-brand">#${live.positionInLine} in line</span>`
      : '<span class="badge badge-stock">Served / closed</span>';
    const cancelBtn = live
      ? `<button class="btn btn-sm btn-ghost" data-cancel="${r.request_id}" data-store="${r.store_id}">Cancel</button>`
      : '';
    return `<tr>
      <td><strong>${esc(r.product_name)}</strong><div style="font-size:12px;color:var(--text-faint)">${esc(r.store_name)}</div></td>
      <td class="num">${r.quantity}</td>
      <td>${status}</td>
      <td style="color:var(--text-faint);font-size:12.5px">${esc(timeAgo(r.placed_at))}</td>
      <td style="text-align:right">${cancelBtn}</td>
    </tr>`;
  }).join('');

  host.innerHTML = `<div class="table-scroll"><table>
    <thead><tr><th>Product</th><th class="num">Qty</th><th>Status</th><th>Placed</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;

  host.querySelectorAll('[data-cancel]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await API.del(`/stores/${btn.dataset.store}/queue/${btn.dataset.cancel}`);
        toast('Request cancelled', 'The rest of the line keeps its FIFO order.', 'ok');
        renderMyRequests();
        loadStores();
      } catch (err) {
        toast('Could not cancel', err.message, 'err');
        btn.disabled = false;
      }
    });
  });
}

/* -------------------------------- stores ---------------------------------- */

async function loadStores() {
  const tbody = document.querySelector('#stores-table tbody');
  if (!tbody) return;
  try {
    const [{ stores }, { queues }] = await Promise.all([
      API.get(`/stores?lat=${state.origin.lat}&lng=${state.origin.lng}`),
      API.get('/queues'),
    ]);
    const waitingBy = new Map(queues.map((q) => [q.store.store_id, q.items.length]));
    el('store-count').textContent = `${stores.length} shops · sorted by merge sort on distance`;
    tbody.innerHTML = stores.map((s) => `
      <tr>
        <td><strong>${esc(s.name)}</strong><div style="font-size:12px;color:var(--text-faint)">${esc(s.address)}</div></td>
        <td><span class="badge badge-muted">${esc(s.category)}</span></td>
        <td class="num">${esc(s.distanceLabel)}</td>
        <td class="num">${waitingBy.get(s.store_id) || 0}</td>
      </tr>`).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty">${esc(err.message)}</td></tr>`;
  }
}

/* --------------------------------- boot ----------------------------------- */

function init() {
  paintLocation();
  initPresets();
  loadStores();
  renderMyRequests();

  el('search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    runSearch(el('q').value);
  });

  el('suggestions').addEventListener('click', (e) => {
    if (e.target.matches('.chip')) runSearch(e.target.textContent);
  });

  el('use-gps').addEventListener('click', useGps);

  el('toggle-instock').addEventListener('click', (e) => {
    state.inStockOnly = !state.inStockOnly;
    e.target.setAttribute('aria-pressed', String(state.inStockOnly));
    e.target.textContent = `In-stock only: ${state.inStockOnly ? 'on' : 'off'}`;
    e.target.classList.toggle('btn-primary', state.inStockOnly);
    if (state.lastQuery) runSearch(state.lastQuery);
  });

  // Deep link: /?q=milk
  const initial = new URLSearchParams(location.search).get('q');
  if (initial) runSearch(initial);

  // Keep queue positions fresh while the tab is open.
  setInterval(() => { if (!document.hidden) renderMyRequests(); }, 15000);
}

document.addEventListener('DOMContentLoaded', init);
