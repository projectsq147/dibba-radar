# Dibba Radar -- Project Plan

## Vision
A PWA speed camera companion app for UAE highway driving. Open it, hit drive, and it warns you about every fixed radar on your route. Runs in-browser, no install needed, works offline after first load.

## Architecture

```
dibba-radar/
  index.html              -- Shell, loads app
  manifest.json           -- PWA manifest with icons
  sw.js                   -- Service worker (offline, tile cache)
  css/
    app.css               -- All styles
  js/
    app.js                -- Entry point, router, state
    map.js                -- Leaflet map, layers, rendering
    gps.js                -- Geolocation tracking, speed calc
    cameras.js            -- Camera data management, snapping
    alerts.js             -- Proximity detection, audio/vibration
    waze.js               -- Live Waze alert fetching
    hud.js                -- Heads-up driving display
    pins.js               -- Custom pin management (add/remove/export)
    storage.js            -- LocalStorage + future backend sync
    utils.js              -- Haversine, helpers
  data/
    dubai-dibba.json      -- Route + camera data for this corridor
    e311.json             -- (future) E311 corridor
  assets/
    icon-192.png
    icon-512.png
    alert.mp3             -- Camera approach sound
    alert-close.mp3       -- Close proximity sound
  workers/                -- Cloudflare Workers (phase 2+)
    waze-proxy.js         -- CORS proxy for Waze API
    pins-api.js           -- Community pin storage
```

## Data Model

### Route file (dubai-dibba.json)
```json
{
  "id": "dubai-dibba",
  "name": "Dubai to Dibba Al Hisn",
  "start": { "name": "ENOC Al Awir", "lat": 25.2086, "lon": 55.5549 },
  "end": { "name": "Wave Cafe Dibba", "lat": 25.6211, "lon": 56.2821 },
  "distance_km": 115.84,
  "duration_min": 85,
  "route_ab": [[lat, lon], ...],
  "route_ba": [[lat, lon], ...],
  "cameras": [
    {
      "lat": 25.20898,
      "lon": 55.55117,
      "speed_limit": 120,
      "route_km": 0.3,
      "route_idx": 5,
      "snap_m": 42,
      "source": "osm",
      "direction": "both"
    }
  ],
  "cameras_offroute": [
    { "lat": ..., "lon": ..., "speed_limit": ... }
  ]
}
```

### Custom pins (localStorage -> future backend)
```json
[
  { "lat": 25.55, "lon": 55.99, "speed": "100", "added": "2026-02-13T15:00:00Z", "confirmed": 1 }
]
```

## Phase 1: Driving Companion MVP

### 1A: Project scaffold + map refactor
- [ ] Split current monolith into proper modules
- [ ] Extract route/camera data into JSON
- [ ] Set up proper CSS with variables
- [ ] Build clean map view (current functionality preserved)
- [ ] Service worker for offline (cache HTML, JS, CSS, fonts, tiles)
- [ ] Generate PWA icons
- [ ] Push to GitHub Pages, test on mobile

### 1B: GPS tracking + speed
- [ ] gps.js: Geolocation.watchPosition with high accuracy
- [ ] Calculate speed from position deltas (GPS speed is unreliable at low speeds)
- [ ] Blue dot on map with heading indicator
- [ ] Auto-center map on position (toggle-able)
- [ ] Snap user position to nearest route point
- [ ] Determine driving direction (A->B or B->A) automatically from movement
- [ ] Show "off route" warning if user is >1km from any route point

### 1C: Camera proximity + alerts
- [ ] alerts.js: Calculate distance to next camera AHEAD (based on direction)
- [ ] Also track camera BEHIND (just passed)
- [ ] Alert zones:
  - 1000m: subtle tone + "Camera ahead 1km" on screen
  - 500m: louder tone + distance countdown
  - 200m: urgent tone + vibration
  - 50m: passing camera indicator
- [ ] Show current speed limit based on nearest camera zone
- [ ] Compare user speed vs limit -- red warning if over
- [ ] Audio: Web Audio API oscillator (no MP3 files needed)
  - Low tone (400Hz) for 1km warning
  - Medium tone (600Hz) for 500m
  - High tone (800Hz) for 200m
  - Can upgrade to proper sounds later
- [ ] Vibration API for mobile haptics

### 1D: HUD mode
- [ ] Full-screen driving display, landscape-optimized
- [ ] Big center: current speed (green if OK, red if over limit)
- [ ] Below speed: speed limit of current zone
- [ ] Left: distance to next camera (countdown)
- [ ] Right: current gap status (clean stretch / camera zone)
- [ ] Bottom: mini progress bar showing position on route
- [ ] Very dim UI -- OLED friendly, minimal light at night
- [ ] Tap to toggle between HUD and map view
- [ ] Keep screen awake (Wake Lock API)

### 1E: Waze live integration
- [ ] Fetch on app start + every 5 min
- [ ] Show police/camera/hazard/jam markers
- [ ] Include in proximity alerts (police reports get same alert treatment)
- [ ] CORS issue: initially try direct fetch, fall back to "Waze data unavailable" message
- [ ] Phase 2: Cloudflare Worker proxy solves CORS permanently

## Phase 2: Multi-route + Backend ✅ DONE

- ✅ Route picker (load different JSON files)
- ✅ Dynamic route loading (.js and .json support)
- ✅ Backend integration prep (device UUID, API fallbacks)
- ✅ User sessions (anonymous device ID)
- ✅ Client-side sync preparation for pins
- ✅ Waze proxy support (with direct fallback)
- 🚧 Pin confirmation system (3 reports = confirmed camera) - backend needed
- 🚧 Drive recording (track GPS path, detect camera flashes) - future

## Phase 3: Polish + Scale ✅ DONE

- ✅ Proper audio system using Web Audio API
- ✅ Night/day theme auto-switch based on GPS location
- ✅ Average speed camera zone detection
- ✅ Speed trend graph during HUD mode
- ✅ Drive history & statistics
- ✅ Share route functionality (URL, text, native)
- ✅ Settings panel (units, alert distances, audio, theme)
- ✅ Route picker home screen
- ✅ Smooth transitions and animations
- ✅ Touch target improvements (44px minimum)
- ✅ Better error handling and loading states
- 🚧 More UAE routes: E311, E611, E11, E44, E66, Al Ain road - data needed

## Tech Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Framework | Vanilla JS (modules) | No build step, fast, simple, PWA-native |
| Map | Leaflet | Already using it, lightweight, touch-friendly |
| Tiles | CartoDB dark | Matches aesthetic, free, no API key |
| Routing | OSRM | Free, accurate, no key needed |
| Hosting | GitHub Pages (now), Cloudflare Pages (later) | Free, fast CDN |
| Backend | Cloudflare Workers + D1 | Free tier, edge-deployed, no server |
| Audio | Web Audio API | No files to load, works offline |
| GPS | Geolocation API | Built into all mobile browsers |

## Build Order (Session by Session)

**Session 1 (current or next):** 1A -- scaffold, split files, service worker, deploy
**Session 2:** 1B + 1C -- GPS tracking, camera proximity, audio alerts  
**Session 3:** 1D + 1E -- HUD mode, Waze integration, polish
**Session 4:** Testing on real drive, bug fixes, Phase 2 planning

## Notes

- Q drives this route (Dubai to Dibba Al Hisn) regularly
- Mountain section has poor cell coverage -- offline is critical
- Q caught multiple bugs in the prototype -- expect hands-on QA
- Don't use expensive models for sub-agents on frontend work
- Always test with Playwright before deploying
- Keep the tactical HUD aesthetic (Rajdhani + Share Tech Mono)
