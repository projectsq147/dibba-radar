/* js/app.js -- Entry point, initializes everything */
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
    });
  }

  // Expose global functions for onclick handlers in HTML
  window.flipDir = function () { DR.mapModule.flipDir(); };
  window.toggleAdd = function () { DR.mapModule.toggleAdd(); };
  window.confirmAdd = function (speed) { DR.mapModule.confirmAdd(speed); };
  window.cancelAdd = function () { DR.mapModule.cancelAdd(); };
  window.exportPins = function () { DR.mapModule.exportPins(); };
  window.fetchWaze = function () { DR.waze.fetch(DR.mapModule.getWazeLayer()); };
  window.removeCustom = function (lat, lon) { DR.mapModule.removeCustom(lat, lon); };

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
