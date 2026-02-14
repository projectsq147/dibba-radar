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

  /** Detect if running in a restricted in-app browser */
  function isInAppBrowser() {
    var ua = navigator.userAgent || '';
    // Telegram, Instagram, Facebook, Twitter in-app browsers
    return /Telegram|FBAN|FBAV|Instagram|Twitter|Line\//i.test(ua);
  }

  /** Start GPS tracking */
  function startTracking() {
    if (tracking) return;

    // Check for in-app browser
    if (isInAppBrowser()) {
      showGPSError('Open in Safari or Chrome -- in-app browsers block GPS');
      // Show a persistent banner with instructions
      var banner = document.getElementById('alertBanner');
      if (banner) {
        banner.style.display = 'block';
        banner.className = 'alert-banner alert-orange';
        var text = document.getElementById('alertText');
        if (text) text.textContent = 'TAP ... MENU > OPEN IN BROWSER';
        var limit = document.getElementById('alertLimit');
        if (limit) limit.textContent = 'In-app browsers block GPS';
      }
      return;
    }

    if (!navigator.geolocation) {
      showGPSError('GPS not available on this device');
      return;
    }

    // Show acquiring state immediately
    var startBtn = document.getElementById('startDriveBtn');
    if (startBtn) {
      startBtn.textContent = 'ACQUIRING GPS...';
      startBtn.classList.add('acquiring');
      startBtn.disabled = true;
    }

    // Show alert banner with acquiring message
    var alertBanner = document.getElementById('alertBanner');
    if (alertBanner) {
      alertBanner.style.display = 'block';
      alertBanner.className = 'alert-banner alert-yellow';
      var alertText = document.getElementById('alertText');
      if (alertText) alertText.textContent = 'ACQUIRING GPS...';
      var alertLimit = document.getElementById('alertLimit');
      if (alertLimit) alertLimit.textContent = 'Allow location when prompted';
    }

    // Stop passive location if running
    stopPassive();

    tracking = true;
    positions = [];

    // Get immediate high-accuracy fix before starting watch
    navigator.geolocation.getCurrentPosition(
      function(pos) {
        var c = pos.coords;
        state.lat = c.latitude;
        state.lon = c.longitude;
        state.accuracy = c.accuracy;
        targetLat = c.latitude;
        targetLon = c.longitude;
        currentLat = c.latitude;
        currentLon = c.longitude;
        // Center map immediately on real position
        var map = DR.mapModule ? DR.mapModule.getMap() : null;
        if (map) {
          map.setView([c.latitude, c.longitude], Math.max(map.getZoom(), 15), { animate: false });
        }
        updateBlueDot();
      },
      function() { /* ignore error, watchPosition will handle it */ },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
    );
    routeKmHistory = [];
    state.direction = null;
    var gotFirstFix = false;

    // Create audio context on user gesture
    if (DR.alerts && DR.alerts.initAudio) {
      DR.alerts.initAudio();
    }

    // Request wake lock
    if (DR.hud && DR.hud.requestWakeLock) {
      DR.hud.requestWakeLock();
    }

    // Wrap onPosition to handle first fix
    var originalOnPosition = onPosition;
    var wrappedOnPosition = function(pos) {
      if (!gotFirstFix) {
        gotFirstFix = true;
        // NOW switch to full driving UI
        if (startBtn) startBtn.style.display = 'none';
        var stopBtn = document.getElementById('stopDriveBtn');
        if (stopBtn) stopBtn.style.display = 'block';
        var centerBtn = document.getElementById('centerBtn');
        if (centerBtn) centerBtn.style.display = 'block';
        var speedOverlay = document.getElementById('speedOverlay');
        if (speedOverlay) speedOverlay.style.display = 'flex';
        // Update alert banner
        if (alertBanner) {
          alertBanner.className = 'alert-banner';
          var at = document.getElementById('alertText');
          if (at) at.textContent = 'GPS LOCKED';
          var al = document.getElementById('alertLimit');
          if (al) al.textContent = '';
          // Flash green briefly
          alertBanner.classList.add('alert-green');
          setTimeout(function() {
            alertBanner.classList.remove('alert-green');
          }, 2000);
        }
        document.body.classList.add('driving');

        // Switch to HUD after brief delay
        setTimeout(function() {
          if (tracking) DR.hud.show();
        }, 1500);
      }
      originalOnPosition(pos);
    };

    watchId = navigator.geolocation.watchPosition(
      wrappedOnPosition,
      onError,
      {
        enableHighAccuracy: true,
        maximumAge: 0,    // always fresh position
        timeout: 10000
      }
    );

    // Timeout fallback -- if no fix in 20 seconds
    setTimeout(function() {
      if (tracking && !gotFirstFix) {
        showGPSError('GPS timeout -- check location settings');
        stopTracking();
      }
    }, 20000);

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
    if (startBtn) {
      // Don't show START DRIVE if a dynamic route is active (has its own GO button)
      startBtn.style.display = (DR.cameras && DR.cameras.isNavigating()) ? 'none' : 'block';
      startBtn.textContent = 'START DRIVE';
      startBtn.classList.remove('acquiring');
      startBtn.disabled = false;
    }
    // Re-show route info if navigating
    if (DR.cameras && DR.cameras.isNavigating()) {
      var ri = document.getElementById('routeInfo');
      if (ri) ri.style.display = 'flex';
    }
    var stopBtn = document.getElementById('stopDriveBtn');
    if (stopBtn) stopBtn.style.display = 'none';
    var centerBtn = document.getElementById('centerBtn');
    if (centerBtn) centerBtn.style.display = 'none';
    var speedOverlay = document.getElementById('speedOverlay');
    if (speedOverlay) speedOverlay.style.display = 'none';
    // Don't hide alert banner here -- let error messages handle their own timeout
    // Only hide if it's not showing an error (red)
    var alertBanner = document.getElementById('alertBanner');
    if (alertBanner && !alertBanner.classList.contains('alert-red') && !alertBanner.classList.contains('alert-orange')) {
      alertBanner.style.display = 'none';
    }
    var offRouteBadge = document.getElementById('offRouteBadge');
    if (offRouteBadge) offRouteBadge.style.display = 'none';
    var slowDown = document.getElementById('slowDownOverlay');
    if (slowDown) slowDown.style.display = 'none';

    // Reset alerts
    if (DR.alerts && DR.alerts.reset) {
      DR.alerts.reset();
    }

    // Restart passive location
    locatePassive();
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
        color: 'rgba(255,255,255,0.6)',
        fillColor: 'rgba(255,255,255,0.6)',
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

  /** Get current speed limit -- zone-based, with camera fallback */
  function getCurrentSpeedLimit() {
    // Prefer zone-based limit (uses route_km position)
    if (DR.speedLimit && state.routeKm !== null) {
      var zoneLimit = DR.speedLimit.update(state.routeKm);
      if (zoneLimit) return zoneLimit;
    }
    // Fallback: next camera limit
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
      // Permission denied -- stop tracking first, then show error (so banner stays visible)
      stopTracking();
      showGPSError('LOCATION PERMISSION DENIED');
    } else if (err.code === 2) {
      showGPSError('LOCATION UNAVAILABLE -- CHECK SETTINGS');
    } else if (err.code === 3) {
      // Timeout -- show message but keep trying
      showGPSError('GPS ACQUIRING -- MOVE OUTDOORS');
    }
  }

  function showGPSError(msg) {
    var banner = document.getElementById('alertBanner');
    if (banner) {
      var text = document.getElementById('alertText');
      if (text) text.textContent = msg;
      var limit = document.getElementById('alertLimit');
      if (limit) limit.textContent = '';
      banner.style.display = 'block';
      banner.className = 'alert-banner alert-red';
      // Keep visible for 8 seconds so user can read it
      setTimeout(function () {
        if (!tracking) {
          banner.style.display = 'none';
          banner.className = 'alert-banner';
        }
      }, 8000);
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

  /** Passive locate -- just show blue dot on map, no driving mode, no alerts.
   *  Called automatically on page load. Doesn't need user gesture on most browsers
   *  for getCurrentPosition (only watchPosition sometimes needs it). */
  var passiveWatchId = null;

  function locatePassive() {
    if (tracking) return; // already in driving mode
    if (!navigator.geolocation) return;

    // Use watchPosition for continuous updates even in passive mode
    passiveWatchId = navigator.geolocation.watchPosition(
      function(pos) {
        if (tracking) return; // switched to driving mode, let that handler take over

        var lat = pos.coords.latitude;
        var lon = pos.coords.longitude;
        var acc = pos.coords.accuracy;

        // Update state (but not speed/heading/routeKm -- those are driving-only)
        state.lat = lat;
        state.lon = lon;
        state.accuracy = acc;

        // Show blue dot
        var map = DR.mapModule.getMap();
        if (!map) return;

        if (!blueDotMarker) {
          blueDotMarker = L.marker([lat, lon], {
            icon: L.divIcon({
              className: 'blue-dot-icon',
              html: '<div class="blue-dot-container"><div class="blue-dot"></div></div>',
              iconSize: [40, 40],
              iconAnchor: [20, 20]
            }),
            zIndexOffset: 2000,
            interactive: false
          }).addTo(map);

          blueDotCircle = L.circle([lat, lon], {
            radius: acc || 20,
            color: 'rgba(255,255,255,0.6)',
            fillColor: 'rgba(255,255,255,0.6)',
            fillOpacity: 0.1,
            weight: 1,
            opacity: 0.3
          }).addTo(map);

          // Center map on user if they're in the UAE region
          if (lat > 22 && lat < 27 && lon > 51 && lon < 57) {
            map.setView([lat, lon], 12, { animate: true });
          }
        } else {
          blueDotMarker.setLatLng([lat, lon]);
          if (blueDotCircle) {
            blueDotCircle.setLatLng([lat, lon]);
            if (acc) blueDotCircle.setRadius(acc);
          }
        }
      },
      function(err) {
        // Silently fail in passive mode -- user didn't explicitly ask
        console.log('Passive GPS:', err.code, err.message);
      },
      {
        enableHighAccuracy: true, // get accurate position from the start
        maximumAge: 5000,
        timeout: 10000
      }
    );
  }

  /** Stop passive tracking (called when driving mode starts) */
  function stopPassive() {
    if (passiveWatchId !== null) {
      navigator.geolocation.clearWatch(passiveWatchId);
      passiveWatchId = null;
    }
  }

  DR.gps = {
    getState: getState,
    isTracking: isTracking,
    isAutoCenter: isAutoCenter,
    startTracking: startTracking,
    stopTracking: stopTracking,
    toggleAutoCenter: toggleAutoCenter,
    setupMapDragHandler: setupMapDragHandler,
    locatePassive: locatePassive
  };
})();
