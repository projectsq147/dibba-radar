/* js/map.js -- MapLibre GL JS map, layers, gap drawing, camera markers, dynamic route */
(function () {
  'use strict';
  var DR = window.DibbaRadar = window.DibbaRadar || {};

  var map;
  var mapReady = false;
  var readyCallbacks = [];
  var routeLayerABId = 'route-layer-ab';
  var routeLayerBAId = 'route-layer-ba';
  var gapLayerId = 'gap-layer';
  var camLayerId = 'cameras-layer';
  var labelLayerId = 'labels-layer';
  var wazeLayerId = 'waze-layer';
  var dynamicRouteLayerId = 'dynamic-route-layer';
  var direction = 'ab';
  var adding = false;
  var pendingLatLng = null;
  var _tmpMarkerSource = 'tmp-marker-source';

  function initMap() {
    map = new maplibregl.Map({
      container: 'map',
      style: {
        version: 8,
        sources: {
          'carto': {
            type: 'raster',
            tiles: ['https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'],
            tileSize: 256
          }
        },
        layers: [{
          id: 'carto',
          type: 'raster',
          source: 'carto'
        }]
      },
      center: [55.9, 25.42], // [lng, lat] - MapLibre order!
      zoom: 10,
      bearing: 0,
      pitch: 0,
      attributionControl: false
    });

    // Wait for map to load before setting up layers
    map.on('load', function() {
      // Add empty sources for our layers
      map.addSource('gaps', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      
      map.addSource('cameras', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      map.addSource('labels', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      map.addSource('waze', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      map.addSource('route-ab', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      map.addSource('route-ba', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      // Add layers
      map.addLayer({
        id: routeLayerABId,
        type: 'line',
        source: 'route-ab',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#0a2a1a',
          'line-width': 4,
          'line-opacity': 0.5
        }
      });

      map.addLayer({
        id: routeLayerBAId,
        type: 'line',
        source: 'route-ba',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#0a2a1a',
          'line-width': 3,
          'line-opacity': 0.25
        }
      });

      map.addLayer({
        id: gapLayerId,
        type: 'line',
        source: 'gaps',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['get', 'width'],
          'line-opacity': ['get', 'opacity']
        }
      });

      map.addLayer({
        id: camLayerId,
        type: 'circle',
        source: 'cameras',
        paint: {
          'circle-radius': [
            'case',
            ['==', ['get', 'source'], 'custom'], 8,
            6
          ],
          'circle-color': ['get', 'color'],
          'circle-opacity': [
            'case',
            ['==', ['get', 'source'], 'custom'], 0.95,
            0.95
          ],
          'circle-stroke-width': [
            'case',
            ['==', ['get', 'source'], 'custom'], 2,
            1.2
          ],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-opacity': [
            'case',
            ['==', ['get', 'source'], 'custom'], 0.8,
            0.5
          ]
        }
      });

      map.addLayer({
        id: labelLayerId,
        type: 'symbol',
        source: 'labels',
        layout: {
          'text-field': ['get', 'text'],
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
          'text-size': ['get', 'size'],
          'text-anchor': 'center',
          'text-allow-overlap': true
        },
        paint: {
          'text-color': ['get', 'color'],
          'text-halo-color': 'rgba(6,10,15,0.88)',
          'text-halo-width': 1
        }
      });

      map.addLayer({
        id: wazeLayerId,
        type: 'circle',
        source: 'waze',
        paint: {
          'circle-radius': 4,
          'circle-color': '#9c27b0',
          'circle-opacity': 0.15,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#9c27b0',
          'circle-stroke-opacity': 0.1
        }
      });

      // Mark map as ready and flush pending callbacks
      mapReady = true;
      for (var i = 0; i < readyCallbacks.length; i++) {
        try { readyCallbacks[i](); } catch (e) { console.error('Map ready callback error:', e); }
      }
      readyCallbacks = [];
    });

    // Map click for custom pins
    map.on('click', function (e) {
      if (!adding) return;
      pendingLatLng = { lat: e.lngLat.lat, lng: e.lngLat.lng };
      document.getElementById('speedPicker').style.display = 'block';
      document.getElementById('overlay').style.display = 'block';
      setTimeout(function () {
        document.getElementById('speedPicker').classList.add('show');
      }, 10);
      
      // Show temporary marker
      if (map.getSource(_tmpMarkerSource)) {
        map.removeLayer(_tmpMarkerSource + '-layer');
        map.removeSource(_tmpMarkerSource);
      }
      
      map.addSource(_tmpMarkerSource, {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [e.lngLat.lng, e.lngLat.lat]
          }
        }
      });
      
      map.addLayer({
        id: _tmpMarkerSource + '-layer',
        type: 'circle',
        source: _tmpMarkerSource,
        paint: {
          'circle-radius': 10,
          'circle-color': '#00e5ff',
          'circle-opacity': 0.5,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff'
        }
      });
    });

    // Camera click handler
    map.on('click', camLayerId, function(e) {
      var cam = e.features[0].properties;
      var coordinates = e.features[0].geometry.coordinates.slice();

      // Show popup
      var popupContent = '<div class="pt" style="color:' + 
        (cam.source === 'custom' ? '#00e5ff' : '#fff') + '">' +
        (cam.source === 'custom' ? 'YOUR PIN' : 'CAMERA') + ' #' + (cam.index + 1) + '</div>' +
        '<div>Limit: <span class="ps">' +
        (cam.speed === '?' ? 'Unknown' : cam.speed + ' km/h') +
        '</span></div>' +
        '<div style="margin-top:2px">km <span class="pg">' +
        parseFloat(cam.route_km).toFixed(1) + '</span> / ' + parseFloat(cam.total_km).toFixed(0) + '</div>' +
        '<div class="pc">' + parseFloat(cam.lat).toFixed(6) + ', ' + parseFloat(cam.lon).toFixed(6) + '</div>';

      if (cam.gap && parseFloat(cam.gap) > 0) {
        popupContent += '<div style="margin-top:6px">Gap: <span class="pg">' + parseFloat(cam.gap).toFixed(2) + ' km</span></div>';
      }

      if (cam.source === 'custom') {
        popupContent += '<div style="margin-top:8px"><button onclick="DibbaRadar.mapModule.removeCustom(' +
          cam.lat + ',' + cam.lon +
          ')" style="background:rgba(255,59,59,0.1);color:#ff6b6b;border:1px solid rgba(255,59,59,0.2);border-radius:20px;padding:6px 16px;font-family:Rajdhani;font-size:11px;font-weight:600;cursor:pointer">REMOVE</button></div>';
      }

      new maplibregl.Popup()
        .setLngLat(coordinates)
        .setHTML(popupContent)
        .addTo(map);
    });

    // Change cursor on hover
    map.on('mouseenter', camLayerId, function () {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', camLayerId, function () {
      map.getCanvas().style.cursor = '';
    });

    return map;
  }

  function getMap() { return map; }
  function getWazeLayer() { return wazeLayerId; }
  function getDirection() { return direction; }

  /** Draw pre-baked route polylines */
  function drawRoutes(rd) {
    if (!map || !mapReady) return;

    var routeABFeature = {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: rd.route_ab.map(function(p) { return [p[1], p[0]]; }) // [lng, lat]
      }
    };

    var routeBAFeature = {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: rd.route_ba.map(function(p) { return [p[1], p[0]]; }) // [lng, lat]
      }
    };

    map.getSource('route-ab').setData({
      type: 'FeatureCollection',
      features: [routeABFeature]
    });

    map.getSource('route-ba').setData({
      type: 'FeatureCollection',
      features: [routeBAFeature]
    });

    // Fit bounds
    var coords = rd.route_ab.map(function(p) { return [p[1], p[0]]; });
    var bounds = new maplibregl.LngLatBounds();
    coords.forEach(function(coord) {
      bounds.extend(coord);
    });
    map.fitBounds(bounds, { padding: { top: 80, bottom: 20, left: 20, right: 20 } });
  }

  /** Draw a dynamic OSRM route on the map */
  function drawDynamicRoute(routePoints) {
    if (!map || !mapReady) return;

    // Remove existing dynamic route
    clearDynamicRoute();

    // Add source if it doesn't exist
    if (!map.getSource(dynamicRouteLayerId)) {
      map.addSource(dynamicRouteLayerId, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      map.addLayer({
        id: dynamicRouteLayerId,
        type: 'line',
        source: dynamicRouteLayerId,
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#00ff88',
          'line-width': 5,
          'line-opacity': 0.85
        }
      });
    }

    var routeFeature = {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: routePoints.map(function(p) { return [p[1], p[0]]; }) // [lng, lat]
      }
    };

    map.getSource(dynamicRouteLayerId).setData({
      type: 'FeatureCollection',
      features: [routeFeature]
    });

    // Fit bounds
    var coords = routePoints.map(function(p) { return [p[1], p[0]]; });
    var bounds = new maplibregl.LngLatBounds();
    coords.forEach(function(coord) {
      bounds.extend(coord);
    });
    map.fitBounds(bounds, { padding: { top: 100, bottom: 40, left: 40, right: 40 } });
  }

  /** Clear dynamic route layer */
  function clearDynamicRoute() {
    if (map && map.getSource(dynamicRouteLayerId)) {
      map.getSource(dynamicRouteLayerId).setData({
        type: 'FeatureCollection',
        features: []
      });
    }
  }

  /** Main draw: gaps, cameras, density bar, panel stats, markers */
  function drawMap() {
    if (!map || !mapReady) return;

    var rd = DR.cameras.getRouteData();
    if (!rd) return;
    var TK = rd.distance_km;
    var R = rd.route_ab;
    var nav = DR.cameras.isNavigating();

    // Clear existing data
    map.getSource('gaps').setData({ type: 'FeatureCollection', features: [] });
    map.getSource('cameras').setData({ type: 'FeatureCollection', features: [] });
    map.getSource('labels').setData({ type: 'FeatureCollection', features: [] });

    var all = DR.cameras.getAllCams();
    var camCountEl = document.getElementById('camCount');
    if (camCountEl) camCountEl.textContent = all.length;

    // Update route km / minutes
    var rkEl = document.getElementById('routeKmVal');
    if (rkEl) rkEl.textContent = TK.toFixed(1);
    var rmEl = document.getElementById('routeMinVal');
    if (rmEl) rmEl.textContent = Math.round(rd.duration_min);

    // Style pre-baked route layers
    if (nav) {
      // Dim pre-baked routes
      map.setPaintProperty(routeLayerABId, 'line-opacity', 0.08);
      map.setPaintProperty(routeLayerABId, 'line-width', 2);
      map.setPaintProperty(routeLayerBAId, 'line-opacity', 0.04);
      map.setPaintProperty(routeLayerBAId, 'line-width', 1);
    } else {
      if (direction === 'ab') {
        map.setPaintProperty(routeLayerABId, 'line-opacity', 0.5);
        map.setPaintProperty(routeLayerABId, 'line-width', 4);
        map.setPaintProperty(routeLayerBAId, 'line-opacity', 0.15);
        map.setPaintProperty(routeLayerBAId, 'line-width', 2);
      } else {
        map.setPaintProperty(routeLayerBAId, 'line-opacity', 0.5);
        map.setPaintProperty(routeLayerBAId, 'line-width', 4);
        map.setPaintProperty(routeLayerABId, 'line-opacity', 0.15);
        map.setPaintProperty(routeLayerABId, 'line-width', 2);
      }
    }

    // Calculate gaps and build features
    var pts = [{ route_km: 0, route_idx: 0 }]
      .concat(all)
      .concat([{ route_km: TK, route_idx: R.length - 1 }]);
    var maxG = 0;

    var gapFeatures = [];
    var labelFeatures = [];

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

      var lineFeature = {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: seg.map(function(pt) { return [pt[1], pt[0]]; }) // [lng, lat]
        },
        properties: {
          color: col,
          width: w,
          dashArray: da || '',
          opacity: op,
          gap: g.toFixed(1)
        }
      };
      gapFeatures.push(lineFeature);

      // Gap labels
      if (g >= 3) {
        var mi = Math.floor((si + ei) / 2), mp = R[mi];
        if (mp) {
          var labelFeature = {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [mp[1], mp[0]] // [lng, lat]
            },
            properties: {
              text: g.toFixed(1) + ' km',
              color: g >= 5 ? '#00ff88' : '#4ade80',
              size: g >= 10 ? 12 : 10
            }
          };
          labelFeatures.push(labelFeature);
        }
      }
    }

    // Update gap layer
    map.getSource('gaps').setData({
      type: 'FeatureCollection',
      features: gapFeatures
    });

    // Update label layer
    map.getSource('labels').setData({
      type: 'FeatureCollection',
      features: labelFeatures
    });

    var maxGapEl = document.getElementById('maxGap');
    if (maxGapEl) maxGapEl.textContent = maxG.toFixed(1);

    // Camera markers
    var cameraFeatures = [];
    all.forEach(function (cam, i) {
      var isC = cam.source === 'custom';
      var col = isC ? '#00e5ff' :
        cam.speed === '120' ? '#ff8c00' :
          cam.speed === '100' ? '#ffc107' : '#ff3b3b';

      var gap = '';
      if (i > 0) {
        var gv = cam.route_km - all[i - 1].route_km;
        gap = gv.toFixed(2);
      }

      var cameraFeature = {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [cam.lon, cam.lat] // [lng, lat]
        },
        properties: {
          color: col,
          source: cam.source || 'camera',
          speed: cam.speed || '?',
          route_km: cam.route_km || 0,
          total_km: TK,
          lat: cam.lat,
          lon: cam.lon,
          gap: gap,
          index: i
        }
      };
      cameraFeatures.push(cameraFeature);
    });

    // Off-route cameras
    var offRoute = DR.cameras.getOffRouteCams();
    offRoute.forEach(function (c) {
      var offFeature = {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [c.lon, c.lat]
        },
        properties: {
          color: '#9c27b0',
          source: 'off-route',
          speed: '?',
          route_km: 0,
          total_km: TK,
          lat: c.lat,
          lon: c.lon,
          gap: '',
          index: -1
        }
      };
      cameraFeatures.push(offFeature);
    });

    // Start / end markers
    var markers;
    if (nav) {
      markers = [
        [rd.start.lat, rd.start.lon, rd.start.name.toUpperCase(), 'START'],
        [rd.end.lat, rd.end.lon, rd.end.name.toUpperCase(), 'END']
      ];
    } else {
      markers = [
        [25.2086, 55.5549, 'ENOC AL AWIR', 'START'],
        [25.6211, 56.2821, 'WAVE CAFE DIBBA', 'END']
      ];
    }
    
    markers.forEach(function (p) {
      var markerFeature = {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [p[1], p[0]] // [lng, lat]
        },
        properties: {
          color: '#00e5ff',
          source: 'endpoint',
          speed: '--',
          route_km: 0,
          total_km: TK,
          lat: p[0],
          lon: p[1],
          gap: '',
          index: -1,
          name: p[2],
          type: p[3]
        }
      };
      cameraFeatures.push(markerFeature);
    });

    // Update camera layer
    map.getSource('cameras').setData({
      type: 'FeatureCollection',
      features: cameraFeatures
    });

    // Density bar
    drawDensityBar(all, TK);

    // Custom pin count
    var cc = document.getElementById('customCount');
    var eb = document.getElementById('exportBtn');
    var pinCount = DR.pins.count();
    if (pinCount > 0) {
      if (cc) cc.textContent = pinCount + ' PIN' + (pinCount > 1 ? 'S' : '');
      if (eb) eb.style.display = 'inline-block';
    } else {
      if (cc) cc.textContent = '';
      if (eb) eb.style.display = 'none';
    }

    // Update panel text
    updatePanel();
  }

  function drawDensityBar(all, TK) {
    var bar = document.getElementById('densityBar');
    if (!bar) return;
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

  /** Update panel title / subtitle / header based on nav state */
  function updatePanel() {
    var nav = DR.cameras.isNavigating();
    var pt = document.getElementById('panelTitle');
    var ps = document.getElementById('panelSub');
    var dt = document.getElementById('dirToggle');
    var rt = document.getElementById('routeTag');

    if (nav) {
      var rd = DR.cameras.getRouteData();
      if (pt) pt.textContent = rd.end.name.toUpperCase();
      if (ps) ps.textContent = rd.distance_km.toFixed(1) + ' km via OSRM \u2022 ' +
        DR.cameras.getAllCams().length + ' cameras';
      if (dt) dt.style.display = 'none';
      if (rt) rt.textContent = 'radar // nav';
    } else {
      if (pt) pt.innerHTML = 'DUBAI &mdash; DIBBA AL HISN';
      if (ps) ps.textContent = 'ENOC Al Awir to Wave Cafe \u2022 Fixed + live alerts';
      if (dt) dt.style.display = '';
      if (rt) rt.textContent = 'radar // live';
    }
  }

  /** Show route info bar */
  function showRouteInfo(distKm, durationMin, camCount) {
    var ri = document.getElementById('routeInfo');
    if (!ri) return;
    var d = document.getElementById('riDist');
    var t = document.getElementById('riTime');
    var c = document.getElementById('riCams');
    if (d) d.textContent = distKm.toFixed(1);
    if (t) t.textContent = Math.round(durationMin);
    if (c) c.textContent = camCount;
    ri.style.display = 'flex';
  }

  /** Hide route info bar */
  function hideRouteInfo() {
    var ri = document.getElementById('routeInfo');
    if (ri) ri.style.display = 'none';
  }

  function flipDir() {
    direction = direction === 'ab' ? 'ba' : 'ab';
    var dirLabel = document.getElementById('dirLabel');
    if (dirLabel) dirLabel.textContent =
      direction === 'ab' ? 'DXB > DIBBA' : 'DIBBA > DXB';
    var dirArrow = document.getElementById('dirArrow');
    if (dirArrow) dirArrow.innerHTML =
      direction === 'ab' ? '&#8594;' : '&#8592;';
    drawMap();
  }

  function toggleAdd() {
    adding = !adding;
    var btn = document.getElementById('addBtn');
    var info = document.getElementById('addInfo');
    if (adding) {
      if (btn) { btn.textContent = 'CANCEL'; btn.className = 'active'; }
      if (info) info.textContent = 'Tap map to place camera';
      document.body.classList.add('add-mode');
    } else {
      if (btn) { btn.textContent = '+ ADD CAMERA'; btn.className = ''; }
      if (info) info.textContent = 'Pin cameras from Waze';
      document.body.classList.remove('add-mode');
    }
  }

  function confirmAdd(speed) {
    if (!pendingLatLng) return;
    DR.pins.addPin(pendingLatLng.lat, pendingLatLng.lng, speed);
    pendingLatLng = null;
    document.getElementById('speedPicker').classList.remove('show');
    setTimeout(function () {
      document.getElementById('speedPicker').style.display = 'none';
      document.getElementById('overlay').style.display = 'none';
    }, 200);
    
    // Remove temporary marker
    if (map.getSource(_tmpMarkerSource)) {
      map.removeLayer(_tmpMarkerSource + '-layer');
      map.removeSource(_tmpMarkerSource);
    }
    
    toggleAdd();
    drawMap();
  }

  function cancelAdd() {
    pendingLatLng = null;
    document.getElementById('speedPicker').classList.remove('show');
    setTimeout(function () {
      document.getElementById('speedPicker').style.display = 'none';
      document.getElementById('overlay').style.display = 'none';
    }, 200);
    
    // Remove temporary marker
    if (map.getSource(_tmpMarkerSource)) {
      map.removeLayer(_tmpMarkerSource + '-layer');
      map.removeSource(_tmpMarkerSource);
    }
  }

  function removeCustom(lat, lon) {
    DR.pins.removePin(lat, lon);
    // Close any open popups
    var popups = document.getElementsByClassName('maplibregl-popup');
    for (var i = 0; i < popups.length; i++) {
      popups[i].remove();
    }
    drawMap();
  }

  function exportPins() {
    DR.pins.exportPins();
  }

  /** Run callback when map style is loaded, or immediately if already ready */
  function onReady(fn) {
    if (mapReady) { fn(); }
    else { readyCallbacks.push(fn); }
  }

  function isReady() { return mapReady; }

  DR.mapModule = {
    init: initMap,
    getMap: getMap,
    isReady: isReady,
    onReady: onReady,
    getWazeLayer: getWazeLayer,
    getDirection: getDirection,
    drawRoutes: drawRoutes,
    drawDynamicRoute: drawDynamicRoute,
    clearDynamicRoute: clearDynamicRoute,
    drawMap: drawMap,
    updatePanel: updatePanel,
    showRouteInfo: showRouteInfo,
    hideRouteInfo: hideRouteInfo,
    flipDir: flipDir,
    toggleAdd: toggleAdd,
    confirmAdd: confirmAdd,
    cancelAdd: cancelAdd,
    removeCustom: removeCustom,
    exportPins: exportPins
  };
})();