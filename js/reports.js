/* js/reports.js -- Community reports: mobile radar, police, accident, hazard */
(function () {
  'use strict';
  var DR = window.DibbaRadar = window.DibbaRadar || {};

  var reports = [];
  var EXPIRY_MS = 2 * 60 * 60 * 1000; // 2 hours
  var STORAGE_KEY = 'dr_reports';
  var reportSourceId = 'community-reports-source';
  var reportLayerId = 'community-reports-layer';
  var reportLabelLayerId = 'community-reports-label-layer';
  var cleanupInterval = null;
  var alertedReports = {}; // track which reports triggered HUD alert by id

  var REPORT_TYPES = {
    radar: { label: 'Mobile Radar', color: '#ff1744', icon: 'R' },
    police: { label: 'Police', color: '#2196f3', icon: 'P' },
    accident: { label: 'Accident', color: '#ff9800', icon: 'A' },
    hazard: { label: 'Hazard', color: '#ffd600', icon: 'H' }
  };

  function init() {
    loadReports();
    cleanExpired();

    // Render existing reports on map
    if (DR.mapModule && DR.mapModule.isReady()) {
      renderReports();
    } else if (DR.mapModule) {
      DR.mapModule.onReady(renderReports);
    }

    // Periodic cleanup every 5 minutes
    cleanupInterval = setInterval(function () {
      cleanExpired();
      renderReports();
    }, 5 * 60 * 1000);
  }

  function addReport(lat, lon, type) {
    var report = {
      id: Date.now(),
      lat: lat,
      lon: lon,
      type: type,
      time: Date.now()
    };
    reports.push(report);
    saveReports();
    renderReports();
    return report;
  }

  function renderReports() {
    cleanExpired();
    var map = DR.mapModule ? DR.mapModule.getMap() : null;
    if (!map || !DR.mapModule.isReady()) return;

    var features = reports.map(function (r) {
      var rt = REPORT_TYPES[r.type] || REPORT_TYPES.hazard;
      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [r.lon, r.lat]
        },
        properties: {
          id: r.id,
          type: r.type,
          label: rt.icon,
          color: rt.color,
          typeName: rt.label,
          time: r.time
        }
      };
    });

    var geojson = { type: 'FeatureCollection', features: features };

    if (!map.getSource(reportSourceId)) {
      map.addSource(reportSourceId, { type: 'geojson', data: geojson });

      // Pulsing circle layer
      map.addLayer({
        id: reportLayerId,
        type: 'circle',
        source: reportSourceId,
        paint: {
          'circle-radius': 14,
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.35,
          'circle-stroke-width': 2,
          'circle-stroke-color': ['get', 'color'],
          'circle-stroke-opacity': 0.8
        }
      });

      // Icon label layer
      map.addLayer({
        id: reportLabelLayerId,
        type: 'symbol',
        source: reportSourceId,
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 12,
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-allow-overlap': true,
          'text-ignore-placement': true
        },
        paint: {
          'text-color': '#ffffff'
        }
      });

      // Click handler for report markers
      map.on('click', reportLayerId, function (e) {
        var props = e.features[0].properties;
        var coords = e.features[0].geometry.coordinates.slice();
        var age = Date.now() - props.time;
        var minsAgo = Math.round(age / 60000);
        var popupContent = '<b>' + props.typeName + '</b><br>' + minsAgo + ' min ago';
        new maplibregl.Popup({ className: 'radar-popup' })
          .setLngLat(coords)
          .setHTML(popupContent)
          .addTo(map);
      });
    } else {
      map.getSource(reportSourceId).setData(geojson);
    }
  }

  function cleanExpired() {
    var now = Date.now();
    reports = reports.filter(function (r) {
      return (now - r.time) < EXPIRY_MS;
    });
    saveReports();
  }

  function loadReports() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) reports = JSON.parse(raw);
    } catch (e) {
      reports = [];
    }
  }

  function saveReports() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
    } catch (e) { /* storage full or unavailable */ }
  }

  function getReports() {
    cleanExpired();
    return reports;
  }

  /** Get reports within a given radius (km) of lat/lon */
  function getNearbyReports(lat, lon, radiusKm) {
    cleanExpired();
    var nearby = [];
    for (var i = 0; i < reports.length; i++) {
      var r = reports[i];
      var d = quickDist(lat, lon, r.lat, r.lon);
      if (d <= radiusKm) {
        nearby.push({ report: r, dist: d });
      }
    }
    nearby.sort(function (a, b) { return a.dist - b.dist; });
    return nearby;
  }

  /** Check nearby reports during driving and trigger HUD alerts */
  function checkNearbyAlerts(lat, lon) {
    if (!lat || !lon) return;
    var nearby = getNearbyReports(lat, lon, 0.5); // 500m
    for (var i = 0; i < nearby.length; i++) {
      var item = nearby[i];
      var r = item.report;
      if (alertedReports[r.id]) continue;
      alertedReports[r.id] = true;
      var rt = REPORT_TYPES[r.type] || REPORT_TYPES.hazard;
      var distM = Math.round(item.dist * 1000);
      showReportAlert(rt.label + ' reported ' + distM + 'm ahead');
    }
  }

  /** Show a brief alert in the alert banner for community reports */
  function showReportAlert(msg) {
    var banner = document.getElementById('alertBanner');
    if (!banner) return;
    var text = document.getElementById('alertText');
    var limit = document.getElementById('alertLimit');
    if (text) text.textContent = msg;
    if (limit) limit.textContent = '';
    banner.style.display = 'block';
    banner.className = 'alert-banner alert-orange';
    setTimeout(function () {
      banner.className = 'alert-banner';
      banner.style.display = 'none';
    }, 4000);
  }

  /** Reset alerted state (on drive stop) */
  function resetAlerts() {
    alertedReports = {};
  }

  /** Quick distance in km (equirectangular approximation) */
  function quickDist(lat1, lon1, lat2, lon2) {
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var cosLat = Math.cos((lat1 + lat2) / 2 * Math.PI / 180);
    return R * Math.sqrt(dLat * dLat + dLon * dLon * cosLat * cosLat);
  }

  DR.reports = {
    init: init,
    addReport: addReport,
    getReports: getReports,
    getNearbyReports: getNearbyReports,
    checkNearbyAlerts: checkNearbyAlerts,
    resetAlerts: resetAlerts,
    renderReports: renderReports,
    REPORT_TYPES: REPORT_TYPES
  };
})();
