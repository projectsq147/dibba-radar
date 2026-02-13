/* js/app.js -- Entry point, initializes everything, wires up driving mode */
(function () {
  'use strict';
  var DR = window.DibbaRadar = window.DibbaRadar || {};

  function init() {
    // Initialize pins from storage
    DR.pins.init();

    // Initialize map
    DR.mapModule.init();

    // Load route data then render
    DR.cameras.load(function (rd) {
      DR.mapModule.drawRoutes(rd);
      DR.mapModule.drawMap();

      // Fetch Waze alerts
      DR.waze.fetch(DR.mapModule.getWazeLayer());
      DR.waze.startAutoRefresh(DR.mapModule.getWazeLayer());

      // Set up GPS drag handler (disables auto-center on manual pan)
      if (DR.gps && DR.gps.setupMapDragHandler) {
        DR.gps.setupMapDragHandler();
      }

      // Check GPS availability, show/hide start button
      checkGPSAvailability();
    });
  }

  /** Check if GPS is available and show start drive button */
  function checkGPSAvailability() {
    var btn = document.getElementById('startDriveBtn');
    if (!btn) return;
    if ('geolocation' in navigator) {
      btn.style.display = 'block';
    } else {
      btn.style.display = 'none';
    }
  }

  // === Global onclick handlers for HTML ===

  // Existing
  window.flipDir = function () { DR.mapModule.flipDir(); };
  window.toggleAdd = function () { DR.mapModule.toggleAdd(); };
  window.confirmAdd = function (speed) { DR.mapModule.confirmAdd(speed); };
  window.cancelAdd = function () { DR.mapModule.cancelAdd(); };
  window.exportPins = function () { DR.mapModule.exportPins(); };
  window.fetchWaze = function () { DR.waze.fetch(DR.mapModule.getWazeLayer()); };
  window.removeCustom = function (lat, lon) { DR.mapModule.removeCustom(lat, lon); };

  // Phase 1B: Driving
  window.startDrive = function () {
    DR.gps.startTracking();
    // Switch to HUD after a brief delay to let GPS acquire
    setTimeout(function () {
      if (DR.gps.isTracking()) {
        DR.hud.show();
      }
    }, 2000);
  };

  window.stopDrive = function () {
    DR.gps.stopTracking();
  };

  window.centerOnMe = function () {
    DR.gps.toggleAutoCenter();
  };

  // Phase 1D: HUD
  window.hudTap = function (e) {
    // Don't toggle if tapping buttons
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
  };

  // Boot on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function (e) {
      console.warn('SW registration failed:', e);
    });
  }

  DR.init = init;
})();
