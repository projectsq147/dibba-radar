/* js/app.js -- Entry point, route picker, module coordination */
(function () {
  'use strict';
  var DR = window.DibbaRadar = window.DibbaRadar || {};

  function init() {
    // Detect standalone PWA mode
    DR.isPWA = window.matchMedia('(display-mode: standalone)').matches ||
               window.navigator.standalone === true;
    if (DR.isPWA) document.body.classList.add('pwa-standalone');

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(function() {});
    }

    // Initialize core modules
    DR.storage.init();
    DR.pins.init();
    DR.settings.init();
    DR.history.init();
    DR.theme.init();
    DR.audio.init();
    DR.speedTrend.init();
    DR.avgSpeedZones.init();
    DR.share.init();

    // Initialize search (for custom routes)
    DR.search.init();

    // Default mode: radar map (show everything, no route needed)
    initRadarMode();
  }

  /** Radar mode: full map with all cameras and colored roads */
  function initRadarMode() {
    // Hide route picker if visible
    var rp = document.getElementById('routePicker');
    if (rp) rp.style.display = 'none';

    // Show map
    var mapEl = document.getElementById('map');
    if (mapEl) mapEl.style.display = 'block';

    // Initialize map module (dark tiles, UAE center)
    DR.mapModule.init();

    // Load and render all cameras + road segments
    DR.radarMap.init(function () {
      // Start passive GPS
      if ('geolocation' in navigator) {
        DR.gps.locatePassive();
      }

      // Show drive button
      var startBtn = document.getElementById('startDriveBtn');
      if (startBtn && 'geolocation' in navigator) {
        startBtn.style.display = 'block';
      }
    });
  }

  /** Show start button if GPS is available, get passive location */
  function checkGPSAvailability() {
    var btn = document.getElementById('startDriveBtn');
    if (!btn) return;
    if ('geolocation' in navigator) {
      // Only show start button if not navigating (dynamic route has its own GO button)
      if (!DR.cameras.isNavigating()) {
        btn.style.display = 'block';
      }
      DR.gps.locatePassive();
    } else {
      btn.style.display = 'none';
    }
  }

  // ---------- Loading overlay helpers ----------

  function showLoading(text) {
    var el = document.getElementById('loadingOverlay');
    var txt = document.getElementById('loadingText');
    if (el && txt) {
      txt.textContent = text;
      el.style.display = 'block';
    }
  }

  function hideLoading() {
    var el = document.getElementById('loadingOverlay');
    if (el) el.style.display = 'none';
  }

  // ========== Global onclick handlers ==========

  // Legend & settings toggles
  window.toggleLegend = function () {
    var el = document.getElementById('legend');
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
  };
  window.toggleSettings = function () {
    var el = document.getElementById('settingsPanel');
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
  };

  // Volume control
  window.setVolume = function (val) {
    var pct = parseInt(val, 10);
    var label = document.getElementById('volumeVal');
    if (label) label.textContent = pct + '%';
    if (DR.audio && DR.audio.setVolume) DR.audio.setVolume(pct / 100);
    try { localStorage.setItem('dr_volume', pct); } catch (e) {}
  };

  // Restore saved volume on init
  (function restoreVolume() {
    try {
      var saved = localStorage.getItem('dr_volume');
      if (saved !== null) {
        var pct = parseInt(saved, 10);
        var slider = document.getElementById('volumeSlider');
        var label = document.getElementById('volumeVal');
        if (slider) slider.value = pct;
        if (label) label.textContent = pct + '%';
        if (DR.audio && DR.audio.setVolume) DR.audio.setVolume(pct / 100);
      }
    } catch (e) {}
  })();

  // Onboarding (first visit only)
  window.dismissOnboarding = function () {
    var el = document.getElementById('onboarding');
    if (el) el.style.display = 'none';
    try { localStorage.setItem('dr_onboarded', '1'); } catch (e) {}
  };

  (function checkOnboarding() {
    try {
      if (!localStorage.getItem('dr_onboarded')) {
        var el = document.getElementById('onboarding');
        if (el) el.style.display = 'flex';
      }
    } catch (e) {}
  })();

  // Legacy map functions (for modules that still reference them)
  window.flipDir = function () { if (DR.mapModule) DR.mapModule.flipDir(); };
  window.toggleAdd = function () { if (DR.mapModule) DR.mapModule.toggleAdd(); };
  window.confirmAdd = function (speed) { if (DR.mapModule) DR.mapModule.confirmAdd(speed); };
  window.cancelAdd = function () { if (DR.mapModule) DR.mapModule.cancelAdd(); };
  window.exportPins = function () { if (DR.mapModule) DR.mapModule.exportPins(); };
  window.fetchWaze = function () { if (DR.waze && DR.mapModule) DR.waze.fetch(DR.mapModule.getWazeLayer()); };
  window.removeCustom = function (lat, lon) { if (DR.mapModule) DR.mapModule.removeCustom(lat, lon); };

  // Driving
  window.startDrive = function () {
    DR.gps.startTracking();
    // Start proximity alerts for all cameras
    if (DR.radarMap) {
      DR.radarMap.startNearbyAlerts();
      DR.radarMap.setDrivingMode(true);
    }
  };

  window.stopDrive = function () {
    DR.gps.stopTracking();
    if (DR.radarMap) {
      DR.radarMap.stopNearbyAlerts();
      DR.radarMap.setDrivingMode(false);
    }
  };

  window.centerOnMe = function () {
    DR.gps.toggleAutoCenter();
  };

  // HUD
  window.hudTap = function (e) {
    if (e.target.tagName === 'BUTTON') return;
    DR.hud.toggle();
  };

  window.hudToMap = function (e) {
    e.stopPropagation();
    DR.hud.hide();
  };

  window.hudStop = function (e) {
    e.stopPropagation();
    DR.gps.stopTracking();
    if (DR.radarMap) DR.radarMap.stopNearbyAlerts();
  };

  // ========== Navigation pipeline ==========

  /** User selected a search result */
  window.searchSelect = function (idx) {
    var dest = DR.search.select(idx);
    if (!dest) return;

    // Get user's current location
    var gpsState = DR.gps.getState();
    var startLat = gpsState.lat;
    var startLon = gpsState.lon;

    if (startLat === null || startLon === null) {
      // No GPS fix -- use a sensible default (Dubai)
      startLat = 25.2048;
      startLon = 55.2708;
    }

    // Clear previous dynamic route
    DR.cameras.clearDynamicRoute();
    DR.mapModule.clearDynamicRoute();
    DR.mapModule.hideRouteInfo();

    showLoading('ROUTING...');

    // Hide START DRIVE button (route info will have GO)
    var startBtn = document.getElementById('startDriveBtn');
    if (startBtn) startBtn.style.display = 'none';

    DR.routing.calculate(startLat, startLon, dest.lat, dest.lon, function (result) {
      if (!result) {
        hideLoading();
        showLoading('ROUTE NOT FOUND');
        setTimeout(hideLoading, 2500);
        if (startBtn) startBtn.style.display = 'block';
        return;
      }

      // Set dynamic route
      DR.cameras.setDynamicRoute(result.routePoints, result.distanceKm, result.durationMin, dest.name);

      // Draw route on map
      DR.mapModule.drawDynamicRoute(result.routePoints);

      // Update map with new route data (no cameras yet)
      DR.mapModule.drawMap();

      // Refresh Waze for new route area
      DR.waze.fetch(DR.mapModule.getWazeLayer());

      showLoading('SCANNING FOR CAMERAS...');

      // Fetch cameras via Overpass API
      DR.cameras.fetchCamerasForRoute(result.routePoints, function (cams) {
        // Redraw map with cameras
        DR.mapModule.drawMap();

        // Show route info bar
        DR.mapModule.showRouteInfo(result.distanceKm, result.durationMin, cams.length);

        hideLoading();
      });
    });
  };

  /** Clear search and revert to default view */
  window.clearSearch = function () {
    DR.search.clear();
    DR.routing.cancel();
    DR.cameras.clearDynamicRoute();
    DR.mapModule.clearDynamicRoute();
    DR.mapModule.hideRouteInfo();
    DR.mapModule.drawMap();
    hideLoading();

    // Show START DRIVE button again
    var startBtn = document.getElementById('startDriveBtn');
    if (startBtn && 'geolocation' in navigator) {
      startBtn.style.display = 'block';
    }
  };

  /** Start navigation (GO button on dynamic route) */
  window.startNavigation = function () {
    // Start GPS tracking (same as startDrive)
    DR.gps.startTracking();
  };

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function (e) {
      console.warn('SW registration failed:', e);
    });
  }

  DR.init = init;
  DR.checkGPSAvailability = checkGPSAvailability;
})();
