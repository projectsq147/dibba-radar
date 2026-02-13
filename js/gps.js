/* js/gps.js -- GPS tracking, speed calculation, blue dot, route snapping */
(function () {
  'use strict';
  var DR = window.DibbaRadar = window.DibbaRadar || {};

  var watchId = null;
  var tracking = false;
  var positions = []; // last N positions for speed/heading calc
  var MAX_POS = 10;
  var routeKmHistory = []; // last 5 route_km values for direction detection
  var MAX_KM_HIST = 5;

  // Current state
  var state = {
    lat: null,
    lon: null,
    speed: null,        // km/h or null
    heading: null,      // degrees 0-360
    routeKm: null,      // km along route
    routeIdx: null,     // index in route array
    direction: null,    // 'ab' or 'ba' or null (auto-detected)
    offRoute: false,    // true if >1km from route
    accuracy: null,     // GPS accuracy in meters
    timestamp: null
  };

  var autoCenter = true;
  var blueDotMarker = null;
  var blueDotCircle = null; // accuracy circle
  var animFrameId = null;
  var targetLat = null, targetLon = null;
  var currentLat = null, currentLon = null;

  function getState() { return state; }
  function isTracking() { return tracking; }
  function isAutoCenter() { return autoCenter; }

  function setAutoCenter(val) {
    autoCenter = val;
    var btn = document.getElementById('centerBtn');
    if (btn) {
      btn.classList.toggle('active', val);
    }
  }

  function toggleAutoCenter() {
    setAutoCenter(!autoCenter);
    if (autoCenter && state.lat !== null) {
      var map = DR.mapModule.getMap();
      if (map) map.setView([state.lat, state.lon], Math.max(map.getZoom(), 14));
    }
  }

  /** Start GPS tracking */
  function startTracking() {
    if (tracking) return;

    if (!navigator.geolocation) {
      showGPSError('GPS not available on this device');
      return;
    }

    tracking = true;
    positions = [];
    routeKmHistory = [];
    state.direction = null;

    // Create audio context on user gesture
    if (DR.alerts && DR.alerts.initAudio) {
      DR.alerts.initAudio();
    }

    // Request wake lock
    if (DR.hud && DR.hud.requestWakeLock) {
      DR.hud.requestWakeLock();
    }

    watchId = navigator.geolocation.watchPosition(
      onPosition,
      onError,
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000
      }
    );

    // Update UI
    document.body.classList.add('driving');
    var startBtn = document.getElementById('startDriveBtn');
    if (startBtn) startBtn.style.display = 'none';
    var stopBtn = document.getElementById('stopDriveBtn');
    if (stopBtn) stopBtn.style.display = 'block';
    var centerBtn = document.getElementById('centerBtn');
    if (centerBtn) centerBtn.style.display = 'block';
    var speedOverlay = document.getElementById('speedOverlay');
    if (speedOverlay) speedOverlay.style.display = 'flex';
    var alertBanner = document.getElementById('alertBanner');
    if (alertBanner) alertBanner.style.display = 'block';

    // Start smooth animation
    startAnimation();
  }

  /** Stop GPS tracking */
  function stopTracking() {
    if (!tracking) return;
    tracking = false;

    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }

    // Stop animation
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }

    // Remove blue dot
    var map = DR.mapModule.getMap();
    if (map) {
      if (blueDotMarker) { map.removeLayer(blueDotMarker); blueDotMarker = null; }
      if (blueDotCircle) { map.removeLayer(blueDotCircle); blueDotCircle = null; }
    }

    // Release wake lock
    if (DR.hud && DR.hud.releaseWakeLock) {
      DR.hud.releaseWakeLock();
    }

    // Hide HUD if showing
    if (DR.hud && DR.hud.hide) {
      DR.hud.hide();
    }

    // Reset state
    state.lat = null;
    state.lon = null;
    state.speed = null;
    state.heading = null;
    state.routeKm = null;
    state.routeIdx = null;
    state.direction = null;
    state.offRoute = false;
    positions = [];
    routeKmHistory = [];
    currentLat = null;
    currentLon = null;
    targetLat = null;
    targetLon = null;

    // Update UI
    document.body.classList.remove('driving');
    var startBtn = document.getElementById('startDriveBtn');
    if (startBtn) startBtn.style.display = 'block';
    var stopBtn = document.getElementById('stopDriveBtn');
    if (stopBtn) stopBtn.style.display = 'none';
    var centerBtn = document.getElementById('centerBtn');
    if (centerBtn) centerBtn.style.display = 'none';
    var speedOverlay = document.getElementById('speedOverlay');
    if (speedOverlay) speedOverlay.style.display = 'none';
    var alertBanner = document.getElementById('alertBanner');
    if (alertBanner) alertBanner.style.display = 'none';
    var offRouteBadge = document.getElementById('offRouteBadge');
    if (offRouteBadge) offRouteBadge.style.display = 'none';
    var slowDown = document.getElementById('slowDownOverlay');
    if (slowDown) slowDown.style.display = 'none';

    // Reset alerts
    if (DR.alerts && DR.alerts.reset) {
      DR.alerts.reset();
    }
  }

  /** Handle new GPS position */
  function onPosition(pos) {
    var coords = pos.coords;
    var now = pos.timestamp;

    state.lat = coords.latitude;
    state.lon = coords.longitude;
    state.accuracy = coords.accuracy;
    state.timestamp = now;

    // Set animation target
    targetLat = coords.latitude;
    targetLon = coords.longitude;
    if (currentLat === null) {
      currentLat = targetLat;
      currentLon = targetLon;
    }

    // Store position for speed/heading calculation
    positions.push({
      lat: coords.latitude,
      lon: coords.longitude,
      time: now,
      coordsSpeed: coords.speed // m/s or null
    });
    if (positions.length > MAX_POS) positions.shift();

    // Calculate speed
    calculateSpeed(coords);

    // Calculate heading
    calculateHeading();

    // Snap to route
    snapToRoute();

    // Detect direction
    detectDirection();

    // Check off-route
    checkOffRoute();

    // Auto-center map
    if (autoCenter) {
      var map = DR.mapModule.getMap();
      if (map) {
        map.setView([coords.latitude, coords.longitude], Math.max(map.getZoom(), 14), {
          animate: true,
          duration: 0.5
        });
      }
    }

    // Update blue dot
    updateBlueDot();

    // Update speed overlay
    updateSpeedOverlay();

    // Run alerts
    if (DR.alerts && DR.alerts.check) {
      DR.alerts.check(state);
    }

    // Update HUD if visible
    if (DR.hud && DR.hud.isVisible && DR.hud.isVisible()) {
      DR.hud.update(state);
    }
  }

  /** Calculate speed from position deltas and/or coords.speed */
  function calculateSpeed(coords) {
    // Prefer coords.speed when available and reasonable
    if (coords.speed !== null && coords.speed !== undefined && coords.speed >= 0) {
      state.speed = coords.speed * 3.6; // m/s to km/h
      return;
    }

    // Calculate from position deltas
    if (positions.length >= 2) {
      var p1 = positions[positions.length - 2];
      var p2 = positions[positions.length - 1];
      var dt = (p2.time - p1.time) / 1000; // seconds
      if (dt > 0 && dt < 30) { // sanity check
        var dist = DR.haversine([p1.lat, p1.lon], [p2.lat, p2.lon]); // km
        var speed = (dist / dt) * 3600; // km/h
        // Sanity check: ignore speeds > 300 km/h
        if (speed < 300) {
          state.speed = speed;
          return;
        }
      }
    }

    state.speed = null;
  }

  /** Calculate heading from last two positions */
  function calculateHeading() {
    if (positions.length < 2) {
      state.heading = null;
      return;
    }
    var p1 = positions[positions.length - 2];
    var p2 = positions[positions.length - 1];

    // Only calc heading if moved more than ~5m
    var dist = DR.haversine([p1.lat, p1.lon], [p2.lat, p2.lon]);
    if (dist < 0.005) return; // keep previous heading

    var dLon = (p2.lon - p1.lon) * Math.PI / 180;
    var lat1 = p1.lat * Math.PI / 180;
    var lat2 = p2.lat * Math.PI / 180;
    var y = Math.sin(dLon) * Math.cos(lat2);
    var x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    var bearing = Math.atan2(y, x) * 180 / Math.PI;
    state.heading = (bearing + 360) % 360;
  }

  /** Snap current position to route */
  function snapToRoute() {
    var rd = DR.cameras.getRouteData();
    if (!rd) return;
    var cumDist = DR.cameras.getCumDist();
    if (!cumDist) return;

    var snap = DR.snapToRoute(state.lat, state.lon, rd.route_ab, rd.route_ba, cumDist);
    state.routeKm = snap.km;
    state.routeIdx = snap.idx;
    // snap.dist is in meters
    state.offRoute = snap.dist > 1000;
  }

  /** Auto-detect driving direction from route_km history */
  function detectDirection() {
    if (state.routeKm === null) return;

    routeKmHistory.push(state.routeKm);
    if (routeKmHistory.length > MAX_KM_HIST) routeKmHistory.shift();

    if (routeKmHistory.length >= 3) {
      var increasing = 0, decreasing = 0;
      for (var i = 1; i < routeKmHistory.length; i++) {
        var diff = routeKmHistory[i] - routeKmHistory[i - 1];
        if (diff > 0.05) increasing++;
        else if (diff < -0.05) decreasing++;
      }
      if (increasing > decreasing && increasing >= 2) {
        state.direction = 'ab'; // Dubai -> Dibba (km increasing)
      } else if (decreasing > increasing && decreasing >= 2) {
        state.direction = 'ba'; // Dibba -> Dubai (km decreasing)
      }
      // If no clear pattern, keep current direction or null
    }

    // Sync direction with map if detected
    if (state.direction && DR.mapModule.getDirection() !== state.direction) {
      // Update map direction display but don't flip (user might have set it)
    }
  }

  /** Check if user is off route */
  function checkOffRoute() {
    var badge = document.getElementById('offRouteBadge');
    if (!badge) return;
    if (state.offRoute) {
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }

  /** Update or create blue dot marker */
  function updateBlueDot() {
    var map = DR.mapModule.getMap();
    if (!map) return;

    var lat = currentLat || state.lat;
    var lon = currentLon || state.lon;
    if (lat === null) return;

    var rotation = state.heading !== null ? state.heading : 0;
    var hasHeading = state.heading !== null;

    var dotHtml = '<div class="blue-dot-container">' +
      (hasHeading ? '<div class="blue-dot-cone" style="transform:rotate(' + rotation + 'deg)"></div>' : '') +
      '<div class="blue-dot"></div>' +
      '</div>';

    if (!blueDotMarker) {
      blueDotMarker = L.marker([lat, lon], {
        icon: L.divIcon({
          className: 'blue-dot-icon',
          html: dotHtml,
          iconSize: [40, 40],
          iconAnchor: [20, 20]
        }),
        zIndexOffset: 2000,
        interactive: false
      }).addTo(map);

      // Accuracy circle
      blueDotCircle = L.circle([lat, lon], {
        radius: state.accuracy || 20,
        color: '#4285f4',
        fillColor: '#4285f4',
        fillOpacity: 0.1,
        weight: 1,
        opacity: 0.3
      }).addTo(map);
    } else {
      blueDotMarker.setLatLng([lat, lon]);
      blueDotMarker.setIcon(L.divIcon({
        className: 'blue-dot-icon',
        html: dotHtml,
        iconSize: [40, 40],
        iconAnchor: [20, 20]
      }));
      if (blueDotCircle) {
        blueDotCircle.setLatLng([lat, lon]);
        if (state.accuracy) blueDotCircle.setRadius(state.accuracy);
      }
    }
  }

  /** Smooth animation loop for blue dot */
  function startAnimation() {
    function animate() {
      if (!tracking) return;
      if (targetLat !== null && currentLat !== null) {
        // Lerp toward target
        var lerp = 0.15;
        currentLat += (targetLat - currentLat) * lerp;
        currentLon += (targetLon - currentLon) * lerp;

        // Update marker position
        if (blueDotMarker) {
          blueDotMarker.setLatLng([currentLat, currentLon]);
        }
        if (blueDotCircle) {
          blueDotCircle.setLatLng([currentLat, currentLon]);
        }
      }
      animFrameId = requestAnimationFrame(animate);
    }
    animFrameId = requestAnimationFrame(animate);
  }

  /** Update speed overlay on map view */
  function updateSpeedOverlay() {
    var el = document.getElementById('speedValue');
    if (!el) return;

    if (state.speed !== null && state.speed >= 0) {
      var spd = Math.round(state.speed);
      el.textContent = spd;

      // Color based on speed vs nearest camera limit
      var limit = getCurrentSpeedLimit();
      var container = document.getElementById('speedOverlay');
      if (container) {
        container.classList.remove('speed-ok', 'speed-warn', 'speed-over');
        if (limit) {
          if (spd > limit + 20) {
            container.classList.add('speed-over');
          } else if (spd > limit) {
            container.classList.add('speed-warn');
          } else {
            container.classList.add('speed-ok');
          }
        } else {
          container.classList.add('speed-ok');
        }
      }
    } else {
      el.textContent = '--';
    }
  }

  /** Get current speed limit based on next camera */
  function getCurrentSpeedLimit() {
    if (!DR.alerts) return null;
    var next = DR.alerts.getNextCamera();
    if (next && next.speed && next.speed !== '?') {
      return parseInt(next.speed, 10);
    }
    return null;
  }

  /** Handle GPS error */
  function onError(err) {
    console.warn('GPS error:', err.code, err.message);
    if (err.code === 1) {
      showGPSError('Location permission denied');
      stopTracking();
    } else if (err.code === 2) {
      showGPSError('Location unavailable');
    }
    // timeout (code 3) -- just wait for next fix
  }

  function showGPSError(msg) {
    var banner = document.getElementById('alertBanner');
    if (banner) {
      var text = banner.querySelector('.alert-text');
      if (text) text.textContent = msg;
      banner.style.display = 'block';
      banner.className = 'alert-banner alert-red';
      setTimeout(function () {
        if (!tracking) banner.style.display = 'none';
      }, 5000);
    }
  }

  // Disable auto-center on manual map drag
  function setupMapDragHandler() {
    var map = DR.mapModule.getMap();
    if (map) {
      map.on('dragstart', function () {
        if (tracking && autoCenter) {
          setAutoCenter(false);
        }
      });
    }
  }

  DR.gps = {
    getState: getState,
    isTracking: isTracking,
    isAutoCenter: isAutoCenter,
    startTracking: startTracking,
    stopTracking: stopTracking,
    toggleAutoCenter: toggleAutoCenter,
    setupMapDragHandler: setupMapDragHandler
  };
})();
