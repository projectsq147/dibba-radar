/* js/cameras.js -- Camera data loading, route snapping, dynamic route support, Overpass API */
(function () {
  'use strict';
  var DR = window.DibbaRadar = window.DibbaRadar || {};

  // Pre-baked Dubai-Dibba data
  var routeData = null;
  var cumDist = null;

  // Dynamic route data (from search + OSRM)
  var dynRoute = null;
  var dynCumDist = null;
  var dynCams = [];
  var navigating = false;

  // ---------- Pre-baked data loading (unchanged) ----------

  function loadRouteData(cb) {
    if (DR._routeData) {
      routeData = DR._routeData;
      cumDist = DR.buildCumDist(routeData.route_ab);
      if (cb) cb(routeData);
      return;
    }

    fetch('data/dubai-dibba.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        routeData = data;
        cumDist = DR.buildCumDist(routeData.route_ab);
        if (cb) cb(routeData);
      })
      .catch(function (err) {
        console.error('Failed to load route data:', err);
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

  // ---------- Dynamic route management ----------

  function isNavigating() { return navigating; }

  /** Set a dynamic route from OSRM results */
  function setDynamicRoute(routePoints, distanceKm, durationMin, destName) {
    var reversed = routePoints.slice().reverse();
    dynCumDist = DR.buildCumDist(routePoints);

    dynRoute = {
      id: 'dynamic',
      name: destName || 'Custom Route',
      start: {
        name: 'Your Location',
        lat: routePoints[0][0],
        lon: routePoints[0][1]
      },
      end: {
        name: destName || 'Destination',
        lat: routePoints[routePoints.length - 1][0],
        lon: routePoints[routePoints.length - 1][1]
      },
      distance_km: distanceKm,
      duration_min: durationMin,
      route_ab: routePoints,
      route_ba: reversed,
      cameras: [],
      cameras_offroute: [],
      waze_chunks: generateWazeChunks(routePoints)
    };
    dynCams = [];
    navigating = true;
  }

  /** Clear dynamic route, revert to pre-baked */
  function clearDynamicRoute() {
    dynRoute = null;
    dynCumDist = null;
    dynCams = [];
    navigating = false;
  }

  /** Generate Waze API chunks from route points */
  function generateWazeChunks(routePoints) {
    var minLat = Infinity, maxLat = -Infinity;
    var minLon = Infinity, maxLon = -Infinity;

    routePoints.forEach(function (p) {
      if (p[0] < minLat) minLat = p[0];
      if (p[0] > maxLat) maxLat = p[0];
      if (p[1] < minLon) minLon = p[1];
      if (p[1] > maxLon) maxLon = p[1];
    });

    minLat -= 0.02;
    maxLat += 0.02;
    minLon -= 0.02;
    maxLon += 0.02;

    var chunks = [];
    var step = 0.12;
    var overlap = 0.02;

    for (var lat = minLat; lat < maxLat; lat += step - overlap) {
      for (var lon = minLon; lon < maxLon; lon += step - overlap) {
        chunks.push([
          lat,
          Math.min(lat + step, maxLat + 0.01),
          lon,
          Math.min(lon + step, maxLon + 0.01)
        ]);
      }
    }
    return chunks;
  }

  // ---------- Overpass API camera fetching ----------

  /** Fetch speed cameras along a route corridor from Overpass API */
  function fetchCamerasForRoute(routePoints, cb) {
    if (!routePoints || routePoints.length < 2) {
      if (cb) cb([]);
      return;
    }

    // Bounding box with ~1km padding
    var minLat = Infinity, maxLat = -Infinity;
    var minLon = Infinity, maxLon = -Infinity;

    routePoints.forEach(function (p) {
      if (p[0] < minLat) minLat = p[0];
      if (p[0] > maxLat) maxLat = p[0];
      if (p[1] < minLon) minLon = p[1];
      if (p[1] > maxLon) maxLon = p[1];
    });

    var pad = 0.01; // ~1.1km
    minLat -= pad;
    maxLat += pad;
    minLon -= pad;
    maxLon += pad;

    // Split large areas into chunks
    var bboxes = [];
    var maxSpan = 0.5;

    if ((maxLat - minLat) <= maxSpan && (maxLon - minLon) <= maxSpan) {
      bboxes.push([minLat, minLon, maxLat, maxLon]);
    } else {
      var latStep = maxSpan - 0.02;
      var lonStep = maxSpan - 0.02;
      for (var la = minLat; la < maxLat; la += latStep) {
        for (var lo = minLon; lo < maxLon; lo += lonStep) {
          bboxes.push([
            la, lo,
            Math.min(la + maxSpan, maxLat),
            Math.min(lo + maxSpan, maxLon)
          ]);
        }
      }
    }

    var allNodes = [];
    var seenIds = {};
    var pending = bboxes.length;
    var done = 0;

    bboxes.forEach(function (bbox) {
      var query = '[out:json][timeout:30];node["highway"="speed_camera"](' +
        bbox[0].toFixed(4) + ',' + bbox[1].toFixed(4) + ',' +
        bbox[2].toFixed(4) + ',' + bbox[3].toFixed(4) +
        ');out body;';

      var url = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query);

      fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          (data.elements || []).forEach(function (node) {
            if (!seenIds[node.id]) {
              seenIds[node.id] = true;
              allNodes.push(node);
            }
          });
        })
        .catch(function (err) {
          console.warn('Overpass query error:', err);
        })
        .finally(function () {
          done++;
          if (done >= pending) {
            processCameras(allNodes, routePoints, cb);
          }
        });
    });
  }

  /** Process Overpass nodes: snap to route, filter, sort */
  function processCameras(nodes, routePoints, cb) {
    if (!dynRoute || !dynCumDist) {
      if (cb) cb([]);
      return;
    }

    var cams = [];

    nodes.forEach(function (node) {
      var lat = node.lat;
      var lon = node.lon;
      var tags = node.tags || {};

      var snap = DR.snapToRoute(lat, lon, dynRoute.route_ab, dynRoute.route_ba, dynCumDist);

      // Only keep cameras within 750m of route
      if (snap.dist > 750) return;

      // Parse speed limit from tags
      var speedLimit = tags.maxspeed || tags['maxspeed:forward'] || '?';
      if (typeof speedLimit === 'string') {
        var num = speedLimit.match(/\d+/);
        speedLimit = num ? num[0] : '?';
      }

      cams.push({
        lat: lat,
        lon: lon,
        speed: speedLimit,
        speed_limit: speedLimit,
        route_km: snap.km,
        route_idx: snap.idx,
        snap_m: snap.dist,
        source: 'osm',
        direction: tags.direction || 'both',
        osm_id: node.id
      });
    });

    cams.sort(function (a, b) { return a.route_km - b.route_km; });

    dynCams = cams;

    // Update dynRoute cameras for consistency
    dynRoute.cameras = cams.map(function (c) {
      return {
        lat: c.lat,
        lon: c.lon,
        speed_limit: c.speed,
        route_km: c.route_km,
        route_idx: c.route_idx,
        snap_m: c.snap_m,
        source: c.source,
        direction: c.direction
      };
    });

    if (cb) cb(cams);
  }

  // ---------- Data accessors ----------

  /** Get active route data (dynamic when navigating, else pre-baked) */
  function getRouteData() {
    return (navigating && dynRoute) ? dynRoute : routeData;
  }

  /** Get pre-baked route data (always available) */
  function getPrebakedRouteData() { return routeData; }

  /** Get cumulative distance array for active route */
  function getCumDist() {
    return (navigating && dynCumDist) ? dynCumDist : cumDist;
  }

  function getPrebakedCumDist() { return cumDist; }

  /** Get all cameras for the active route, sorted by route_km */
  function getAllCams() {
    if (navigating && dynRoute) {
      var all = dynCams.map(function (c) {
        return {
          lat: c.lat,
          lon: c.lon,
          speed: c.speed,
          route_km: c.route_km,
          route_idx: c.route_idx,
          snap_m: c.snap_m,
          source: c.source,
          direction: c.direction
        };
      });

      // Add custom pins within 750m of dynamic route
      var customs = DR.storage.loadPins();
      customs.forEach(function (c) {
        var s = DR.snapToRoute(c.lat, c.lon, dynRoute.route_ab, dynRoute.route_ba, dynCumDist);
        if (s.dist < 750) {
          all.push({
            lat: c.lat,
            lon: c.lon,
            speed: c.speed,
            route_km: s.km,
            route_idx: s.idx,
            snap_m: s.dist,
            source: 'custom'
          });
        }
      });

      all.sort(function (a, b) { return a.route_km - b.route_km; });
      return all;
    }

    // Original pre-baked logic
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
    if (navigating) return [];
    if (!routeData) return [];
    return routeData.cameras_offroute || [];
  }

  DR.cameras = {
    load: loadRouteData,
    getRouteData: getRouteData,
    getPrebakedRouteData: getPrebakedRouteData,
    getPrebakedCumDist: getPrebakedCumDist,
    getCumDist: getCumDist,
    getAllCams: getAllCams,
    getOffRouteCams: getOffRouteCams,
    setDynamicRoute: setDynamicRoute,
    clearDynamicRoute: clearDynamicRoute,
    fetchCamerasForRoute: fetchCamerasForRoute,
    isNavigating: isNavigating
  };
})();
