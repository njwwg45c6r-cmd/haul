/* HAUL app — screens, storage, map, routing, live run. Pure logic lives in core.js. */
(() => {
  'use strict';
  const C = window.HaulCore;
  const { MIN, HOUR, DAY } = C;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const KEY = 'haul.v1';

  const I = {
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 14l6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 10l6 6 6-6"/></svg>',
    msg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v10H9l-5 4z"/></svg>',
    pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0113 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    car: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 15.5V12l2-5h12l2 5v3.5M3 15.5h18v3H3z"/><circle cx="7.5" cy="18.5" r="1.4"/><circle cx="16.5" cy="18.5" r="1.4"/></svg>',
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11l8-6.5 8 6.5M6 9.5V20h12V9.5"/></svg>',
    nav: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 4L4 11l7 2 2 7z"/></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="12" rx="2"/><path d="M5 15V5a1 1 0 011-1h9"/></svg>',
    cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/></svg>',
    ext: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 5h6v6M19 5l-8.5 8.5M17 14v5H5V7h5"/></svg>',
    paste: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5.5" y="5" width="13" height="16" rx="2"/><path d="M9 5V3.5h6V5M9 11h6M9 15h4"/></svg>',
    camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3.5L9 5.5h6L16.5 8H20v11H4z"/><circle cx="12" cy="13.5" r="3.4"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10-6.5z"/></svg>',
    route: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="18.5" r="2"/><circle cx="18.5" cy="5.5" r="2"/><path d="M7.5 18.5h6a3.5 3.5 0 000-7h-3a3.5 3.5 0 010-7h6"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/></svg>',
  };

  /* ================= state ================= */

  const DEFAULT_SETTINGS = { home: null, vehicle: 'suv', mpg: 22, gas: 3.25, dwell: 10, early: 5, grace: 5, theme: 'auto', scale: 1, city: '', wake: true, quickPaste: true };
  const freshState = () => ({
    v: 1, seeded: false, listings: [], hunts: [], settings: { ...DEFAULT_SETTINGS },
    run: { startMode: 'gps', endMode: 'home', departMode: 'auto', departAt: null, keepOrder: false, order: [], plan: null, live: null },
    ui: { tab: 'list', sort: 'newest', priceDir: 1, filter: 'active', q: '', showDone: false },
  });
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw), f = freshState();
        return { ...f, ...s, settings: { ...f.settings, ...(s.settings || {}) }, run: { ...f.run, ...(s.run || {}) }, ui: { ...f.ui, ...(s.ui || {}) } };
      }
    } catch (e) { /* fresh start */ }
    return freshState();
  }
  let S = load();
  let saveTimer = null, persistAsked = false;
  function save() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 250); }
  function saveNow() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Could not save. Phone storage may be full.'); }
    if (!persistAsked && navigator.storage && navigator.storage.persist) { persistAsked = true; navigator.storage.persist().catch(() => {}); }
  }

  // runtime only (never saved)
  const R = { pos: null, watchId: null, map: null, tiles: null, tileDark: null, layer: null, routeLayer: null, meLayer: null, markers: new Map(), fitted: false,
    pickFor: null, geoCache: new Map(), lastGeo: 0, draft: null, ocr: null, busy: null, wake: null, liveRoute: null, liveFetchAt: 0, sheet: null, sheetArg: null,
    geoResults: null, propose: null, confirmErase: false, importPending: null, selected: null, huntDraft: null, lastLiveRender: 0, lastClip: null };
  const isEditing = () => { const a = document.activeElement; return !!(a && a.matches && a.matches('input, select, textarea')); };

  /* ================= helpers ================= */

  const byId = id => S.listings.find(l => l.id === id);
  const winOf = l => (l.listedMin != null ? { min: l.listedMin, max: l.listedMax } : null);
  const midOf = l => (l.listedMin != null ? (l.listedMin + l.listedMax) / 2 : null);
  const refPoint = () => R.pos || S.settings.home || null;
  const distM = l => { const r = refPoint(); return r && l.lat != null ? C.haversineKm(r, l) * 1000 : null; };
  const dealPct = l => (l.maxPay && l.price != null ? (l.maxPay - l.price) / l.maxPay : null);
  const flagsFor = l => C.scamFlags([l.title, l.description, l.notes, l.rawText].filter(Boolean).join('\n'), { price: l.price, maxPay: l.maxPay });
  const catLabel = id => (C.CATEGORIES.find(c => c.id === id) || { label: 'Other' }).label;
  const statusLabel = id => (C.STATUSES.find(s => s.id === id) || { label: id }).label;
  const money = n => C.fmtMoney(n);
  const isDark = () => S.settings.theme === 'dark' || (S.settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
  const vehicle = () => C.VEHICLES[S.settings.vehicle] || C.VEHICLES.suv;
  const cleanUrl = u => String(u || '').split('?')[0].replace(/\/+$/, '').toLowerCase();

  function toast(msg, ms = 2600) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0;top:0';
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
      let ok = false; try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
      ta.remove(); return ok;
    }
  }

  async function saveFile(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function fetchJSON(url, ms = 12000) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }

  /* ================= listings ================= */

  function makeListing(p, extra = {}) {
    const now = Date.now();
    const hist = [];
    if (p.wasPrice != null) hist.push({ t: null, price: p.wasPrice });
    if (p.price != null) hist.push({ t: now, price: p.price });
    return {
      id: uid(), example: false, createdAt: now, updatedAt: now, capturedAt: now,
      url: p.url || null, fbId: p.fbId || null, title: (p.title || '').trim() || 'Untitled listing', price: p.price ?? null, wasPrice: p.wasPrice ?? null, priceHistory: hist,
      category: p.category || C.guessCategory(p.title, p.price), condition: p.condition || null, description: p.description || null, seller: p.seller || null,
      place: p.place || null, lat: p.lat ?? null, lng: p.lng ?? null, prec: p.lat != null ? (p.prec || 'exact') : null,
      listedMin: p.listedWindow ? p.listedWindow.min : null, listedMax: p.listedWindow ? p.listedWindow.max : null, listedObs: p.listedWindow ? 1 : 0,
      status: 'found', appt: null, dwell: null, size: p.size || 'M', helper: false, maxPay: p.maxPay ?? null, resale: null, notes: '',
      rawText: (p.rawText || '').slice(0, 3000), inRun: false, ...extra,
    };
  }

  const normTxt = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  /* same listing = same Facebook id or link, or same title in the same town at a believable price (drops allowed) */
  function findDup(d) {
    const t = normTxt(d.title), pl = normTxt(d.place);
    return S.listings.find(l => {
      if (d.fbId && l.fbId === d.fbId) return true;
      if (d.url && l.url && cleanUrl(l.url) === cleanUrl(d.url)) return true;
      if (!t || normTxt(l.title) !== t) return false;
      if (pl && l.place && normTxt(l.place) !== pl) return false;
      if (d.price > 0 && l.price > 0) { const r = d.price / l.price; if (r < 0.5 || r > 1.5) return false; }
      return true;
    });
  }

  function mergeInto(l, d) {
    const msgs = [];
    if (d.window) {
      const r = C.intersectWindows(winOf(l), d.window);
      l.listedMin = r.window.min; l.listedMax = r.window.max; l.listedObs = (l.listedObs || 0) + 1;
      if (r.narrowed) { const f = C.fmtListed(r.window); msgs.push('Listed time sharpened to ' + (f.err || 'the minute')); }
    }
    if (d.price != null && d.price !== l.price) {
      l.priceHistory = [...(l.priceHistory || []), { t: Date.now(), price: d.price }];
      if (l.price != null && d.price < l.price) { l.wasPrice = l.price; msgs.push(`Price dropped ${money(l.price)} → ${money(d.price)}`); }
      l.price = d.price;
    }
    for (const k of ['url', 'fbId', 'place', 'condition', 'description', 'seller']) if (!l[k] && d[k]) l[k] = d[k];
    if (d.rawText) l.rawText = ((l.rawText ? l.rawText + '\n---\n' : '') + d.rawText).slice(-4000);
    l.updatedAt = Date.now();
    return msgs;
  }

  function setStatus(l, status) {
    const prev = l.status; l.status = status; l.updatedAt = Date.now();
    if (status === 'confirmed' && prev !== 'confirmed') { l.inRun = true; toast('Confirmed. Added to your run.'); }
    if (status === 'passed') l.inRun = false;
    if (status === 'picked' && S.run.live && S.run.live.on) liveAdvance();
    save();
  }

  /* background: put a city-level pin on new listings so they show on the map right away */
  async function autoLocate(l) {
    if (!l || l.lat != null || !l.place || !navigator.onLine) return;
    try {
      const res = await geocode(l.place);
      if (res && res[0] && byId(l.id) && l.lat == null) {
        l.lat = res[0].lat; l.lng = res[0].lng; l.prec = 'approx'; save(); syncMarkers(); renderView();
      }
    } catch (e) { /* stays unmapped; user can set it in Details */ }
  }

  /* ================= geocoding (OpenStreetMap Nominatim, 1 request per second) ================= */

  const EXACT_TYPES = new Set(['house', 'building', 'residential', 'address', 'place', 'amenity', 'shop', 'commercial', 'retail', 'office', 'parking', 'road', 'house_number', 'leisure', 'tourism']);
  async function geocode(q) {
    const key = q.trim().toLowerCase();
    if (!key) return [];
    if (R.geoCache.has(key)) return R.geoCache.get(key);
    const wait = 1100 - (Date.now() - R.lastGeo); if (wait > 0) await sleep(wait);
    R.lastGeo = Date.now();
    const p = new URLSearchParams({ q, format: 'jsonv2', limit: '5' });
    const ref = refPoint();
    if (ref) p.set('viewbox', `${ref.lng - 1.3},${ref.lat + 1.3},${ref.lng + 1.3},${ref.lat - 1.3}`);
    const j = await fetchJSON('https://nominatim.openstreetmap.org/search?' + p.toString());
    const res = (j || []).map(r => ({ label: r.display_name, lat: +r.lat, lng: +r.lon, prec: EXACT_TYPES.has(r.addresstype || r.type) ? 'exact' : 'approx' }));
    R.geoCache.set(key, res);
    return res;
  }

  /* ================= routing (OSRM on OpenStreetMap data) ================= */

  const OSRM = ['https://routing.openstreetmap.de/routed-car', 'https://router.project-osrm.org'];
  const coordStr = pts => pts.map(p => `${(+p.lng).toFixed(6)},${(+p.lat).toFixed(6)}`).join(';');
  async function osrm(service, pts, query) {
    if (!navigator.onLine) throw new Error('offline');
    let last = null;
    for (const base of OSRM) {
      try {
        const j = await fetchJSON(`${base}/${service}/v1/driving/${coordStr(pts)}?${query}`, 14000);
        if (j && j.code === 'Ok') return j;
        last = new Error(j && j.code);
      } catch (e) { last = e; }
    }
    throw last || new Error('Routing failed');
  }
  async function osrmTable(pts) {
    const j = await osrm('table', pts, 'annotations=duration,distance');
    if (!j.durations) throw new Error('No table');
    const est = C.estimateMatrix(pts);
    const dur = j.durations.map((row, i) => row.map((x, k) => (x == null ? est.dur[i][k] : Math.round(x))));
    const dist = (j.distances || est.dist).map((row, i) => row.map((x, k) => (x == null ? est.dist[i][k] : Math.round(x))));
    return { dur, dist, source: 'osrm' };
  }
  async function osrmGeometry(pts) {
    const j = await osrm('route', pts, 'overview=full&geometries=geojson&steps=false');
    const line = j.routes[0].geometry.coordinates.map(([x, y]) => [+y.toFixed(5), +x.toFixed(5)]);
    if (line.length <= 900) return line;
    const step = Math.ceil(line.length / 900), out = line.filter((_, i) => i % step === 0);
    out.push(line[line.length - 1]); return out;
  }

  /* ================= GPS ================= */

  function onPos(p) {
    R.pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, at: Date.now() };
    drawMe();
    if (S.run.live && S.run.live.on) liveTick();
  }
  function onPosErr(err) {
    if (err && err.code === 1) toast('Location is off for HAUL. Turn it on in Settings › Privacy › Location Services.', 4200);
  }
  function startWatch() {
    if (!('geolocation' in navigator)) { toast('Location is not available on this device.'); return false; }
    if (R.watchId == null) R.watchId = navigator.geolocation.watchPosition(onPos, onPosErr, { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 });
    return true;
  }
  function getPosOnce(timeout = 12000) {
    return new Promise((res, rej) => {
      if (!('geolocation' in navigator)) return rej(new Error('No GPS'));
      if (R.pos && Date.now() - R.pos.at < 60000) return res(R.pos);
      navigator.geolocation.getCurrentPosition(p => { onPos(p); res(R.pos); }, e => { onPosErr(e); rej(e); }, { enableHighAccuracy: true, maximumAge: 30000, timeout });
    });
  }

  /* ================= examples (first run) ================= */

  function seedExamples() {
    const now = Date.now();
    const ago = s => C.windowFromAge(now, C.parseAge(s));
    const appt1 = C.roundUpTo(now + 80 * MIN, 15), appt2 = appt1 + 55 * MIN;
    const mk = o => makeListing({ title: o.title, price: o.price, wasPrice: o.wasPrice, place: o.place, listedWindow: o.win, condition: o.condition, description: o.description, lat: o.lat, lng: o.lng, prec: o.prec, size: o.size, maxPay: o.maxPay },
      { example: true, status: o.status, appt: o.appt || null, inRun: !!o.inRun, helper: !!o.helper });
    S.listings = [
      mk({ title: 'Fender Rumble 100 bass combo', price: 150, maxPay: 180, place: 'Spring Hill, FL', lat: 28.4831, lng: -82.537, prec: 'approx', status: 'found', size: 'M', condition: 'Used - Good', win: ago('22 minutes ago'), description: 'Works great, small scuff on one corner. Cash only, porch pickup.' }),
      mk({ title: 'QSC K12.2 powered speaker', price: 450, wasPrice: 550, maxPay: 500, place: 'Brooksville, FL', lat: 28.5553, lng: -82.3879, prec: 'approx', status: 'messaged', size: 'L', condition: 'Used - Like New', win: ago('3 hours ago') }),
      mk({ title: 'Road case on casters, 30 × 20 × 20 in', price: 60, maxPay: 80, place: 'Hudson, FL', lat: 28.3647, lng: -82.6955, prec: 'exact', status: 'confirmed', size: 'L', appt: appt1, inRun: true, win: ago('yesterday') }),
      mk({ title: 'Solid oak desk, 60 in wide', price: 90, maxPay: 120, place: 'Weeki Wachee, FL', lat: 28.5154, lng: -82.5735, prec: 'exact', status: 'confirmed', size: 'XL', helper: true, appt: appt2, inRun: true, win: ago('2 days ago') }),
      mk({ title: 'Boom mic stands, set of 4', price: 40, place: 'New Port Richey, FL', lat: 28.2442, lng: -82.7193, prec: 'approx', status: 'found', size: 'S', win: ago('about an hour ago') }),
      mk({ title: 'DeWalt 20V drill + 2 batteries', price: 35, maxPay: 120, place: "Land O' Lakes, FL", lat: 28.2189, lng: -82.4576, prec: 'approx', status: 'found', size: 'S', win: ago('5 hours ago'), description: 'Brand new in box. I am out of town so shipping only. Send a $20 deposit on Zelle to hold it.' }),
    ];
    S.hunts = [
      { id: uid(), example: true, query: 'bass amp', minPrice: null, maxPrice: 300, days: 1, sort: 'creation_time_descend', condition: '', lastChecked: now - 50 * MIN },
      { id: uid(), example: true, query: 'road case', minPrice: null, maxPrice: 150, days: 7, sort: 'creation_time_descend', condition: '', lastChecked: now - 3 * HOUR },
      { id: uid(), example: true, query: 'speaker stands', minPrice: null, maxPrice: 80, days: 7, sort: 'distance_ascend', condition: '', lastChecked: null },
    ];
    S.run.order = []; S.run.plan = null; S.seeded = true;
    saveNow();
  }
  function clearExamples() {
    S.listings = S.listings.filter(l => !l.example);
    S.hunts = S.hunts.filter(h => !h.example);
    S.run.plan = null; S.run.order = S.run.order.filter(id => byId(id));
    save(); syncMarkers(); drawRoute(); renderAll(); toast('Examples cleared');
  }

  /* ================= top + tabs ================= */

  function renderTop() {
    const active = S.listings.filter(l => C.ACTIVE.includes(l.status)).length;
    const stops = runStops().length;
    let html = `<b>${active}</b> active · <b>${stops}</b> in run`;
    if (S.run.live && S.run.live.on) html = `<b style="color:var(--sign)">RUN LIVE</b> · ${stops} left`;
    $('#topMeta').innerHTML = html;
    const runTab = document.querySelector('.tab[data-tab="run"]');
    let b = runTab.querySelector('.badge');
    if (stops) { if (!b) { b = document.createElement('span'); b.className = 'badge num'; runTab.appendChild(b); } b.textContent = stops; } else if (b) b.remove();
  }

  function showTab(tab) {
    S.ui.tab = tab; save();
    for (const t of ['list', 'map', 'run', 'hunt']) $('#view-' + t).hidden = t !== tab;
    document.querySelectorAll('.tab').forEach(b => { if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    if (tab === 'map') { ensureMap(); setTimeout(() => { R.map.invalidateSize(); syncMarkers(); drawRoute(); if (!R.fitted) fitAll(); }, 30); }
    renderView();
  }

  function renderAll() { renderTop(); renderView(); }
  function renderView() {
    renderTop();
    if (S.ui.tab === 'list') renderList();
    else if (S.ui.tab === 'run') renderRun();
    else if (S.ui.tab === 'hunt') renderHunts();
    else if (S.ui.tab === 'map') renderMapBanner();
  }

  /* ================= LIST ================= */

  const SORTS = [
    { id: 'newest', label: 'Newest listed' },
    { id: 'pickup', label: 'Pickup time' },
    { id: 'item', label: 'Item A–Z' },
    { id: 'price', label: 'Price' },
    { id: 'near', label: 'Nearest' },
    { id: 'deal', label: 'Best deal' },
  ];

  function renderListControls() {
    const sortRow = SORTS.map(s => {
      const on = S.ui.sort === s.id;
      const label = s.id === 'price' ? `Price ${S.ui.priceDir > 0 ? '↑' : '↓'}` : s.label;
      return `<button class="chip" data-act="sort" data-sort="${s.id}" aria-pressed="${on}">${esc(label)}</button>`;
    }).join('');
    const counts = {};
    for (const l of S.listings) counts[l.status] = (counts[l.status] || 0) + 1;
    const activeN = S.listings.filter(l => C.ACTIVE.includes(l.status)).length;
    const f = S.ui.filter;
    let filterRow = `<button class="chip" data-act="filter" data-filter="active" aria-pressed="${f === 'active'}">Active <span class="count">${activeN}</span></button>`;
    filterRow += C.STATUSES.map(s => `<button class="chip" data-act="filter" data-filter="${s.id}" aria-pressed="${f === s.id}"><span class="dot" style="--c:var(--st-${s.id})"></span>${esc(s.label)} <span class="count">${counts[s.id] || 0}</span></button>`).join('');
    filterRow += `<button class="chip" data-act="filter" data-filter="all" aria-pressed="${f === 'all'}">All <span class="count">${S.listings.length}</span></button>`;
    $('#sortRow').innerHTML = sortRow;
    $('#filterRow').innerHTML = filterRow;
  }

  function filteredListings() {
    const q = (S.ui.q || '').trim().toLowerCase();
    return S.listings.filter(l => {
      if (S.ui.filter === 'active' && !C.ACTIVE.includes(l.status)) return false;
      if (S.ui.filter !== 'active' && S.ui.filter !== 'all' && l.status !== S.ui.filter) return false;
      if (q && ![l.title, l.place, l.notes, l.seller, catLabel(l.category), l.condition].filter(Boolean).join(' ').toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function groupedListings(now) {
    const items = filteredListings();
    const sort = S.ui.sort;
    if (sort === 'newest') {
      const known = items.filter(l => midOf(l) != null).sort((a, b) => midOf(b) - midOf(a));
      const unknown = items.filter(l => midOf(l) == null).sort((a, b) => b.capturedAt - a.capturedAt);
      const groups = []; let cur = null;
      for (const l of known) { const k = C.dayLabel(midOf(l), now); if (!cur || cur.title !== k) { cur = { title: k, items: [] }; groups.push(cur); } cur.items.push(l); }
      if (unknown.length) groups.push({ title: 'Listed time unknown', items: unknown });
      return groups;
    }
    if (sort === 'pickup') {
      const timed = items.filter(l => l.appt).sort((a, b) => a.appt - b.appt);
      const rest = items.filter(l => !l.appt).sort((a, b) => (midOf(b) || b.capturedAt) - (midOf(a) || a.capturedAt));
      const groups = []; let cur = null;
      for (const l of timed) { const k = 'Pickup ' + C.dayLabel(l.appt, now).toLowerCase(); if (!cur || cur.title !== k) { cur = { title: k, items: [] }; groups.push(cur); } cur.items.push(l); }
      if (rest.length) groups.push({ title: 'No pickup time yet', items: rest });
      return groups;
    }
    if (sort === 'item') {
      const groups = [];
      for (const c of C.CATEGORIES) {
        const g = items.filter(l => (l.category || 'other') === c.id).sort((a, b) => a.title.localeCompare(b.title));
        if (g.length) groups.push({ title: c.label, items: g });
      }
      return groups;
    }
    if (sort === 'price') {
      const d = S.ui.priceDir;
      const sorted = items.slice().sort((a, b) => ((a.price ?? 1e9 * d) - (b.price ?? 1e9 * d)) * d);
      return [{ title: d > 0 ? 'Lowest price first' : 'Highest price first', items: sorted }];
    }
    if (sort === 'near') {
      const withD = items.filter(l => distM(l) != null).sort((a, b) => distM(a) - distM(b));
      const rest = items.filter(l => distM(l) == null);
      const groups = [{ title: R.pos ? 'Nearest to you' : (S.settings.home ? 'Nearest to home' : 'Distance'), items: withD }];
      if (rest.length) groups.push({ title: 'No location yet', items: rest });
      return groups.filter(g => g.items.length);
    }
    if (sort === 'deal') {
      const withD = items.filter(l => dealPct(l) != null).sort((a, b) => dealPct(b) - dealPct(a));
      const rest = items.filter(l => dealPct(l) == null);
      const groups = [];
      if (withD.length) groups.push({ title: 'Furthest under your max price', items: withD });
      if (rest.length) groups.push({ title: 'No max price set', items: rest });
      return groups;
    }
    return [{ title: '', items }];
  }

  function ageChip(l, now) {
    const mid = midOf(l);
    if (mid == null) return '<span class="age" title="Listed time unknown">?</span>';
    const age = Math.max(0, now - mid);
    const cls = age < HOUR ? 'age-hot' : age < 6 * HOUR ? 'age-warm' : '';
    return `<span class="age ${cls}" title="Time since listed">${C.fmtAge(age)}</span>`;
  }

  function cardHTML(l, now) {
    const f = C.fmtListed(winOf(l), now);
    const d = distM(l);
    const tags = [];
    if (l.example) tags.push('<span class="ex-badge">EXAMPLE</span>');
    if (l.appt) {
      const late = l.appt < now && C.ACTIVE.includes(l.status);
      tags.push(`<span class="tag ${late ? 'tag-warn' : 'tag-time'}">${I.clock}${late ? 'Missed? ' : 'Pickup '}${esc(C.dayLabel(l.appt, now) === 'Today' ? C.fmtClock(l.appt) : C.dayLabel(l.appt, now) + ' ' + C.fmtClock(l.appt))}</span>`);
    }
    if (l.wasPrice && l.price != null && l.wasPrice > l.price) tags.push(`<span class="tag tag-good">↓ ${money(l.wasPrice - l.price)} drop</span>`);
    const dp = dealPct(l);
    if (dp != null) tags.push(dp >= 0 ? `<span class="tag tag-good">${Math.round(dp * 100)}% under max</span>` : `<span class="tag tag-bad">${money(l.price - l.maxPay)} over max</span>`);
    const flags = flagsFor(l);
    const high = flags.filter(x => x.level === 'high').length;
    if (flags.length) tags.push(`<span class="tag ${high ? 'tag-bad' : 'tag-warn'}">${flags.length} red flag${flags.length > 1 ? 's' : ''}</span>`);
    if (l.lat == null) tags.push('<span class="tag tag-ghost">No location</span>');
    else if (l.prec === 'approx') tags.push('<span class="tag tag-dash">Area only</span>');
    if (l.helper) tags.push('<span class="tag tag-ghost">2 people</span>');
    tags.push(`<span class="tag tag-ghost" title="Size">${esc(l.size || 'M')}</span>`);
    const meta = [];
    meta.push(`<span>${esc(l.place || 'Location unknown')}</span>`);
    if (d != null) meta.push(`<span class="num">${C.fmtMiles(d)}</span>`);
    meta.push(f ? `<span>Listed <span class="num">${esc(f.main)}</span>${f.err ? ` <span class="num">${esc(f.err)}</span>` : ''}</span>` : '<span>Listed time unknown</span>');
    const done = l.status === 'picked' || l.status === 'passed';
    const runBtn = done
      ? `<button class="btn" data-act="open" data-id="${l.id}">Details</button>`
      : `<button class="btn ${l.inRun ? 'on' : ''}" data-act="run-toggle" data-id="${l.id}">${l.inRun ? I.check + 'In run' : I.plus + 'Run'}</button>`;
    return `<article class="card is-${l.status}">
      <div class="card-top">
        <button class="sticker st-${l.status}" data-act="cycle" data-id="${l.id}" aria-label="Status ${esc(statusLabel(l.status))}. Tap to move to the next step.">${esc(statusLabel(l.status))}</button>
        ${ageChip(l, now)}
        <span class="price">${esc(money(l.price))}${l.wasPrice && l.wasPrice > (l.price ?? 0) ? `<span class="was">${esc(money(l.wasPrice))}</span>` : ''}</span>
      </div>
      <button class="card-title" data-act="open" data-id="${l.id}">${esc(l.title)}</button>
      <div class="card-meta">${meta.join('')}</div>
      <div class="card-tags">${tags.join('')}</div>
      <div class="card-actions">
        <button class="btn" data-act="msg" data-id="${l.id}">${I.msg}Message</button>
        <button class="btn" data-act="map" data-id="${l.id}">${I.pin}Map</button>
        ${runBtn}
      </div>
    </article>`;
  }

  function todayStrip(now) {
    const next = S.listings.filter(l => l.appt && l.appt > now - 15 * MIN && C.ACTIVE.includes(l.status)).sort((a, b) => a.appt - b.appt)[0];
    if (!next) return '';
    const inMs = next.appt - now;
    const when = inMs > 0 ? 'in ' + C.fmtDur(inMs) : 'now';
    return `<button class="today" data-act="tab" data-tab="run">
      <span class="big">${esc(C.fmtClock(next.appt))}</span>
      <span class="what"><b>${esc(next.title)}</b><span>Next pickup ${esc(C.dayLabel(next.appt, now).toLowerCase())}, ${esc(when)}</span></span>
      <span class="go">RUN ›</span></button>`;
  }

  function renderList() {
    renderListControls();
    const now = Date.now();
    const q = $('#q'); if (q && document.activeElement !== q) q.value = S.ui.q || '';
    let html = todayStrip(now);
    if (S.listings.some(l => l.example)) {
      html += `<div class="notice" style="margin-bottom:12px"><div><b>These are examples.</b> They show what HAUL does. Add your first real listing with the yellow <b>+</b> below.</div>
        <div class="row"><button class="btn" data-act="clear-examples">Clear examples</button><button class="btn" data-act="howto">Fastest way to add</button></div></div>`;
    }
    if (!S.listings.length) {
      html += `<div class="empty"><h3>No listings yet</h3><p>In Facebook, open a listing and tap Share › Copy link. Then tap the yellow + below and Paste.</p><button class="btn btn-sign btn-lg" data-act="add">${I.plus} Add a listing</button></div>`;
      $('#listBody').innerHTML = html; return;
    }
    const groups = groupedListings(now);
    if (!groups.length || groups.every(g => !g.items.length)) {
      html += `<div class="empty"><h3>Nothing here</h3><p>No listings match this filter${S.ui.q ? ' and search' : ''}.</p><button class="btn" data-act="filter" data-filter="all">Show all</button></div>`;
    } else {
      if (S.ui.sort === 'near' && !refPoint()) html += `<div class="notice" style="margin-bottom:8px">Distance needs a starting point.<div class="row"><button class="btn" data-act="locate-list">Use my location</button><button class="btn" data-act="settings">Set home</button></div></div>`;
      for (const g of groups) {
        if (!g.items.length) continue;
        if (g.title) html += `<div class="group-head"><h2>${esc(g.title)}</h2><span class="line"></span><span class="n">${g.items.length}</span></div>`;
        html += `<div class="cards">${g.items.map(l => cardHTML(l, now)).join('')}</div>`;
      }
    }
    $('#listBody').innerHTML = html;
  }

  /* ================= SHEETS ================= */

  function openSheet(kind, arg) {
    R.sheet = kind; R.sheetArg = arg;
    $('#scrim').hidden = false; $('#sheet').hidden = false;
    renderSheet(true);
  }
  function closeSheet() {
    R.sheet = null; R.sheetArg = null; R.geoResults = null; R.propose = null; R.confirmErase = false; R.importPending = null;
    $('#sheet').hidden = true; $('#scrim').hidden = true; $('#sheet').innerHTML = '';
  }
  function renderSheet(first) {
    const el = $('#sheet'); if (!R.sheet) return;
    const top = el.scrollTop;
    const body = R.sheet === 'detail' ? detailHTML(byId(R.sheetArg))
      : R.sheet === 'add' ? addHTML()
      : R.sheet === 'msg' ? msgHTML(byId(R.sheetArg))
      : R.sheet === 'settings' ? settingsHTML()
      : R.sheet === 'hunt' ? huntEditHTML()
      : R.sheet === 'propose' ? proposeHTML()
      : R.sheet === 'howto' ? howtoHTML()
      : R.sheet === 'pinpick' ? pinPickHTML(R.sheetArg) : '';
    if (!body) { closeSheet(); return; }
    el.innerHTML = '<div class="grab" aria-hidden="true"></div>' + body;
    el.scrollTop = first ? 0 : top;
  }
  const sheetHead = title => `<div class="sheet-head"><h2>${esc(title)}</h2><button class="close-btn" data-act="close-sheet" aria-label="Close">${I.close}</button></div>`;

  /* ---------- add / capture ---------- */

  const AGE_CHIPS = [
    ['now', 'Just now', { lo: 0, hi: MIN }], ['15m', '15 min', { lo: 10 * MIN, hi: 20 * MIN }], ['30m', '30 min', { lo: 20 * MIN, hi: 40 * MIN }],
    ['1h', '1 hour', { lo: 45 * MIN, hi: 90 * MIN }], ['2h', '2 hours', { lo: 2 * HOUR, hi: 3 * HOUR }], ['4h', '3–5 hours', { lo: 3 * HOUR, hi: 5 * HOUR }],
    ['8h', '5–12 hours', { lo: 5 * HOUR, hi: 12 * HOUR }], ['1d', 'Yesterday', { lo: DAY, hi: 2 * DAY }], ['3d', '2–6 days', { lo: 2 * DAY, hi: 7 * DAY }], ['1w', 'Week+', { lo: 7 * DAY, hi: 30 * DAY }],
  ];

  function newDraft(text = '') { return { text, parsed: null, title: '', price: null, place: '', window: null, ageKey: null, category: 'other', size: 'M', maxPay: null, dupId: null, url: null, fbId: null }; }

  function parseDraft() {
    const d = R.draft; const p = C.parseListingText(d.text, Date.now());
    d.parsed = p; d.url = p.url; d.fbId = p.fbId;
    d.title = p.title || d.title || ''; d.price = p.price ?? d.price; d.place = p.place || d.place || '';
    if (p.listedWindow) { d.window = p.listedWindow; d.ageKey = 'parsed'; }
    d.category = C.guessCategory(d.title, d.price);
    const dup = findDup({ fbId: d.fbId, url: d.url, title: d.title, price: d.price });
    d.dupId = dup ? dup.id : null;
  }

  function addHTML() {
    const d = R.draft || (R.draft = newDraft());
    let h = sheetHead('Add a listing') + '<div class="sheet-body">';
    if (R.ocr) {
      h += `<div class="block"><h3>Reading your screenshot</h3><div class="progress"><i style="width:${Math.round((R.ocr.progress || 0) * 100)}%"></i></div><div class="small muted">${esc(R.ocr.status || 'Loading the text reader…')} First time needs internet.</div></div>`;
    }
    if (!d.parsed) {
      h += `<button class="btn btn-sign btn-lg btn-block" data-act="paste">${I.paste} Paste from clipboard</button>
        <button class="btn btn-lg btn-block" data-act="scan">${I.camera} Scan a screenshot</button>
        <label class="field"><span>Or paste / type the listing here</span>
          <textarea class="textarea" id="addText" data-d="text" placeholder="Link, title, price, &quot;Listed 3 hours ago in…&quot; — anything you copied">${esc(d.text)}</textarea></label>
        <button class="btn btn-ink btn-lg btn-block" data-act="parse">Read it</button>
        <div class="block"><h3>Fastest way on iPhone</h3>
          <ol class="small" style="margin:0;padding-left:1.2em;display:grid;gap:4px">
            <li>In Facebook, open the listing.</li><li>Tap <b>Share</b> › <b>Copy link</b>.</li><li>Come back here › <b>Paste from clipboard</b>.</li>
            <li>Type the title and price, tap when it was listed. Done.</li></ol>
          <div class="small muted">Want it filled in for you? Screenshot the listing, then tap <b>Scan a screenshot</b>.</div></div>`;
      return h + '</div>';
    }
    const dup = d.dupId ? byId(d.dupId) : null;
    if (dup) h += `<div class="notice"><div><b>Already saved:</b> ${esc(dup.title)}. Updating it will sharpen the listed time and log any price change.</div></div>`;
    const flags = C.scamFlags(d.text, { price: d.price, maxPay: d.maxPay });
    if (flags.length) h += `<div class="notice bad">${flags.map(f => `<div class="flag ${f.level}"><i>${f.level === 'high' ? 'RISK' : 'WATCH'}</i><span>${esc(f.msg)}</span></div>`).join('')}</div>`;
    const win = d.window, f = C.fmtListed(win);
    h += `<div class="block">
      <label class="field"><span>Title</span><input class="input" data-d="title" value="${esc(d.title)}" placeholder="What is it?" autocomplete="off"></label>
      <div class="grid2">
        <label class="field"><span>Price</span><div class="money"><input class="input num" data-d="price" inputmode="decimal" value="${d.price ?? ''}" placeholder="0"></div></label>
        <label class="field"><span>Max you'd pay</span><div class="money"><input class="input num" data-d="maxPay" inputmode="decimal" value="${d.maxPay ?? ''}" placeholder="optional"></div></label>
      </div>
      <label class="field"><span>Area or address</span><input class="input" data-d="place" value="${esc(d.place)}" placeholder="Spring Hill, FL" autocomplete="off"></label>
    </div>
    <div class="block"><h3>When was it listed?</h3>
      ${f ? `<div class="big-time">${esc(f.main)}<small>${esc(f.err || 'exact')}</small></div>` : '<div class="small muted">Tap the closest match. Facebook shows it under the price.</div>'}
      ${d.ageKey === 'parsed' && d.parsed && d.parsed.listedText ? `<div class="small muted">Read from text: “${esc(d.parsed.listedText)}”</div>` : ''}
      <div class="row">${AGE_CHIPS.map(([k, label]) => `<button class="chip" data-act="age" data-k="${k}" aria-pressed="${d.ageKey === k}">${label}</button>`).join('')}</div>
    </div>
    <div class="block"><h3>Type and size</h3>
      <select class="select" data-d="category" aria-label="Category">${C.CATEGORIES.map(c => `<option value="${c.id}" ${c.id === d.category ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select>
      <div class="seg" role="group" aria-label="Size">${Object.keys(C.SIZES).map(k => `<button data-act="draft-size" data-k="${k}" aria-pressed="${d.size === k}">${k}</button>`).join('')}</div>
      <div class="small muted">${esc(C.SIZES[d.size].name)}: ${esc(C.SIZES[d.size].hint)}</div>
    </div>`;
    if (d.url) h += `<div class="small muted" style="overflow-wrap:anywhere">Link: ${esc(d.url)}</div>`;
    if (dup) h += `<button class="btn btn-sign btn-lg btn-block" data-act="save-draft" data-mode="merge">${I.check} Update saved listing</button><button class="btn btn-block" data-act="save-draft" data-mode="new">Save as a new listing</button>`;
    else h += `<button class="btn btn-sign btn-lg btn-block" data-act="save-draft" data-mode="new">${I.check} Save listing</button>`;
    h += `<button class="btn btn-block" data-act="draft-reset">Start over</button>`;
    return h + '</div>';
  }

  function saveDraft(mode, beforeSig) {
    const d = R.draft; if (!d) return;
    const title = (d.title || '').trim();
    if (!title && !d.url) { toast('Add a title first.'); return; }
    if (mode === 'merge' && d.dupId && byId(d.dupId)) {
      const l = byId(d.dupId);
      const msgs = mergeInto(l, { window: d.window, price: d.price, url: d.url, fbId: d.fbId, place: d.place, rawText: d.text, condition: d.parsed && d.parsed.condition, description: d.parsed && d.parsed.description, seller: d.parsed && d.parsed.seller });
      if (d.maxPay != null) l.maxPay = d.maxPay;
      save(); closeSheet(); R.draft = null; renderAll(); syncMarkers();
      const same = beforeSig && beforeSig === JSON.stringify([l.listedMin, l.listedMax, l.price]);
      toast(msgs.length ? msgs.join(' · ') : same ? `Already saved: ${l.title}` : `Updated: ${l.title}`, 3600);
      return;
    }
    const p = d.parsed || {};
    const l = makeListing({ title: title || 'Facebook listing', price: d.price, wasPrice: p.wasPrice, url: d.url, fbId: d.fbId, place: d.place || null, listedWindow: d.window,
      condition: p.condition, description: p.description, seller: p.seller, rawText: d.text, category: d.category, size: d.size, maxPay: d.maxPay });
    S.listings.unshift(l);
    save(); closeSheet(); R.draft = null;
    if (S.ui.filter !== 'all' && S.ui.filter !== 'active' && S.ui.filter !== 'found') S.ui.filter = 'active';
    renderAll(); toast(`Saved: ${l.title}${l.price != null ? ' · ' + money(l.price) : ''}`, 3200);
    autoLocate(l);
  }

  const looksLikeListing = t => /facebook\.com\/(marketplace|share)|fb\.me\//i.test(t) || /\blisted\s+(just now|yesterday|\d+|an?\s|about|over|a few)/i.test(t) || (/\$\s?\d/.test(t) && t.length < 6000);
  const confident = d => !!(d.title && d.price != null && (d.window || d.place));

  /* one path for every capture: parse, then save straight away when the listing looks complete */
  function captureText(text) {
    R.lastClip = text;
    R.draft = newDraft(text); parseDraft();
    const d = R.draft;
    if (S.settings.quickPaste && confident(d)) {
      if (d.dupId) {
        const before = JSON.stringify([byId(d.dupId).listedMin, byId(d.dupId).listedMax, byId(d.dupId).price]);
        saveDraft('merge', before);
      } else saveDraft('new');
      return true;
    }
    renderSheet(false);
    return false;
  }

  async function doPaste() {
    let text = '';
    try { text = await navigator.clipboard.readText(); } catch (e) { text = ''; }
    if (!text) { toast('Long-press the box below and tap Paste.', 3400); const ta = $('#addText'); if (ta) ta.focus(); return; }
    captureText(text);
  }

  async function loadTesseract() {
    if (window.Tesseract) return window.Tesseract;
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
      s.onload = res; s.onerror = () => rej(new Error('Could not load the text reader. Check your connection.'));
      document.head.appendChild(s);
    });
    return window.Tesseract;
  }
  async function runOCR(file) {
    R.ocr = { progress: 0, status: 'Loading the text reader…' }; renderSheet(false);
    let worker = null;
    try {
      const T = await loadTesseract();
      worker = await T.createWorker('eng', 1, {
        logger: m => {
          if (!R.ocr) return;
          R.ocr.status = m.status === 'recognizing text' ? 'Reading text…' : 'Getting ready…';
          R.ocr.progress = m.status === 'recognizing text' ? 0.3 + m.progress * 0.7 : Math.min(0.3, (m.progress || 0) * 0.3);
          const bar = document.querySelector('.progress > i'); if (bar) bar.style.width = Math.round(R.ocr.progress * 100) + '%';
        },
      });
      const { data } = await worker.recognize(file);
      R.ocr = null;
      R.draft = newDraft(data.text || ''); parseDraft();
      if (!R.draft.title && !R.draft.price) toast('Could not read much. Check the fields below.', 3400);
      renderSheet(false);
    } catch (e) {
      R.ocr = null; renderSheet(false); toast(e.message || 'Could not read that image.', 3800);
    } finally { if (worker) worker.terminate().catch(() => {}); }
  }

  function howtoHTML() {
    return sheetHead('Fastest way to add') + `<div class="sheet-body">
      <div class="block"><h3>The loop · about 20 seconds</h3>
        <ol class="small" style="margin:0;padding-left:1.2em;display:grid;gap:6px">
          <li>Facebook pings you about a new listing. Open it.</li>
          <li><b>Double-tap the back of your iPhone.</b> The HAUL Grab shortcut copies the listing text.</li>
          <li>Open HAUL and tap the yellow <b>+</b>. Tap <b>Paste</b> if iPhone asks. It saves itself.</li>
        </ol></div>
      <div class="block"><h3>Set up HAUL Grab · 2 min, once</h3>
        <ol class="small" style="margin:0;padding-left:1.2em;display:grid;gap:6px">
          <li>Open the <b>Shortcuts</b> app. Tap <b>+</b>. Name it <b>HAUL Grab</b>.</li>
          <li>Add these 4 actions in order: <b>Take Screenshot</b> › <b>Extract Text from Image</b> › <b>Copy to Clipboard</b> › <b>Show Notification</b> (text: “Listing copied”).</li>
          <li>Open <b>Settings</b> › <b>Accessibility</b> › <b>Touch</b> › <b>Back Tap</b> › <b>Double Tap</b>. Pick <b>HAUL Grab</b>.</li>
          <li>Test it on a listing. Allow the screenshot when asked.</li>
        </ol></div>
      <div class="block"><h3>Get pings for new listings</h3><div class="small">In the <b>Hunt</b> tab, tap <b>Check now</b>. Facebook opens your search. Tap the <b>bell</b> next to Filters › <b>Create Alert</b>. Repeat for each hunt.</div></div>
      <div class="block"><h3>Other ways</h3><div class="small"><b>Copy link:</b> in Facebook tap Share › Copy link, then + here. Type title and price.<br><b>Scan:</b> tap + › Scan a screenshot (slower, needs internet the first time).</div></div>
      <div class="block"><h3>Sharper times</h3><div>Facebook rounds times (“3 hours ago”). Paste or scan the same listing again later and HAUL narrows the window. Two looks can get you within minutes.</div></div>
      <div class="block"><h3>Why no auto-import?</h3><div>Facebook has no free public feed of Marketplace listings. HAUL never asks for your Facebook login, so your account stays safe. If you buy a scraper service later, export its JSON or CSV and use Settings › Import.</div></div>
      <button class="btn btn-sign btn-lg btn-block" data-act="add">${I.plus} Add a listing</button></div>`;
  }

  /* ---------- message seller ---------- */

  function msgCtx(l) {
    const ctx = {};
    const plan = S.run.plan;
    if (plan) { const v = plan.visits.find(x => x.id === l.id); if (v) { ctx.etaMs = v.arrive; if (l.appt && v.arrive > l.appt) ctx.lateMin = Math.round((v.arrive - l.appt) / MIN); } }
    if (S.run.live && S.run.live.on) { const lv = liveState(); if (lv && lv.visit && lv.visit.id === l.id) { ctx.etaMs = lv.eta; ctx.lateMin = lv.lateMin > 0 ? lv.lateMin : 0; } }
    return ctx;
  }
  function msgHTML(l) {
    if (!l) return '';
    const msgs = C.sellerMessages(l, msgCtx(l));
    return sheetHead('Message seller') + `<div class="sheet-body">
      <div class="small muted">Tap a message to copy it. Then open the listing and paste it into Messenger.</div>
      <div class="msg-list">${msgs.map(m => `<button class="msg" data-act="copy-msg" data-id="${l.id}" data-k="${m.key}"><b>${esc(m.label)}</b><span>${esc(m.text)}</span></button>`).join('')}</div>
      ${l.url ? `<a class="btn btn-sign btn-lg btn-block" href="${esc(l.url)}" target="_blank" rel="noopener">${I.ext} Open listing in Facebook</a>` : '<div class="small muted">No link saved for this listing. Paste its link in Details to open it from here.</div>'}
      ${l.status === 'found' ? `<button class="btn btn-block" data-act="mark-messaged" data-id="${l.id}">I sent it › mark Messaged</button>` : ''}
    </div>`;
  }

  /* ---------- listing detail ---------- */

  function pickupChips(now) {
    const start = C.roundUpTo(now + 30 * MIN, 30), out = [];
    for (let i = 0; i < 5; i++) out.push(start + i * 30 * MIN);
    const tmr = new Date(now); tmr.setDate(tmr.getDate() + 1); tmr.setHours(10, 0, 0, 0); out.push(tmr.getTime());
    return out;
  }

  function detailHTML(l) {
    if (!l) return '';
    const now = Date.now();
    const f = C.fmtListed(winOf(l), now);
    const flags = flagsFor(l);
    const d = distM(l);
    const ref = refPoint();
    const tripMi = d != null ? C.kmToMi(d / 1000) * 1.32 * 2 : null;
    const gasCost = tripMi != null ? tripMi / Math.max(1, S.settings.mpg) * S.settings.gas : null;
    const dp = dealPct(l);
    const offer = C.offerPrice(l.price, l.maxPay);
    const flip = l.resale != null && l.price != null ? l.resale - l.price - (gasCost || 0) : null;
    let h = sheetHead('Listing') + '<div class="sheet-body">';
    h += `<div class="detail-hero">
      <div class="row"><span class="sticker st-${l.status}">${esc(statusLabel(l.status))}</span>${ageChip(l, now)}${l.example ? '<span class="ex-badge">EXAMPLE</span>' : ''}</div>
      <div class="row" style="align-items:baseline"><span class="price-big">${esc(money(l.price))}</span>${l.wasPrice && l.wasPrice > (l.price ?? 0) ? `<span class="muted" style="text-decoration:line-through;font-family:var(--f-sign)">${esc(money(l.wasPrice))}</span>` : ''}</div>
      <h2>${esc(l.title)}</h2>
      <div class="status-pick" role="group" aria-label="Status">${C.STATUSES.map(s => `<button class="st-${s.id}" data-act="set-status" data-id="${l.id}" data-s="${s.id}" aria-pressed="${l.status === s.id}">${esc(s.label)}</button>`).join('')}</div>
    </div>`;
    if (flags.length) {
      h += `<div class="notice bad"><b>Red flags</b>${flags.map(x => `<div class="flag ${x.level}"><i>${x.level === 'high' ? 'RISK' : 'WATCH'}</i><span>${esc(x.msg)}</span></div>`).join('')}
        <div class="small">Safe pickup: meet in daylight, bring someone for big items, pay cash only after you test it.</div></div>`;
    }
    h += `<div class="btn-row"><button class="btn btn-sign" data-act="msg" data-id="${l.id}">${I.msg} Message</button>${l.url ? `<a class="btn" href="${esc(l.url)}" target="_blank" rel="noopener">${I.ext} Facebook</a>` : ''}</div>`;

    // pickup
    h += `<div class="block"><h3>Pickup</h3>
      ${l.appt ? `<div class="big-time">${esc(C.fmtClock(l.appt))}<small>${esc(C.dayLabel(l.appt, now))}</small></div>` : '<div class="small muted">No time set. Agree on one with the seller, then tap it below.</div>'}
      <div class="row">${pickupChips(now).map(t => `<button class="chip" data-act="appt" data-id="${l.id}" data-t="${t}" aria-pressed="${l.appt === t}">${esc((C.dayLabel(t, now) === 'Today' ? '' : 'Tmrw ') + C.fmtClock(t))}</button>`).join('')}${l.appt ? `<button class="chip" data-act="appt" data-id="${l.id}" data-t="">Clear</button>` : ''}</div>
      <label class="field"><span>Exact date and time</span><input class="input num" type="datetime-local" data-f="appt" value="${C.toLocalInput(l.appt)}"></label>
      <div class="grid2">
        <label class="field"><span>Time at stop</span><select class="select" data-f="dwell">${[5, 10, 15, 20, 30, 45].map(m => `<option value="${m}" ${(l.dwell ?? S.settings.dwell) === m ? 'selected' : ''}>${m} min</option>`).join('')}</select></label>
        <label class="check" style="align-self:end"><input type="checkbox" data-f="inRun" ${l.inRun ? 'checked' : ''}> In today's run</label>
      </div>
      ${l.price ? `<div class="small"><b>Cash:</b> <span class="num">${esc(money(l.price))}</span> = <span class="num">${esc(C.billsText(C.cashBreakdown(l.price)))}</span></div>` : ''}
    </div>`;

    // location
    const precText = l.lat == null ? 'No pin yet' : l.prec === 'approx' ? 'Area only. Ask the seller for the address.' : 'Exact pin';
    h += `<div class="block"><h3>Location</h3>
      <div class="row"><span class="tag ${l.lat == null ? 'tag-ghost' : l.prec === 'approx' ? 'tag-dash' : 'tag-good'}">${esc(precText)}</span>${d != null ? `<span class="tag tag-ghost num">${C.fmtMiles(d)} from ${R.pos ? 'you' : 'home'}</span>` : ''}</div>
      <label class="field"><span>Address or area</span><input class="input" data-f="place" value="${esc(l.place || '')}" placeholder="Street address from the seller" autocomplete="off"></label>
      <div class="btn-row"><button class="btn" data-act="geo-find" data-id="${l.id}">Find address</button><button class="btn" data-act="pick-on-map" data-id="${l.id}">${I.pin} Pick on map</button></div>
      ${R.geoResults && R.geoResults.for === l.id ? geoResultsHTML(R.geoResults, l.id) : ''}
      ${l.lat != null ? `<div class="btn-row"><a class="btn" href="${C.appleNavUrl(l, l.title)}" target="_blank" rel="noopener">${I.nav} Apple Maps</a><a class="btn" href="${C.googleNavUrl(l)}" target="_blank" rel="noopener">${I.nav} Google Maps</a></div>` : ''}
    </div>`;

    // listed time
    h += `<div class="block"><h3>Listed</h3>
      ${f ? `<div class="big-time">${esc(f.main)}<small>${esc(f.err || 'to the minute')}</small></div>
        <div class="small muted">Between <span class="num">${esc(C.fmtClock(l.listedMin))}</span> and <span class="num">${esc(C.fmtClock(l.listedMax))}</span>${C.dayLabel(l.listedMin, now) !== 'Today' ? ' (' + esc(C.dayLabel(l.listedMin, now)) + ')' : ''} · seen ${l.listedObs || 1}×</div>`
        : '<div class="small muted">Unknown. Paste or scan the listing to read it.</div>'}
      <button class="btn" data-act="repaste" data-id="${l.id}">Paste again to sharpen</button>
    </div>`;

    // money
    h += `<div class="block"><h3>Money</h3>
      <div class="grid2">
        <label class="field"><span>Price</span><div class="money"><input class="input num" data-f="price" inputmode="decimal" value="${l.price ?? ''}"></div></label>
        <label class="field"><span>Max you'd pay</span><div class="money"><input class="input num" data-f="maxPay" inputmode="decimal" value="${l.maxPay ?? ''}" placeholder="—"></div></label>
      </div>
      <label class="field"><span>Resale value</span><div class="money"><input class="input num" data-f="resale" inputmode="decimal" value="${l.resale ?? ''}" placeholder="If you might flip it"></div></label>
      <dl class="kv">
        ${dp != null ? `<dt>Deal</dt><dd>${dp >= 0 ? `${Math.round(dp * 100)}% under your max` : `${esc(money(l.price - l.maxPay))} over your max`}</dd>` : ''}
        ${offer != null && l.price > 0 && offer < l.price ? `<dt>Fair offer</dt><dd class="num">${esc(money(offer))}</dd>` : ''}
        ${gasCost != null ? `<dt>Gas, round trip</dt><dd class="num">≈ ${esc(money(Math.round(gasCost * 100) / 100))}</dd>` : ''}
        ${flip != null ? `<dt>Flip profit</dt><dd class="num" style="color:${flip >= 0 ? 'var(--good)' : 'var(--bad)'}">${esc(money(Math.round(flip)))}</dd>` : ''}
        ${(l.priceHistory || []).length > 1 ? `<dt>Price log</dt><dd class="num">${l.priceHistory.map(p => esc(money(p.price))).join(' → ')}</dd>` : ''}
      </dl>
      ${!ref && l.lat != null ? '<div class="small muted">Set Home in Settings to see gas cost.</div>' : ''}
    </div>`;

    // size
    h += `<div class="block"><h3>Size</h3>
      <div class="seg" role="group" aria-label="Size">${Object.keys(C.SIZES).map(k => `<button data-act="size" data-id="${l.id}" data-k="${k}" aria-pressed="${l.size === k}">${k}</button>`).join('')}</div>
      <div class="small muted">${esc(C.SIZES[l.size || 'M'].name)}: ${esc(C.SIZES[l.size || 'M'].hint)}</div>
      <label class="check"><input type="checkbox" data-f="helper" ${l.helper ? 'checked' : ''}> Needs 2 people to carry</label>
    </div>`;

    // notes + details
    h += `<div class="block"><h3>Notes</h3>
      <textarea class="textarea" data-f="notes" placeholder="Paste the seller's replies here. HAUL checks them for scam patterns.">${esc(l.notes || '')}</textarea></div>
      <div class="block"><h3>Details</h3>
      <label class="field"><span>Title</span><input class="input" data-f="title" value="${esc(l.title)}"></label>
      <label class="field"><span>Category</span><select class="select" data-f="category">${C.CATEGORIES.map(c => `<option value="${c.id}" ${c.id === l.category ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select></label>
      <label class="field"><span>Facebook link</span><input class="input" data-f="url" value="${esc(l.url || '')}" placeholder="https://www.facebook.com/marketplace/item/…" autocomplete="off" inputmode="url"></label>
      <dl class="kv">
        ${l.condition ? `<dt>Condition</dt><dd>${esc(l.condition)}</dd>` : ''}
        ${l.seller ? `<dt>Seller</dt><dd>${esc(l.seller)}</dd>` : ''}
        <dt>Saved</dt><dd>${esc(C.dayLabel(l.capturedAt, now))} ${esc(C.fmtClock(l.capturedAt))}</dd>
      </dl>
      ${l.description ? `<div class="small" style="white-space:pre-wrap">${esc(l.description)}</div>` : ''}
    </div>
    <button class="btn btn-danger btn-block" data-act="delete" data-id="${l.id}">${I.trash} Delete listing</button>`;
    return h + '</div>';
  }

  function geoResultsHTML(gr, id) {
    if (gr.loading) return '<div class="small muted">Searching…</div>';
    if (gr.error) return `<div class="small" style="color:var(--bad)">${esc(gr.error)}</div>`;
    if (!gr.items.length) return '<div class="small muted">No match. Try adding the city and state.</div>';
    return `<div class="geo-results">${gr.items.map((r, i) => `<button data-act="geo-use" data-id="${id}" data-i="${i}"><b>${r.prec === 'exact' ? 'Exact' : 'Area'}</b> · ${esc(r.label)}</button>`).join('')}</div>`;
  }

  async function findAddress(targetId, query) {
    const q = (query || '').trim();
    if (!q) { toast('Type an address or area first.'); return; }
    R.geoResults = { for: targetId, loading: true, items: [] }; renderSheet(false);
    try { const items = await geocode(q); R.geoResults = { for: targetId, items }; }
    catch (e) { R.geoResults = { for: targetId, items: [], error: navigator.onLine ? 'Address search is busy. Try again in a moment.' : 'You are offline. Use Pick on map instead.' }; }
    renderSheet(false);
  }

  /* ---------- pin chooser after long-press ---------- */

  function pinPickHTML(pt) {
    if (!pt) return '';
    const cands = S.listings.filter(l => C.ACTIVE.includes(l.status) && l.prec !== 'exact');
    return sheetHead('Drop a pin here') + `<div class="sheet-body">
      <div class="small muted num">${pt.lat.toFixed(5)}, ${pt.lng.toFixed(5)}</div>
      <button class="btn btn-block" data-act="pin-home">${I.home} Set as Home</button>
      ${cands.length ? `<div class="label">Exact pickup spot for…</div><div class="stack">${cands.map(l => `<button class="btn btn-block" style="justify-content:flex-start" data-act="pin-listing" data-id="${l.id}">${esc(l.title)}</button>`).join('')}</div>` : '<div class="small muted">Every active listing already has an exact pin.</div>'}
    </div>`;
  }

  /* ================= MAP ================= */

  function tileLayerFor(dark, osm) {
    const attrib = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' + (osm ? ' contributors' : ' &copy; <a href="https://carto.com/attributions">CARTO</a>');
    const url = osm ? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
      : dark ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
    const t = L.tileLayer(url, { maxZoom: 19, subdomains: 'abcd', attribution: attrib, crossOrigin: true, detectRetina: false });
    if (!osm) {
      let errs = 0;
      t.on('tileerror', () => { errs++; if (errs === 8 && R.map && navigator.onLine) { R.map.removeLayer(t); R.tiles = tileLayerFor(dark, true).addTo(R.map); } });
    }
    return t;
  }
  function syncTiles() {
    if (!R.map) return;
    const dark = isDark();
    if (R.tiles && R.tileDark === dark) return;
    if (R.tiles) R.map.removeLayer(R.tiles);
    R.tileDark = dark; R.tiles = tileLayerFor(dark, false).addTo(R.map); R.tiles.bringToBack();
  }

  function ensureMap() {
    if (R.map) return R.map;
    const pts = S.listings.filter(l => l.lat != null);
    const c = refPoint() || pts[0] || { lat: 39.5, lng: -98.35 };
    R.map = L.map('map', { zoomControl: false, attributionControl: true, tapHold: true, worldCopyJump: true }).setView([c.lat, c.lng], refPoint() || pts.length ? 10 : 4);
    syncTiles();
    R.layer = L.layerGroup().addTo(R.map);
    R.routeLayer = L.layerGroup().addTo(R.map);
    R.meLayer = L.layerGroup().addTo(R.map);
    R.map.on('click', e => {
      if (!R.pickFor) return;
      placePin(R.pickFor, e.latlng.lat, e.latlng.lng);
    });
    R.map.on('contextmenu', e => { if (R.pickFor) return; openSheet('pinpick', { lat: e.latlng.lat, lng: e.latlng.lng }); });
    return R.map;
  }

  function syncMarkers() {
    if (!R.map) return;
    R.layer.clearLayers(); R.markers.clear();
    const show = S.listings.filter(l => l.lat != null && (S.ui.showDone || C.ACTIVE.includes(l.status)));
    for (const l of show) {
      if (l.prec === 'approx') L.circle([l.lat, l.lng], { radius: 1500, color: cssVar('--st-' + l.status), weight: 1.5, dashArray: '5 6', fillOpacity: 0.07, interactive: false }).addTo(R.layer);
      const icon = L.divIcon({ className: 'pin-wrap', iconSize: [0, 0], html: `<div class="pin st-${l.status}${l.prec === 'approx' ? ' pin-approx' : ''}${R.selected === l.id ? ' pin-sel' : ''}">${esc(money(l.price))}</div>` });
      const m = L.marker([l.lat, l.lng], { icon, title: l.title, riseOnHover: true, zIndexOffset: R.selected === l.id ? 1000 : 0 }).addTo(R.layer);
      m.on('click', () => openDetail(l.id));
      R.markers.set(l.id, m);
    }
    $('#mapDoneBtn').textContent = S.ui.showDone ? 'All' : 'Active';
  }

  function drawMe() {
    if (!R.map || !R.pos) return;
    R.meLayer.clearLayers();
    if (R.pos.acc && R.pos.acc < 2000) L.circle([R.pos.lat, R.pos.lng], { radius: R.pos.acc, color: '#2F7BFF', weight: 1, fillOpacity: 0.08, interactive: false }).addTo(R.meLayer);
    L.marker([R.pos.lat, R.pos.lng], { icon: L.divIcon({ className: 'pin-wrap', iconSize: [22, 22], iconAnchor: [11, 11], html: '<div class="me"></div>' }), interactive: false, zIndexOffset: 2000 }).addTo(R.meLayer);
  }

  function drawRoute() {
    if (!R.map) return;
    R.routeLayer.clearLayers();
    const plan = S.run.plan; if (!plan || !plan.visits.length) return;
    const pts = [plan.start, ...plan.visits, ...(plan.end ? [plan.end] : [])];
    const line = plan.geometry && plan.geometry.length ? plan.geometry : pts.map(p => [p.lat, p.lng]);
    L.polyline(line, { color: cssVar('--asphalt'), weight: 11, opacity: 0.8, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(R.routeLayer);
    L.polyline(line, { color: cssVar('--sign'), weight: 5, opacity: 1, lineCap: 'round', lineJoin: 'round', dashArray: plan.geometry ? null : '2 10', interactive: false }).addTo(R.routeLayer);
    const badge = (p, html, cls = '') => L.marker([p.lat, p.lng], { icon: L.divIcon({ className: 'pin-wrap', iconSize: [30, 30], iconAnchor: [15, 15], html: `<div class="stopnum ${cls}">${html}</div>` }), interactive: false, zIndexOffset: 1500 }).addTo(R.routeLayer);
    badge(plan.start, 'S', 'home');
    plan.visits.forEach((v, i) => badge(v, i + 1));
    if (plan.end) badge(plan.end, 'H', 'home');
  }

  function fitAll() {
    if (!R.map) return;
    const pts = [];
    S.listings.filter(l => l.lat != null && (S.ui.showDone || C.ACTIVE.includes(l.status))).forEach(l => pts.push([l.lat, l.lng]));
    if (S.run.plan) { pts.push([S.run.plan.start.lat, S.run.plan.start.lng]); if (S.run.plan.geometry) S.run.plan.geometry.forEach(p => pts.push(p)); }
    if (R.pos) pts.push([R.pos.lat, R.pos.lng]);
    if (S.settings.home) pts.push([S.settings.home.lat, S.settings.home.lng]);
    if (!pts.length) return;
    R.fitted = true;
    if (pts.length === 1) R.map.setView(pts[0], 13); else R.map.fitBounds(L.latLngBounds(pts).pad(0.12), { maxZoom: 14 });
  }

  function renderMapBanner() {
    const b = $('#mapBanner');
    if (R.pickFor) {
      const name = R.pickFor.kind === 'home' ? 'Home' : (byId(R.pickFor.id) || {}).title || 'listing';
      b.innerHTML = `<span>Tap the map to place <b>${esc(name)}</b></span><button class="btn" data-act="pick-cancel">Cancel</button>`;
      b.hidden = false;
    } else if (S.ui.tab === 'map' && S.run.plan && S.run.plan.visits.length) {
      const p = S.run.plan;
      b.innerHTML = `<span>Run: <b>${p.visits.length} stops</b> · leave <b>${esc(C.fmtClock(p.depart))}</b></span><button class="btn" data-act="tab" data-tab="run">Open</button>`;
      b.hidden = false;
    } else b.hidden = true;
  }

  function placePin(target, lat, lng) {
    R.pickFor = null;
    if (target.kind === 'home') {
      S.settings.home = { lat, lng, label: 'Pinned on map' }; save(); toast('Home set');
      renderMapBanner(); openSheet('settings');
      return;
    }
    const l = byId(target.id); if (!l) return;
    l.lat = lat; l.lng = lng; l.prec = 'exact'; l.updatedAt = Date.now(); save();
    syncMarkers(); renderMapBanner(); toast('Pin set');
    openDetail(l.id);
  }

  function focusListing(id) {
    const l = byId(id); if (!l) return;
    if (l.lat == null) { openDetail(id); toast('Add a location first: Find address or Pick on map.', 3400); return; }
    R.selected = id;
    if (!C.ACTIVE.includes(l.status)) S.ui.showDone = true;
    showTab('map');
    setTimeout(() => { syncMarkers(); R.map.setView([l.lat, l.lng], Math.max(R.map.getZoom(), 13)); R.fitted = true; }, 60);
  }

  /* ================= RUN ================= */

  function runStops() { return S.listings.filter(l => l.inRun && !['picked', 'passed'].includes(l.status)); }
  function orderedStops() {
    const idx = new Map(S.run.order.map((id, i) => [id, i]));
    return runStops().sort((a, b) => {
      const ia = idx.has(a.id) ? idx.get(a.id) : 1e6 + (a.appt || 9e12) / 1e13;
      const ib = idx.has(b.id) ? idx.get(b.id) : 1e6 + (b.appt || 9e12) / 1e13;
      return ia - ib;
    });
  }
  const stopSig = () => orderedStops().map(s => [s.id, s.appt, s.dwell, s.lat, s.lng].join(':')).join('|') + `|${S.run.startMode}|${S.run.endMode}|${S.run.departMode}|${S.run.departAt}|${S.settings.home ? S.settings.home.lat : ''}`;

  async function planRun(optimize) {
    const stops = orderedStops();
    const located = stops.filter(s => s.lat != null), missing = stops.filter(s => s.lat == null);
    if (!located.length) { toast('Give at least one stop a location first.'); return; }
    R.busy = 'Finding your start point…'; renderRun();
    let start = null, startLabel = '';
    if (S.run.startMode === 'gps') { try { start = await getPosOnce(); startLabel = 'My location'; } catch (e) { start = null; } }
    if (!start && S.settings.home) { start = S.settings.home; startLabel = 'Home'; }
    if (!start) { start = { lat: located[0].lat, lng: located[0].lng }; startLabel = 'First stop'; }
    const end = S.run.endMode === 'home' && S.settings.home ? S.settings.home : null;
    const pts = [start, ...located, ...(end ? [end] : [])];
    R.busy = 'Getting drive times…'; renderRun();
    let M;
    try { M = await osrmTable(pts); } catch (e) { M = C.estimateMatrix(pts); }
    const ctx = { dur: M.dur, dist: M.dist, stops: located.map(s => ({ appt: s.appt, dwellMin: s.dwell ?? S.settings.dwell })), hasEnd: !!end, earlyMs: S.settings.early * MIN, graceMs: S.settings.grace * MIN };
    const now = Date.now();
    const fixed = S.run.departMode === 'fixed' && S.run.departAt;
    const base = fixed ? S.run.departAt : now;
    let sim;
    if (optimize) sim = C.optimize(ctx, base, !fixed);
    else { const order = located.map((_, i) => i); sim = fixed ? C.simulate(order, ctx, base) : C.simulateAuto(order, ctx, base); }
    S.run.order = [...sim.order.map(k => located[k].id), ...missing.map(m => m.id)];
    S.run.keepOrder = !optimize;
    S.run.plan = {
      at: now, source: M.source, startLabel, start: { lat: start.lat, lng: start.lng }, end: end ? { lat: end.lat, lng: end.lng } : null,
      depart: sim.depart, finish: sim.finish, endArrive: sim.endArrive, endLeg: sim.endLeg, driveMs: sim.driveMs, meters: sim.meters,
      waitMs: sim.waitMs, lateMs: sim.lateMs, lateCount: sim.lateCount, missing: missing.map(m => m.id), geometry: null,
      visits: sim.visits.map(v => ({ id: located[v.k].id, lat: located[v.k].lat, lng: located[v.k].lng, arrive: v.arrive, ready: v.ready, leave: v.leave, wait: v.wait, late: v.late, legS: v.legS, legM: v.legM })),
      matrix: { ids: located.map(s => s.id), dur: M.dur, dist: M.dist, hasEnd: !!end }, sig: stopSig(),
    };
    R.busy = null; save(); renderRun(); drawRoute(); renderTop();
    if (sim.lateCount) toast(`${sim.lateCount} pickup${sim.lateCount > 1 ? 's' : ''} can't be reached on time. Check the red stops.`, 4200);
    try {
      const ordered = [S.run.plan.start, ...S.run.plan.visits, ...(end ? [S.run.plan.end] : [])];
      const geo = await osrmGeometry(ordered);
      if (S.run.plan && S.run.plan.at === now) { S.run.plan.geometry = geo; save(); drawRoute(); }
    } catch (e) { /* dashed straight lines stay */ }
  }

  function proposeTimesFor() {
    const plan = S.run.plan; if (!plan) return null;
    const ids = plan.matrix.ids;
    const ctx = { dur: plan.matrix.dur, dist: plan.matrix.dist, stops: ids.map(id => { const l = byId(id); return { appt: null, dwellMin: (l && l.dwell) ?? S.settings.dwell }; }), hasEnd: plan.matrix.hasEnd };
    const order = plan.visits.map(v => ids.indexOf(v.id)).filter(k => k >= 0);
    const depart = Math.max(Date.now() + 10 * MIN, plan.depart);
    return C.proposeTimes(order, ctx, depart).map(p => ({ id: ids[p.k], propose: p.propose }));
  }
  function proposeHTML() {
    const list = R.propose || [];
    if (!list.length) return '';
    return sheetHead('Suggested times') + `<div class="sheet-body">
      <div class="small">These times follow the best driving order. Copy each message and send it. When sellers agree, tap <b>Use these times</b>.</div>
      <div class="stack">${list.map((p, i) => {
        const l = byId(p.id); if (!l) return '';
        const day = C.dayLabel(p.propose) === 'Today' ? 'today' : C.dayLabel(p.propose).toLowerCase();
        const text = `Hi! Is the ${l.title} still available? Could I pick it up at ${C.fmtClock(p.propose)} ${day}? Cash ready.`;
        return `<div class="block"><div class="row"><span class="stop-n num" style="font-weight:800">${i + 1}</span><b style="flex:1;min-width:0">${esc(l.title)}</b><span class="big-time" style="font-size:var(--t-lg)">${esc(C.fmtClock(p.propose))}</span></div>
          <button class="msg" data-act="copy-text" data-text="${esc(text)}"><b>Copy message</b><span>${esc(text)}</span></button></div>`;
      }).join('')}</div>
      <button class="btn btn-sign btn-lg btn-block" data-act="propose-apply">${I.check} Use these times</button>
    </div>`;
  }

  function liveVisits() { const p = S.run.plan; return p ? p.visits.filter(v => { const l = byId(v.id); return l && !['picked', 'passed'].includes(l.status); }) : []; }
  function liveState() {
    const p = S.run.plan; if (!p || !S.run.live || !S.run.live.on) return null;
    const left = liveVisits();
    if (!left.length) return { done: true };
    const visit = left[0], l = byId(visit.id), now = Date.now();
    const notLeftYet = p.depart - now > 2 * MIN && visit.id === p.visits[0].id;
    let eta = visit.arrive, src = 'plan';
    if (!notLeftYet) {
      if (R.pos) {
        if (R.liveRoute && R.liveRoute.id === visit.id && now - R.liveRoute.at < 5 * MIN) { eta = R.liveRoute.at + R.liveRoute.durS * 1000; src = 'road'; }
        else { eta = now + C.estimateLeg(R.pos, visit).durS * 1000; src = 'estimate'; }
      } else if (visit.arrive < now) { eta = now + (visit.legS || 600) * 1000; src = 'estimate'; }
    }
    const appt = l.appt;
    const lateMin = appt ? Math.round((eta - appt) / MIN) : 0;
    return { visit, l, eta, src, appt, lateMin, left: left.length, total: p.visits.length, leaveIn: p.depart - now, notLeftYet };
  }
  async function liveTick() {
    const ls = liveState();
    if (ls && !ls.done && R.pos && !ls.notLeftYet && Date.now() - R.liveFetchAt > 150000 && navigator.onLine) {
      R.liveFetchAt = Date.now();
      try {
        const j = await osrm('route', [R.pos, ls.visit], 'overview=false');
        R.liveRoute = { id: ls.visit.id, at: Date.now(), durS: j.routes[0].duration };
      } catch (e) { /* keep estimate */ }
    }
    if (S.ui.tab === 'run' && !isEditing() && !R.sheet && Date.now() - R.lastLiveRender > 10000) { R.lastLiveRender = Date.now(); renderRun(); }
  }
  function liveAdvance() { R.liveRoute = null; R.liveFetchAt = 0; R.lastLiveRender = 0; setTimeout(() => { liveTick(); renderAll(); }, 30); }
  async function requestWake() {
    if (!S.settings.wake || !('wakeLock' in navigator)) return;
    try { R.wake = await navigator.wakeLock.request('screen'); } catch (e) { R.wake = null; }
  }

  function liveHTML() {
    const ls = liveState(); if (!ls) return '';
    if (ls.done) return `<div class="live"><span class="label">Run complete</span><h2>All pickups done.</h2><div class="small" style="color:var(--asphalt-ink-2)">Nice haul. Mark anything you skipped as Passed in the list.</div><button class="btn btn-sign btn-lg" data-act="live-stop">End run</button></div>`;
    const { l, visit, eta, appt, lateMin, left, total } = ls;
    let state = '', cls = '';
    if (ls.notLeftYet) { state = `Leave by ${C.fmtClock(S.run.plan.depart)} · in ${C.fmtDur(ls.leaveIn)}`; }
    else if (appt) { if (lateMin > S.settings.grace) { state = `${lateMin} min late for ${C.fmtClock(appt)}`; cls = 'late'; } else if (lateMin < -2) { state = `${-lateMin} min early for ${C.fmtClock(appt)}`; cls = 'ok'; } else { state = `On time for ${C.fmtClock(appt)}`; cls = 'ok'; } }
    else state = 'No set time';
    const n = total - left + 1;
    return `<div class="live">
      <span class="label">Next up · stop ${n} of ${total}</span>
      <h2>${esc(l.title)}</h2>
      <div class="small" style="color:var(--asphalt-ink-2)">${esc(l.place || '')}${l.price ? ' · bring ' + esc(money(l.price)) + ' = ' + esc(C.billsText(C.cashBreakdown(l.price))) : ''}</div>
      <div class="eta">${esc(C.fmtClock(eta))}<small>ETA${ls.src === 'estimate' ? ' (estimate)' : ''}</small></div>
      <div class="state ${cls}">${esc(state)}</div>
      <div class="btn-row">
        <a class="btn btn-sign" href="${C.appleNavUrl(visit, l.title)}" target="_blank" rel="noopener">${I.nav} Apple Maps</a>
        <a class="btn" href="${C.googleNavUrl(visit)}" target="_blank" rel="noopener">${I.nav} Google</a>
      </div>
      <div class="btn-row">
        <button class="btn" data-act="msg" data-id="${l.id}">${I.msg} Message</button>
        <button class="btn btn-sign" data-act="live-picked" data-id="${l.id}">${I.check} Picked up</button>
      </div>
      <div class="btn-row"><button class="btn" data-act="live-skip" data-id="${l.id}">Skip stop</button><button class="btn" data-act="live-stop">End run</button></div>
    </div>`;
  }

  function renderRun() {
    const el = $('#view-run');
    const stops = orderedStops();
    const plan = S.run.plan;
    const now = Date.now();
    let h = '<div class="run-head">';
    h += `<div class="row"><h1 style="flex:1">Pickup run</h1>${plan && !S.run.live ? `<button class="btn" data-act="tab" data-tab="map">${I.pin} Map</button>` : ''}</div>`;
    const live = !!(S.run.live && S.run.live.on);
    if (live) h += liveHTML();
    if (!live) h += `<div class="block">
      <div class="field"><span class="label">Start from</span><div class="seg"><button data-act="run-start" data-k="gps" aria-pressed="${S.run.startMode === 'gps'}">Where I am</button><button data-act="run-start" data-k="home" aria-pressed="${S.run.startMode === 'home'}">Home</button></div></div>
      <div class="field"><span class="label">Finish at</span><div class="seg"><button data-act="run-end" data-k="home" aria-pressed="${S.run.endMode === 'home'}">Home</button><button data-act="run-end" data-k="none" aria-pressed="${S.run.endMode === 'none'}">Last stop</button></div></div>
      <div class="field"><span class="label">Leave</span><div class="seg"><button data-act="run-depart" data-k="auto" aria-pressed="${S.run.departMode !== 'fixed'}">Auto (leave-by)</button><button data-act="run-depart" data-k="fixed" aria-pressed="${S.run.departMode === 'fixed'}">Set time</button></div></div>
      ${S.run.departMode === 'fixed' ? `<input class="input num" type="datetime-local" data-run="departAt" value="${C.toLocalInput(S.run.departAt || C.roundUpTo(now, 15))}">` : ''}
      ${!S.settings.home && (S.run.startMode === 'home' || S.run.endMode === 'home') ? '<div class="small" style="color:var(--warn)">Home is not set. <button class="chip" data-act="settings">Set home</button></div>' : ''}
    </div>`;
    h += '</div>';

    h += `<div class="group-head"><h2>Stops</h2><span class="line"></span><span class="n">${stops.length}</span></div>`;
    if (!stops.length) {
      h += `<div class="empty"><h3>No stops yet</h3><p>Mark a listing <b>Confirmed</b>, or tap <b>+ Run</b> on any card.</p><button class="btn" data-act="tab" data-tab="list">Go to list</button></div>`;
      el.innerHTML = h; return;
    }
    h += '<div class="stop-list">' + stops.map((s, i) => {
      const meta = [];
      meta.push(esc(s.place || 'No location'));
      if (s.price) meta.push(`<span class="num">${esc(money(s.price))}</span>`);
      meta.push(esc(s.size || 'M') + (s.helper ? ' · 2 people' : ''));
      if (s.lat == null) meta.push('<span style="color:var(--bad);font-weight:600">Needs location</span>');
      else if (s.prec === 'approx') meta.push('<span style="color:var(--warn);font-weight:600">Area only</span>');
      return `<div class="stop"><div class="n">${i + 1}</div><div style="min-width:0"><div class="t">${esc(s.title)}</div><div class="s">${meta.join('<span>·</span>')}</div>
        <input class="appt-in" type="datetime-local" aria-label="Pickup time for ${esc(s.title)}" data-stop-appt="${s.id}" value="${C.toLocalInput(s.appt)}"></div>
        <div class="ctl">${i > 0 ? `<button data-act="stop-up" data-id="${s.id}" aria-label="Move up">${I.up}</button>` : ''}${i < stops.length - 1 ? `<button data-act="stop-down" data-id="${s.id}" aria-label="Move down">${I.down}</button>` : ''}<button data-act="run-toggle" data-id="${s.id}" aria-label="Remove from run">${I.close}</button></div></div>`;
    }).join('') + '</div>';

    if (R.busy) h += `<div class="notice" style="margin-top:12px">${esc(R.busy)}</div>`;
    else {
      h += `<div class="stack" style="margin-top:12px"><button class="btn btn-sign btn-lg btn-block" data-act="run-plan">${I.route} Plan best route</button>
        <div class="btn-row"><button class="btn" data-act="run-keep">Keep my order</button>${plan ? '<button class="btn" data-act="run-propose">Suggest pickup times</button>' : ''}</div></div>`;
    }

    if (plan && plan.visits.length) {
      const stale = !(S.run.live && S.run.live.on) && plan.sig !== stopSig();
      if (stale) h += `<div class="notice" style="margin-top:12px">Stops changed since this plan. Tap <b>Plan best route</b> to refresh it.</div>`;
      const miles = C.kmToMi(plan.meters / 1000);
      const gas = miles / Math.max(1, S.settings.mpg) * S.settings.gas;
      const visitsL = plan.visits.map(v => byId(v.id)).filter(Boolean);
      const cash = visitsL.reduce((a, l) => a + (l.price || 0), 0);
      const load = visitsL.reduce((a, l) => a + C.SIZES[l.size || 'M'].units, 0);
      const cap = vehicle().units;
      const helpers = visitsL.filter(l => l.helper).length;
      h += `<div class="group-head"><h2>Plan</h2><span class="line"></span><span class="n">${plan.source === 'osrm' ? 'road times' : 'estimated'}</span></div>
      <div class="summary">
        <div class="sum lead"><b>${esc(C.fmtClock(plan.depart))}</b><span>Leave by</span></div>
        <div class="sum"><b>${esc(C.fmtDur(plan.driveMs))}</b><span>Driving</span></div>
        <div class="sum"><b>${miles.toFixed(miles < 10 ? 1 : 0)} mi</b><span>Distance</span></div>
        <div class="sum"><b>${esc(money(Math.round(gas * 100) / 100))}</b><span>Gas</span></div>
        <div class="sum"><b>${esc(money(cash))}</b><span>Cash</span></div>
        <div class="sum ${load > cap ? 'warn' : ''}"><b>${load}/${cap}</b><span>Load · ${esc(vehicle().label)}</span></div>
      </div>
      <div class="meter ${load > cap ? 'over' : ''}" style="margin-top:8px" aria-label="Vehicle load"><i style="width:${Math.min(100, Math.round(load / cap * 100))}%"></i></div>
      <div class="small muted" style="margin-top:6px">${load > cap ? '<b style="color:var(--bad)">Too much for one trip.</b> Split the run or take a bigger vehicle. ' : ''}${helpers ? `Bring a helper for ${helpers} heavy item${helpers > 1 ? 's' : ''}. ` : ''}Cash bills: <span class="num">${esc(C.billsText(visitsL.reduce((acc, l) => { C.cashBreakdown(l.price || 0).forEach(b => { const f = acc.find(x => x.bill === b.bill); if (f) f.n += b.n; else acc.push({ ...b }); }); return acc; }, []).sort((a, b) => b.bill - a.bill)))}</span>. Keep each stop's cash in its own pocket.</div>`;

      // timeline
      h += '<div class="road" style="margin-top:16px">';
      h += `<div class="r-node"><div class="dot home">${I.home}</div><div class="r-card"><div class="r-time"><span class="label">Leave</span><span class="num">${esc(C.fmtClock(plan.depart))}</span><span class="small muted">${esc(C.dayLabel(plan.depart, now))} · from ${esc(plan.startLabel)}</span></div></div></div>`;
      plan.visits.forEach((v, i) => {
        const l = byId(v.id); if (!l) return;
        const done = ['picked', 'passed'].includes(l.status);
        h += `<div class="r-leg">${I.car}<span>${esc(C.fmtDur(v.legS * 1000))}${v.legM != null ? ' · ' + esc(C.fmtMiles(v.legM)) : ''}</span></div>`;
        let badge = '';
        if (done) badge = `<span class="tag">${esc(statusLabel(l.status))}</span>`;
        else if (l.appt) {
          if (v.late > 0) badge = `<span class="tag tag-bad">${Math.round(v.late / MIN)} min late</span>`;
          else if (v.wait > 0) badge = `<span class="tag tag-good">on time · wait ${esc(C.fmtDur(v.wait))}</span>`;
          else badge = '<span class="tag tag-good">on time</span>';
        } else badge = '<span class="tag tag-ghost">no set time</span>';
        const isNext = S.run.live && S.run.live.on && liveVisits()[0] && liveVisits()[0].id === v.id;
        h += `<div class="r-node"><div class="dot">${i + 1}</div><div class="r-card ${v.late > 0 && !done ? 'late' : ''} ${isNext ? 'next' : ''}">
          <div class="r-time"><span class="num">${esc(C.fmtClock(v.arrive))}</span>${badge}${l.appt ? `<span class="small muted">pickup ${esc(C.fmtClock(l.appt))}</span>` : ''}</div>
          <div class="r-title">${esc(l.title)}</div>
          <div class="small muted">${esc(l.place || '')}${l.price ? ' · ' + esc(money(l.price)) + ' cash' : ''}${l.prec === 'approx' ? ' · <b style="color:var(--warn)">ask for address</b>' : ''}</div>
          <div class="btn-row"><a class="btn" href="${C.appleNavUrl(v, l.title)}" target="_blank" rel="noopener">${I.nav} Go</a><button class="btn" data-act="msg" data-id="${l.id}">${I.msg} Message</button></div>
        </div></div>`;
      });
      if (plan.end) {
        h += `<div class="r-leg">${I.car}<span>${esc(C.fmtDur((plan.endLeg ? plan.endLeg.legS : 0) * 1000))}${plan.endLeg && plan.endLeg.legM != null ? ' · ' + esc(C.fmtMiles(plan.endLeg.legM)) : ''}</span></div>`;
        h += `<div class="r-node"><div class="dot home">${I.home}</div><div class="r-card"><div class="r-time"><span class="label">Home</span><span class="num">${esc(C.fmtClock(plan.endArrive))}</span></div></div></div>`;
      }
      h += '</div>';
      if (plan.missing && plan.missing.length) h += `<div class="notice bad" style="margin-top:12px">${plan.missing.length} stop${plan.missing.length > 1 ? 's' : ''} left out: no location yet. Open them and tap Find address.</div>`;

      // exports
      const pts = [plan.start, ...plan.visits, ...(plan.end ? [plan.end] : [])];
      const links = C.googleRouteLinks(pts, { originIsHere: plan.startLabel === 'My location' });
      h += `<div class="stack" style="margin-top:16px">
        ${!S.run.live ? `<button class="btn btn-sign btn-lg btn-block" data-act="live-start">${I.play} Start run</button>` : ''}
        <div class="btn-row">${links.map((u, i) => `<a class="btn" href="${esc(u)}" target="_blank" rel="noopener">${I.route} Google Maps${links.length > 1 ? ` ${i + 1}/${links.length}` : ''}</a>`).join('')}</div>
        <div class="btn-row"><button class="btn" data-act="run-copy">${I.copy} Copy plan</button><button class="btn" data-act="run-ics">${I.cal} Calendar</button></div>
        <div class="small muted">Google Maps links hold 3 stops each on a phone, so longer runs come in parts. Copy plan to text it to someone, so they know where you are.</div>
      </div>`;
    }
    el.innerHTML = h;
  }

  function planText() {
    const p = S.run.plan; if (!p) return '';
    const lines = [`HAUL run · ${C.dayLabel(p.depart)} ${new Date(p.depart).toLocaleDateString([], { month: 'short', day: 'numeric' })}`, `Leave ${C.fmtClock(p.depart)} from ${p.startLabel}`];
    p.visits.forEach((v, i) => { const l = byId(v.id); if (l) lines.push(`${i + 1}. ${C.fmtClock(v.arrive)}  ${l.title}${l.place ? ' — ' + l.place : ''}${l.price ? ' (' + money(l.price) + ')' : ''}`); });
    if (p.end) lines.push(`Home ~${C.fmtClock(p.endArrive)}`);
    lines.push(`${C.fmtDur(p.driveMs)} driving · ${C.kmToMi(p.meters / 1000).toFixed(1)} mi`);
    return lines.join('\n');
  }
  function planICS() {
    const p = S.run.plan; if (!p) return '';
    const events = [];
    events.push({ uid: 'leave-' + p.at, start: p.depart, end: p.depart + 5 * MIN, title: 'Leave for pickups (HAUL)', description: planText(), alarmMin: 10 });
    p.visits.forEach(v => {
      const l = byId(v.id); if (!l) return;
      const start = l.appt || v.arrive;
      events.push({ uid: l.id + '-' + p.at, start, end: start + (l.dwell ?? S.settings.dwell) * MIN, title: `Pickup: ${l.title}${l.price ? ' (' + money(l.price) + ')' : ''}`, location: l.place || `${l.lat},${l.lng}`,
        description: `Cash: ${money(l.price)} = ${C.billsText(C.cashBreakdown(l.price || 0))}${l.url ? '\n' + l.url : ''}`, url: l.url || undefined, alarmMin: 30 });
    });
    return C.buildICS(events);
  }

  /* ================= HUNTS ================= */

  function renderHunts() {
    const el = $('#view-hunt'); const now = Date.now();
    let h = `<div class="hunt-head"><h1>Hunts</h1>
      <div class="small">Each hunt opens Facebook Marketplace already sorted <b>newest first</b>. Check often: the first message usually gets the item.</div>
      <div class="small muted">Tip: in Facebook, tap the <b>bell</b> next to Filters to get a ping when new listings match.</div>
      <div class="btn-row"><button class="btn btn-sign" data-act="hunt-sweep">${I.bolt} Check next</button><button class="btn" data-act="hunt-new">${I.plus} New hunt</button></div></div>`;
    if (!S.hunts.length) {
      h += `<div class="empty"><h3>No hunts yet</h3><p>A hunt is a saved search, like “bass amp under $300, listed today”.</p><button class="btn btn-sign btn-lg" data-act="hunt-new">${I.plus} New hunt</button></div>`;
      el.innerHTML = h; return;
    }
    const sorted = S.hunts.slice().sort((a, b) => (a.lastChecked || 0) - (b.lastChecked || 0));
    h += '<div class="cards">' + sorted.map(hu => {
      const age = hu.lastChecked ? now - hu.lastChecked : null;
      const cls = age == null ? 'old' : age < 20 * MIN ? 'ok' : age < 90 * MIN ? 'mid' : 'old';
      const chips = [];
      if (hu.minPrice || hu.maxPrice) chips.push(hu.minPrice && hu.maxPrice ? `${money(hu.minPrice)}–${money(hu.maxPrice)}` : hu.maxPrice ? `≤ ${money(hu.maxPrice)}` : `≥ ${money(hu.minPrice)}`);
      chips.push(hu.days === 1 ? 'Last 24 h' : hu.days === 7 ? 'Last 7 days' : hu.days === 30 ? 'Last 30 days' : 'Any time');
      chips.push(hu.sort === 'distance_ascend' ? 'Nearest first' : hu.sort === 'price_ascend' ? 'Cheapest first' : 'Newest first');
      if (hu.condition) chips.push({ new: 'New', used_like_new: 'Like new', used_good: 'Good', used_fair: 'Fair' }[hu.condition] || hu.condition);
      return `<article class="hunt"><div class="row"><span class="hunt-q" style="flex:1;min-width:0">${esc(hu.query)}</span>${hu.example ? '<span class="ex-badge">EXAMPLE</span>' : ''}<span class="fresh ${cls}">${age == null ? 'never checked' : 'checked ' + C.fmtAge(age) + ' ago'}</span></div>
        <div class="card-tags">${chips.map(c => `<span class="tag tag-ghost">${esc(c)}</span>`).join('')}</div>
        <div class="btn-row"><a class="btn btn-sign" data-act="hunt-open" data-id="${hu.id}" href="${esc(C.fbSearchUrl(hu, S.settings.city))}" target="_blank" rel="noopener">${I.ext} Check now</a><button class="btn" data-act="hunt-edit" data-id="${hu.id}">Edit</button></div></article>`;
    }).join('') + '</div>';
    h += `<div class="small muted" style="margin-top:14px">Hunts use your Facebook location${S.settings.city ? ` (city set: ${esc(S.settings.city)})` : ''}. Change it in Settings if results look far away.</div>`;
    el.innerHTML = h;
  }

  function huntEditHTML() {
    const hu = R.huntDraft;
    if (!hu) return '';
    const daysBtn = (v, label) => `<button data-act="hd" data-k="days" data-v="${v}" aria-pressed="${String(hu.days ?? '') === String(v)}">${label}</button>`;
    const sortBtn = (v, label) => `<button data-act="hd" data-k="sort" data-v="${v}" aria-pressed="${(hu.sort || 'creation_time_descend') === v}">${label}</button>`;
    return sheetHead(S.hunts.some(x => x.id === hu.id) ? 'Edit hunt' : 'New hunt') + `<div class="sheet-body">
      <label class="field"><span>Search for</span><input class="input" data-h="query" value="${esc(hu.query || '')}" placeholder="bass amp" autocomplete="off"></label>
      <div class="grid2">
        <label class="field"><span>Min price</span><div class="money"><input class="input num" data-h="minPrice" inputmode="decimal" value="${hu.minPrice ?? ''}"></div></label>
        <label class="field"><span>Max price</span><div class="money"><input class="input num" data-h="maxPrice" inputmode="decimal" value="${hu.maxPrice ?? ''}"></div></label>
      </div>
      <div class="field"><span class="label">Listed within</span><div class="seg">${daysBtn(1, '24 h')}${daysBtn(7, '7 days')}${daysBtn(30, '30 days')}${daysBtn('', 'Any')}</div></div>
      <div class="field"><span class="label">Sort</span><div class="seg">${sortBtn('creation_time_descend', 'Newest')}${sortBtn('distance_ascend', 'Nearest')}${sortBtn('price_ascend', 'Cheapest')}</div></div>
      <label class="field"><span>Condition</span><select class="select" data-h="condition"><option value="">Any</option>${[['new', 'New'], ['used_like_new', 'Used, like new'], ['used_good', 'Used, good'], ['used_fair', 'Used, fair']].map(([v, l]) => `<option value="${v}" ${hu.condition === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <button class="btn btn-sign btn-lg btn-block" data-act="hunt-save">${I.check} Save hunt</button>
      ${S.hunts.some(x => x.id === hu.id) ? `<button class="btn btn-danger btn-block" data-act="hunt-delete" data-id="${hu.id}">${I.trash} Delete hunt</button>` : ''}
    </div>`;
  }

  /* ================= SETTINGS ================= */

  function settingsHTML() {
    const s = S.settings;
    const home = s.home;
    return sheetHead('Settings') + `<div class="sheet-body">
      <div class="block"><h3>Home base</h3>
        <div>${home ? `<b>${esc(home.label || 'Set')}</b> <span class="small muted num">${home.lat.toFixed(4)}, ${home.lng.toFixed(4)}</span>` : '<span class="muted">Not set. Used for distance, gas and routes.</span>'}</div>
        <div class="btn-row"><button class="btn" data-act="home-gps">${I.pin} My location</button><button class="btn" data-act="home-pick">Pick on map</button></div>
        <div class="row" style="flex-wrap:nowrap"><input class="input" id="homeQ" placeholder="Or type your address" autocomplete="off" style="flex:1;min-width:0"><button class="btn" data-act="home-find">Find</button></div>
        ${R.geoResults && R.geoResults.for === 'home' ? geoResultsHTML(R.geoResults, 'home') : ''}
        ${home ? '<button class="btn btn-danger" data-act="home-clear">Clear home</button>' : ''}
      </div>
      <div class="block"><h3>Vehicle</h3>
        <div class="seg">${Object.entries(C.VEHICLES).map(([k, v]) => `<button data-act="set" data-k="vehicle" data-v="${k}" aria-pressed="${s.vehicle === k}">${esc(v.label)}</button>`).join('')}</div>
        <div class="small muted">Holds about ${vehicle().units} load units. S = 1, M = 2, L = 4, XL = 8.</div>
        <div class="grid2">
          <label class="field"><span>Miles per gallon</span><input class="input num" data-s="mpg" inputmode="decimal" value="${s.mpg}"></label>
          <label class="field"><span>Gas price per gallon</span><div class="money"><input class="input num" data-s="gas" inputmode="decimal" value="${s.gas}"></div></label>
        </div>
      </div>
      <div class="block"><h3>Timing</h3>
        <div class="grid2">
          <label class="field"><span>Time at each stop</span><select class="select" data-s="dwell">${[5, 10, 15, 20, 30].map(m => `<option value="${m}" ${s.dwell === m ? 'selected' : ''}>${m} min</option>`).join('')}</select></label>
          <label class="field"><span>Arrive early by</span><select class="select" data-s="early">${[0, 5, 10, 15].map(m => `<option value="${m}" ${s.early === m ? 'selected' : ''}>${m} min</option>`).join('')}</select></label>
        </div>
        <label class="field"><span>Count as late after</span><select class="select" data-s="grace">${[0, 5, 10, 15].map(m => `<option value="${m}" ${s.grace === m ? 'selected' : ''}>${m} min</option>`).join('')}</select></label>
        <label class="check"><input type="checkbox" data-s="wake" ${s.wake ? 'checked' : ''}> Keep screen on during a run</label>
        <label class="check"><input type="checkbox" data-s="quickPaste" ${s.quickPaste ? 'checked' : ''}> Tapping + pastes and saves a copied listing</label>
      </div>
      <div class="block"><h3>Reading</h3>
        <div class="field"><span class="label">Theme</span><div class="seg">${[['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => `<button data-act="set" data-k="theme" data-v="${k}" aria-pressed="${s.theme === k}">${l}</button>`).join('')}</div></div>
        <div class="field"><span class="label">Text size</span><div class="seg">${[[1, 'A'], [1.12, 'A+'], [1.25, 'A++']].map(([k, l]) => `<button data-act="set" data-k="scale" data-v="${k}" aria-pressed="${s.scale === k}" style="font-size:${0.85 * k}rem">${l}</button>`).join('')}</div></div>
      </div>
      <div class="block"><h3>Facebook hunts</h3>
        <label class="field"><span>City for hunts (optional)</span><input class="input" data-s="city" value="${esc(s.city)}" placeholder="e.g. tampa" autocomplete="off" autocapitalize="off"><small>Leave blank to use the location set in your Facebook app.</small></label>
      </div>
      <div class="block"><h3>Your data</h3>
        <div class="small muted">Everything stays on this phone. No Facebook login, no account.</div>
        <div class="btn-row"><button class="btn" data-act="export">Back up</button><button class="btn" data-act="import">Import file</button></div>
        ${R.importPending ? `<div class="notice"><div>This is a HAUL backup with <b>${R.importPending.listings.length}</b> listings.</div><div class="btn-row"><button class="btn" data-act="import-merge">Add to mine</button><button class="btn btn-danger" data-act="import-replace">Replace mine</button></div></div>` : ''}
        <div class="small muted">Import takes a HAUL backup, or JSON / CSV from a scraper service (title, price, location, link, listed time).</div>
        ${S.listings.some(l => l.example) || S.hunts.some(h => h.example) ? '<button class="btn" data-act="clear-examples">Clear examples</button>' : ''}
        <button class="btn btn-danger" data-act="erase">${R.confirmErase ? 'Tap again to erase everything' : 'Erase everything'}</button>
      </div>
      <div class="small muted">Maps © OpenStreetMap contributors, © CARTO. Routes: OSRM. Address search: Nominatim. Screenshot reading: Tesseract.js. HAUL is not made by or linked to Meta.</div>
    </div>`;
  }

  function applyTheme() {
    const t = S.settings.theme;
    if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
    document.documentElement.style.setProperty('--scale', S.settings.scale);
    syncTiles(); if (R.map) { syncMarkers(); drawRoute(); }
  }

  /* ================= actions ================= */

  function openDetail(id) { R.geoResults = null; openSheet('detail', id); }

  const A = {
    tab: el => { closeSheet(); showTab(el.dataset.tab); },
    add: () => {
      R.draft = newDraft(); openSheet('add');
      if (!S.settings.quickPaste || !navigator.clipboard || !navigator.clipboard.readText) return;
      navigator.clipboard.readText().then(text => {
        if (!text || text === R.lastClip || R.sheet !== 'add' || (R.draft && (R.draft.parsed || R.draft.text))) return;
        if (looksLikeListing(text)) captureText(text);
      }).catch(() => {});
    },
    howto: () => openSheet('howto'),
    settings: () => { R.geoResults = null; openSheet('settings'); },
    'close-sheet': () => closeSheet(),
    sort: el => { const s = el.dataset.sort; if (s === 'price' && S.ui.sort === 'price') S.ui.priceDir *= -1; S.ui.sort = s; save(); if (s === 'near' && !R.pos) getPosOnce().then(() => renderList()).catch(() => {}); renderList(); },
    filter: el => { S.ui.filter = el.dataset.filter; save(); renderList(); },
    open: (el, id) => openDetail(id),
    cycle: (el, id) => {
      const l = byId(id); if (!l) return;
      const order = ['found', 'messaged', 'confirmed', 'picked'];
      const i = order.indexOf(l.status);
      setStatus(l, i < 0 ? 'found' : order[(i + 1) % order.length]);
      renderAll(); syncMarkers();
    },
    'set-status': (el, id) => { const l = byId(id); if (!l) return; setStatus(l, el.dataset.s); renderSheet(false); renderAll(); syncMarkers(); },
    'mark-messaged': (el, id) => { const l = byId(id); if (!l) return; setStatus(l, 'messaged'); closeSheet(); renderAll(); syncMarkers(); toast('Marked Messaged'); },
    msg: (el, id) => openSheet('msg', id),
    'copy-msg': async (el, id) => {
      const l = byId(id); if (!l) return;
      const m = C.sellerMessages(l, msgCtx(l)).find(x => x.key === el.dataset.k);
      if (m && await copyText(m.text)) toast('Copied. Open the listing and paste it.'); else toast('Copy failed. Press and hold the text to copy it.');
    },
    'copy-text': async el => { if (await copyText(el.dataset.text)) toast('Copied'); },
    map: (el, id) => { closeSheet(); focusListing(id); },
    'run-toggle': (el, id) => {
      const l = byId(id); if (!l) return;
      l.inRun = !l.inRun; l.updatedAt = Date.now();
      if (l.inRun && !S.run.order.includes(l.id)) S.run.order.push(l.id);
      save(); toast(l.inRun ? 'Added to run' : 'Removed from run'); renderAll();
    },
    'clear-examples': () => { closeSheet(); clearExamples(); },
    paste: () => doPaste(),
    scan: () => { const f = $('#fileShot'); f.value = ''; f.click(); },
    parse: () => {
      const ta = $('#addText'); const text = ta ? ta.value : '';
      if (!text.trim()) { toast('Paste or type something first.'); return; }
      R.draft = newDraft(text); parseDraft(); renderSheet(false);
    },
    age: el => {
      const d = R.draft; if (!d) return;
      const chip = AGE_CHIPS.find(c => c[0] === el.dataset.k); if (!chip) return;
      d.ageKey = chip[0]; d.window = C.windowFromAge(Date.now(), chip[2]); renderSheet(false);
    },
    'draft-size': el => { if (R.draft) { R.draft.size = el.dataset.k; renderSheet(false); } },
    'save-draft': el => saveDraft(el.dataset.mode),
    'draft-reset': () => { R.draft = newDraft(); renderSheet(true); },
    repaste: () => { R.draft = newDraft(); openSheet('add'); toast('Paste or scan the same listing again.'); },
    appt: (el, id) => {
      const l = byId(id); if (!l) return;
      l.appt = el.dataset.t ? +el.dataset.t : null; l.updatedAt = Date.now();
      save(); renderSheet(false); renderAll();
    },
    size: (el, id) => { const l = byId(id); if (!l) return; l.size = el.dataset.k; save(); renderSheet(false); renderAll(); },
    'geo-find': (el, id) => { const l = byId(id); const inp = document.querySelector('#sheet [data-f="place"]'); findAddress(id, inp ? inp.value : l && l.place); },
    'geo-use': (el, id) => {
      const r = R.geoResults && R.geoResults.items[+el.dataset.i]; if (!r) return;
      if (id === 'home') { S.settings.home = { lat: r.lat, lng: r.lng, label: r.label.split(',').slice(0, 2).join(',') }; R.geoResults = null; save(); renderSheet(false); renderAll(); toast('Home set'); return; }
      const l = byId(id); if (!l) return;
      l.lat = r.lat; l.lng = r.lng; l.prec = r.prec; if (!l.place) l.place = r.label.split(',').slice(0, 3).join(',');
      R.geoResults = null; save(); syncMarkers(); renderSheet(false); renderAll(); toast(r.prec === 'exact' ? 'Exact pin set' : 'Area pin set');
    },
    'pick-on-map': (el, id) => { R.pickFor = { kind: 'listing', id }; closeSheet(); showTab('map'); const l = byId(id); if (l && l.lat != null) setTimeout(() => R.map.setView([l.lat, l.lng], 14), 80); renderMapBanner(); },
    'pick-cancel': () => { R.pickFor = null; renderMapBanner(); },
    'pin-home': () => { const pt = R.sheetArg; closeSheet(); placePin({ kind: 'home' }, pt.lat, pt.lng); },
    'pin-listing': (el, id) => { const pt = R.sheetArg; closeSheet(); placePin({ kind: 'listing', id }, pt.lat, pt.lng); },
    delete: (el, id) => {
      if (el.dataset.confirm !== '1') { el.dataset.confirm = '1'; el.innerHTML = I.trash + ' Tap again to delete'; return; }
      S.listings = S.listings.filter(l => l.id !== id); S.run.order = S.run.order.filter(x => x !== id);
      save(); closeSheet(); renderAll(); syncMarkers(); toast('Deleted');
    },
    'map-locate': () => { if (startWatch()) { getPosOnce().then(p => { ensureMap(); R.map.setView([p.lat, p.lng], 13); R.fitted = true; renderList(); }).catch(() => {}); } },
    'locate-list': () => { getPosOnce().then(() => renderList()).catch(() => toast('Could not get your location.')); },
    'map-fit': () => fitAll(),
    'map-toggle-done': () => { S.ui.showDone = !S.ui.showDone; save(); syncMarkers(); toast(S.ui.showDone ? 'Showing all listings' : 'Showing active listings'); },
    'run-start': el => { S.run.startMode = el.dataset.k; save(); renderRun(); },
    'run-end': el => { S.run.endMode = el.dataset.k; save(); renderRun(); },
    'run-depart': el => { S.run.departMode = el.dataset.k; if (el.dataset.k === 'fixed' && !S.run.departAt) S.run.departAt = C.roundUpTo(Date.now(), 15); save(); renderRun(); },
    'run-plan': () => planRun(true),
    'run-keep': () => planRun(false),
    'run-propose': () => { R.propose = proposeTimesFor(); if (R.propose && R.propose.length) openSheet('propose'); else toast('Plan the route first.'); },
    'propose-apply': () => {
      for (const p of R.propose || []) { const l = byId(p.id); if (l) { l.appt = p.propose; l.updatedAt = Date.now(); } }
      save(); closeSheet(); toast('Times set. Re-planning…'); planRun(false);
    },
    'stop-up': (el, id) => moveStop(id, -1),
    'stop-down': (el, id) => moveStop(id, 1),
    'run-copy': async () => { if (await copyText(planText())) toast('Plan copied. Paste it in a text.'); },
    'run-ics': () => { const ics = planICS(); if (!ics) return; saveFile('haul-pickups.ics', ics, 'text/calendar'); toast('Open the file to add the pickups to Calendar.', 3600); },
    'live-start': () => { S.run.live = { on: true, startedAt: Date.now() }; save(); startWatch(); requestWake(); liveTick(); renderAll(); toast('Run started. HAUL tracks your ETA while open.'); },
    'live-stop': () => { S.run.live = null; save(); if (R.wake) { R.wake.release().catch(() => {}); R.wake = null; } renderAll(); },
    'live-picked': (el, id) => { const l = byId(id); if (!l) return; setStatus(l, 'picked'); toast('Picked up'); renderAll(); syncMarkers(); },
    'live-skip': (el, id) => { const l = byId(id); if (!l) return; setStatus(l, 'passed'); liveAdvance(); toast('Skipped'); renderAll(); syncMarkers(); },
    'hunt-new': () => { R.huntDraft = { id: uid(), query: '', minPrice: null, maxPrice: null, days: 1, sort: 'creation_time_descend', condition: '', lastChecked: null }; openSheet('hunt', null); },
    'hunt-edit': (el, id) => { const hu = S.hunts.find(x => x.id === id); if (!hu) return; R.huntDraft = { ...hu }; openSheet('hunt', id); },
    hd: el => { const hu = R.huntDraft; if (!hu) return; const k = el.dataset.k; let v = el.dataset.v; if (k === 'days') v = v === '' ? null : +v; hu[k] = v; renderSheet(false); },
    'hunt-save': () => {
      const hu = R.huntDraft; if (!hu) return;
      if (!String(hu.query || '').trim()) { toast('Type what to search for.'); return; }
      const i = S.hunts.findIndex(x => x.id === hu.id);
      if (i >= 0) S.hunts[i] = hu; else S.hunts.push(hu);
      R.huntDraft = null; save(); closeSheet(); renderHunts(); toast('Hunt saved');
    },
    'hunt-delete': (el, id) => { S.hunts = S.hunts.filter(x => x.id !== id); save(); closeSheet(); renderHunts(); toast('Hunt deleted'); },
    'hunt-open': (el, id, e) => { const hu = S.hunts.find(x => x.id === id); if (hu) { hu.lastChecked = Date.now(); save(); setTimeout(renderHunts, 400); } },
    'hunt-sweep': () => {
      const hu = S.hunts.slice().sort((a, b) => (a.lastChecked || 0) - (b.lastChecked || 0))[0];
      if (!hu) { toast('Add a hunt first.'); return; }
      hu.lastChecked = Date.now(); save();
      const a = document.createElement('a'); a.href = C.fbSearchUrl(hu, S.settings.city); a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(renderHunts, 400);
    },
    'home-gps': () => getPosOnce().then(p => { S.settings.home = { lat: p.lat, lng: p.lng, label: 'My location' }; save(); renderSheet(false); renderAll(); toast('Home set'); }).catch(() => toast('Could not get your location.')),
    'home-pick': () => { R.pickFor = { kind: 'home' }; closeSheet(); showTab('map'); renderMapBanner(); },
    'home-find': () => { const q = $('#homeQ'); findAddress('home', q ? q.value : ''); },
    'home-clear': () => { S.settings.home = null; save(); renderSheet(false); renderAll(); },
    set: el => {
      const k = el.dataset.k; let v = el.dataset.v;
      if (k === 'scale') v = +v;
      S.settings[k] = v; save();
      if (k === 'theme' || k === 'scale') applyTheme();
      renderSheet(false); renderAll();
    },
    export: () => { const name = `haul-backup-${C.dayKey(Date.now())}.json`; saveFile(name, JSON.stringify({ ...S, run: { ...S.run, live: null } }, null, 1), 'application/json'); toast('Backup saved to your downloads.'); },
    import: () => { const f = $('#fileImport'); f.value = ''; f.click(); },
    'import-merge': () => {
      const b = R.importPending; if (!b) return;
      let n = 0; for (const l of b.listings) if (!S.listings.some(x => x.id === l.id)) { S.listings.push(l); n++; }
      for (const hu of b.hunts || []) if (!S.hunts.some(x => x.id === hu.id)) S.hunts.push(hu);
      R.importPending = null; save(); renderSheet(false); renderAll(); syncMarkers(); toast(`Added ${n} listings`);
    },
    'import-replace': () => {
      const b = R.importPending; if (!b) return;
      const f = freshState();
      S = { ...f, ...b, settings: { ...f.settings, ...(b.settings || {}) }, run: { ...f.run, ...(b.run || {}), live: null }, ui: { ...f.ui, ...(b.ui || {}) } };
      R.importPending = null; saveNow(); applyTheme(); renderSheet(false); renderAll(); syncMarkers(); drawRoute(); toast('Backup restored');
    },
    erase: () => {
      if (!R.confirmErase) { R.confirmErase = true; renderSheet(false); return; }
      S = freshState(); S.seeded = true; saveNow(); R.confirmErase = false; closeSheet(); applyTheme(); renderAll(); syncMarkers(); drawRoute(); toast('Everything erased');
    },
  };

  function moveStop(id, dir) {
    const ids = orderedStops().map(s => s.id);
    const i = ids.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    S.run.order = ids; S.run.keepOrder = true; save(); renderRun();
  }

  /* ================= events ================= */

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const fn = A[el.dataset.act]; if (!fn) return;
    if (el.tagName !== 'A') e.preventDefault();
    fn(el, el.dataset.id, e);
  });
  $('#scrim').addEventListener('click', closeSheet);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && R.sheet) closeSheet(); });

  const num = v => { const n = parseFloat(String(v).replace(/[^\d.]/g, '')); return isFinite(n) ? n : null; };

  function onField(e) {
    const t = e.target;
    if (t.id === 'q') { S.ui.q = t.value; save(); renderList(); return; }
    if (t.dataset.d && R.draft) {
      const k = t.dataset.d; const v = t.value;
      if (k === 'price' || k === 'maxPay') R.draft[k] = num(v);
      else R.draft[k] = v;
      if (k === 'title' && e.type === 'change') { R.draft.category = C.guessCategory(R.draft.title, R.draft.price); const sel = document.querySelector('#sheet [data-d="category"]'); if (sel) sel.value = R.draft.category; }
      return;
    }
    if (t.dataset.f && R.sheet === 'detail') {
      const l = byId(R.sheetArg); if (!l) return;
      const k = t.dataset.f;
      if (k === 'price' || k === 'maxPay' || k === 'resale') {
        const v = num(t.value);
        if (k === 'price' && v != null && l.price != null && v !== l.price && e.type === 'change') { l.priceHistory = [...(l.priceHistory || []), { t: Date.now(), price: v }]; if (v < l.price) l.wasPrice = l.price; }
        l[k] = v;
      } else if (k === 'appt') l.appt = C.fromLocalInput(t.value);
      else if (k === 'dwell') l.dwell = +t.value;
      else if (k === 'inRun' || k === 'helper') l[k] = t.checked;
      else if (k === 'url') { l.url = t.value.trim() || null; const m = (l.url || '').match(/marketplace\/item\/(\d+)/); if (m) l.fbId = m[1]; }
      else l[k] = t.value;
      l.updatedAt = Date.now(); save();
      if (e.type === 'change') { renderAll(); if (['price', 'maxPay', 'resale', 'appt', 'inRun', 'helper', 'category'].includes(k)) renderSheet(false); if (k === 'price') syncMarkers(); }
      return;
    }
    if (t.dataset.s) {
      const k = t.dataset.s;
      if (k === 'wake' || k === 'quickPaste') S.settings[k] = t.checked;
      else if (k === 'city') S.settings.city = t.value.trim();
      else { const v = num(t.value); if (v != null) S.settings[k] = v; }
      save(); if (e.type === 'change') renderAll();
      return;
    }
    if (t.dataset.h && R.huntDraft) {
      const k = t.dataset.h;
      R.huntDraft[k] = (k === 'minPrice' || k === 'maxPrice') ? num(t.value) : t.value;
      return;
    }
    if (t.dataset.run === 'departAt') { S.run.departAt = C.fromLocalInput(t.value); save(); return; }
    if (t.dataset.stopAppt && e.type === 'change') {
      const l = byId(t.dataset.stopAppt); if (!l) return;
      l.appt = C.fromLocalInput(t.value); l.updatedAt = Date.now(); save(); renderRun(); renderTop();
    }
  }
  document.addEventListener('input', onField);
  document.addEventListener('change', onField);

  $('#fileShot').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (f) runOCR(f); });
  $('#fileImport').addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    try {
      const text = await f.text();
      let parsed = null; try { parsed = JSON.parse(text); } catch (_) { parsed = null; }
      if (parsed && parsed.v && Array.isArray(parsed.listings)) { R.importPending = parsed; if (R.sheet !== 'settings') openSheet('settings'); else renderSheet(false); return; }
      const recs = C.importRecords(text);
      let n = 0, upd = 0;
      for (const r of recs) {
        const dup = findDup(r);
        if (dup) { mergeInto(dup, { window: r.listedWindow, price: r.price, url: r.url, fbId: r.fbId, place: r.place, condition: r.condition, description: r.description }); upd++; continue; }
        const l = makeListing({ ...r, prec: r.lat != null ? 'approx' : null });
        S.listings.push(l); n++;
      }
      save(); renderAll(); syncMarkers();
      toast(n || upd ? `Imported ${n} new${upd ? `, updated ${upd}` : ''}` : 'No listings found in that file.', 3400);
      for (const l of S.listings.filter(x => x.lat == null && x.place).slice(0, 15)) await autoLocate(l);
    } catch (err) { toast('Could not read that file.'); }
  });

  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (S.settings.theme === 'auto') applyTheme(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    renderView();
    if (S.run.live && S.run.live.on) { requestWake(); startWatch(); }
  });
  window.addEventListener('online', () => toast('Back online'));
  window.addEventListener('offline', () => toast('Offline. Saved listings still work.'));
  setInterval(() => { if (document.visibilityState !== 'visible' || R.sheet || isEditing()) return; if (S.ui.tab === 'list') renderList(); else if (S.ui.tab === 'run' && !R.busy) renderRun(); else if (S.ui.tab === 'hunt') renderHunts(); }, 30000);

  /* ================= boot ================= */

  if (!S.seeded && !S.listings.length) seedExamples();
  applyTheme();
  showTab(S.ui.tab || 'list');
  if (S.run.live && S.run.live.on) { startWatch(); requestWake(); }
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
  window.HAUL = { get state() { return S; }, planRun, render: renderAll };
})();
