/* js/hud.js -- Full-screen HUD driving mode */
(function () {
  'use strict';
  var DR = window.DibbaRadar = window.DibbaRadar || {};

  var visible = false;
  var wakeLock = null;
  var updateTimer = null;
  var _turnFlashOn = false;
  var _turnFlashTimer = null;

  /** Return an SVG string for a maneuver type + modifier */
  function getTurnSvg(type, modifier) {
    var s = 'http://www.w3.org/2000/svg';
    var attrs = 'xmlns="' + s + '" width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"';

    if (type === 'arrive') {
      // Flag / destination icon
      return '<svg ' + attrs + '><path d="M16 28V6"/><path d="M16 6l10 4-10 4"/></svg>';
    }
    if (type === 'roundabout' || type === 'rotary') {
      return '<svg ' + attrs + '><circle cx="16" cy="14" r="6"/><path d="M16 20v8"/><path d="M22 14l4-6"/></svg>';
    }
    if (type === 'merge') {
      return '<svg ' + attrs + '><path d="M10 6l6 10 6-10"/><path d="M16 16v12"/></svg>';
    }
    if (type === 'fork') {
      if (modifier === 'left' || modifier === 'slight left') {
        return '<svg ' + attrs + '><path d="M16 28V16"/><path d="M16 16L8 6"/><path d="M16 16l8-2"/></svg>';
      }
      return '<svg ' + attrs + '><path d="M16 28V16"/><path d="M16 16l8-10"/><path d="M16 16L8 14"/></svg>';
    }

    // U-turn
    if (modifier === 'uturn') {
      return '<svg ' + attrs + '><path d="M20 28V12a6 6 0 0 0-12 0v2"/><path d="M12 10l-4 4 4 4"/></svg>';
    }

    // Directional turns
    if (modifier === 'sharp left') {
      return '<svg ' + attrs + '><path d="M16 28V14"/><path d="M16 14L6 8"/><path d="M6 8l2 6"/></svg>';
    }
    if (modifier === 'left') {
      return '<svg ' + attrs + '><path d="M16 28V14"/><path d="M16 14H6"/><path d="M10 10L6 14l4 4"/></svg>';
    }
    if (modifier === 'slight left') {
      return '<svg ' + attrs + '><path d="M18 28V16"/><path d="M18 16L8 6"/><path d="M8 6l1 7"/></svg>';
    }
    if (modifier === 'sharp right') {
      return '<svg ' + attrs + '><path d="M16 28V14"/><path d="M16 14l10-6"/><path d="M26 8l-2 6"/></svg>';
    }
    if (modifier === 'right') {
      return '<svg ' + attrs + '><path d="M16 28V14"/><path d="M16 14h10"/><path d="M22 10l4 4-4 4"/></svg>';
    }
    if (modifier === 'slight right') {
      return '<svg ' + attrs + '><path d="M14 28V16"/><path d="M14 16l10-10"/><path d="M24 6l-1 7"/></svg>';
    }

    // Default: straight arrow (depart, new name, straight, continue, etc.)
    return '<svg ' + attrs + '><path d="M16 28V6"/><path d="M10 12l6-6 6 6"/></svg>';
  }

  /** Format a distance in meters for display */
  function formatTurnDist(meters) {
    if (meters === null || meters === undefined) return '--';
    if (meters < 1000) return Math.round(meters) + 'm';
    return (meters / 1000).toFixed(1) + ' km';
  }

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

    // Zoom map in for driving view
    if (DR.mapModule) {
      var map = DR.mapModule.getMap();
      if (map && map.getZoom() < 15) {
        map.easeTo({ zoom: 15 });
      }
    }

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

        // Get speed limit: zone system > radar-map nearest > route alerts
        var limit = null;
        if (DR.speedLimit && gpsState.routeKm !== null) {
          limit = DR.speedLimit.update(gpsState.routeKm);
        }
        if (!limit) {
          var rn = DR.radarMap ? DR.radarMap.getNearestCam() : null;
          if (rn && rn.cam) {
            var rsl = rn.cam.speed_limit || rn.cam.speed;
            if (rsl && rsl !== '?' && rsl !== 'unknown') limit = parseInt(rsl, 10);
          }
        }
        if (!limit && DR.alerts) {
          var nextCam = DR.alerts.getNextCamera();
          if (nextCam && nextCam.speed && nextCam.speed !== '?') {
            limit = parseInt(nextCam.speed, 10);
          }
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
        } else {
          speedEl.classList.add('hud-speed-ok');
        }
      } else {
        speedEl.textContent = '--';
        speedEl.classList.remove('hud-speed-ok', 'hud-speed-warn', 'hud-speed-over');
        speedEl.classList.add('hud-speed-ok');
        if (limitEl) limitEl.textContent = '';
      }
    }

    // Camera distance -- use radar-map's nearby state as primary source,
    // fall back to route-based alerts if available
    var camDistEl = document.getElementById('hudCamDist');
    var camLabelEl = document.getElementById('hudCamLabel');
    var camBarEl = document.getElementById('hudCamBar');

    var nextDist = null;
    var nextCamObj = null;
    var camLabel = 'CAMERA';

    // Primary: radar-map nearby camera (works in radar/free-drive mode)
    var radarNear = DR.radarMap ? DR.radarMap.getNearestCam() : null;
    if (radarNear && radarNear.dist !== null) {
      nextDist = radarNear.dist;
      nextCamObj = radarNear.cam;
      camLabel = 'CAMERA';
    }

    // Fallback: route-based alerts (works in navigation mode)
    if (nextDist === null && DR.alerts) {
      nextDist = DR.alerts.getNextCameraDistance();
      nextCamObj = DR.alerts.getNextCamera();
      if (nextCamObj && nextCamObj.source === 'waze_police') camLabel = 'POLICE';
    }

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
        camLabelEl.textContent = camLabel + ' IN';
      } else {
        camLabelEl.textContent = 'NO CAMERA';
      }
    }

    // Update HUD limit badge from nearest camera
    var hudLimitBadge = document.getElementById('hudLimitBadge');
    if (hudLimitBadge && nextCamObj) {
      var sl = nextCamObj.speed_limit || nextCamObj.speed;
      if (sl && sl !== '?' && sl !== 'unknown') {
        hudLimitBadge.textContent = sl;
      } else {
        hudLimitBadge.textContent = '--';
      }
    } else if (hudLimitBadge) {
      hudLimitBadge.textContent = '--';
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

    // ETA calculation
    var etaContainer = document.getElementById('hudEta');
    var etaTimeEl = document.getElementById('hudEtaTime');
    if (etaContainer && etaTimeEl) {
      var showEta = false;
      // Check if navigating with route data
      if (DR.cameras && DR.cameras.isNavigating && DR.cameras.isNavigating()) {
        var rd = DR.cameras.getRouteData();
        if (rd && rd.distance_km && gpsState.routeKm !== null && gpsState.routeKm !== undefined) {
          var remainingKm = rd.distance_km - gpsState.routeKm;
          if (remainingKm > 0) {
            var currentSpeed = gpsState.speed;
            // Use current speed if > 10 km/h, otherwise estimate from route avg
            var estSpeed = (currentSpeed && currentSpeed > 10) ? currentSpeed :
              (rd.duration_min > 0 ? (rd.distance_km / rd.duration_min) * 60 : 80);
            if (estSpeed > 0) {
              var remainingHours = remainingKm / estSpeed;
              var etaMs = Date.now() + remainingHours * 3600000;
              var etaDate = new Date(etaMs);
              var hh = etaDate.getHours().toString();
              var mm = etaDate.getMinutes().toString().padStart(2, '0');
              etaTimeEl.textContent = hh + ':' + mm;
              showEta = true;
            }
          }
        }
      }
      etaContainer.style.display = showEta ? 'block' : 'none';
    }

    // Off route indicator in HUD
    var hudOffRoute = document.getElementById('hudOffRoute');
    if (hudOffRoute) {
      hudOffRoute.style.display = gpsState.offRoute ? 'block' : 'none';
    }

    // Turn-by-turn instruction
    var hudTurn = document.getElementById('hudTurn');
    if (hudTurn) {
      var maneuver = DR.routing ? DR.routing.getNextManeuver() : null;
      if (maneuver && maneuver.distance !== null) {
        hudTurn.style.display = 'flex';
        var iconEl = document.getElementById('hudTurnIcon');
        var distEl = document.getElementById('hudTurnDist');
        var nameEl = document.getElementById('hudTurnName');

        if (iconEl) iconEl.innerHTML = getTurnSvg(maneuver.type, maneuver.modifier);
        if (distEl) distEl.textContent = formatTurnDist(maneuver.distance);
        if (nameEl) nameEl.textContent = maneuver.name || '';

        // Approaching state
        if (maneuver.distance < 100) {
          hudTurn.classList.add('approaching');
        } else {
          hudTurn.classList.remove('approaching');
        }

        // Flash when very close
        if (maneuver.distance < 30) {
          if (!_turnFlashTimer) {
            _turnFlashTimer = setInterval(function () {
              _turnFlashOn = !_turnFlashOn;
              hudTurn.style.opacity = _turnFlashOn ? '0.4' : '1';
            }, 300);
          }
        } else {
          if (_turnFlashTimer) {
            clearInterval(_turnFlashTimer);
            _turnFlashTimer = null;
            _turnFlashOn = false;
            hudTurn.style.opacity = '1';
          }
        }
      } else {
        hudTurn.style.display = 'none';
        if (_turnFlashTimer) {
          clearInterval(_turnFlashTimer);
          _turnFlashTimer = null;
          _turnFlashOn = false;
        }
      }
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
