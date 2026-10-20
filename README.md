# HAUL — Marketplace pickup planner

Free iPhone web app. Capture Facebook Marketplace listings, sort them by the minute they were listed, see them on a live map, and build a timed pickup route.

No App Store. No Facebook login. No API keys. Data stays on your phone.

---

## 1 · Put it online (free, one time, ~10 min)

GPS and offline mode need an `https://` address. Pick one option.

### Option A — GitHub Pages (works from your iPhone)

1. Tap `haul-app.zip` in the **Files** app. It unzips into a `haul` folder.
2. Go to **github.com** and sign in (free account).
3. Tap **+** › **New repository**. Name it `haul`. Set it to **Public**. Tap **Create repository**.
4. Tap **uploading an existing file**. Select **all files inside** the `haul` folder. Tap **Commit changes**.
5. Open the repo **Settings** › **Pages**. Source: **Deploy from a branch**. Branch: **main**, folder **/ (root)**. Tap **Save**.
6. Wait 1–2 minutes. Your app lives at `https://YOUR-USERNAME.github.io/haul/`

### Option B — Netlify Drop (from a computer, 1 min)

1. Unzip `haul-app.zip`.
2. Open **app.netlify.com/drop** and drag the `haul` folder onto the page.
3. Make a free account so the site stays up. Copy the link.

## 2 · Install on iPhone

1. Open your link in **Safari**.
2. Tap **Share** › **Add to Home Screen** › **Add**.
3. Open HAUL from the home screen. Allow **Location** when asked.

Installed apps keep their data. Plain Safari tabs can lose it after a week of no use.

---

## 3 · Set up live listings (5 min, once)

**Facebook pings you (free, official):**
1. In HAUL, open **Hunt** and add your searches.
2. Tap **Check now**. Facebook opens that search, newest first.
3. Tap the **bell** next to Filters › **Create Alert**. Repeat for each hunt.

**HAUL Grab shortcut (one gesture captures a listing):**
1. Open the **Shortcuts** app › **+** › name it `HAUL Grab`.
2. Add 4 actions in this order:
   `Take Screenshot` › `Extract Text from Image` › `Copy to Clipboard` › `Show Notification` ("Listing copied")
3. **Settings** › **Accessibility** › **Touch** › **Back Tap** › **Double Tap** › pick **HAUL Grab**.
4. Try it on a listing. Allow the screenshot when asked.

---

## The loop (about 20 seconds per listing)

| Step | Do this |
|---|---|
| 1 | Facebook pings you. Open the listing. |
| 2 | **Double-tap the back of your iPhone.** |
| 3 | Open HAUL › tap yellow **+** › tap **Paste** if asked. It saves itself, sorted by listed time. |
| 4 | Tap **Message** › pick a message › paste it in Messenger. |
| 5 | Seller says yes › set the pickup time › tap **Confirmed**. |
| 6 | **Run** › **Plan best route** › **Start run** › **Apple Maps**. |

```
FB ping ─▶ listing ─▶ double-tap back ─▶ HAUL + (auto-saved)
   ─▶ Message ─▶ Confirmed + time ─▶ RUN ─▶ leave-by time ─▶ drive
```

Grab the same listing again later and HAUL updates it: the listed time gets sharper and price drops are logged.

## Free services it uses

| Part | Service | Limit |
|---|---|---|
| Map tiles | OpenStreetMap data, CARTO tiles | Fair use, personal |
| Drive times + routes | OSRM (routing.openstreetmap.de) | About 1 request per second |
| Address search | Nominatim | 1 request per second |
| Screenshot reading | Tesseract.js, runs on the phone | First use downloads ~10 MB |

If routing is down or you're offline, HAUL falls back to estimated drive times.

## About Facebook data

- Facebook has **no free public API** for Marketplace listings. Its official Marketplace data access (Meta Content Library) is for approved researchers only.
- HAUL never logs into Facebook, so your account is not at risk.
- Paid scraper services exist. They are unofficial and against Facebook's terms. If you use one, export **JSON or CSV** and load it with **Settings › Import file**. Exact listing timestamps come through.

## Files

| File | What it is |
|---|---|
| `index.html` | App shell |
| `app.js` | Screens, map, routing, live run |
| `core.js` | Parsing, time windows, route optimizer, scam check |
| `app.css` | Look and layout |
| `sw.js` | Offline support, map tile cache |
| `manifest.webmanifest`, `icon-*.png` | Home screen install |
| `leaflet.*`, `*.woff2` | Map library and fonts, bundled for offline |

## Updating

Change files, raise `VERSION` in `sw.js` (for example `haul-1.0.1`), upload again. The app updates the next time it opens online.
