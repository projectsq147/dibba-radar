/* js/utils.js -- Haversine, snapToRoute, cumulative distance helpers */
(function () {
  'use strict';
  var DR = window.DibbaRadar = window.DibbaRadar || {};

  /** Haversine distance in km between two [lat,lon] arrays */
  function haversine(a, b) {
    var R = 6371;
    var dLat = (b[0] - a[0]) * Math.PI / 180;
    var dLon = (b[1] - a[1]) * Math.PI / 180;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.asin(Math.sqrt(x));
  }

  /** Build cumulative distance array from route points */
  function buildCumDist(route) {
    var cum = [0];
    for (var i = 1; i < route.length; i++) {
      cum.push(cum[i - 1] + haversine(route[i - 1], route[i]));
    }
    return cum;
  }

  /** Snap a lat/lon to the nearest route point.
   *  Returns { idx, km, dist } where dist is in metres. */
  function snapToRoute(lat, lon, routeAB, routeBA, cumDist) {
    var min = Infinity, best = 0;
    for (var i = 0; i < routeAB.length; i++) {
      var d = (routeAB[i][0] - lat) * (routeAB[i][0] - lat) +
        (routeAB[i][1] - lon) * (routeAB[i][1] - lon);
      if (d < min) { min = d; best = i; }
    }
    var minB = Infinity;
    for (var j = 0; j < routeBA.length; j++) {
      var d2 = (routeBA[j][0] - lat) * (routeBA[j][0] - lat) +
        (routeBA[j][1] - lon) * (routeBA[j][1] - lon);
      if (d2 < minB) { minB = d2; }
    }
    return {
      idx: best,
      km: cumDist[best],
      dist: Math.min(Math.sqrt(min), Math.sqrt(minB)) * 111 * 1000
    };
  }

  // Public API
  DR.haversine = haversine;
  DR.buildCumDist = buildCumDist;
  DR.snapToRoute = snapToRoute;
})();
