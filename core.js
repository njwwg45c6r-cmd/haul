/* HAUL core — pure logic, no DOM.
   Browser: window.HaulCore   Node: require('./core.js')
   Parsing, precise listed-time windows, scam flags, routing math,
   route optimizer with pickup windows, map/calendar/Facebook link builders. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HaulCore = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const SEC = 1000, MIN = 60 * SEC, HOUR = 60 * MIN, DAY = 24 * HOUR, WEEK = 7 * DAY, MONTH = 30 * DAY, YEAR = 365 * DAY;

  /* ---------------- vocab ---------------- */

  const STATUSES = [
    { id: 'found', label: 'Found' },
    { id: 'messaged', label: 'Messaged' },
    { id: 'confirmed', label: 'Confirmed' },
    { id: 'picked', label: 'Picked up' },
    { id: 'passed', label: 'Passed' },
  ];
  const STATUS_IDS = STATUSES.map(s => s.id);
  const ACTIVE = ['found', 'messaged', 'confirmed'];

  const SIZES = {
    S: { label: 'S', name: 'Small', units: 1, hint: 'fits on a seat' },
    M: { label: 'M', name: 'Medium', units: 2, hint: 'one-person carry' },
    L: { label: 'L', name: 'Large', units: 4, hint: 'seats down / truck' },
    XL: { label: 'XL', name: 'Extra large', units: 8, hint: 'truck or van' },
  };
  const VEHICLES = {
    car: { label: 'Car', units: 6 },
    suv: { label: 'SUV', units: 12 },
    truck: { label: 'Pickup', units: 20 },
    van: { label: 'Van', units: 24 },
  };

  const CATEGORIES = [
    { id: 'music', label: 'Music & audio', words: 'amp amps amplifier bass guitar guitars drum drums drumset cymbal cymbals snare kick speaker speakers subwoofer subwoofers sub mixer mixing console pedal pedals pedalboard synth synthesizer keyboard keyboards piano mic mics microphone microphones interface preamp cab cabinet pa monitors headphones studio dj turntable turntables vinyl fender gibson ibanez yamaha roland boss shure sennheiser qsc jbl behringer ampeg marshall peavey mackie focusrite presonus allen heath midas rane pioneer ukulele violin cello banjo trumpet sax saxophone xlr ev electro-voice crown line6 vox orange markbass gallien-krueger' },
    { id: 'electronics', label: 'Electronics', words: 'tv tvs television laptop macbook imac iphone ipad phone tablet camera cameras lens lenses gopro drone ps5 ps4 playstation xbox nintendo switch computer pc gpu printer router projector smartwatch kindle airpods ssd hdd nas' },
    { id: 'furniture', label: 'Furniture', words: 'couch sofa sectional loveseat recliner chair chairs table tables desk desks dresser nightstand bed bedframe mattress headboard bookcase bookshelf shelf shelves shelving cabinet cabinets armoire ottoman bench stool stools futon wardrobe credenza sideboard vanity hutch crib' },
    { id: 'tools', label: 'Tools', words: 'drill drills saw saws dewalt milwaukee ryobi makita ridgid craftsman kobalt ladder compressor generator welder toolbox tool tools sander grinder impact nailer wrench socket jack bandsaw tablesaw router-table workbench vise' },
    { id: 'home', label: 'Home & appliances', words: 'fridge refrigerator freezer washer dryer microwave oven stove range dishwasher lamp lamps rug rugs mirror curtains vacuum ac fan heater blender cookware dehumidifier' },
    { id: 'outdoor', label: 'Outdoor & sports', words: 'bike bikes bicycle kayak canoe paddle grill smoker patio mower lawnmower trimmer edger blower golf fishing rod reel tent camping treadmill weights dumbbell dumbbells pool trampoline surfboard paddleboard cooler' },
    { id: 'vehicles', label: 'Vehicles & parts', words: 'car truck suv trailer motorcycle scooter atv utv boat jetski tires tire rims wheels engine hitch golfcart' },
    { id: 'free', label: 'Free', words: '' },
    { id: 'other', label: 'Other', words: '' },
  ].map(c => ({ ...c, set: new Set(c.words.split(/\s+/).filter(Boolean)) }));

  const CATEGORY_PHRASES = [
    ['road case', 'music'], ['flight case', 'music'], ['rack case', 'music'], ['mic stand', 'music'], ['speaker stand', 'music'],
    ['powered speaker', 'music'], ['tv stand', 'furniture'], ['pressure washer', 'tools'], ['golf cart', 'vehicles'],
    ['air conditioner', 'home'], ['jet ski', 'vehicles'], ['instant pot', 'home'],
  ];

  function guessCategory(title, price) {
    if (price === 0) return 'free';
    const t = String(title || '').toLowerCase();
    for (const [phrase, cat] of CATEGORY_PHRASES) if (t.includes(phrase)) return cat;
    const words = t.split(/[^a-z0-9+-]+/).filter(Boolean);
    let best = 'other', bestScore = 0;
    for (const c of CATEGORIES) {
      if (!c.set.size) continue;
      let score = 0;
      for (const w of words) if (c.set.has(w)) score++;
      if (score > bestScore) { best = c.id; bestScore = score; }
    }
    return best;
  }

  /* ---------------- precise listed time ---------------- */

  const WORDNUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, few: 3, couple: 2 };

  function unitMs(u) {
    u = String(u || '').toLowerCase();
    if (u === 's' || u.startsWith('sec')) return SEC;
    if (u === 'm' || u.startsWith('min')) return MIN;
    if (u.startsWith('h')) return HOUR;
    if (u === 'd' || u.startsWith('day')) return DAY;
    if (u.startsWith('w')) return WEEK;
    if (u.startsWith('mo')) return MONTH;
    if (u === 'y' || u.startsWith('y')) return YEAR;
    return 0;
  }

  /** Age range {lo, hi} in ms from Facebook-style text ("Listed 3 hours ago in Tampa, FL", "about an hour ago", "23m"). */
  function parseAge(input) {
    if (input == null) return null;
    let s = String(input).toLowerCase().replace(/[\u2019']/g, "'").replace(/\s+/g, ' ').trim();
    s = s.replace(/^listed\s+/, '').replace(/\s+in\s+.*$/, '').replace(/\s+ago\b.*$/, '').replace(/\s*·.*$/, '').trim();
    if (!s) return null;
    if (/^(just now|now|moments?|a moment|a few seconds|seconds?|a second)$/.test(s)) return { lo: 0, hi: MIN };
    if (s === 'yesterday') return { lo: DAY, hi: 2 * DAY };
    let mode = 'floor';
    if (/^(over|more than)\s+/.test(s)) { mode = 'over'; s = s.replace(/^(over|more than)\s+/, ''); }
    else if (/^(about|around|almost|nearly|~)\s*/.test(s)) { mode = 'about'; s = s.replace(/^(about|around|almost|nearly|~)\s*/, ''); }
    s = s.replace(/^a (few|couple)( of)?\s+/, '$1 ');
    const m = s.match(/^(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|few|couple)\s*([a-z]+)$/);
    if (!m) return null;
    const n = /^\d+$/.test(m[1]) ? parseInt(m[1], 10) : WORDNUM[m[1]];
    const u = unitMs(m[2]);
    if (!u) return null;
    if (n === 0) return { lo: 0, hi: MIN };
    if (mode === 'over') return { lo: n * u, hi: 2 * n * u };
    if (mode === 'about' || ((m[1] === 'a' || m[1] === 'an') && u === HOUR)) return { lo: Math.round(0.75 * n * u), hi: Math.round(1.5 * n * u) };
    if (m[1] === 'few') return { lo: 2 * u, hi: 5 * u };
    return { lo: n * u, hi: (n + 1) * u };
  }

  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  /** "Oct 12" / "October 12, 2026" -> local-day window. */
  function parseDayWindow(str, now) {
    const m = String(str || '').toLowerCase().match(/([a-z]{3,9})\.?\s+(\d{1,2})(?:,?\s*(\d{4}))?/);
    if (!m) return null;
    const mi = MONTHS.indexOf(m[1].slice(0, 3));
    if (mi < 0) return null;
    const ref = new Date(now);
    let year = m[3] ? parseInt(m[3], 10) : ref.getFullYear();
    let d = new Date(year, mi, parseInt(m[2], 10));
    if (!m[3] && d.getTime() > now + DAY) d = new Date(year - 1, mi, parseInt(m[2], 10));
    const start = d.getTime();
    return { min: start, max: Math.min(start + DAY - 1, now) };
  }

  /** Window of possible listing moments, given capture time and age range. */
  function windowFromAge(capturedAt, age) {
    if (!age) return null;
    return { min: capturedAt - age.hi, max: capturedAt - age.lo };
  }

  /** Narrow a window with a new observation. Each re-paste can tighten precision. */
  function intersectWindows(a, b) {
    if (!a) return { window: b, narrowed: false, conflict: false };
    if (!b) return { window: a, narrowed: false, conflict: false };
    // pad each window 5% so Facebook's rounding can't fake precision at a shared edge
    const pa = (a.max - a.min) * 0.05, pb = (b.max - b.min) * 0.05;
    const min = Math.max(a.min - pa, b.min - pb), max = Math.min(a.max + pa, b.max + pb);
    const exact = a.min === a.max || b.min === b.max;
    if (min < max || (exact && min === max)) {
      const w = { min: Math.max(min, Math.min(a.min, b.min)), max: Math.min(max, Math.max(a.max, b.max)) };
      return { window: w, narrowed: (w.max - w.min) < (a.max - a.min) - 1000, conflict: false };
    }
    return { window: b, narrowed: false, conflict: true }; // relisted or bumped: trust the newest
  }

  /* ---------------- paste parser ---------------- */

  const UI_LINES = new Set([
    'marketplace', 'search marketplace', 'message', 'send', 'send seller a message', 'hi, is this available?', 'is this still available?',
    'hi, is this still available?', 'save', 'saved', 'share', 'more', 'details', 'condition', 'description', 'seller information', 'seller details',
    'location is approximate', 'see all', "today's picks", 'sponsored', 'sell', 'for you', 'local', 'categories', 'inbox', 'notifications', 'menu',
    'home', 'video', 'profile', 'listing details', 'about this item', 'send offer', 'make offer', 'buy now', 'see more', 'see less', 'report listing',
    'similar items', 'related items', 'view listing', 'in stock', 'pickup', 'local pickup', 'shipping', 'delivery', 'free shipping', 'back', 'close',
    'follow', 'following', 'join', 'like', 'comment', 'reply', 'all listings', 'your account', 'your listings', 'facebook', 'marketplace listing',
    'ask for details', 'send message', 'message seller', 'joined facebook', 'seller', 'buyer', 'listings', 'filters', 'search',
  ]);
  const STOP_LINES = /^(seller information|seller details|location is approximate|today's picks|similar items|related items|send seller a message|report listing|sponsored)$/i;
  const PRICE_LINE = /^(?:US)?\$\s?\d[\d,]*(?:\.\d{2})?/;
  const PRICE_ANY = /(?:US)?\$\s?(\d[\d,]*(?:\.\d{2})?)/g;
  const CITY_LINE = /^([A-Z][A-Za-z.'\- ]{1,40}),\s*([A-Z]{2})\b\.?$/;

  function toNum(s) { const n = parseFloat(String(s).replace(/[^\d.]/g, '')); return isFinite(n) ? n : null; }

  function isJunkLine(L) {
    const low = L.toLowerCase().replace(/[·•|]+$/, '').trim();
    if (UI_LINES.has(low)) return true;
    if (/^https?:\/\//i.test(L)) return true;
    if (/^\d{1,2}:\d{2}(\s?[ap]m)?$/i.test(L)) return true;            // status bar clock
    if (/^(\d{1,3}%|lte|5g|4g|wi-?fi|sos)$/i.test(L)) return true;
    if (/^listed\s/i.test(L)) return true;
    if (PRICE_LINE.test(L) || /^free$/i.test(L)) return true;
    const letters = (L.match(/[a-z]/gi) || []).length;
    if (letters < 3 || letters / L.length < 0.45) return true;
    return false;
  }

  /** Pull listing fields out of anything pasted: a link, copied page text, OCR text, a share message. */
  function parseListingText(raw, now = Date.now()) {
    const text = String(raw || '').replace(/\r/g, '').replace(/\u00a0/g, ' ');
    const out = { url: null, fbId: null, title: null, price: null, wasPrice: null, listedWindow: null, listedText: null, place: null, condition: null, description: null, seller: null };
    const urlM = text.match(/https?:\/\/[^\s<>"']+/i);
    if (urlM) out.url = urlM[0].replace(/[).,;]+$/, '');
    const idM = text.match(/marketplace\/item\/(\d{6,})/i);
    if (idM) out.fbId = idM[1];

    const lines = text.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);

    // listed line
    for (let i = 0; i < lines.length; i++) {
      const L = lines[i];
      const lm = L.match(/\blisted\s+(just now|yesterday|today|(?:over |about |more than )?(?:\d+|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|a few)\s*[a-z]+\s+ago|on\s+[a-z]{3,9}\.?\s+\d{1,2}(?:,?\s*\d{4})?|[a-z]{3,9}\.?\s+\d{1,2}(?:,?\s*\d{4})?)(?:\s+in\s+(.+))?$/i);
      if (lm) {
        out.listedText = lm[1];
        const age = parseAge(lm[1]);
        out.listedWindow = age ? windowFromAge(now, age) : parseDayWindow(lm[1].replace(/^on\s+/i, ''), now);
        if (lm[2]) out.place = lm[2].replace(/[·•|].*$/, '').trim();
        break;
      }
    }
    if (!out.listedWindow) {
      for (const L of lines) {
        if (/^(\d+\s*(m|min|mins|minutes?|h|hr|hrs|hours?|d|days?|w|wks?|weeks?)|just now|yesterday)(\s+ago)?$/i.test(L)) {
          const age = parseAge(L);
          if (age) { out.listedText = L; out.listedWindow = windowFromAge(now, age); break; }
        }
      }
    }

    // price (+ crossed-out old price when it dropped)
    let priceIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      const L = lines[i];
      if (/^free$/i.test(L)) { out.price = 0; priceIdx = i; break; }
      if (PRICE_LINE.test(L)) {
        const all = [...L.matchAll(PRICE_ANY)].map(m => toNum(m[1]));
        out.price = all[0];
        if (all.length > 1 && all[1] > all[0]) out.wasPrice = all[1];
        priceIdx = i; break;
      }
    }
    if (out.price == null) {
      const any = [...text.matchAll(PRICE_ANY)];
      if (any.length) out.price = toNum(any[0][1]);
      else if (/\bfree\b/i.test(lines[0] || '')) out.price = 0;
    }

    // title: closest real line above the price line, else first real line
    const candidates = lines.map((L, i) => ({ L, i })).filter(o => !isJunkLine(o.L) && !CITY_LINE.test(o.L) && !/^(new|used|used\s*[-–—]\s*(like new|good|fair))$/i.test(o.L));
    let titleObj = null;
    if (priceIdx > 0) titleObj = [...candidates].reverse().find(o => o.i < priceIdx) || null;
    if (!titleObj) titleObj = candidates[0] || null;
    if (titleObj) {
      let t = titleObj.L.replace(/^(check out|look at) (this|my) .*?(on|in) (facebook )?marketplace:?\s*/i, '');
      t = t.replace(/\s*[-–—|·]\s*\$\s?\d[\d,]*(\.\d{2})?.*$/, '').trim();
      // a share line like "Fender Rumble 100 - $150" also carries the price
      if (out.price == null) { const pm = titleObj.L.match(/\$\s?(\d[\d,]*(?:\.\d{2})?)/); if (pm) out.price = toNum(pm[1]); }
      out.title = t.slice(0, 120) || null;
    }

    if (!out.place) { const c = lines.find(L => CITY_LINE.test(L)); if (c) out.place = c; }

    // condition
    for (let i = 0; i < lines.length; i++) {
      const L = lines[i];
      if (/^condition$/i.test(L) && lines[i + 1]) { out.condition = lines[i + 1]; break; }
      const cm = L.match(/^(?:condition:?\s*)?(new|used\s*[-–—]\s*(?:like new|good|fair)|used)$/i);
      if (cm) { out.condition = cm[1].replace(/\s*[-–—]\s*/, ' - '); break; }
    }

    // description: after "Details"/"Description" until a stop line
    const dIdx = lines.findIndex(L => /^(details|description|about this item)$/i.test(L));
    if (dIdx >= 0) {
      const body = [];
      for (let i = dIdx + 1; i < lines.length; i++) {
        const L = lines[i];
        if (STOP_LINES.test(L)) break;
        if (/^condition$/i.test(L)) { i++; continue; }
        if (out.condition && L === out.condition) continue;
        body.push(L);
      }
      if (body.length) out.description = body.join(' ').slice(0, 900);
    }

    // seller
    const sIdx = lines.findIndex(L => /^seller (information|details)$/i.test(L));
    if (sIdx >= 0) {
      const name = lines.slice(sIdx + 1, sIdx + 4).find(L => /^[A-Z][a-zA-Z'\-]+(?:\s[A-Z][a-zA-Z'\-.]+){0,3}$/.test(L) && !UI_LINES.has(L.toLowerCase()));
      if (name) out.seller = name;
    }
    return out;
  }

  /* ---------------- scam / red flags ---------------- */

  function scamFlags(text, opts = {}) {
    const t = String(text || '').toLowerCase();
    const flags = [];
    const add = (level, id, msg) => { if (!flags.some(f => f.id === id)) flags.push({ level, id, msg }); };
    const payApp = /(zelle|cash ?app|cashapp|venmo|paypal|apple ?pay|chime|gift ?cards?|bitcoin|crypto|usdt)/.test(t);
    if (payApp && /(deposit|upfront|up front|first|before|in advance|to hold|hold it|reserve)/.test(t)) add('high', 'prepay', 'Wants payment before you see the item. Pay only in person.');
    else if (/(gift ?cards?|bitcoin|crypto|usdt)/.test(t)) add('high', 'giftcard', 'Gift card or crypto payment. Real local sellers take cash.');
    if (/(verification code|verify code|google voice|6[- ]?digit code|code (i|we) sent|send (me )?the code)/.test(t)) add('high', 'code', 'Code scam. Never share a code someone texts you.');
    if (/(friends (and|&) family|\bf&f\b|\bf ?and ?f\b)/.test(t)) add('high', 'ff', 'PayPal Friends & Family has no buyer protection.');
    if (/(ship(ping)? only|can only ship|will ship|i('| wi)ll ship|via (fedex|ups|usps|courier)|courier service)/.test(t)) add('med', 'ship', 'Shipping-only on a local listing is a classic scam.');
    if (/(text me|call me|whats ?app|telegram|email me|e-mail me|signal me|my number)/.test(t) || /\(?\b\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/.test(t)) add('med', 'offsite', 'Wants to move off Facebook. Keep the chat in Messenger.');
    if (/(out of town|deployed|military|offshore|moving abroad|overseas|(son|daughter|cousin|brother|sister|husband|wife) will (bring|deliver|drop))/.test(t)) add('med', 'story', 'Away-seller story. Common setup for no-show or prepay scams.');
    if (/(bit\.ly|tinyurl|t\.co\/|click (this|the) link|fill (out )?(this|the) form|insurance link|shipping link)/.test(t)) add('high', 'link', 'Sends a link to "pay" or "insure". Do not open it.');
    if (/(overpaid|overpay|refund the difference|send (you )?(back|more)|extra for (the )?mover)/.test(t)) add('high', 'overpay', 'Overpayment trick. Never send money back.');
    if (opts.maxPay && opts.price != null && opts.price > 0 && opts.price < opts.maxPay * 0.35) add('med', 'cheap', 'Price is far under your max. Inspect it in person before paying.');
    return flags;
  }

  /* ---------------- geo + drive estimates ---------------- */

  function haversineKm(a, b) {
    const R = 6371, toR = Math.PI / 180;
    const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }
  const kmToMi = km => km * 0.621371;

  /** Offline drive estimate: road detour factor + speed by trip length. Returns {durS, distM}. */
  function estimateLeg(a, b) {
    const km = haversineKm(a, b) * 1.32;
    if (km < 0.05) return { durS: 0, distM: 0 };
    const kmh = km < 3 ? 28 : km < 15 ? 45 : 62;
    return { durS: Math.round(km / kmh * 3600 + 90), distM: Math.round(km * 1000) };
  }

  function estimateMatrix(points) {
    const n = points.length, dur = [], dist = [];
    for (let i = 0; i < n; i++) {
      dur.push([]); dist.push([]);
      for (let j = 0; j < n; j++) {
        if (i === j) { dur[i].push(0); dist[i].push(0); continue; }
        const e = estimateLeg(points[i], points[j]);
        dur[i].push(e.durS); dist[i].push(e.distM);
      }
    }
    return { dur, dist, source: 'estimate' };
  }

  /* ---------------- route schedule + optimizer ---------------- */

  /* ctx = { dur, dist, stops:[{appt|null, dwellMin}], hasEnd, earlyMs, graceMs }
     matrix nodes: 0 = start, 1..n = stops, n+1 = end */
  function simulate(order, ctx, departMs) {
    const { dur, dist, stops, hasEnd } = ctx;
    const earlyMs = ctx.earlyMs ?? 5 * MIN, graceMs = ctx.graceMs ?? 5 * MIN;
    let t = departMs, prev = 0, drive = 0, meters = 0, wait = 0, late = 0, lateCount = 0;
    const visits = [];
    for (const k of order) {
      const node = k + 1;
      const legS = dur[prev][node], legM = dist ? dist[prev][node] : null;
      drive += legS * SEC; meters += legM || 0; t += legS * SEC;
      const s = stops[k], arrive = t;
      let w = 0, l = 0;
      if (s.appt != null) {
        const earliest = s.appt - earlyMs;
        if (t < earliest) { w = earliest - t; t = earliest; }
        if (arrive > s.appt + graceMs) { l = arrive - s.appt; lateCount++; }
      }
      wait += w; late += l;
      const dwell = (s.dwellMin ?? 10) * MIN;
      visits.push({ k, arrive, ready: t, wait: w, late: l, leave: t + dwell, legS, legM });
      t += dwell; prev = node;
    }
    let endArrive = null, endLeg = null;
    if (hasEnd) {
      const node = stops.length + 1;
      const legS = dur[prev][node], legM = dist ? dist[prev][node] : null;
      drive += legS * SEC; meters += legM || 0; t += legS * SEC;
      endArrive = t; endLeg = { legS, legM };
    }
    const score = drive / SEC + 0.3 * wait / SEC + 40 * late / SEC + lateCount * 600;
    return { order: order.slice(), depart: departMs, visits, endArrive, endLeg, driveMs: drive, meters, waitMs: wait, lateMs: late, lateCount, finish: t, score };
  }

  /** Departure that removes idle waiting before the first appointment ("leave by"). */
  function simulateAuto(order, ctx, nowMs) {
    let sim = simulate(order, ctx, nowMs);
    const first = sim.visits.find(v => ctx.stops[v.k].appt != null);
    if (first && first.wait > 0) sim = simulate(order, ctx, nowMs + first.wait);
    return sim;
  }

  function permutations(n) {
    const a = [...Array(n).keys()], out = [a.slice()], c = new Array(n).fill(0);
    let i = 0;
    while (i < n) {
      if (c[i] < i) {
        if (i % 2 === 0) [a[0], a[i]] = [a[i], a[0]]; else [a[c[i]], a[i]] = [a[i], a[c[i]]];
        out.push(a.slice()); c[i]++; i = 0;
      } else { c[i] = 0; i++; }
    }
    return out;
  }

  /** Best stop order. Exact for up to 8 stops, greedy + 2-opt beyond. */
  function optimize(ctx, departMs, auto) {
    const n = ctx.stops.length;
    const run = order => (auto ? simulateAuto(order, ctx, departMs) : simulate(order, ctx, departMs));
    if (n === 0) return run([]);
    let best = null;
    if (n <= 8) {
      for (const p of permutations(n)) { const s = run(p); if (!best || s.score < best.score) best = s; }
      return best;
    }
    // greedy: earliest appointment first, then nearest
    const left = new Set([...Array(n).keys()]), order = [];
    let prev = 0;
    while (left.size) {
      let pick = null, pickScore = Infinity;
      for (const k of left) {
        const appt = ctx.stops[k].appt;
        const sc = (appt != null ? appt / 60000 : 1e9) * 0.001 + ctx.dur[prev][k + 1];
        if (sc < pickScore) { pickScore = sc; pick = k; }
      }
      order.push(pick); left.delete(pick); prev = pick + 1;
    }
    best = run(order);
    let improved = true, guard = 0;
    while (improved && guard++ < 60) {
      improved = false;
      for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) {
        const cand = best.order.slice(0, i).concat(best.order.slice(i, j + 1).reverse(), best.order.slice(j + 1));
        const s = run(cand);
        if (s.score < best.score - 1e-6) { best = s; improved = true; }
      }
    }
    return best;
  }

  const roundUpTo = (ms, stepMin) => Math.ceil(ms / (stepMin * MIN)) * stepMin * MIN;

  /** Times to offer sellers, built from the route (arrival rounded up to 5 min). */
  function proposeTimes(order, ctx, departMs) {
    const free = { ...ctx, stops: ctx.stops.map(s => ({ ...s, appt: null })) };
    const sim = simulate(order, free, departMs);
    return sim.visits.map(v => ({ k: v.k, arrive: v.arrive, propose: roundUpTo(v.arrive, 5) }));
  }

  /* ---------------- money ---------------- */

  /** Bills that hand over exact cash without asking for change. */
  function cashBreakdown(amount) {
    let left = Math.ceil(Math.max(0, amount || 0));
    const out = [];
    for (const b of [20, 10, 5, 1]) { const n = Math.floor(left / b); if (n) { out.push({ bill: b, n }); left -= n * b; } }
    return out;
  }
  const billsText = bd => bd.map(x => `${x.n}×$${x.bill}`).join(' + ') || '$0';

  function offerPrice(price, maxPay) {
    if (price == null) return null;
    let o = Math.floor(price * 0.85 / 5) * 5;
    if (maxPay && maxPay < o) o = Math.floor(maxPay / 5) * 5;
    return Math.max(o, price > 0 ? 5 : 0);
  }

  /* ---------------- links ---------------- */

  const ll = p => `${(+p.lat).toFixed(6)},${(+p.lng).toFixed(6)}`;

  /** Google Maps route links. Mobile browsers allow 3 waypoints per link, so long runs split into parts. */
  function googleRouteLinks(points, { originIsHere = false } = {}) {
    const links = [];
    if (points.length < 2) return links;
    const chunk = 4; // origin + 3 waypoints + destination = 5 points, step 4
    for (let s = 0; s < points.length - 1; s += chunk) {
      const seg = points.slice(s, Math.min(points.length, s + chunk + 1));
      const p = new URLSearchParams({ api: '1', travelmode: 'driving' });
      if (!(s === 0 && originIsHere)) p.set('origin', ll(seg[0]));
      p.set('destination', ll(seg[seg.length - 1]));
      const way = seg.slice(1, -1).map(ll);
      if (way.length) p.set('waypoints', way.join('|'));
      if (s === 0 && originIsHere) p.set('dir_action', 'navigate');
      links.push('https://www.google.com/maps/dir/?' + p.toString());
    }
    return links;
  }
  const appleNavUrl = (p, label) => `https://maps.apple.com/?daddr=${encodeURIComponent(ll(p))}&dirflg=d${label ? '&q=' + encodeURIComponent(label) : ''}`;
  const googleNavUrl = p => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ll(p))}&travelmode=driving&dir_action=navigate`;

  /** Facebook Marketplace search, pre-sorted. sortBy: creation_time_descend | distance_ascend | price_ascend | price_descend | best_match */
  function fbSearchUrl(h, citySlug) {
    const slug = String(citySlug || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    const base = 'https://www.facebook.com/marketplace/' + (slug ? slug + '/' : '') + 'search/';
    const p = new URLSearchParams();
    p.set('query', String(h.query || '').trim());
    p.set('sortBy', h.sort || 'creation_time_descend');
    if (h.days) p.set('daysSinceListed', String(h.days));
    if (h.minPrice) p.set('minPrice', String(Math.round(h.minPrice)));
    if (h.maxPrice) p.set('maxPrice', String(Math.round(h.maxPrice)));
    if (h.condition) p.set('itemCondition', h.condition);
    p.set('exact', 'false');
    return base + '?' + p.toString();
  }

  /* ---------------- calendar (.ics) ---------------- */

  const icsDate = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const icsEsc = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  function icsFold(line) {
    const out = []; let cur = line;
    while (cur.length > 74) { out.push(cur.slice(0, 74)); cur = ' ' + cur.slice(74); }
    out.push(cur); return out.join('\r\n');
  }
  /** events: [{uid, start, end, title, location, description, url, alarmMin}] */
  function buildICS(events, now = Date.now()) {
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HAUL//Pickup Planner//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    for (const e of events) {
      L.push('BEGIN:VEVENT', `UID:${e.uid}@haul.app`, `DTSTAMP:${icsDate(now)}`, `DTSTART:${icsDate(e.start)}`, `DTEND:${icsDate(e.end || e.start + 15 * MIN)}`,
        `SUMMARY:${icsEsc(e.title)}`);
      if (e.location) L.push(`LOCATION:${icsEsc(e.location)}`);
      if (e.description) L.push(`DESCRIPTION:${icsEsc(e.description)}`);
      if (e.url) L.push(`URL:${e.url}`);
      if (e.alarmMin) L.push('BEGIN:VALARM', `TRIGGER:-PT${Math.round(e.alarmMin)}M`, 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(e.title)}`, 'END:VALARM');
      L.push('END:VEVENT');
    }
    L.push('END:VCALENDAR');
    return L.map(icsFold).join('\r\n') + '\r\n';
  }

  /* ---------------- import (scraper JSON / CSV) ---------------- */

  function parseCSV(text) {
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (ch !== '\r') cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    if (!rows.length) return [];
    const head = rows[0].map(h => h.trim());
    return rows.slice(1).filter(r => r.some(c => c.trim())).map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
  }

  const pick = (o, paths) => {
    for (const p of paths) {
      const v = p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
      if (v != null && v !== '') return v;
    }
    return null;
  };

  /** Map common scraper outputs (Apify, ScrapeCreators, your own CSV) onto HAUL listings. */
  function importRecords(input, now = Date.now()) {
    let arr = input;
    if (typeof input === 'string') {
      const s = input.trim();
      arr = s.startsWith('[') || s.startsWith('{') ? JSON.parse(s) : parseCSV(s);
    }
    if (!Array.isArray(arr)) arr = arr.listings || arr.items || arr.data || arr.results || [];
    const out = [];
    for (const r of arr) {
      if (!r || typeof r !== 'object') continue;
      const title = pick(r, ['title', 'name', 'marketplace_listing_title', 'listingTitle', 'custom_title', 'Title']);
      if (!title) continue;
      let price = pick(r, ['price', 'listing_price.amount', 'listingPrice.amount', 'priceAmount', 'price.amount', 'formatted_price', 'listing_price.formatted_amount', 'Price']);
      if (typeof price === 'object' && price) price = price.amount ?? price.value ?? null;
      if (typeof price === 'string') price = /free/i.test(price) ? 0 : toNum(price);
      const id = pick(r, ['id', 'listingId', 'listing_id', 'itemId', 'item_id']);
      let url = pick(r, ['url', 'listingUrl', 'listing_url', 'link', 'itemUrl', 'item_url', 'URL']);
      if (!url && id) url = `https://www.facebook.com/marketplace/item/${id}/`;
      let place = pick(r, ['location.reverse_geocode.city_page.display_name', 'locationText', 'location_text', 'city', 'location.city', 'Location']);
      if (!place && typeof r.location === 'string') place = r.location;
      const state = pick(r, ['location.reverse_geocode.state', 'state']);
      if (place && state && !/,/.test(place)) place += ', ' + state;
      const lat = toNum(pick(r, ['latitude', 'lat', 'location.latitude', 'location.lat', 'coordinates.lat']));
      const lng = toNum(pick(r, ['longitude', 'lng', 'lon', 'location.longitude', 'location.lng', 'coordinates.lng']));
      let created = pick(r, ['creation_time', 'creationTime', 'dateListed', 'date_listed', 'listedAt', 'listed_at', 'created_at', 'createdAt', 'timestamp']);
      let listedWindow = null;
      if (created != null) {
        let ms = typeof created === 'number' ? (created < 1e12 ? created * 1000 : created) : Date.parse(created);
        if (isFinite(ms) && ms > 0 && ms <= now + HOUR) listedWindow = { min: ms, max: ms };
      }
      if (!listedWindow) {
        const rel = pick(r, ['listedText', 'listed', 'timeAgo', 'time_ago']);
        const age = rel ? parseAge(rel) : null;
        if (age) listedWindow = windowFromAge(now, age);
      }
      out.push({
        title: String(title).slice(0, 120), price: price == null ? null : +price, url: url || null,
        fbId: id ? String(id) : (url && (String(url).match(/item\/(\d+)/) || [])[1]) || null,
        place: place || null, lat: isFinite(lat) ? lat : null, lng: isFinite(lng) ? lng : null,
        listedWindow, condition: pick(r, ['condition', 'Condition']) || null,
        description: (pick(r, ['description', 'redacted_description.text', 'Description']) || '').toString().slice(0, 900) || null,
      });
    }
    return out;
  }

  /* ---------------- formatting ---------------- */

  const pad2 = n => String(n).padStart(2, '0');
  const fmtClock = ms => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  function dayLabel(ms, now = Date.now()) {
    const d = new Date(ms); d.setHours(0, 0, 0, 0);
    const n = new Date(now); n.setHours(0, 0, 0, 0);
    const diff = Math.round((d - n) / DAY);
    if (diff === 0) return 'Today';
    if (diff === -1) return 'Yesterday';
    if (diff === 1) return 'Tomorrow';
    return new Date(ms).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  }
  const dayKey = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
  function fmtDur(ms) {
    const m = Math.round(Math.abs(ms) / MIN);
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60), r = m % 60;
    return r ? `${h}h ${r}m` : `${h}h`;
  }
  function fmtAge(ms) {
    if (ms < MIN) return 'now';
    if (ms < HOUR) return `${Math.floor(ms / MIN)}m`;
    if (ms < DAY) return `${Math.floor(ms / HOUR)}h`;
    if (ms < WEEK) return `${Math.floor(ms / DAY)}d`;
    return `${Math.floor(ms / WEEK)}w`;
  }
  function fmtErr(ms) {
    if (ms < MIN) return `${Math.max(1, Math.round(ms / SEC))}s`;
    if (ms < HOUR) return `${Math.round(ms / MIN)}m`;
    if (ms < DAY) return `${Math.round(ms / HOUR)}h`;
    return `${Math.round(ms / DAY)}d`;
  }
  /** "2:14 PM ±30m", "Yesterday 9:05 AM ±30m", "Oct 12 ±12h". */
  function fmtListed(win, now = Date.now()) {
    if (!win) return null;
    const mid = (win.min + win.max) / 2, err = (win.max - win.min) / 2;
    const day = dayLabel(mid, now);
    if (err >= 6 * HOUR) return { main: day === 'Today' || day === 'Yesterday' ? day : new Date(mid).toLocaleDateString([], { month: 'short', day: 'numeric' }), err: '±' + fmtErr(err), mid, exact: false };
    const clock = fmtClock(mid);
    return { main: day === 'Today' ? clock : `${day} ${clock}`, err: err <= MIN ? '' : '±' + fmtErr(err), mid, exact: err <= MIN };
  }
  const fmtMoney = n => n == null ? '—' : (n === 0 ? 'Free' : '$' + (Math.round(n) === n ? n.toLocaleString() : n.toFixed(2)));
  const fmtMiles = m => { const mi = kmToMi(m / 1000); return mi < 10 ? mi.toFixed(1) + ' mi' : Math.round(mi) + ' mi'; };
  const toLocalInput = ms => { if (ms == null) return ''; const d = new Date(ms); return `${dayKey(ms)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
  const fromLocalInput = s => { if (!s) return null; const t = new Date(s).getTime(); return isFinite(t) ? t : null; };

  /** Message templates sellers actually answer. */
  function sellerMessages(l, ctx = {}) {
    const title = l.title || 'item';
    const when = l.appt ? `at ${fmtClock(l.appt)}${dayLabel(l.appt) === 'Today' ? ' today' : ' ' + dayLabel(l.appt).toLowerCase()}` : (ctx.when || 'today');
    const offer = offerPrice(l.price, l.maxPay);
    const out = [
      { key: 'avail', label: 'Still available?', text: `Hi! Is the ${title} still available? I can pick up ${when}. Cash ready.` },
    ];
    if (offer != null && l.price > 0 && offer < l.price) out.push({ key: 'offer', label: `Offer $${offer}`, text: `Hi! Would you take $${offer} cash for the ${title}? I can pick up ${when}.` });
    out.push({ key: 'addr', label: 'Ask for address', text: `Sounds good, thanks! Could you send me the pickup address? I'll be there ${when}.` });
    if (ctx.etaMs) out.push({ key: 'otw', label: 'On my way', text: `On my way for the ${title}. ETA about ${fmtClock(ctx.etaMs)}. I'll message when I'm outside.` });
    if (ctx.lateMin > 0) out.push({ key: 'late', label: 'Running late', text: `Sorry, running about ${ctx.lateMin} min late. New ETA ${fmtClock(ctx.etaMs)}. Still good?` });
    out.push({ key: 'here', label: "I'm here", text: `Hi, I'm outside for the ${title}!` });
    return out;
  }

  return {
    SEC, MIN, HOUR, DAY, WEEK, STATUSES, STATUS_IDS, ACTIVE, SIZES, VEHICLES, CATEGORIES,
    guessCategory, parseAge, parseDayWindow, windowFromAge, intersectWindows, parseListingText, scamFlags,
    haversineKm, kmToMi, estimateLeg, estimateMatrix, simulate, simulateAuto, optimize, proposeTimes, roundUpTo, permutations,
    cashBreakdown, billsText, offerPrice, googleRouteLinks, appleNavUrl, googleNavUrl, fbSearchUrl, buildICS, parseCSV, importRecords,
    fmtClock, dayLabel, dayKey, fmtDur, fmtAge, fmtErr, fmtListed, fmtMoney, fmtMiles, toLocalInput, fromLocalInput, sellerMessages,
  };
});
