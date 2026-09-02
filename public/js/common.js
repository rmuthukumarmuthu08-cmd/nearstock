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
  if (qty <= 0) return `<span class="badge badge-out">${icon('alert')}Out of stock</span>`;
  if (qty <= 5) return `<span class="badge badge-low">${icon('low')}Only ${qty} left</span>`;
  return `<span class="badge badge-stock">${icon('check')}${qty} in stock</span>`;
}

/* ------------------------------ line icons -------------------------------- */

const ICONS = {
  search:   '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>',
  mail:     '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5L12 13l8.5-6.5"/>',
  lock:     '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/>',
  pin:      '<path d="M12 21s7-5.6 7-11a7 7 0 10-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
  shop:     '<path d="M4 9h16l-1 11H5L4 9z"/><path d="M8.5 9V6.5a3.5 3.5 0 017 0V9"/>',
  target:   '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  arrow:    '<path d="M5 12h13"/><path d="M13 6l6 6-6 6"/>',
  check:    '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  alert:    '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v5M12 16.2v.1"/>',
  low:      '<path d="M12 4.5l8.5 15h-17l8.5-15z"/><path d="M12 10v4M12 17v.1"/>',
  refresh:  '<path d="M20 12a8 8 0 11-2.6-5.9"/><path d="M20 4v4h-4"/>',
  eye:      '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  sale:     '<path d="M4 7h16v13H4z"/><path d="M8 11h8M8 15h5"/><path d="M8 4h8v3H8z"/>',
  restock:  '<path d="M4 8l8-4 8 4v8l-8 4-8-4V8z"/><path d="M4 8l8 4 8-4M12 12v8"/>',
  layers:   '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
  clock:    '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  close:    '<path d="M6 6l12 12M18 6L6 18"/>',
  chevron:  '<path d="M9 5l7 7-7 7"/>',
  box:      '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>',
};

/** Inline stroke icon. `cls` lets callers size or colour it. */
function icon(name, cls = '') {
  return `<svg class="icn ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

/* --------------------------- background scene ----------------------------- */

/**
 * Builds the layered landscape behind every page: sun, drifting clouds,
 * four mountain ranges and a conifer foreground. Pure SVG, no images.
 */
function buildScene() {
  const host = document.querySelector('.scene');
  if (!host) return;

  const cloud = (cx, cy, s, o) =>
    `<g opacity="${o}" transform="translate(${cx} ${cy}) scale(${s})">
       <ellipse cx="0"   cy="0"  rx="86" ry="34"/>
       <ellipse cx="-58" cy="10" rx="58" ry="26"/>
       <ellipse cx="58"  cy="9"  rx="62" ry="27"/>
       <ellipse cx="-14" cy="-20" rx="46" ry="30"/>
       <ellipse cx="30"  cy="-16" rx="40" ry="26"/>
     </g>`;

  /** Layered conifer silhouette. */
  const pine = (x, base, h, w) => {
    let d = '';
    const tiers = 6;
    for (let i = 0; i < tiers; i++) {
      const t = i / tiers;
      const tipY = base - h * (0.22 + t * 0.76);
      const baseYt = base - h * (t * 0.7);
      const bw = w * (1 - t * 0.68);
      d += `M${(x - bw / 2).toFixed(1)} ${baseYt.toFixed(1)} L${x} ${tipY.toFixed(1)} L${(x + bw / 2).toFixed(1)} ${baseYt.toFixed(1)} Z `;
    }
    d += `M${x - w * 0.045} ${base} L${x - w * 0.045} ${base - h * 0.12} L${x + w * 0.045} ${base - h * 0.12} L${x + w * 0.045} ${base} Z`;
    return `<path d="${d}"/>`;
  };

  const bird = (x, y, s) =>
    `<path d="M${x} ${y} q6 -7 12 0 q6 -7 12 0" transform="scale(${s})" transform-origin="${x} ${y}"/>`;

  host.innerHTML = `
  <svg class="scene-svg" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="#dbeafe"/>
        <stop offset="55%"  stop-color="#e8f1fe"/>
        <stop offset="100%" stop-color="#f2f7ff"/>
      </linearGradient>
      <radialGradient id="sunGlow">
        <stop offset="0%"   stop-color="#ffffff" stop-opacity=".95"/>
        <stop offset="55%"  stop-color="#ffffff" stop-opacity=".45"/>
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="m1" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#c9d9f7"/><stop offset="100%" stop-color="#dbe6fb"/>
      </linearGradient>
      <linearGradient id="m2" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#9dbdea"/><stop offset="100%" stop-color="#b6d0f2"/>
      </linearGradient>
      <linearGradient id="m3" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#5b93c9"/><stop offset="100%" stop-color="#7fb0da"/>
      </linearGradient>
      <linearGradient id="m4" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#2b6f86"/><stop offset="100%" stop-color="#3f8ea0"/>
      </linearGradient>
      <linearGradient id="m5" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#14464f"/><stop offset="100%" stop-color="#1d5c66"/>
      </linearGradient>
    </defs>

    <rect width="1440" height="900" fill="url(#sky)"/>

    <g class="sun-layer">
      <circle cx="720" cy="150" r="240" fill="url(#sunGlow)"/>
      <circle class="sun" cx="720" cy="150" r="104" fill="#ffffff"/>
    </g>

    <g fill="#ffffff" class="cloud-far">
      ${cloud(180, 210, 1.05, .72)}${cloud(1250, 175, .95, .66)}
    </g>

    <g fill="url(#m1)" class="range r1">
      <path d="M-60 470 L170 300 L330 415 L520 265 L760 470 L980 320 L1180 455 L1360 330 L1500 470 L1500 900 L-60 900 Z"/>
    </g>
    <g fill="url(#m2)" class="range r2">
      <path d="M-60 560 L120 430 L300 545 L470 400 L640 540 L860 415 L1060 555 L1260 440 L1500 560 L1500 900 L-60 900 Z"/>
    </g>

    <g fill="#ffffff" class="cloud-near">
      ${cloud(430, 250, 1.25, .92)}${cloud(1020, 225, 1.15, .88)}${cloud(720, 300, 1.4, .8)}
    </g>

    <g fill="url(#m3)" class="range r3">
      <path d="M-60 660 L150 520 L360 645 L560 500 L790 655 L1010 520 L1230 660 L1420 545 L1500 640 L1500 900 L-60 900 Z"/>
    </g>
    <g fill="url(#m4)" class="range r4">
      <path d="M-60 760 L200 620 L420 745 L640 610 L880 760 L1120 625 L1340 755 L1500 690 L1500 900 L-60 900 Z"/>
    </g>
    <g fill="url(#m5)" class="range r5">
      <path d="M-60 850 L240 730 L520 845 L800 725 L1080 850 L1360 745 L1500 820 L1500 900 L-60 900 Z"/>
    </g>

    <g class="birds" fill="none" stroke="#16384a" stroke-width="2.4" stroke-linecap="round" opacity=".7">
      <g class="flock flock-a">${bird(0, 0, 1)}${bird(34, 16, .8)}${bird(-30, 20, .7)}</g>
      <g class="flock flock-b">${bird(0, 0, .85)}${bird(28, 14, .65)}</g>
    </g>

    <g fill="#0d2a33" class="trees trees-l">
      ${pine(70, 930, 340, 190)}${pine(200, 940, 260, 150)}${pine(-20, 945, 300, 170)}${pine(300, 950, 200, 120)}
    </g>
    <g fill="#0d2a33" class="trees trees-r">
      ${pine(1380, 930, 350, 195)}${pine(1250, 945, 255, 150)}${pine(1460, 940, 300, 175)}${pine(1140, 952, 190, 115)}
    </g>
  </svg>`;

  // Gentle parallax — ranges shift a few pixels with the pointer.
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && window.innerWidth > 820) {
    const svg = host.querySelector('.scene-svg');
    const layers = [
      ['.sun-layer', 4], ['.cloud-far', 7], ['.r1', 5], ['.r2', 9],
      ['.cloud-near', 14], ['.r3', 14], ['.r4', 20], ['.r5', 26],
      ['.trees-l', 34], ['.trees-r', 34],
    ].map(([sel, d]) => [svg.querySelector(sel), d]).filter(([n]) => n);

    let raf;
    window.addEventListener('pointermove', (e) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const dx = (e.clientX / window.innerWidth - 0.5);
        const dy = (e.clientY / window.innerHeight - 0.5);
        for (const [node, depth] of layers) {
          node.style.transform = `translate(${(-dx * depth).toFixed(2)}px, ${(-dy * depth * 0.4).toFixed(2)}px)`;
        }
      });
    }, { passive: true });
  }
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
  el.innerHTML = `${icon(kind === 'err' ? 'alert' : 'check', 'toast-ico')}
    <div><strong>${esc(title)}</strong>${body ? `<span>${esc(body)}</span>` : ''}</div>`;
  host.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .28s, transform .28s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    setTimeout(() => el.remove(), 300);
  }, 4200);
}

/* ---------------------------------- modal --------------------------------- */

function openModal({ title, subtitle = '', bodyHtml, confirmLabel = 'Confirm', onConfirm }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal glass" role="dialog" aria-modal="true">
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

/* ---------------------- reveal-on-scroll for sections --------------------- */

function initReveal() {
  const targets = [...document.querySelectorAll('[data-reveal]')];
  if (!targets.length) return;

  const show = (n) => n.classList.add('in');

  if (!('IntersectionObserver' in window)) { targets.forEach(show); return; }

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { show(e.target); io.unobserve(e.target); }
    });
  }, { threshold: 0 });
  targets.forEach((t) => io.observe(t));

  // Panels grow after their data loads, so re-check once everything has settled —
  // and never leave content hidden if the observer misses it entirely.
  const sweep = () => targets.forEach((t) => {
    const r = t.getBoundingClientRect();
    if (r.top < window.innerHeight + 120) show(t);
  });
  window.addEventListener('load', () => setTimeout(sweep, 200));
  setTimeout(() => targets.forEach(show), 2500);
}

document.addEventListener('DOMContentLoaded', () => { buildScene(); initReveal(); });
