/* ==========================================================================
   NearStock — shared frontend helpers
   ========================================================================== */

const API = {
  async request(path, options = {}) {
    const res = await fetch(`/api${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { /* empty body */ }
    if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
    return data;
  },
  get(path) { return API.request(path); },
  post(path, body) { return API.request(path, { method: 'POST', body }); },
  put(path, body) { return API.request(path, { method: 'PUT', body }); },
  del(path) { return API.request(path, { method: 'DELETE' }); },
};

/** Escape untrusted text before putting it into innerHTML. */
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const money = (n) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function timeAgo(iso) {
  if (!iso) return '—';
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function stockBadge(qty) {
  if (qty <= 0) return '<span class="badge badge-out">Out of stock</span>';
  if (qty <= 5) return `<span class="badge badge-low">Only ${qty} left</span>`;
  return `<span class="badge badge-stock">${qty} in stock</span>`;
}

/* ---------------------------------- toasts -------------------------------- */

function toast(title, body = '', kind = '') {
  let host = document.querySelector('.toasts');
  if (!host) {
    host = document.createElement('div');
    host.className = 'toasts';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `<strong>${esc(title)}</strong>${body ? `<span>${esc(body)}</span>` : ''}`;
  host.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .25s, transform .25s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    setTimeout(() => el.remove(), 260);
  }, 4200);
}

/* ---------------------------------- modal --------------------------------- */

function openModal({ title, subtitle = '', bodyHtml, confirmLabel = 'Confirm', onConfirm }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-head">
        <h3>${esc(title)}</h3>
        ${subtitle ? `<p>${esc(subtitle)}</p>` : ''}
      </div>
      <div class="modal-body">${bodyHtml}</div>
      <div class="modal-foot">
        <button class="btn" data-cancel>Cancel</button>
        <button class="btn btn-primary" data-confirm>${esc(confirmLabel)}</button>
      </div>
    </div>`;

  const close = () => { backdrop.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };

  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  backdrop.querySelector('[data-cancel]').addEventListener('click', close);
  backdrop.querySelector('[data-confirm]').addEventListener('click', async () => {
    const btn = backdrop.querySelector('[data-confirm]');
    btn.disabled = true;
    try {
      const keepOpen = await onConfirm(backdrop.querySelector('.modal-body'));
      if (!keepOpen) close();
    } catch (err) {
      toast('Could not complete', err.message, 'err');
    } finally {
      btn.disabled = false;
    }
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(backdrop);
  const firstInput = backdrop.querySelector('input, select, textarea');
  if (firstInput) firstInput.focus();
  return { close, root: backdrop };
}

/* ------------------------------ tiny storage ------------------------------ */

const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(`nearstock:${key}`);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(`nearstock:${key}`, JSON.stringify(value)); } catch { /* ignore */ }
  },
};
