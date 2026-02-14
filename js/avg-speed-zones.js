/* js/avg-speed-zones.js -- Average speed camera zone detection */
(function () {
  'use strict';
  var DR = window.DibbaRadar = window.DibbaRadar || {};

  var avgSpeedZones = [];
  var currentZone = null;
  var zoneEntry = null;
  var zoneSpeedSamples = [];

  function init() {
    // Listen for route data changes
    document.addEventListener('routeDataLoaded', function() {
      detectAverageSpeedZones();
    });

    // Listen for GPS updates during driving
    document.addEventListener('driveUpdate', function(e) {
      if (e.detail && e.detail.position) {
        updateZoneTracking(e.detail.position, e.detail.speed || 0);
      }
    });

    // Clear zones when drive stops
    document.addEventListener('driveStop', function() {
      exitCurrentZone();
    });
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
    // Update any zone progress displays
    var remaining = zone.length - distance;
    var progress = Math.min(distance / zone.length, 1);

    // Could update a progress bar or distance remaining display
    console.log('Zone progress:', (progress * 100).toFixed(1) + '%', 
                'Avg speed:', avgSpeed.toFixed(1) + 'km/h');
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
        
        var zoneLine = L.polyline(zonePoints, {
          color: '#ff8c00',
          weight: 8,
          opacity: 0.3,
          dashArray: '10, 10'
        }).addTo(routeLayer);
        
        zoneLine.bindPopup(
          '<div class="pt">AVERAGE SPEED ZONE</div>' +
          '<div class="ps">' + zone.speedLimit + ' km/h limit</div>' +
          '<div class="pc">' + zone.length.toFixed(1) + 'km length</div>' +
          '<div style="margin-top:6px;font-size:10px;color:var(--muted)">Monitor your average speed through this section</div>'
        );
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
    detectAverageSpeedZones: detectAverageSpeedZones,
    drawZonesOnMap: drawZonesOnMap,
    getAverageSpeedZones: getAverageSpeedZones,
    getCurrentZone: getCurrentZone,
    getZoneEntry: getZoneEntry,
    getZoneSpeedSamples: getZoneSpeedSamples
  };
})();