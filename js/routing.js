/* js/routing.js -- OSRM route calculation */
(function () {
  'use strict';
  var DR = window.DibbaRadar = window.DibbaRadar || {};

  var requestId = 0; // cancel stale requests

  /**
   * Calculate a driving route via OSRM.
   * @param {number} startLat
   * @param {number} startLon
   * @param {number} endLat
   * @param {number} endLon
   * @param {function} cb  callback({ routePoints, distanceKm, durationMin }) or null on error
   */
  function calculate(startLat, startLon, endLat, endLon, cb) {
    requestId++;
    var myId = requestId;

    var url = 'https://router.project-osrm.org/route/v1/driving/' +
      startLon.toFixed(6) + ',' + startLat.toFixed(6) + ';' +
      endLon.toFixed(6) + ',' + endLat.toFixed(6) +
      '?overview=full&geometries=geojson&steps=true';

    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (myId !== requestId) return; // stale
        if (!data.routes || data.routes.length === 0) {
          console.warn('OSRM: no route found');
          if (cb) cb(null);
          return;
        }

        var route = data.routes[0];
        var coords = route.geometry.coordinates; // [lon, lat]
        var routePoints = coords.map(function (c) {
          return [c[1], c[0]]; // [lat, lon]
        });

        var distanceKm = route.distance / 1000;
        var durationMin = route.duration / 60;

        if (cb) cb({
          routePoints: routePoints,
          distanceKm: distanceKm,
          durationMin: durationMin
        });
      })
      .catch(function (err) {
        console.error('OSRM routing error:', err);
        if (myId === requestId && cb) cb(null);
      });
  }

  /** Cancel any pending route calculation */
  function cancel() {
    requestId++;
  }

  DR.routing = {
    calculate: calculate,
    cancel: cancel
  };
})();
