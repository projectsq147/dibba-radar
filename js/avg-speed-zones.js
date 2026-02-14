/* js/avg-speed-zones.js -- Average speed camera zone detection */
(function () {
  'use strict';
  var DR = window.DibbaRadar = window.DibbaRadar || {};

  var avgSpeedZones = [];
  var currentZone = null;
  var zoneEntry = null;
  var zoneSpeedSamples = [];

  function init() {
    // Detect zones when radar-map data is available
    var checkData = setInterval(function() {
      var radarData = DR.radarMap && DR.radarMap.getData ? DR.radarMap.getData() : null;
      if (radarData && radarData.cameras && radarData.cameras.length > 0) {
        clearInterval(checkData);
        detectAverageSpeedZonesFromRadar(radarData.cameras);
      }
    }, 2000);

    // Also detect from route-based cameras if available
    if (DR.cameras && DR.cameras.getAllCams) {
      var cams = DR.cameras.getAllCams();
      if (cams && cams.length > 0) {
        detectAverageSpeedZones();
      }
    }
  }

  /** Check current GPS state for avg speed zone tracking (called from gps.js) */
  function check(gpsState) {
    if (!gpsState || !gpsState.lat) return;
    if (avgSpeedZones.length === 0) return;

    var speed = gpsState.speed || 0;

    // Use radar-map nearest camera data for proximity-based zone detection
    var radarNear = DR.radarMap ? DR.radarMap.getNearestCam() : null;

    // If we have route_km, use route-based zone tracking
    if (gpsState.routeKm !== null && gpsState.routeKm !== undefined) {
      updateZoneTracking([gpsState.lat, gpsState.lon], speed);
      return;
    }

    // Otherwise use proximity-based detection with radar-map cameras
    if (radarNear && radarNear.cam && radarNear.dist !== null && radarNear.dist < 5) {
      // Find zones involving the nearest camera
      var nearCam = radarNear.cam;
      var inZone = null;
      for (var i = 0; i < avgSpeedZones.length; i++) {
        var zone = avgSpeedZones[i];
        if (zone.startCamera === nearCam || zone.endCamera === nearCam) {
          inZone = zone;
          break;
        }
      }

      if (inZone && inZone !== currentZone) {
        enterAverageSpeedZone(inZone, 0, speed);
      } else if (!inZone && currentZone) {
        exitCurrentZone();
      } else if (currentZone && inZone === currentZone) {
        // Estimate progress based on distance to cameras
        zoneSpeedSamples.push({ time: Date.now(), speed: speed, km: 0 });
        var avgSpd = 0;
        var total = 0;
        for (var j = 0; j < zoneSpeedSamples.length; j++) {
          total += zoneSpeedSamples[j].speed;
        }
        avgSpd = zoneSpeedSamples.length > 0 ? total / zoneSpeedSamples.length : 0;
        updateZoneDisplay(currentZone, 0, avgSpd);
      }
    } else if (currentZone) {
      exitCurrentZone();
    }
  }

  /** Detect average speed zones from radar-map camera data */
  function detectAverageSpeedZonesFromRadar(cameras) {
    if (!cameras || cameras.length < 2) return;

    // Sort by latitude (rough north-south ordering)
    var sorted = cameras.slice().sort(function(a, b) {
      return a.lat - b.lat;
    });

    var MAX_ZONE_DISTANCE = 5.0; // 5km max

    for (var i = 0; i < sorted.length - 1; i++) {
      var cam1 = sorted[i];
      var cam2 = sorted[i + 1];

      var sl1 = cam1.speed_limit;
      var sl2 = cam2.speed_limit;
      if (!sl1 || sl1 === '?' || sl1 === 'unknown') continue;
      if (!sl2 || sl2 === '?' || sl2 === 'unknown') continue;
      if (sl1 !== sl2) continue;

      // Calculate distance between cameras
      var dist = quickDistKm(cam1.lat, cam1.lon, cam2.lat, cam2.lon);
      if (dist > MAX_ZONE_DISTANCE || dist < 0.3) continue;

      var zone = {
        id: 'rzone_' + i,
        startKm: 0,
        endKm: dist,
        startCamera: cam1,
        endCamera: cam2,
        speedLimit: parseInt(sl1, 10),
        length: dist,
        active: false
      };
      avgSpeedZones.push(zone);
    }

    console.log('Detected', avgSpeedZones.length, 'potential average speed zones (radar)');
  }

  /** Quick distance in km */
  function quickDistKm(lat1, lon1, lat2, lon2) {
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var cosLat = Math.cos((lat1 + lat2) / 2 * Math.PI / 180);
    return R * Math.sqrt(dLat * dLat + dLon * dLon * cosLat * cosLat);
  }

  function detectAverageSpeedZones() {
    var cameras = DR.cameras.getAllCams();
    if (!cameras || cameras.length < 2) return;

    avgSpeedZones = [];
    var MAX_ZONE_DISTANCE = 5.0; // 5km max distance between cameras

    for (var i = 0; i < cameras.length - 1; i++) {
      var cam1 = cameras[i];
      var cam2 = cameras[i + 1];

      // Check if cameras are within 5km and have same speed limit
      var distance = cam2.route_km - cam1.route_km;
      
      if (distance <= MAX_ZONE_DISTANCE && 
          cam1.speed && cam2.speed && 
          cam1.speed === cam2.speed &&
          cam1.speed !== '?' && cam2.speed !== '?') {
        
        var zone = {
          id: 'zone_' + i,
          startKm: cam1.route_km,
          endKm: cam2.route_km,
          startCamera: cam1,
          endCamera: cam2,
          speedLimit: parseInt(cam1.speed),
          length: distance,
          active: false
        };

        avgSpeedZones.push(zone);
      }
    }

    console.log('Detected', avgSpeedZones.length, 'potential average speed zones');
  }

  function updateZoneTracking(position, speed) {
    if (!position || avgSpeedZones.length === 0) return;

    // Get current position on route
    var routeData = DR.cameras.getRouteData();
    if (!routeData) return;

    var snap = DR.snapToRoute(position[0], position[1], 
      routeData.route_ab, routeData.route_ba, DR.cameras.getCumDist());
    
    var currentKm = snap.km;

    // Check if entering a new zone
    var enteredZone = null;
    for (var i = 0; i < avgSpeedZones.length; i++) {
      var zone = avgSpeedZones[i];
      if (currentKm >= zone.startKm && currentKm <= zone.endKm) {
        enteredZone = zone;
        break;
      }
    }

    if (enteredZone && enteredZone !== currentZone) {
      enterAverageSpeedZone(enteredZone, currentKm, speed);
    } else if (!enteredZone && currentZone) {
      exitCurrentZone();
    } else if (currentZone && enteredZone === currentZone) {
      updateZoneProgress(currentKm, speed);
    }
  }

  function enterAverageSpeedZone(zone, currentKm, speed) {
    console.log('Entering average speed zone:', zone.length.toFixed(1) + 'km', zone.speedLimit + 'km/h');
    
    currentZone = zone;
    zone.active = true;
    zoneEntry = {
      time: Date.now(),
      km: currentKm,
      speed: speed
    };
    zoneSpeedSamples = [{ time: Date.now(), speed: speed, km: currentKm }];

    // Show zone indicator
    showZoneIndicator(zone);

    // Trigger event
    document.dispatchEvent(new CustomEvent('avgSpeedZoneEnter', {
      detail: { zone: zone, entry: zoneEntry }
    }));
  }

  function updateZoneProgress(currentKm, speed) {
    if (!currentZone || !zoneEntry) return;

    // Add speed sample
    zoneSpeedSamples.push({
      time: Date.now(),
      speed: speed,
      km: currentKm
    });

    // Calculate current average speed in the zone
    var distanceTraveled = currentKm - zoneEntry.km;
    var timeElapsed = (Date.now() - zoneEntry.time) / 1000; // seconds
    var avgSpeed = distanceTraveled > 0 && timeElapsed > 0 ? 
      (distanceTraveled / timeElapsed) * 3600 : 0; // km/h

    // Update zone progress display
    updateZoneDisplay(currentZone, distanceTraveled, avgSpeed);

    // Warn if average speed is over limit
    if (avgSpeed > currentZone.speedLimit && distanceTraveled > 0.1) {
      warnAverageSpeedViolation(avgSpeed, currentZone.speedLimit);
    }
  }

  function exitCurrentZone() {
    if (!currentZone) return;

    console.log('Exiting average speed zone');
    
    var finalAvgSpeed = calculateFinalAverageSpeed();
    currentZone.active = false;

    // Hide zone indicator
    hideZoneIndicator();

    // Trigger event
    document.dispatchEvent(new CustomEvent('avgSpeedZoneExit', {
      detail: { 
        zone: currentZone, 
        entry: zoneEntry,
        avgSpeed: finalAvgSpeed,
        samples: zoneSpeedSamples 
      }
    }));

    currentZone = null;
    zoneEntry = null;
    zoneSpeedSamples = [];
  }

  function calculateFinalAverageSpeed() {
    if (!zoneEntry || zoneSpeedSamples.length < 2) return 0;

    var totalDistance = 0;
    var totalTime = 0;

    for (var i = 1; i < zoneSpeedSamples.length; i++) {
      var prev = zoneSpeedSamples[i - 1];
      var curr = zoneSpeedSamples[i];
      
      var dist = curr.km - prev.km;
      var time = (curr.time - prev.time) / 1000; // seconds
      
      if (dist > 0 && time > 0) {
        totalDistance += dist;
        totalTime += time;
      }
    }

    return totalTime > 0 ? (totalDistance / totalTime) * 3600 : 0; // km/h
  }

  function showZoneIndicator(zone) {
    var indicator = document.getElementById('avgSpeedZone');
    var lengthEl = document.getElementById('avgZoneLength');
    
    if (indicator) {
      indicator.style.display = 'block';
    }
    if (lengthEl) {
      lengthEl.textContent = zone.length.toFixed(1);
    }

    // Update HUD if active
    if (document.body.classList.contains('hud-active')) {
      updateHUDZoneInfo(zone);
    }
  }

  function hideZoneIndicator() {
    var indicator = document.getElementById('avgSpeedZone');
    if (indicator) {
      indicator.style.display = 'none';
    }
  }

  function updateZoneDisplay(zone, distance, avgSpeed) {
    var progress = zone.length > 0 ? Math.min(distance / zone.length, 1) : 0;

    var limitEl = document.getElementById('avgZoneLimit');
    if (limitEl) limitEl.textContent = zone.speedLimit;

    var progressEl = document.getElementById('avgZoneProgress');
    if (progressEl) progressEl.style.width = (progress * 100).toFixed(1) + '%';

    var avgEl = document.getElementById('avgZoneAvgSpeed');
    if (avgEl) avgEl.textContent = 'AVG: ' + Math.round(avgSpeed);
  }

  function updateHUDZoneInfo(zone) {
    // Update HUD to show zone information
    var hudGap = document.getElementById('hudGap');
    if (hudGap && zone) {
      hudGap.textContent = 'AVG SPEED ZONE ' + zone.speedLimit + 'km/h';
      hudGap.className = 'hud-gap hud-gap-zone';
    }
  }

  function warnAverageSpeedViolation(avgSpeed, limit) {
    // Could trigger audio warning or visual alert
    console.warn('Average speed violation:', avgSpeed.toFixed(1) + 'km/h', 
                 'in', limit + 'km/h', 'zone');
    
    // Flash zone indicator
    var indicator = document.getElementById('avgSpeedZone');
    if (indicator) {
      indicator.style.animation = 'none';
      indicator.offsetHeight; // Trigger reflow
      indicator.style.animation = 'pulse 1s ease 3';
    }
  }

  function drawZonesOnMap(map, routeLayer) {
    if (!routeLayer || avgSpeedZones.length === 0) return;

    var routeData = DR.cameras.getRouteData();
    if (!routeData) return;

    avgSpeedZones.forEach(function(zone) {
      // Find route points for zone start and end
      var startIdx = Math.floor(zone.startKm / routeData.route_ab.length * routeData.route_ab.length);
      var endIdx = Math.floor(zone.endKm / routeData.route_ab.length * routeData.route_ab.length);
      
      startIdx = Math.max(0, Math.min(startIdx, routeData.route_ab.length - 1));
      endIdx = Math.max(0, Math.min(endIdx, routeData.route_ab.length - 1));

      if (startIdx < endIdx) {
        var zonePoints = routeData.route_ab.slice(startIdx, endIdx + 1);
        
        // Draw avg speed zone on MapLibre map
        var map = DR.mapModule ? DR.mapModule.getMap() : null;
        if (map && DR.mapModule.isReady()) {
          var zoneId = 'avg-speed-zone-' + i;
          var coords = zonePoints.map(function(p) { return [p[1], p[0]]; }); // [lng, lat]
          if (!map.getSource(zoneId)) {
            map.addSource(zoneId, {
              type: 'geojson',
              data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} }
            });
            map.addLayer({
              id: zoneId,
              type: 'line',
              source: zoneId,
              paint: { 'line-color': '#ff8c00', 'line-width': 8, 'line-opacity': 0.3, 'line-dasharray': [10, 10] }
            });
          }
        }
      }
    });
  }

  function getAverageSpeedZones() {
    return avgSpeedZones.slice(); // Return copy
  }

  function getCurrentZone() {
    return currentZone;
  }

  function getZoneEntry() {
    return zoneEntry;
  }

  function getZoneSpeedSamples() {
    return zoneSpeedSamples.slice(); // Return copy
  }

  // Public API
  DR.avgSpeedZones = {
    init: init,
    check: check,
    detectAverageSpeedZones: detectAverageSpeedZones,
    drawZonesOnMap: drawZonesOnMap,
    getAverageSpeedZones: getAverageSpeedZones,
    getCurrentZone: getCurrentZone,
    getZoneEntry: getZoneEntry,
    getZoneSpeedSamples: getZoneSpeedSamples
  };
})();