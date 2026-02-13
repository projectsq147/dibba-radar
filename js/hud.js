/* js/hud.js -- Full-screen HUD driving mode */
(function () {
  'use strict';
  var DR = window.DibbaRadar = window.DibbaRadar || {};

  var visible = false;
  var wakeLock = null;
  var updateTimer = null;

  function isVisible() { return visible; }

  /** Show HUD overlay */
  function show() {
    visible = true;
    var el = document.getElementById('hudContainer');
    if (el) el.style.display = 'flex';
    document.body.classList.add('hud-active');

    // Hide map-view driving elements
    var speedOverlay = document.getElementById('speedOverlay');
    if (speedOverlay) speedOverlay.style.display = 'none';

    // Start continuous update loop
    startUpdateLoop();

    // Request full-screen on mobile
    try {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(function () {});
      } else if (document.documentElement.webkitRequestFullscreen) {
        document.documentElement.webkitRequestFullscreen();
      }
    } catch (e) { /* ignore */ }
  }

  /** Hide HUD overlay */
  function hide() {
    visible = false;
    var el = document.getElementById('hudContainer');
    if (el) el.style.display = 'none';
    document.body.classList.remove('hud-active');

    // Show map-view driving elements if still tracking
    if (DR.gps && DR.gps.isTracking()) {
      var speedOverlay = document.getElementById('speedOverlay');
      if (speedOverlay) speedOverlay.style.display = 'flex';
    }

    stopUpdateLoop();

    // Exit full-screen
    try {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(function () {});
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    } catch (e) { /* ignore */ }
  }

  /** Toggle HUD visibility */
  function toggle() {
    if (visible) hide();
    else show();
  }

  /** Request wake lock to keep screen on */
  function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      navigator.wakeLock.request('screen').then(function (lock) {
        wakeLock = lock;
        lock.addEventListener('release', function () { wakeLock = null; });
      }).catch(function () { /* ignore */ });
    } catch (e) { /* ignore */ }
  }

  /** Release wake lock */
  function releaseWakeLock() {
    if (wakeLock) {
      try { wakeLock.release(); } catch (e) { /* ignore */ }
      wakeLock = null;
    }
  }

  /** Re-acquire wake lock on visibility change */
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && DR.gps && DR.gps.isTracking()) {
      requestWakeLock();
    }
  });

  /** Start continuous update loop (for smooth countdown) */
  function startUpdateLoop() {
    if (updateTimer) clearInterval(updateTimer);
    updateTimer = setInterval(function () {
      if (!visible) return;
      var gpsState = DR.gps ? DR.gps.getState() : {};
      update(gpsState);
    }, 250); // 4 updates per second for smooth countdown
  }

  function stopUpdateLoop() {
    if (updateTimer) {
      clearInterval(updateTimer);
      updateTimer = null;
    }
  }

  /** Update HUD display with current state */
  function update(gpsState) {
    if (!visible) return;

    // Speed
    var speedEl = document.getElementById('hudSpeed');
    var speedUnitEl = document.getElementById('hudSpeedUnit');
    var limitEl = document.getElementById('hudLimit');

    if (speedEl) {
      if (gpsState.speed !== null && gpsState.speed !== undefined) {
        var spd = Math.round(gpsState.speed);
        speedEl.textContent = spd;

        // Color based on speed vs limit
        var nextCam = DR.alerts ? DR.alerts.getNextCamera() : null;
        var limit = null;
        if (nextCam && nextCam.speed && nextCam.speed !== '?') {
          limit = parseInt(nextCam.speed, 10);
        }

        speedEl.classList.remove('hud-speed-ok', 'hud-speed-warn', 'hud-speed-over');
        if (limit) {
          if (spd > limit + 20) {
            speedEl.classList.add('hud-speed-over');
          } else if (spd > limit) {
            speedEl.classList.add('hud-speed-warn');
          } else {
            speedEl.classList.add('hud-speed-ok');
          }
          if (limitEl) limitEl.textContent = 'LIMIT: ' + limit;
        } else {
          speedEl.classList.add('hud-speed-ok');
          if (limitEl) limitEl.textContent = '';
        }
      } else {
        speedEl.textContent = '--';
        speedEl.classList.remove('hud-speed-ok', 'hud-speed-warn', 'hud-speed-over');
        speedEl.classList.add('hud-speed-ok');
        if (limitEl) limitEl.textContent = '';
      }
    }

    // Camera distance
    var camDistEl = document.getElementById('hudCamDist');
    var camLabelEl = document.getElementById('hudCamLabel');
    var camBarEl = document.getElementById('hudCamBar');

    var nextDist = DR.alerts ? DR.alerts.getNextCameraDistance() : null;
    var nextCamObj = DR.alerts ? DR.alerts.getNextCamera() : null;

    if (camDistEl) {
      if (nextDist !== null) {
        if (nextDist < 0.05) {
          camDistEl.textContent = 'NOW';
          camDistEl.classList.add('hud-cam-flash');
        } else if (nextDist < 1) {
          camDistEl.textContent = (nextDist * 1000).toFixed(0) + 'm';
          camDistEl.classList.remove('hud-cam-flash');
        } else {
          camDistEl.textContent = nextDist.toFixed(1) + ' km';
          camDistEl.classList.remove('hud-cam-flash');
        }
      } else {
        camDistEl.textContent = '--';
        camDistEl.classList.remove('hud-cam-flash');
      }
    }

    if (camLabelEl) {
      if (nextCamObj) {
        var src = nextCamObj.source === 'waze_police' ? 'POLICE' : 'CAMERA';
        camLabelEl.textContent = src + ' IN';
      } else {
        camLabelEl.textContent = 'NO CAMERA';
      }
    }

    // Camera proximity bar (fills as you approach, 5km range)
    if (camBarEl) {
      if (nextDist !== null && nextDist < 5) {
        var pct = Math.max(0, Math.min(100, ((5 - nextDist) / 5) * 100));
        camBarEl.style.width = pct + '%';
        if (nextDist < 0.2) {
          camBarEl.className = 'hud-cam-bar-fill hud-bar-red';
        } else if (nextDist < 0.5) {
          camBarEl.className = 'hud-cam-bar-fill hud-bar-orange';
        } else if (nextDist < 1) {
          camBarEl.className = 'hud-cam-bar-fill hud-bar-yellow';
        } else {
          camBarEl.className = 'hud-cam-bar-fill';
        }
      } else {
        camBarEl.style.width = '0%';
        camBarEl.className = 'hud-cam-bar-fill';
      }
    }

    // Gap info
    var gapEl = document.getElementById('hudGap');
    if (gapEl && gpsState.routeKm !== null && gpsState.routeKm !== undefined) {
      var allCams = DR.cameras ? DR.cameras.getAllCams() : [];
      var dir = gpsState.direction || (DR.mapModule ? DR.mapModule.getDirection() : 'ab');
      var userKm = gpsState.routeKm;

      // Find prev and next camera
      var prevCam = null, nextCamGap = null;
      for (var i = 0; i < allCams.length; i++) {
        if (allCams[i].route_km <= userKm) prevCam = allCams[i];
        if (allCams[i].route_km > userKm && !nextCamGap) nextCamGap = allCams[i];
      }

      if (prevCam && nextCamGap) {
        var gap = nextCamGap.route_km - prevCam.route_km;
        if (gap >= 3) {
          gapEl.textContent = 'CLEAN STRETCH ' + gap.toFixed(1) + ' km';
          gapEl.className = 'hud-gap hud-gap-clean';
        } else {
          gapEl.textContent = 'CAMERA ZONE';
          gapEl.className = 'hud-gap hud-gap-zone';
        }
      } else {
        gapEl.textContent = '';
      }
    }

    // Next cam info
    var nextInfoEl = document.getElementById('hudNextInfo');
    if (nextInfoEl && nextCamObj) {
      var spdLimit = nextCamObj.speed;
      if (spdLimit && spdLimit !== '?') {
        nextInfoEl.textContent = 'NEXT: ' + spdLimit + ' km/h';
      } else if (nextCamObj.source === 'waze_police') {
        nextInfoEl.textContent = 'POLICE REPORT';
      } else {
        nextInfoEl.textContent = 'NEXT: ???';
      }
    } else if (nextInfoEl) {
      nextInfoEl.textContent = '';
    }

    // Route progress bar
    var progressEl = document.getElementById('hudProgress');
    if (progressEl && gpsState.routeKm !== null) {
      var rd = DR.cameras ? DR.cameras.getRouteData() : null;
      var totalKm = rd ? rd.distance_km : 115.84;
      var pctRoute = Math.max(0, Math.min(100, (gpsState.routeKm / totalKm) * 100));
      progressEl.style.width = pctRoute + '%';
    }

    // Off route indicator in HUD
    var hudOffRoute = document.getElementById('hudOffRoute');
    if (hudOffRoute) {
      hudOffRoute.style.display = gpsState.offRoute ? 'block' : 'none';
    }
  }

  DR.hud = {
    show: show,
    hide: hide,
    toggle: toggle,
    isVisible: isVisible,
    update: update,
    requestWakeLock: requestWakeLock,
    releaseWakeLock: releaseWakeLock
  };
})();
