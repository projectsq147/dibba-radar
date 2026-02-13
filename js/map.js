/* js/map.js -- Leaflet map setup, layer rendering, gap drawing, camera markers */
(function () {
  'use strict';
  var DR = window.DibbaRadar = window.DibbaRadar || {};

  var map, routeLayerAB, routeLayerBA;
  var gapLayer, camLayer, labelLayer, wazeLayer;
  var direction = 'ab'; // ab = Dubai->Dibba, ba = Dibba->Dubai
  var adding = false;
  var pendingLatLng = null;
  var _tmpMarker = null;

  function initMap() {
    map = L.map('map', {
      center: [25.42, 55.9],
      zoom: 10,
      zoomControl: true,
      attributionControl: false
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19
    }).addTo(map);

    gapLayer = L.layerGroup().addTo(map);
    camLayer = L.layerGroup().addTo(map);
    labelLayer = L.layerGroup().addTo(map);
    wazeLayer = L.layerGroup().addTo(map);

    // Map click handler for adding custom pins
    map.on('click', function (e) {
      if (!adding) return;
      pendingLatLng = e.latlng;
      document.getElementById('speedPicker').style.display = 'block';
      document.getElementById('overlay').style.display = 'block';
      setTimeout(function () {
        document.getElementById('speedPicker').classList.add('show');
      }, 10);
      if (_tmpMarker) map.removeLayer(_tmpMarker);
      _tmpMarker = L.circleMarker([e.latlng.lat, e.latlng.lng], {
        radius: 10, fillColor: '#00e5ff', fillOpacity: 0.5,
        color: '#fff', weight: 2
      }).addTo(map);
    });

    return map;
  }

  function getMap() { return map; }
  function getWazeLayer() { return wazeLayer; }
  function getDirection() { return direction; }

  /** Draw route polylines once data is loaded */
  function drawRoutes(rd) {
    routeLayerAB = L.polyline(rd.route_ab, {
      color: '#0a2a1a', weight: 4, opacity: 0.5
    }).addTo(map);
    routeLayerBA = L.polyline(rd.route_ba, {
      color: '#0a2a1a', weight: 3, opacity: 0.25
    }).addTo(map);
    // Fit bounds to route
    map.fitBounds(rd.route_ab.map(function (p) { return [p[0], p[1]]; }), {
      padding: [80, 20]
    });
  }

  /** Main draw function: gaps, cameras, density bar, etc. */
  function drawMap() {
    var rd = DR.cameras.getRouteData();
    if (!rd) return;
    var TK = rd.distance_km;
    var R = rd.route_ab;

    gapLayer.clearLayers();
    camLayer.clearLayers();
    labelLayer.clearLayers();

    var all = DR.cameras.getAllCams();
    document.getElementById('camCount').textContent = all.length;

    // Highlight active route direction
    if (routeLayerAB && routeLayerBA) {
      if (direction === 'ab') {
        routeLayerAB.setStyle({ opacity: 0.5, weight: 4 });
        routeLayerBA.setStyle({ opacity: 0.15, weight: 2 });
      } else {
        routeLayerBA.setStyle({ opacity: 0.5, weight: 4 });
        routeLayerAB.setStyle({ opacity: 0.15, weight: 2 });
      }
    }

    // Calculate gaps
    var pts = [{ route_km: 0, route_idx: 0 }]
      .concat(all)
      .concat([{ route_km: TK, route_idx: R.length - 1 }]);
    var maxG = 0;

    for (var i = 1; i < pts.length; i++) {
      var p = pts[i - 1], c = pts[i];
      var g = c.route_km - p.route_km;
      if (g > maxG) maxG = g;

      var si = p.route_idx || 0, ei = c.route_idx || 0;
      if (si > ei) { var tmp = si; si = ei; ei = tmp; }
      var seg = R.slice(si, ei + 1);
      if (seg.length < 2) continue;

      var col, w, da, op;
      if (g >= 5) { col = '#00ff88'; w = 5; da = null; op = 0.7; }
      else if (g >= 3) { col = '#4ade80'; w = 4; da = null; op = 0.55; }
      else if (g >= 1) { col = '#ff8c00'; w = 3; da = '10,6'; op = 0.45; }
      else { col = '#ff3b3b'; w = 3; da = '5,5'; op = 0.4; }

      var line = L.polyline(seg, {
        color: col, weight: w, opacity: op, dashArray: da
      }).addTo(gapLayer);
      line.bindPopup('<div class="pt"><span class="pg">' + g.toFixed(1) + ' km</span> gap</div>');

      // Gap labels for >3km
      if (g >= 3) {
        var mi = Math.floor((si + ei) / 2), mp = R[mi];
        if (mp) {
          L.marker(mp, {
            icon: L.divIcon({
              className: '',
              html: '<div style="font-family:Share Tech Mono,monospace;background:rgba(6,10,15,0.88);color:' +
                (g >= 5 ? '#00ff88' : '#4ade80') +
                ';padding:2px 8px;border-radius:20px;font-size:' +
                (g >= 10 ? '12' : '10') +
                'px;font-weight:600;white-space:nowrap;border:1px solid ' +
                (g >= 5 ? 'rgba(0,255,136,0.25)' : 'rgba(74,222,128,0.18)') +
                ';letter-spacing:0.5px;">' + g.toFixed(1) + ' km</div>',
              iconAnchor: [24, 10]
            }),
            interactive: false
          }).addTo(labelLayer);
        }
      }
    }

    document.getElementById('maxGap').textContent = maxG.toFixed(1);

    // Draw camera markers
    all.forEach(function (cam, i) {
      var isC = cam.source === 'custom';
      var col = isC ? '#00e5ff' :
        cam.speed === '120' ? '#ff8c00' :
          cam.speed === '100' ? '#ffc107' : '#ff3b3b';

      // Pulse ring
      var pi = L.divIcon({
        className: '',
        html: '<div style="width:22px;height:22px;border-radius:50%;background:' + col +
          ';opacity:0.12;animation:pulse 2.5s ease-in-out infinite;animation-delay:' +
          (i * 0.15 % 2.5) + 's;"></div>',
        iconAnchor: [11, 11]
      });
      L.marker([cam.lat, cam.lon], { icon: pi, interactive: false }).addTo(camLayer);

      // Circle marker
      var mk = L.circleMarker([cam.lat, cam.lon], {
        radius: isC ? 8 : 6,
        fillColor: col, fillOpacity: 0.95,
        color: '#fff', weight: isC ? 2 : 1.2,
        opacity: isC ? 0.8 : 0.5
      }).addTo(camLayer);

      var gap = '';
      if (i > 0) {
        var gv = cam.route_km - all[i - 1].route_km;
        gap = '<div style="margin-top:6px">Gap: <span class="pg">' + gv.toFixed(2) + ' km</span></div>';
      }
      var del = '';
      if (isC) {
        del = '<div style="margin-top:8px"><button onclick="DibbaRadar.mapModule.removeCustom(' +
          cam.lat + ',' + cam.lon +
          ')" style="background:rgba(255,59,59,0.1);color:#ff6b6b;border:1px solid rgba(255,59,59,0.2);border-radius:20px;padding:6px 16px;font-family:Rajdhani;font-size:11px;font-weight:600;cursor:pointer">REMOVE</button></div>';
      }
      mk.bindPopup(
        '<div class="pt" style="color:' + (isC ? '#00e5ff' : '#fff') + '">' +
        (isC ? 'YOUR PIN' : 'CAMERA') + ' #' + (i + 1) + '</div>' +
        '<div>Limit: <span class="ps">' +
        (cam.speed === '?' ? 'Unknown' : cam.speed + ' km/h') +
        '</span></div>' +
        '<div style="margin-top:2px">km <span class="pg">' +
        cam.route_km.toFixed(1) + '</span> / ' + TK.toFixed(0) + '</div>' +
        '<div class="pc">' + cam.lat.toFixed(6) + ', ' + cam.lon.toFixed(6) + '</div>' +
        gap + del
      );
    });

    // Off-route cameras
    var offRoute = DR.cameras.getOffRouteCams();
    offRoute.forEach(function (c) {
      L.circleMarker([c.lat, c.lon], {
        radius: 3, fillColor: '#9c27b0', fillOpacity: 0.15,
        color: '#9c27b0', weight: 1, opacity: 0.1
      }).addTo(camLayer);
    });

    // Start/end markers
    [[25.2086, 55.5549, 'ENOC AL AWIR', 'START'],
    [25.6211, 56.2821, 'WAVE CAFE DIBBA', 'END']].forEach(function (p) {
      L.marker([p[0], p[1]], {
        icon: L.divIcon({
          className: '',
          html: '<div style="width:14px;height:14px;background:#00e5ff;border:2px solid #fff;border-radius:50%;box-shadow:0 0 14px rgba(0,229,255,0.5)"></div>',
          iconAnchor: [7, 7]
        })
      }).addTo(camLayer).bindPopup(
        '<div class="pt" style="color:#00e5ff">' + p[2] + '</div>' +
        '<div class="pc">' + p[3] + '</div>'
      );
    });

    // Density bar
    drawDensityBar(all, TK);

    // Custom pin count
    var cc = document.getElementById('customCount');
    var eb = document.getElementById('exportBtn');
    var pinCount = DR.pins.count();
    if (pinCount > 0) {
      cc.textContent = pinCount + ' PIN' + (pinCount > 1 ? 'S' : '');
      eb.style.display = 'inline-block';
    } else {
      cc.textContent = '';
      eb.style.display = 'none';
    }
  }

  function drawDensityBar(all, TK) {
    var bar = document.getElementById('densityBar');
    bar.innerHTML = '';
    all.forEach(function (cam) {
      var pct = (cam.route_km / TK) * 100;
      var col = cam.source === 'custom' ? 'var(--custom)' :
        cam.speed === '120' ? 'var(--s120)' :
          cam.speed === '100' ? 'var(--s100)' : 'var(--warn)';
      var d = document.createElement('div');
      d.className = 'density-cam';
      d.style.cssText = 'left:' + pct + '%;background:' + col + ';opacity:0.85;';
      bar.appendChild(d);
    });
  }

  /** Toggle direction */
  function flipDir() {
    direction = direction === 'ab' ? 'ba' : 'ab';
    document.getElementById('dirLabel').textContent =
      direction === 'ab' ? 'DXB > DIBBA' : 'DIBBA > DXB';
    document.getElementById('dirArrow').innerHTML =
      direction === 'ab' ? '&#8594;' : '&#8592;';
    drawMap();
  }

  /** Toggle add-camera mode */
  function toggleAdd() {
    adding = !adding;
    var btn = document.getElementById('addBtn');
    var info = document.getElementById('addInfo');
    if (adding) {
      btn.textContent = 'CANCEL';
      btn.className = 'active';
      info.textContent = 'Tap map to place camera';
      document.body.classList.add('add-mode');
    } else {
      btn.textContent = '+ ADD CAMERA';
      btn.className = '';
      info.textContent = 'Pin cameras from Waze';
      document.body.classList.remove('add-mode');
    }
  }

  /** Confirm add with speed limit */
  function confirmAdd(speed) {
    if (!pendingLatLng) return;
    DR.pins.addPin(pendingLatLng.lat, pendingLatLng.lng, speed);
    pendingLatLng = null;
    document.getElementById('speedPicker').classList.remove('show');
    setTimeout(function () {
      document.getElementById('speedPicker').style.display = 'none';
      document.getElementById('overlay').style.display = 'none';
    }, 200);
    if (_tmpMarker) { map.removeLayer(_tmpMarker); _tmpMarker = null; }
    toggleAdd();
    drawMap();
  }

  /** Cancel add */
  function cancelAdd() {
    pendingLatLng = null;
    document.getElementById('speedPicker').classList.remove('show');
    setTimeout(function () {
      document.getElementById('speedPicker').style.display = 'none';
      document.getElementById('overlay').style.display = 'none';
    }, 200);
    if (_tmpMarker) { map.removeLayer(_tmpMarker); _tmpMarker = null; }
  }

  /** Remove a custom pin by lat/lon */
  function removeCustom(lat, lon) {
    DR.pins.removePin(lat, lon);
    map.closePopup();
    drawMap();
  }

  /** Export pins */
  function exportPins() {
    DR.pins.exportPins();
  }

  DR.mapModule = {
    init: initMap,
    getMap: getMap,
    getWazeLayer: getWazeLayer,
    getDirection: getDirection,
    drawRoutes: drawRoutes,
    drawMap: drawMap,
    flipDir: flipDir,
    toggleAdd: toggleAdd,
    confirmAdd: confirmAdd,
    cancelAdd: cancelAdd,
    removeCustom: removeCustom,
    exportPins: exportPins
  };
})();
