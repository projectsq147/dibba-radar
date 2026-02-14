/* js/radar-map.js -- Full radar map view: all cameras + heat-colored roads */
(function () {
  'use strict';
  var DR = window.DibbaRadar = window.DibbaRadar || {};

  var loaded = false;
  var cameraMarkers = [];
  var segmentLines = [];
  var clusterGroup = null;
  var data = null;
  var nearbyAlertActive = false;
  var lastAlertCam = null;
  var nearbyCheckInterval = null;

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

    // Draw colored road segments first (under cameras)
    var segs = data.segments || [];
    for (var i = 0; i < segs.length; i++) {
      var seg = segs[i];
      if (!seg.coords || seg.coords.length < 2) continue;
      var line = L.polyline(seg.coords, {
        color: seg.color,
        weight: 4,
        opacity: 0.7,
        smoothFactor: 1
      }).addTo(map);
      segmentLines.push(line);
    }

    // Draw camera markers
    var cams = data.cameras || [];
    for (var j = 0; j < cams.length; j++) {
      var c = cams[j];
      var marker = createCameraMarker(c);
      if (marker) {
        marker.addTo(map);
        cameraMarkers.push(marker);
      }
    }

    // Fit map to show all segments
    if (segmentLines.length > 0) {
      var group = L.featureGroup(segmentLines);
      var bounds = group.getBounds();
      if (bounds.isValid()) {
        // Don't auto-fit if user has a GPS position in UAE
        var st = DR.gps ? DR.gps.getState() : {};
        if (!st.lat || st.lat < 22 || st.lat > 27) {
          map.fitBounds(bounds, { padding: [30, 30] });
        }
      }
    }
  }

  /** Create a camera marker with appropriate icon */
  function createCameraMarker(cam) {
    var sl = cam.speed_limit;
    var hasLimit = sl && sl !== '?' && sl !== 'unknown';
    var limitNum = hasLimit ? parseInt(sl, 10) : null;

    // Color based on speed limit
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

    var icon = L.divIcon({
      className: 'radar-cam-icon',
      html: '<div style="' +
        'width:' + size + 'px;height:' + size + 'px;' +
        'background:' + color + ';' +
        'border:1.5px solid rgba(255,255,255,0.8);' +
        'border-radius:50%;' +
        'box-shadow:0 0 6px ' + color + '80;' +
        '"></div>',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2]
    });

    var marker = L.marker([cam.lat, cam.lon], {
      icon: icon,
      interactive: true
    });

    // Popup with speed limit
    var popupText = '<b>Speed Camera</b><br>';
    if (hasLimit) {
      popupText += 'Limit: <b>' + sl + ' km/h</b><br>';
    }
    popupText += 'Source: ' + (cam.source || 'OSM');
    marker.bindPopup(popupText, { className: 'radar-popup' });

    return marker;
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
    } else {
      // Clear HUD
      var camDistEl2 = document.getElementById('hudCamDist');
      if (camDistEl2) camDistEl2.textContent = '--';
      lastAlertCam = null;
    }
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
    for (var i = 0; i < cameraMarkers.length; i++) {
      cameraMarkers[i].remove();
    }
    cameraMarkers = [];
    for (var j = 0; j < segmentLines.length; j++) {
      segmentLines[j].remove();
    }
    segmentLines = [];
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
