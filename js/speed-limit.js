/* js/speed-limit.js -- Road speed limit zones & Waze-style limit badge */
(function () {
  'use strict';
  var DR = window.DibbaRadar = window.DibbaRadar || {};

  /* Default limits by route (km/h) */
  var ROUTE_DEFAULTS = {
    'dubai-dibba': 120,
    'e311-mbz': 120,
    'e66-alain': 120,
    'e44-hatta': 120,
    'e66-kalba': 120,
    'e611-emirates': 120,
    'e11-coastal': 120
  };

  var zones = [];        // [{start_km, end_km, limit}]
  var currentLimit = null;
  var routeDefault = 120;

  /** Build speed limit zones from camera data */
  function buildZones(cameras, routeId, totalKm) {
    zones = [];
    routeDefault = ROUTE_DEFAULTS[routeId] || 120;

    if (!cameras || !cameras.length) {
      zones.push({ start_km: 0, end_km: totalKm || 999, limit: routeDefault });
      return;
    }

    // Sort cameras by route_km
    var sorted = cameras.slice().sort(function (a, b) {
      return (a.route_km || 0) - (b.route_km || 0);
    });

    // Extract cameras with known speed limits
    var known = [];
    for (var i = 0; i < sorted.length; i++) {
      var sl = sorted[i].speed_limit;
      if (sl && sl !== '?' && sl !== 'unknown') {
        var parsed = parseInt(sl, 10);
        if (parsed > 10 && parsed <= 160) { // sanity check
          known.push({ km: sorted[i].route_km || 0, limit: parsed });
        }
      }
    }

    if (known.length === 0) {
      zones.push({ start_km: 0, end_km: totalKm || 999, limit: routeDefault });
      return;
    }

    // Build zones: before first known, use route default
    if (known[0].km > 0) {
      zones.push({ start_km: 0, end_km: known[0].km, limit: routeDefault });
    }

    // Between known cameras, carry forward limit
    for (var j = 0; j < known.length; j++) {
      var endKm = (j + 1 < known.length) ? known[j + 1].km : (totalKm || 999);
      zones.push({ start_km: known[j].km, end_km: endKm, limit: known[j].limit });
    }
  }

  /** Look up speed limit at a given route km */
  function getLimitAtKm(km) {
    if (!zones.length) return routeDefault;
    for (var i = zones.length - 1; i >= 0; i--) {
      if (km >= zones[i].start_km) return zones[i].limit;
    }
    return zones[0] ? zones[0].limit : routeDefault;
  }

  /** Update the displayed limit badge based on current position */
  function update(routeKm) {
    var limit = getLimitAtKm(routeKm);
    currentLimit = limit;
    renderBadge(limit);
    return limit;
  }

  /** Render the Waze-style limit badge */
  function renderBadge(limit) {
    // Map view badge
    var mapBadge = document.getElementById('speedLimitBadge');
    if (mapBadge) {
      if (limit) {
        mapBadge.textContent = limit;
        mapBadge.style.display = 'flex';
      } else {
        mapBadge.style.display = 'none';
      }
    }

    // HUD badge
    var hudBadge = document.getElementById('hudLimitBadge');
    if (hudBadge) {
      if (limit) {
        hudBadge.textContent = limit;
        hudBadge.style.display = 'flex';
      } else {
        hudBadge.style.display = 'none';
      }
    }

    // Update limit text in HUD (legacy element)
    var hudLimitText = document.getElementById('hudLimit');
    if (hudLimitText) {
      hudLimitText.textContent = ''; // we use the badge now
    }
  }

  /** Get current limit */
  function getCurrentLimit() { return currentLimit; }

  /** Get the route default */
  function getRouteDefault() { return routeDefault; }

  DR.speedLimit = {
    buildZones: buildZones,
    getLimitAtKm: getLimitAtKm,
    update: update,
    getCurrentLimit: getCurrentLimit,
    getRouteDefault: getRouteDefault
  };
})();
