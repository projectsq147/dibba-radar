/* js/radar-map.js -- Full radar map view: all cameras + heat-colored roads with MapLibre */
(function () {
  'use strict';
  var DR = window.DibbaRadar = window.DibbaRadar || {};

  var loaded = false;
  var data = null;
  var nearbyAlertActive = false;
  var lastAlertCam = null;
  var nearbyCheckInterval = null;
  var wasOverMargin = false;  // for green flash on recovery
  var flashRedTimer = null;
  var flashGreenTimer = null;

  var radarCamerasSourceId = 'radar-cameras-source';
  var radarCamerasLayerId = 'radar-cameras-layer';
  var roadSegmentsSourceId = 'road-segments-source';
  var roadSegmentsLayerId = 'road-segments-layer';

  /** Initialize radar map mode */
  function init(cb) {
    if (loaded && data) {
      if (cb) cb();
      return;
    }

    // Load combined camera data
    if (DR._allCameras) {
      data = DR._allCameras;
      loaded = true;
      render();
      if (cb) cb();
      return;
    }

    // Dynamic load
    var script = document.createElement('script');
    script.src = 'data/all-cameras.js';
    script.onload = function () {
      if (DR._allCameras) {
        data = DR._allCameras;
        loaded = true;
        render();
      }
      if (cb) cb();
    };
    script.onerror = function () {
      console.error('Failed to load all-cameras.js');
      if (cb) cb();
    };
    document.head.appendChild(script);
  }

  /** Render cameras and road segments on map */
  function render() {
    var map = DR.mapModule ? DR.mapModule.getMap() : null;
    if (!map || !data) return;

    // Wait for map to be ready (style loaded, base layers added)
    if (!DR.mapModule.isReady()) {
      DR.mapModule.onReady(function() { render(); });
      return;
    }

    // Draw colored road segments first (under cameras)
    var segs = data.segments || [];
    var segmentFeatures = [];

    for (var i = 0; i < segs.length; i++) {
      var seg = segs[i];
      if (!seg.coords || seg.coords.length < 2) continue;
      
      var segmentFeature = {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: seg.coords.map(function(coord) { return [coord[1], coord[0]]; }) // [lng, lat]
        },
        properties: {
          color: seg.color
        }
      };
      segmentFeatures.push(segmentFeature);
    }

    // Add road segments source and layer
    if (!map.getSource(roadSegmentsSourceId)) {
      map.addSource(roadSegmentsSourceId, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: segmentFeatures
        }
      });

      map.addLayer({
        id: roadSegmentsLayerId,
        type: 'line',
        source: roadSegmentsSourceId,
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 4,
          'line-opacity': 0.7
        }
      });
    } else {
      map.getSource(roadSegmentsSourceId).setData({
        type: 'FeatureCollection',
        features: segmentFeatures
      });
    }

    // Draw camera markers
    var cams = data.cameras || [];
    var cameraFeatures = [];

    for (var j = 0; j < cams.length; j++) {
      var c = cams[j];
      var sl = c.speed_limit;
      var hasLimit = sl && sl !== '?' && sl !== 'unknown';
      var limitNum = hasLimit ? parseInt(sl, 10) : null;

      // Color and size based on speed limit
      var color, size;
      if (!hasLimit) {
        color = '#78909c'; // grey for unknown
        size = 8;
      } else if (limitNum >= 120) {
        color = '#ff1744'; // red for high-speed enforcement
        size = 10;
      } else if (limitNum >= 80) {
        color = '#ff6d00'; // orange
        size = 9;
      } else {
        color = '#ffd600'; // yellow for low-speed zones
        size = 8;
      }

      var cameraFeature = {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [c.lon, c.lat] // [lng, lat]
        },
        properties: {
          color: color,
          size: size,
          speed_limit: sl || '?',
          source: c.source || 'OSM',
          lat: c.lat,
          lon: c.lon
        }
      };
      cameraFeatures.push(cameraFeature);
    }

    // Add radar cameras source and layer
    if (!map.getSource(radarCamerasSourceId)) {
      map.addSource(radarCamerasSourceId, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: cameraFeatures
        }
      });

      map.addLayer({
        id: radarCamerasLayerId,
        type: 'circle',
        source: radarCamerasSourceId,
        paint: {
          'circle-radius': ['get', 'size'],
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.95,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': 'rgba(255,255,255,0.8)',
          'circle-stroke-opacity': 1
        }
      });

      // Add click handler for radar cameras
      map.on('click', radarCamerasLayerId, function(e) {
        var cam = e.features[0].properties;
        var coordinates = e.features[0].geometry.coordinates.slice();

        var popupContent = '<b>Speed Camera</b><br>';
        if (cam.speed_limit && cam.speed_limit !== '?' && cam.speed_limit !== 'unknown') {
          popupContent += 'Limit: <b>' + cam.speed_limit + ' km/h</b><br>';
        }
        popupContent += 'Source: ' + cam.source;

        new maplibregl.Popup({ className: 'radar-popup' })
          .setLngLat(coordinates)
          .setHTML(popupContent)
          .addTo(map);
      });

      // Change cursor on hover
      map.on('mouseenter', radarCamerasLayerId, function () {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', radarCamerasLayerId, function () {
        map.getCanvas().style.cursor = '';
      });

    } else {
      map.getSource(radarCamerasSourceId).setData({
        type: 'FeatureCollection',
        features: cameraFeatures
      });
    }

    // Fit map to show all segments
    if (segmentFeatures.length > 0) {
      var bounds = new maplibregl.LngLatBounds();
      
      // Extend bounds with all segment coordinates
      segmentFeatures.forEach(function(feature) {
        if (feature.geometry.type === 'LineString') {
          feature.geometry.coordinates.forEach(function(coord) {
            bounds.extend(coord);
          });
        }
      });

      if (!bounds.isEmpty()) {
        // Don't auto-fit if user has a GPS position in UAE
        var st = DR.gps ? DR.gps.getState() : {};
        if (!st.lat || st.lat < 22 || st.lat > 27) {
          map.fitBounds(bounds, { padding: 30 });
        }
      }
    }
  }

  /** Start nearby camera alerts (runs during driving without a specific route) */
  function startNearbyAlerts() {
    if (nearbyCheckInterval) return;
    nearbyCheckInterval = setInterval(checkNearbyCameras, 250);
  }

  /** Stop nearby alerts */
  function stopNearbyAlerts() {
    if (nearbyCheckInterval) {
      clearInterval(nearbyCheckInterval);
      nearbyCheckInterval = null;
    }
    nearbyAlertActive = false;
    lastAlertCam = null;
  }

  /** Check for cameras near current position */
  function checkNearbyCameras() {
    if (!data || !data.cameras) return;
    var st = DR.gps ? DR.gps.getState() : {};
    if (!st.lat) return;

    var closest = null;
    var closestDist = Infinity;
    var cams = data.cameras;

    for (var i = 0; i < cams.length; i++) {
      var d = quickDist(st.lat, st.lon, cams[i].lat, cams[i].lon);
      if (d < closestDist) {
        closestDist = d;
        closest = cams[i];
      }
    }

    // Update the speed limit badge based on nearest camera
    var limitBadge = document.getElementById('speedLimitBadge');
    var hudLimitBadge = document.getElementById('hudLimitBadge');
    if (closest && closestDist < 5) {
      var sl = closest.speed_limit;
      if (sl && sl !== '?' && sl !== 'unknown') {
        var limitVal = sl;
        if (limitBadge) { limitBadge.textContent = limitVal; limitBadge.style.display = 'flex'; }
        if (hudLimitBadge) { hudLimitBadge.textContent = limitVal; hudLimitBadge.style.display = 'flex'; }
      }
    }

    // Alert thresholds
    var alertDist = 2; // km
    var warningDist = 1;
    var criticalDist = 0.3;

    if (closest && closestDist < alertDist) {
      // Update HUD camera distance
      var camDistEl = document.getElementById('hudCamDist');
      if (camDistEl) {
        if (closestDist < 0.05) {
          camDistEl.textContent = 'NOW';
        } else if (closestDist < 1) {
          camDistEl.textContent = (closestDist * 1000).toFixed(0) + 'm';
        } else {
          camDistEl.textContent = closestDist.toFixed(1) + ' km';
        }
      }

      // Trigger audio alert
      if (closestDist < warningDist && DR.audio) {
        var camKey = closest.lat + ',' + closest.lon;
        if (lastAlertCam !== camKey) {
          lastAlertCam = camKey;
          if (closestDist < criticalDist) {
            DR.audio.playAlert('critical');
          } else {
            DR.audio.playAlert('warning');
          }
        }
      }

      // UAE +20 margin flash system
      var camLimit = closest.speed_limit;
      var speed = st.speed;
      if (camLimit && camLimit !== '?' && speed !== null && closestDist < 1.5) {
        var limitNum = parseInt(camLimit, 10);
        var margin = limitNum + 20; // UAE fine threshold
        var isOver = speed > margin;

        if (isOver && !wasOverMargin) {
          // Just went over -- RED flash
          wasOverMargin = true;
          showFlash('red', limitNum, Math.round(speed));
        } else if (isOver && wasOverMargin) {
          // Still over -- keep red visible
          keepFlashRed();
        } else if (!isOver && wasOverMargin) {
          // Dropped back under -- GREEN flash
          wasOverMargin = false;
          showFlash('green');
        }
      } else if (closestDist >= 1.5) {
        // Out of range, reset
        if (wasOverMargin) wasOverMargin = false;
        hideFlashes();
      }

    } else {
      // Clear HUD
      var camDistEl2 = document.getElementById('hudCamDist');
      if (camDistEl2) camDistEl2.textContent = '--';
      lastAlertCam = null;
      if (wasOverMargin) wasOverMargin = false;
      hideFlashes();
    }
  }

  /** Show red or green flash */
  function showFlash(color, limit, speed) {
    var red = document.getElementById('flashRed');
    var green = document.getElementById('flashGreen');
    if (color === 'red') {
      if (green) green.style.display = 'none';
      if (red) {
        red.style.display = 'flex';
        var sub = document.getElementById('flashRedSub');
        if (sub && limit) sub.textContent = Math.round(speed) + ' / ' + (limit + 20) + ' km/h';
      }
      // Auto-hide after 3s if speed drops (keepFlashRed refreshes it)
      clearTimeout(flashRedTimer);
      flashRedTimer = setTimeout(function () {
        if (red) red.style.display = 'none';
      }, 3000);
    } else {
      if (red) red.style.display = 'none';
      clearTimeout(flashRedTimer);
      if (green) green.style.display = 'flex';
      clearTimeout(flashGreenTimer);
      flashGreenTimer = setTimeout(function () {
        if (green) green.style.display = 'none';
      }, 1500);
    }
  }

  /** Keep red flash alive while still over */
  function keepFlashRed() {
    var red = document.getElementById('flashRed');
    if (red && red.style.display !== 'flex') red.style.display = 'flex';
    clearTimeout(flashRedTimer);
    flashRedTimer = setTimeout(function () {
      if (red) red.style.display = 'none';
    }, 1500);
  }

  /** Hide all flashes */
  function hideFlashes() {
    var red = document.getElementById('flashRed');
    var green = document.getElementById('flashGreen');
    if (red) red.style.display = 'none';
    if (green) green.style.display = 'none';
    clearTimeout(flashRedTimer);
    clearTimeout(flashGreenTimer);
  }

  /** Quick distance in km (equirectangular approximation) */
  function quickDist(lat1, lon1, lat2, lon2) {
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var cosLat = Math.cos((lat1 + lat2) / 2 * Math.PI / 180);
    return R * Math.sqrt(dLat * dLat + dLon * dLon * cosLat * cosLat);
  }

  /** Clear all markers and lines */
  function clear() {
    var map = DR.mapModule ? DR.mapModule.getMap() : null;
    if (!map) return;

    // Clear radar cameras
    if (map.getLayer(radarCamerasLayerId)) {
      map.removeLayer(radarCamerasLayerId);
    }
    if (map.getSource(radarCamerasSourceId)) {
      map.removeSource(radarCamerasSourceId);
    }

    // Clear road segments
    if (map.getLayer(roadSegmentsLayerId)) {
      map.removeLayer(roadSegmentsLayerId);
    }
    if (map.getSource(roadSegmentsSourceId)) {
      map.removeSource(roadSegmentsSourceId);
    }

    stopNearbyAlerts();
  }

  /** Get data */
  function getData() { return data; }
  function isLoaded() { return loaded; }

  DR.radarMap = {
    init: init,
    render: render,
    clear: clear,
    startNearbyAlerts: startNearbyAlerts,
    stopNearbyAlerts: stopNearbyAlerts,
    checkNearbyCameras: checkNearbyCameras,
    getData: getData,
    isLoaded: isLoaded
  };
})();