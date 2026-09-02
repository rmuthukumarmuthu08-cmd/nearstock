/* ==========================================================================
   NearStock — customer app
   ========================================================================== */

const PRESETS = [
  { label: 'Town Hall, Coimbatore', lat: 11.0025, lng: 76.9640 },
  { label: 'Gandhipuram',           lat: 11.0183, lng: 76.9668 },
  { label: 'RS Puram',              lat: 11.0060, lng: 76.9490 },
  { label: 'Peelamedu (PSG Tech)',  lat: 11.0245, lng: 77.0028 },
  { label: 'Ramanathapuram',        lat: 10.9975, lng: 76.9470 },
  { label: 'Saibaba Colony',        lat: 11.0290, lng: 76.9490 },
  { label: 'Thudiyalur',            lat: 11.0810, lng: 76.9420 },
  { label: 'Singanallur',           lat: 10.9980, lng: 77.0290 },
];

const state = {
  origin: store.get('origin', { lat: 11.0168, lng: 76.9558, label: 'Coimbatore (default)' }),
  inStockOnly: false,
  lastQuery: '',
  lastData: null,
  myRequests: store.get('myRequests', []),
  customer: store.get('customer', { name: '', phone: '' }),
};

const el = (id) => document.getElementById(id);

/* ------------------------------ helpers ----------------------------------- */

/** Count up to a value so the hero numbers feel alive. */
function animateCount(node, target, dur = 1100) {
  const from = Number(String(node.textContent).replace(/[^\d]/g, '')) || 0;
  const start = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - start) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    node.textContent = Math.round(from + (target - from) * eased).toLocaleString('en-IN');
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Two-letter monogram for a product, so no emoji is needed. */
function monogram(name) {
  // Prefer word-initials, ignoring size/spec tokens like "5kg" or "20W".
  const words = String(name).replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w));
  if (!words.length) return String(name).trim().slice(0, 2).toUpperCase() || '?';
  return words.length === 1
    ? words[0].slice(0, 2).toUpperCase()
    : (words[0][0] + words[1][0]).toUpperCase();
}

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
      toast('Location updated', 'Distances now measured from where you are.', 'ok');
    },
    (err) => {
      btn.disabled = false;
      btn.textContent = 'Use my location';
      toast('Could not get your location',
        err.code === 1 ? 'Permission denied — pick a landmark instead.' : err.message, 'err');
    },
    { enableHighAccuracy: true, timeout: 9000, maximumAge: 60000 }
  );
}

/* ------------------------------- search ----------------------------------- */

function skeleton() {
  return `<div class="card result"><div class="result-head">
      <div class="mono-tile skeleton" style="background:rgba(255,255,255,.5)"></div>
      <div class="result-title">
        <div class="skeleton" style="height:18px;width:220px"></div>
        <div class="skeleton" style="height:11px;width:290px;margin-top:9px"></div>
      </div>
    </div>
    ${[0, 1, 2].map(() => `<div class="shop">
      <div class="shop-rank skeleton" style="background:rgba(255,255,255,.5)"></div>
      <div class="shop-main">
        <div class="skeleton" style="height:15px;width:180px"></div>
        <div class="skeleton" style="height:10px;width:270px;margin-top:8px"></div>
      </div>
      <div class="skeleton" style="height:28px;width:70px"></div>
    </div>`).join('')}
  </div>`;
}

async function runSearch(term) {
  const q = String(term || '').trim();
  if (!q) return;
  state.lastQuery = q;
  el('q').value = q;

  el('results-section').hidden = false;
  el('intro-section').hidden = true;
  el('results').innerHTML = skeleton();
  el('results-heading').textContent = `Results for “${q}”`;
  el('results-hint').textContent = 'searching…';

  const params = new URLSearchParams({
    q, lat: String(state.origin.lat), lng: String(state.origin.lng),
    limit: '8', inStockOnly: String(state.inStockOnly),
  });

  try {
    renderResults(await API.get(`/search?${params}`));
  } catch (err) {
    el('results').innerHTML = `<div class="card"><div class="empty">${icon('alert')}<br>${esc(err.message)}</div></div>`;
    el('results-hint').textContent = '';
  }
}

function renderResults(data) {
  const host = el('results');
  el('results-hint').textContent =
    `${data.matchedProducts} product${data.matchedProducts === 1 ? '' : 's'} · distances from ${data.origin.label}`;

  if (!data.results.length) {
    host.innerHTML = `<div class="card"><div class="empty">
      ${icon('search')}<br>
      Nothing in the catalogue matches “${esc(data.query)}”.<br>
      Try a shorter term, or a brand like “Amul” or “boAt”.
    </div></div>`;
    el('dsa-note').hidden = true;
    return;
  }

  host.innerHTML = data.results.map((r, i) => renderProductCard(r, data.origin, i)).join('');

  // Animate the availability rings and proximity bars in.
  requestAnimationFrame(() => {
    host.querySelectorAll('.ring .fg').forEach((c) => { c.style.strokeDashoffset = c.dataset.offset; });
    host.querySelectorAll('.prox i').forEach((b) => { b.style.width = b.dataset.w; });
  });

  state.lastData = data;
  data.results.forEach((r, i) => drawMiniMap(`map-${i}`, r, data.origin));

  const d = data.dsa;
  el('dsa-note').hidden = false;
  el('dsa-note').innerHTML = `
    <div class="trace-head"><span class="lamp"></span><h4>DSA trace — what the server just ran</h4></div>
    <div class="trace-grid">
      <div class="trace-item"><div class="tv">${d.candidates}</div><div class="tl">stocking shops evaluated</div></div>
      <div class="trace-item"><div class="tv">${d.distanceComputations}</div><div class="tl">Haversine distance computations</div></div>
      <div class="trace-item"><div class="tv">${d.heapExtractions}</div><div class="tl">MinHeap extractions</div></div>
      <div class="trace-item"><div class="tv">O(n + k log n)</div><div class="tl">instead of a full O(n log n) sort</div></div>
    </div>
    <div class="trace-foot">
      <b>search</b> linear scan, prefix-weighted &nbsp;·&nbsp;
      <b>sort</b> merge sort, stable &nbsp;·&nbsp;
      <b>rank</b> Haversine → MinHeap k-smallest &nbsp;·&nbsp;
      <b>reserve</b> Queue.enqueue, O(1)
    </div>`;

  host.querySelectorAll('[data-request]').forEach((btn) => {
    btn.addEventListener('click', () =>
      openRequestModal(btn.dataset.store, btn.dataset.product, btn.dataset.storeName, btn.dataset.productName));
  });
}

function renderProductCard(result, origin, idx) {
  const p = result.product;
  const shops = result.shops;
  const maxKm = Math.max(...shops.map((s) => s.distanceKm), 0.5);

  const pct = result.totalShops ? result.inStockShops / result.totalShops : 0;
  const CIRC = 2 * Math.PI * 21;

  const rows = shops.length
    ? shops.map((s, i) => {
        const nearest = result.nearest && s.store_id === result.nearest.store_id;
        return `
        <li class="shop ${nearest ? 'is-nearest' : ''} ${s.inStock ? '' : 'is-out'}" style="animation-delay:${i * 55}ms">
          <span class="shop-rank">${s.rank}</span>
          <div class="shop-main">
            <div class="shop-name">
              ${esc(s.store_name)}
              ${nearest ? '<span class="badge badge-nearest">Nearest available</span>' : ''}
              ${stockBadge(s.quantity)}
            </div>
            <div class="shop-meta">${esc(s.category)} · ${esc(s.address)} · rated ${s.rating.toFixed(1)} · open ${esc(s.opens_at)}–${esc(s.closes_at)}</div>
          </div>
          <div class="shop-dist">
            <div class="km">${esc(s.distanceLabel)}</div>
            <div class="eta">~${s.etaMin} min</div>
            <div class="prox"><i data-w="${Math.max(6, 100 - (s.distanceKm / maxKm) * 92)}%"></i></div>
          </div>
          <div class="shop-price">${money(s.price)}</div>
          <div class="shop-actions">
            <a class="btn btn-sm" href="${esc(s.mapUrl)}" target="_blank" rel="noopener">Directions</a>
            <button class="btn btn-sm btn-accent" type="button"
              data-request data-store="${s.store_id}" data-product="${p.product_id}"
              data-store-name="${esc(s.store_name)}" data-product-name="${esc(p.name)}">
              ${s.inStock ? 'Reserve' : 'Request'}
            </button>
          </div>
        </li>`;
      }).join('')
    : `<li><div class="empty">${icon('box')}<br>No nearby shop lists this product${state.inStockOnly ? ' in stock' : ''}.</div></li>`;

  return `
    <article class="card result" style="animation-delay:${idx * 80}ms">
      <div class="result-head">
        <div class="mono-tile">${esc(monogram(p.name))}</div>
        <div class="result-title">
          <h3>${esc(p.name)}</h3>
          <div class="meta">${esc(p.brand || '')} · ${esc(p.category)} · per ${esc(p.unit)} · MRP ${money(p.base_price)}</div>
        </div>
        <div class="avail">
          <div class="avail-copy"><b>${result.inStockShops}/${result.totalShops}</b>shops have it</div>
          <svg class="ring" viewBox="0 0 48 48" aria-hidden="true">
            <circle class="bg" cx="24" cy="24" r="21"></circle>
            <circle class="fg" cx="24" cy="24" r="21"
              stroke-dasharray="${CIRC.toFixed(1)}"
              style="stroke-dashoffset:${CIRC.toFixed(1)}"
              data-offset="${(CIRC * (1 - pct)).toFixed(1)}"
              transform="rotate(-90 24 24)"></circle>
          </svg>
        </div>
      </div>
      <ul class="shoplist">${rows}</ul>
      ${shops.length ? `
      <div class="mapwrap">
        <div class="map-head">
          <h4>Proximity map</h4>
          <span>true bearing and distance from ${esc(origin.label)}</span>
        </div>
        <svg class="mapsvg" id="map-${idx}" viewBox="0 0 560 250" role="img"
             aria-label="Map of shops stocking ${esc(p.name)}, positioned by real distance and direction from you"></svg>
        <div class="map-legend">
          <span><i style="background:#0ca30c"></i>In stock</span>
          <span><i style="background:#d03b3b"></i>Out of stock</span>
          <span><i style="background:#2e6fd8"></i>You</span>
          <span>Dot size = units on the shelf</span>
        </div>
      </div>` : ''}
    </article>`;
}

/* ----------------------------- proximity map ------------------------------ */

/**
 * A local equirectangular projection of the shops around the customer.
 * Rings mark real distance bands; the angle is the true compass bearing.
 */
function drawMiniMap(svgId, result, origin) {
  const svg = document.getElementById(svgId);
  if (!svg) return;

  const shops = result.shops;

  // Portrait geometry on phones so the map stays legible; landscape on desktop.
  const narrow = window.innerWidth < 640;
  const W = narrow ? 340 : 560;
  const H = narrow ? 330 : 250;
  const cx = W / 2;
  const cy = H / 2 - 4;
  const R = narrow ? 118 : 104;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  const maxKm = Math.max(...shops.map((s) => s.distanceKm), 0.6);
  const scale = R / maxKm;
  const kmPerDegLat = 110.574;
  const kmPerDegLng = 111.320 * Math.cos((origin.lat * Math.PI) / 180);

  const parts = [];

  for (let i = 1; i <= 3; i++) {
    const r = (R / 3) * i;
    const km = (maxKm / 3) * i;
    parts.push(`<circle class="ring-line" cx="${cx}" cy="${cy}" r="${r}"></circle>`);
    parts.push(`<text class="ring-label" x="${cx + 3}" y="${cy - r + 10}">${km < 1 ? Math.round(km * 1000) + 'm' : km.toFixed(1) + 'km'}</text>`);
  }
  for (const a of [0, 45, 90, 135]) {
    const rad = (a * Math.PI) / 180;
    parts.push(`<line class="spoke" x1="${cx - Math.cos(rad) * R}" y1="${cy - Math.sin(rad) * R}" x2="${cx + Math.cos(rad) * R}" y2="${cy + Math.sin(rad) * R}"></line>`);
  }
  parts.push(`<text class="ring-label" x="${cx - 4}" y="${cy - R - 7}">N</text>`);

  parts.push(`<circle class="you-halo" cx="${cx}" cy="${cy}" r="13"></circle>`);
  parts.push(`<circle class="you" cx="${cx}" cy="${cy}" r="5.5"></circle>`);
  parts.push(`<text class="dot-label" x="${cx + 12}" y="${cy + 4}" style="fill:#2e6fd8">You</text>`);

  shops.forEach((s) => {
    const dxKm = (s.longitude - origin.lng) * kmPerDegLng;
    const dyKm = (s.latitude - origin.lat) * kmPerDegLat;
    const x = cx + dxKm * scale;
    const y = cy - dyKm * scale;
    const r = Math.min(13, 6.5 + Math.sqrt(Math.max(s.quantity, 0)) * 0.55);
    const fill = s.inStock ? '#0ca30c' : '#d03b3b';

    parts.push(`<g class="shop-dot" data-name="${esc(s.store_name)}" data-dist="${esc(s.distanceLabel)}" data-qty="${s.quantity}" data-price="${s.price}">
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r + 3).toFixed(1)}" fill="${fill}" opacity=".16"></circle>
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${fill}" stroke="#ffffff" stroke-width="2"></circle>
      <text class="dot-num" x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}">${s.rank}</text>
    </g>`);

    if (s.rank === 1 && !narrow) {
      const anchor = x > cx ? 'start' : 'end';
      const off = x > cx ? r + 7 : -(r + 7);
      parts.push(`<text class="dot-label" x="${(x + off).toFixed(1)}" y="${(y - r - 5).toFixed(1)}" text-anchor="${anchor}">${esc(s.store_name)}</text>`);
    }
  });

  svg.innerHTML = parts.join('');

  const wrap = svg.closest('.mapwrap');
  let tip = wrap.querySelector('.map-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'map-tip';
    wrap.appendChild(tip);
  }
  const place = (e) => {
    const box = wrap.getBoundingClientRect();
    tip.style.left = `${e.clientX - box.left + 14}px`;
    tip.style.top = `${e.clientY - box.top - 12}px`;
  };
  svg.querySelectorAll('.shop-dot').forEach((g) => {
    g.addEventListener('mouseenter', (e) => {
      const d = g.dataset;
      tip.innerHTML = `<b>${esc(d.name)}</b><span>${esc(d.dist)} · ${d.qty} in stock · ${money(d.price)}</span>`;
      tip.style.opacity = '1';
      place(e);
    });
    g.addEventListener('mousemove', place);
    g.addEventListener('mouseleave', () => { tip.style.opacity = '0'; });
  });
}

/* ------------------------------ requests ---------------------------------- */

function openRequestModal(storeId, productId, storeName, productName) {
  openModal({
    title: 'Join the request queue',
    subtitle: `${productName} · ${storeName}`,
    confirmLabel: 'Place request',
    bodyHtml: `
      <div class="ufield">
        <input id="rq-name" value="${esc(state.customer.name)}" placeholder="Your name" required>
        <span class="rail"></span>
      </div>
      <div class="field-row">
        <div class="ufield" style="flex:2">
          <input id="rq-phone" value="${esc(state.customer.phone)}" placeholder="Phone" inputmode="tel">
          <span class="rail"></span>
        </div>
        <div class="ufield" style="flex:1">
          <input id="rq-qty" type="number" min="1" value="1" placeholder="Qty">
          <span class="rail"></span>
        </div>
      </div>
      <div class="ufield">
        <input id="rq-note" placeholder="Note for the shop (optional)">
        <span class="rail"></span>
      </div>
      <div class="dsa-note">
        <b>Queue · enqueue · O(1)</b> — your request goes to the <code>rear</code> of this shop's
        circular-array queue and is served strictly First In, First Out.
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
        placed_at: new Date().toISOString(),
      });
      state.myRequests = state.myRequests.slice(0, 10);
      store.set('myRequests', state.myRequests);

      toast('Request placed', res.message, 'ok');
      renderMyRequests();
      loadStores();
      loadMeta();
      return false;
    },
  });
}

async function renderMyRequests() {
  const section = el('requests-section');
  const host = el('my-requests');
  if (!state.myRequests.length) { section.hidden = true; return; }
  section.hidden = false;

  const storeIds = [...new Set(state.myRequests.map((r) => r.store_id))];
  const queues = new Map();
  await Promise.all(storeIds.map(async (id) => {
    try { queues.set(id, await API.get(`/stores/${id}/queue`)); } catch { /* ignore */ }
  }));

  const rows = state.myRequests.map((r) => {
    const q = queues.get(r.store_id);
    const live = q && q.items.find((i) => i.request_id === r.request_id);
    const status = live
      ? `<span class="badge badge-brand">${icon('clock')}#${live.positionInLine} in line</span>`
      : `<span class="badge badge-stock">${icon('check')}Served</span>`;
    const cancelBtn = live
      ? `<button class="btn btn-sm btn-ghost" data-cancel="${r.request_id}" data-store="${r.store_id}">Cancel</button>`
      : '';
    return `<tr>
      <td><strong>${esc(r.product_name)}</strong><div style="font-size:12px;color:var(--ink-3)">${esc(r.store_name)}</div></td>
      <td class="num">${r.quantity}</td>
      <td>${status}</td>
      <td style="color:var(--ink-3);font-size:12.5px">${esc(timeAgo(r.placed_at))}</td>
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
        renderMyRequests(); loadStores(); loadMeta();
      } catch (err) {
        toast('Could not cancel', err.message, 'err');
        btn.disabled = false;
      }
    });
  });
}

/* -------------------------------- data ------------------------------------ */

async function loadMeta() {
  try {
    const m = await API.get('/meta');
    animateCount(el('hs-shops'), m.stats.stores);
    animateCount(el('hs-products'), m.stats.products);
    animateCount(el('hs-units'), m.stats.totalUnits);
    animateCount(el('hs-queue'), m.stats.waitingRequests);
    el('hero-shopcount').textContent = m.stats.stores;
  } catch { /* hero stats are decorative */ }
}

async function loadStores() {
  const tbody = document.querySelector('#stores-table tbody');
  if (!tbody) return;
  try {
    const [{ stores }, { queues }] = await Promise.all([
      API.get(`/stores?lat=${state.origin.lat}&lng=${state.origin.lng}`),
      API.get('/queues'),
    ]);
    const waitingBy = new Map(queues.map((q) => [q.store.store_id, q.items.length]));
    el('store-count').textContent = `${stores.length} shops · merge-sorted by distance`;
    tbody.innerHTML = stores.map((s) => `
      <tr>
        <td><strong>${esc(s.name)}</strong><div style="font-size:12px;color:var(--ink-3)">${esc(s.address)}</div></td>
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
  el('logo-mark').innerHTML = icon('box');
  el('search-ico').innerHTML = icon('search');
  el('loc-ico').innerHTML = icon('pin');
  el('check-ico').innerHTML = icon('check');

  paintLocation();
  initPresets();
  loadMeta();
  loadStores();
  renderMyRequests();

  el('search-form').addEventListener('submit', (e) => { e.preventDefault(); runSearch(el('q').value); });
  el('suggestions').addEventListener('click', (e) => { if (e.target.matches('.chip')) runSearch(e.target.textContent); });
  el('use-gps').addEventListener('click', useGps);

  el('toggle-instock').addEventListener('change', (e) => {
    state.inStockOnly = e.target.checked;
    if (state.lastQuery) runSearch(state.lastQuery);
  });

  const initial = new URLSearchParams(location.search).get('q');
  if (initial) runSearch(initial);

  setInterval(() => { if (!document.hidden) renderMyRequests(); }, 15000);

  // Maps use a different aspect on phones — redraw when the breakpoint is crossed.
  let wasNarrow = window.innerWidth < 640;
  let t;
  window.addEventListener('resize', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      const isNarrow = window.innerWidth < 640;
      if (isNarrow !== wasNarrow && state.lastData) {
        wasNarrow = isNarrow;
        state.lastData.results.forEach((r, i) => drawMiniMap(`map-${i}`, r, state.lastData.origin));
      }
    }, 180);
  });
}

document.addEventListener('DOMContentLoaded', init);
