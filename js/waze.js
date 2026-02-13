/* js/waze.js -- Live Waze alert fetching */
(function () {
  'use strict';
  var DR = window.DibbaRadar = window.DibbaRadar || {};

  var wazeAlerts = [];
  var wazeTimer = null;

  function getAlerts() { return wazeAlerts; }

  /** Fetch live Waze alerts for all route chunks */
  function fetchWaze(wazeLayer, cb) {
    var rd = DR.cameras.getRouteData();
    if (!rd) { if (cb) cb([]); return; }

    var chunks = rd.waze_chunks;
    var st = document.getElementById('wazeStatus');
    var tx = document.getElementById('wazeText');
    if (tx) tx.textContent = 'WAZE: FETCHING...';

    if (wazeLayer) wazeLayer.clearLayers();
    wazeAlerts = [];
    var seen = {};
    var pending = chunks.length;
    var done = 0;

    chunks.forEach(function (chunk) {
      var bMin = chunk[0], bMax = chunk[1], lMin = chunk[2], lMax = chunk[3];
      var url = 'https://www.waze.com/live-map/api/georss?top=' + bMax +
        '&bottom=' + bMin + '&left=' + lMin + '&right=' + lMax +
        '&env=row&types=alerts';
      fetch(url, { headers: { 'referer': 'https://www.waze.com/live-map/' } })
        .then(function (r) { return r.ok ? r.json() : { alerts: [] }; })
        .then(function (d) {
          (d.alerts || []).forEach(function (a) {
            var u = a.uuid || '';
            if (!seen[u]) { seen[u] = true; wazeAlerts.push(a); }
          });
        })
        .catch(function () { })
        .finally(function () {
          done++;
          if (done >= pending) {
            drawWazeAlerts(wazeLayer);
            if (cb) cb(wazeAlerts);
          }
        });
    });
  }

  /** Draw Waze alerts on the map layer */
  function drawWazeAlerts(wazeLayer) {
    if (!wazeLayer) return;
    var police = 0, hazards = 0, jams = 0, closures = 0;

    wazeAlerts.forEach(function (a) {
      var lat = a.location.y, lon = a.location.x;
      var t = a.type || '', s = a.subtype || '';
      var col, icon, label;

      if (t === 'POLICE') {
        col = '#ff3b3b'; icon = 'P'; label = 'POLICE'; police++;
      } else if (s.indexOf('CAMERA') >= 0) {
        col = '#ff3b3b'; icon = 'C'; label = 'MOBILE CAM'; police++;
      } else if (t === 'HAZARD') {
        col = '#ffc107'; icon = '!';
        label = 'HAZARD: ' + s.replace('HAZARD_', '').replace(/_/g, ' ').toLowerCase();
        hazards++;
      } else if (t === 'JAM') {
        col = '#ff8c00'; icon = 'J';
        label = 'TRAFFIC: ' + s.replace('JAM_', '').replace(/_/g, ' ').toLowerCase();
        jams++;
      } else if (t === 'ROAD_CLOSED') {
        col = '#9c27b0'; icon = 'X'; label = 'ROAD CLOSED'; closures++;
      } else {
        col = '#888'; icon = '?'; label = t + '/' + s;
      }

      var mk = L.circleMarker([lat, lon], {
        radius: 5, fillColor: col, fillOpacity: 0.7,
        color: col, weight: 1.5, opacity: 0.5
      }).addTo(wazeLayer);
      L.circleMarker([lat, lon], {
        radius: 12, fillColor: col, fillOpacity: 0.08, stroke: false
      }).addTo(wazeLayer);
      mk.bindPopup(
        '<div class="pt" style="color:' + col + '">' + label.toUpperCase() + '</div>' +
        '<div class="pc">' + (a.street || '') + '</div>' +
        '<div class="pc">' + lat.toFixed(5) + ', ' + lon.toFixed(5) + '</div>' +
        '<div style="margin-top:4px;font-size:10px;color:var(--muted)">Live Waze report</div>'
      );
    });

    // Update status bar
    var now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    var parts = [];
    if (police) parts.push(police + ' police');
    if (hazards) parts.push(hazards + ' hazard');
    if (jams) parts.push(jams + ' jam');
    if (closures) parts.push(closures + ' closed');

    var tx = document.getElementById('wazeText');
    var st = document.getElementById('wazeStatus');
    if (tx) tx.textContent = 'WAZE: ' + (parts.length ? parts.join(' / ') : 'CLEAR') + ' @ ' + now;
    if (st) st.className = police ? 'has-alerts' : '';
  }

  /** Start auto-refresh timer (every 5 min) */
  function startAutoRefresh(wazeLayer) {
    if (wazeTimer) clearInterval(wazeTimer);
    wazeTimer = setInterval(function () { fetchWaze(wazeLayer); }, 300000);
  }

  DR.waze = {
    fetch: fetchWaze,
    getAlerts: getAlerts,
    startAutoRefresh: startAutoRefresh
  };
})();
