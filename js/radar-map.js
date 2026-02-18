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

  // Shared state so HUD can read nearest camera info without fighting
  var nearestCamState = { dist: null, cam: null };

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

    // Add radar cameras source and layer with clustering
    if (!map.getSource(radarCamerasSourceId)) {
      map.addSource(radarCamerasSourceId, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: cameraFeatures
        },
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50
      });

      // Cluster circles
      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: radarCamerasSourceId,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'step',
            ['get', 'point_count'],
            '#ff6d00',
            10,
            '#ff5722',
            30,
            '#f44336'
          ],
          'circle-radius': [
            'step',
            ['get', 'point_count'],
            15,
            10,
            20,
            30,
            25
          ],
          'circle-opacity': 0.8,
          'circle-stroke-width': 2,
          'circle-stroke-color': 'rgba(255,255,255,0.9)'
        }
      });

      // Cluster count labels
      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: radarCamerasSourceId,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
          'text-size': 12
        },
        paint: {
          'text-color': '#ffffff'
        }
      });

      // Unclustered points
      map.addLayer({
        id: radarCamerasLayerId,
        type: 'circle',
        source: radarCamerasSourceId,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': ['get', 'size'],
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.95,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': 'rgba(255,255,255,0.8)',
          'circle-stroke-opacity': 1
        }
      });

      // Click handler for clusters - zoom in
      map.on('click', 'clusters', function(e) {
        var features = map.queryRenderedFeatures(e.point, {
          layers: ['clusters']
        });
        var clusterId = features[0].properties.cluster_id;
        map.getSource(radarCamerasSourceId).getClusterExpansionZoom(
          clusterId,
          function(err, zoom) {
            if (err) return;
            map.easeTo({
              center: features[0].geometry.coordinates,
              zoom: zoom
            });
          }
        );
      });

      // Add click handler for individual cameras
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
      map.on('mouseenter', 'clusters', function () {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'clusters', function () {
        map.getCanvas().style.cursor = '';
      });
      map.on('mouseenter', radarCamerasLayerId, function () {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', radarCamerasLayerId, function () {
        map.getCanvas().style.cursor = '';
      });

    } else {
      // Update existing source with new data
      var source = map.getSource(radarCamerasSourceId);
      if (source) {
        source.setData({
          type: 'FeatureCollection',
          features: cameraFeatures
        });
      }
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
    // Reset trip camera tracking
    if (checkNearbyCameras._recordedCams) checkNearbyCameras._recordedCams = {};
    // Reset background notification tracking
    if (DR._bgNotify) DR._bgNotify.notifiedCameras = {};
  }

  /** Check for cameras near current position */
  function checkNearbyCameras() {
    if (!data || !data.cameras) return;
    var st = DR.gps ? DR.gps.getState() : {};
    if (!st.lat) { nearestCamState.dist = null; nearestCamState.cam = null; return; }

    var closest = null;
    var closestDist = Infinity;
    var cams = data.cameras;

    for (var i = 0; i < cams.length; i++) {
      var d = DR.quickDist(st.lat, st.lon, cams[i].lat, cams[i].lon);
      if (d < closestDist) {
        closestDist = d;
        closest = cams[i];
      }
    }

    // Store state for HUD to read (single source of truth)
    nearestCamState.dist = (closest && closestDist < 5) ? closestDist : null;
    nearestCamState.cam = (closest && closestDist < 5) ? closest : null;

    // Update the speed limit badge on the map-view widget only
    var limitBadge = document.getElementById('speedLimitBadge');
    if (closest && closestDist < 5) {
      var sl = closest.speed_limit;
      if (sl && sl !== '?' && sl !== 'unknown') {
        if (limitBadge) { limitBadge.textContent = sl; limitBadge.style.display = 'flex'; }
      }
    }

    // Alert thresholds
    var warningDist = 1;
    var criticalDist = 0.3;

    if (closest && closestDist < 2) {
      // Record camera encounter for trip log when within 50m
      if (closestDist < 0.05 && DR.tripLog) {
        var tripCamKey = closest.lat + ',' + closest.lon;
        if (!checkNearbyCameras._recordedCams) checkNearbyCameras._recordedCams = {};
        if (!checkNearbyCameras._recordedCams[tripCamKey]) {
          checkNearbyCameras._recordedCams[tripCamKey] = true;
          DR.tripLog.recordCamera();
        }
      }

      // Background notification when within 500m
      if (closestDist < 0.5 && DR._bgNotify) {
        var bgCamKey = closest.lat + ',' + closest.lon;
        if (!DR._bgNotify.notifiedCameras[bgCamKey]) {
          DR._bgNotify.notifiedCameras[bgCamKey] = true;
          var distM = Math.round(closestDist * 1000);
          DR._bgNotify.sendBackgroundCameraNotification(distM, closest.speed_limit);
        }
      }

      // Trigger audio alert with voice (only for cameras ahead, not behind)
      if (closestDist < warningDist && DR.audio) {
        var camKey = closest.lat + ',' + closest.lon;
        // Check if camera is ahead using heading
        var isCamAhead = true;
        if (st.heading !== null && st.heading !== undefined) {
          var bearingToCam = Math.atan2(
            (closest.lon - st.lon) * Math.cos(st.lat * Math.PI / 180),
            closest.lat - st.lat
          ) * 180 / Math.PI;
          bearingToCam = (bearingToCam + 360) % 360;
          var headingDiff = Math.abs(bearingToCam - st.heading);
          if (headingDiff > 180) headingDiff = 360 - headingDiff;
          isCamAhead = headingDiff < 90; // within 90 degrees of travel direction
        }

        if (isCamAhead && lastAlertCam !== camKey) {
          lastAlertCam = camKey;
          var voiceMessage = null;
          
          if (closestDist < criticalDist) {
            voiceMessage = 'Camera, ' + formatDistanceForVoice(closestDist);
            DR.audio.playAlert('critical', voiceMessage);
          } else {
            // 1km warning with speed limit info if available
            var limitInfo = '';
            var camSl = closest.speed_limit;
            if (camSl && camSl !== '?' && camSl !== 'unknown') {
              limitInfo = ', limit ' + camSl;
            }
            voiceMessage = 'Camera ahead, ' + formatDistanceForVoice(closestDist) + limitInfo;
            DR.audio.playAlert('warning', voiceMessage);
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
          wasOverMargin = true;
          showFlash('red', limitNum, Math.round(speed));
          // Voice alert for over speed limit (only if very close to camera)
          if (closestDist < 0.2 && DR.audio) {
            DR.audio.speak('Slow down');
          }
        } else if (isOver && wasOverMargin) {
          keepFlashRed();
        } else if (!isOver && wasOverMargin) {
          wasOverMargin = false;
          showFlash('green');
        }
      } else if (closestDist >= 1.5) {
        if (wasOverMargin) wasOverMargin = false;
        hideFlashes();
      }

    } else {
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
      if (green) green.classList.remove('active');
      if (red) {
        red.classList.add('active');
        var sub = document.getElementById('flashRedSub');
        if (sub && limit) sub.textContent = Math.round(speed) + ' / ' + (limit + 20) + ' km/h';
      }
      // Auto-hide after 3s if speed drops (keepFlashRed refreshes it)
      clearTimeout(flashRedTimer);
      flashRedTimer = setTimeout(function () {
        if (red) red.classList.remove('active');
      }, 3000);
    } else {
      if (red) red.classList.remove('active');
      clearTimeout(flashRedTimer);
      if (green) green.classList.add('active');
      clearTimeout(flashGreenTimer);
      flashGreenTimer = setTimeout(function () {
        if (green) green.classList.remove('active');
      }, 1500);
    }
  }

  /** Keep red flash alive while still over */
  function keepFlashRed() {
    var red = document.getElementById('flashRed');
    if (red && !red.classList.contains('active')) red.classList.add('active');
    clearTimeout(flashRedTimer);
    flashRedTimer = setTimeout(function () {
      if (red) red.classList.remove('active');
    }, 1500);
  }

  /** Hide all flashes */
  function hideFlashes() {
    var red = document.getElementById('flashRed');
    var green = document.getElementById('flashGreen');
    if (red) red.classList.remove('active');
    if (green) green.classList.remove('active');
    clearTimeout(flashRedTimer);
    clearTimeout(flashGreenTimer);
  }

  /** Format distance for natural voice announcements */
  function formatDistanceForVoice(distKm) {
    if (distKm >= 1) {
      var roundedKm = Math.round(distKm * 10) / 10;
      if (roundedKm <= 1.1) return 'one kilometer';
      return roundedKm.toFixed(0) + ' kilometers';
    }
    // Round to nearest 100m for cleaner speech
    var meters = Math.round(distKm * 10) * 100;
    if (meters <= 100) return '100 meters';
    return meters + ' meters';
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

  /** Get nearest camera state (for HUD to read) */
  function getNearestCam() { return nearestCamState; }

  /** Dim segments during driving, restore when stopped */
  function setDrivingMode(on) {
    var map = DR.mapModule ? DR.mapModule.getMap() : null;
    if (!map) return;
    if (map.getLayer(roadSegmentsLayerId)) {
      map.setPaintProperty(roadSegmentsLayerId, 'line-opacity', on ? 0.15 : 0.7);
      map.setPaintProperty(roadSegmentsLayerId, 'line-width', on ? 2 : 4);
    }
  }

  DR.radarMap = {
    init: init,
    render: render,
    clear: clear,
    startNearbyAlerts: startNearbyAlerts,
    stopNearbyAlerts: stopNearbyAlerts,
    checkNearbyCameras: checkNearbyCameras,
    getNearestCam: getNearestCam,
    setDrivingMode: setDrivingMode,
    getData: getData,
    isLoaded: isLoaded
  };
})();