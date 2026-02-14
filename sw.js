/* sw.js -- Service worker for Dibba Radar PWA */

var CACHE_NAME = 'dibba-radar-v4';

var APP_FILES = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './js/utils.js',
  './js/storage.js',
  './js/settings.js',
  './js/theme.js',
  './js/audio.js',
  './js/cameras.js',
  './js/pins.js',
  './js/waze.js',
  './js/map.js',
  './js/search.js',
  './js/routing.js',
  './js/gps.js',
  './js/alerts.js',
  './js/hud.js',
  './js/speed-limit.js',
  './js/radar-map.js',
  './js/speed-trend.js',
  './data/all-cameras.js',
  './js/avg-speed-zones.js',
  './js/history.js',
  './js/share.js',
  './js/route-picker.js',
  './js/app.js',
  './data/routes-index.json',
  './data/dubai-dibba.json',
  './data/dubai-dibba.js'
];

var CDN_FILES = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&display=swap'
];

// Install: cache app shell + CDN resources
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // Cache app files first (these should always succeed)
      return cache.addAll(APP_FILES).then(function () {
        // Try to cache CDN files, but don't fail install if they're unavailable
        return Promise.all(
          CDN_FILES.map(function (url) {
            return cache.add(url).catch(function () {
              console.warn('SW: Could not cache CDN file:', url);
            });
          })
        );
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names.filter(function (n) { return n !== CACHE_NAME; })
          .map(function (n) { return caches.delete(n); })
      );
    })
  );
  self.clients.claim();
});

// Fetch strategy:
// - Map tiles: cache-first (stale-while-revalidate)
// - Waze API: network-first (fall back to cache)
// - App files / CDN: cache-first (fall back to network)
self.addEventListener('fetch', function (event) {
  var url = event.request.url;

  // Map tiles: cache-first
  if (url.indexOf('basemaps.cartocdn.com') >= 0 || url.indexOf('tile.openstreetmap.org') >= 0) {
    event.respondWith(
      caches.open(CACHE_NAME).then(function (cache) {
        return cache.match(event.request).then(function (cached) {
          if (cached) return cached;
          return fetch(event.request).then(function (response) {
            if (response.ok) {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(function () {
            return new Response('', { status: 408 });
          });
        });
      })
    );
    return;
  }

  // Waze API: network-first
  if (url.indexOf('waze.com') >= 0) {
    event.respondWith(
      fetch(event.request).then(function (response) {
        if (response.ok) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(function () {
        return caches.match(event.request).then(function (cached) {
          return cached || new Response('{"alerts":[]}', {
            headers: { 'Content-Type': 'application/json' }
          });
        });
      })
    );
    return;
  }

  // Google Fonts: cache-first
  if (url.indexOf('fonts.googleapis.com') >= 0 || url.indexOf('fonts.gstatic.com') >= 0) {
    event.respondWith(
      caches.open(CACHE_NAME).then(function (cache) {
        return cache.match(event.request).then(function (cached) {
          if (cached) return cached;
          return fetch(event.request).then(function (response) {
            if (response.ok) {
              cache.put(event.request, response.clone());
            }
            return response;
          });
        });
      })
    );
    return;
  }

  // Everything else (app files, CDN): cache-first
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) return cached;
      return fetch(event.request).then(function (response) {
        if (response.ok && event.request.method === 'GET') {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      });
    })
  );
});
