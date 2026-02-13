/* js/cameras.js -- Camera data loading, route snapping, getAllCams() */
(function () {
  'use strict';
  var DR = window.DibbaRadar = window.DibbaRadar || {};

  var routeData = null;  // loaded JSON
  var cumDist = null;     // cumulative distance array for route_ab

  /** Load route data -- try fetch first, fall back to inline data */
  function loadRouteData(cb) {
    // Check if data was already loaded via script tag
    if (DR._routeData) {
      routeData = DR._routeData;
      cumDist = DR.buildCumDist(routeData.route_ab);
      if (cb) cb(routeData);
      return;
    }

    // Try fetch (works on HTTP, may fail on file://)
    fetch('data/dubai-dibba.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        routeData = data;
        cumDist = DR.buildCumDist(routeData.route_ab);
        if (cb) cb(routeData);
      })
      .catch(function (err) {
        console.error('Failed to load route data:', err);
        // Try XHR as fallback
        var xhr = new XMLHttpRequest();
        xhr.open('GET', 'data/dubai-dibba.json', true);
        xhr.onreadystatechange = function () {
          if (xhr.readyState === 4 && (xhr.status === 200 || xhr.status === 0)) {
            routeData = JSON.parse(xhr.responseText);
            cumDist = DR.buildCumDist(routeData.route_ab);
            if (cb) cb(routeData);
          }
        };
        xhr.send();
      });
  }

  /** Get route data object */
  function getRouteData() { return routeData; }

  /** Get cumulative distance array */
  function getCumDist() { return cumDist; }

  /** Get all cameras (fixed + custom), sorted by route_km */
  function getAllCams() {
    if (!routeData) return [];
    var all = routeData.cameras.map(function (c) {
      return {
        lat: c.lat,
        lon: c.lon,
        snap_lat: c.snap_lat,
        snap_lon: c.snap_lon,
        speed: c.speed_limit,
        route_km: c.route_km,
        route_idx: c.route_idx,
        snap_m: c.snap_m,
        source: 'osm',
        direction: c.direction
      };
    });
    var customs = DR.storage.loadPins();
    customs.forEach(function (c) {
      var s = DR.snapToRoute(c.lat, c.lon, routeData.route_ab, routeData.route_ba, cumDist);
      all.push({
        lat: c.lat,
        lon: c.lon,
        speed: c.speed,
        route_km: s.km,
        route_idx: s.idx,
        snap_m: s.dist,
        source: 'custom'
      });
    });
    all.sort(function (a, b) { return a.route_km - b.route_km; });
    return all;
  }

  /** Get off-route cameras */
  function getOffRouteCams() {
    if (!routeData) return [];
    return routeData.cameras_offroute;
  }

  DR.cameras = {
    load: loadRouteData,
    getRouteData: getRouteData,
    getCumDist: getCumDist,
    getAllCams: getAllCams,
    getOffRouteCams: getOffRouteCams
  };
})();
