/* HAUL service worker: app works offline, map tiles you've seen stay cached, screenshot reader cached after first use.
   Routing and address search always go to the network. Bump VERSION when you change any app file. */
const VERSION = 'haul-1.1.0';
const TILE_CACHE = 'haul-tiles-v1';
const OCR_CACHE = 'haul-ocr-v1';
const TILE_MAX = 700;
const SHELL = ['./', 'index.html', 'app.css', 'core.js', 'app.js', 'leaflet.js', 'leaflet.css', 'manifest.webmanifest',
  'icon-180.png', 'icon-192.png', 'icon-512.png', 'lexend.woff2', 'overpass.woff2', 'overpass-mono.woff2'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== TILE_CACHE && k !== OCR_CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const isTile = u => /(^|\.)basemaps\.cartocdn\.com$|(^|\.)tile\.openstreetmap\.org$/.test(u.hostname);
const isOCR = u => (u.hostname === 'cdn.jsdelivr.net' && /tesseract/.test(u.pathname)) || u.hostname === 'tessdata.projectnaptha.com';

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') {
      // network first so updates arrive; cached app when offline
      e.respondWith(fetch(req).then(r => {
        if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put('index.html', copy)); }
        return r;
      }).catch(() => caches.match('index.html')));
      return;
    }
    // stale-while-revalidate for app files
    e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => {
      const net = fetch(req).then(r => {
        if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
        return r;
      }).catch(() => hit);
      return hit || net;
    }));
    return;
  }

  if (isTile(url)) { e.respondWith(cacheFirst(req, TILE_CACHE, true)); return; }
  if (isOCR(url)) { e.respondWith(cacheFirst(req, OCR_CACHE, false)); }
});

async function cacheFirst(req, name, trimIt) {
  const c = await caches.open(name);
  const hit = await c.match(req);
  if (hit) return hit;
  try {
    const r = await fetch(req);
    if (r.ok || r.type === 'opaque') { c.put(req, r.clone()); if (trimIt) trim(c); }
    return r;
  } catch (err) {
    return Response.error();
  }
}

let trimming = false;
async function trim(c) {
  if (trimming) return;
  trimming = true;
  try {
    const keys = await c.keys();
    if (keys.length > TILE_MAX) await Promise.all(keys.slice(0, keys.length - TILE_MAX).map(k => c.delete(k)));
  } finally { trimming = false; }
}
