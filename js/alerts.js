/* js/alerts.js -- Camera proximity detection, audio/vibration alerts */
(function () {
  'use strict';
  var DR = window.DibbaRadar = window.DibbaRadar || {};

  var audioCtx = null;
  var nextCamera = null;       // { cam, distance } - next camera ahead
  var alertedCameras = {};     // camKey -> { 1000: true, 500: true, 200: true, 0: true }
  var lastAlertTime = 0;
  var MIN_ALERT_INTERVAL = 500; // ms between alerts

  // Alert zone thresholds in km
  var ZONES = [
    { dist: 1.0, freq: 400, duration: 200, color: 'yellow', label: '1000m' },
    { dist: 0.5, freq: 600, duration: 300, color: 'orange', label: '500m' },
    { dist: 0.2, freq: 800, duration: 400, color: 'red', vibrate: true, label: '200m' },
    { dist: 0.05, freq: 1000, duration: 150, color: 'flash', label: 'passing' }
  ];

  function getNextCamera() { return nextCamera ? nextCamera.cam : null; }
  function getNextCameraDistance() { return nextCamera ? nextCamera.distance : null; }

  /** Initialize audio context using new audio system */
  function initAudio() {
    // Use the new centralized audio system
    if (DR.audio && DR.audio.init) {
      // Audio system is already initialized in app.js
      return;
    }
  }

  /** Play a tone at given frequency and duration */
  function playTone(freq, duration) {
    if (!audioCtx) return;
    try {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.value = 0.3;
      osc.start();
      setTimeout(function () {
        try {
          gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
        } catch (e) { /* ignore */ }
      }, duration);
      setTimeout(function () {
        try { osc.stop(); } catch (e) { /* ignore */ }
      }, duration + 100);
    } catch (e) {
      console.warn('Audio playback error:', e);
    }
  }

  /** Play passing chime (two quick ascending tones) */
  function playPassingChime() {
    playTone(800, 100);
    setTimeout(function () { playTone(1200, 100); }, 120);
  }

  /** Play double beep for 200m alert */
  function playDoubleBeep(freq, duration) {
    playTone(freq, duration);
    setTimeout(function () { playTone(freq, duration); }, duration + 100);
  }

  /** Vibrate device if supported */
  function vibrate(pattern) {
    if (navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch (e) { /* ignore */ }
    }
  }

  /** Get a unique key for a camera */
  function camKey(cam) {
    return cam.lat.toFixed(6) + ',' + cam.lon.toFixed(6);
  }

  /** Reset alert state (on stop drive) */
  function reset() {
    alertedCameras = {};
    nextCamera = null;
    lastAlertTime = 0;
    hideAlertBanner();
    hideSlowDown();
  }

  /** Main check function -- called on every GPS update */
  function check(gpsState) {
    if (!gpsState.routeKm && gpsState.routeKm !== 0) return;
    if (gpsState.offRoute) {
      nextCamera = null;
      updateAlertBanner(null);
      return;
    }

    var allCams = DR.cameras.getAllCams();
    if (!allCams || allCams.length === 0) return;

    var dir = gpsState.direction || DR.mapModule.getDirection();
    var userKm = gpsState.routeKm;

    // Find next camera ahead based on direction
    var found = null;
    var foundDist = Infinity;

    if (dir === 'ab') {
      // Moving in increasing km direction
      for (var i = 0; i < allCams.length; i++) {
        var diff = allCams[i].route_km - userKm;
        if (diff > -0.03 && diff < foundDist) { // small negative tolerance for "just passing"
          foundDist = diff;
          found = allCams[i];
          break; // sorted, so first match is closest ahead
        }
      }
    } else {
      // Moving in decreasing km direction (ba)
      for (var j = allCams.length - 1; j >= 0; j--) {
        var diff2 = userKm - allCams[j].route_km;
        if (diff2 > -0.03 && diff2 < foundDist) {
          foundDist = diff2;
          found = allCams[j];
          break;
        }
      }
    }

    // Also check Waze police reports on route
    var wazeAlerts = DR.waze.getAlerts();
    var rd = DR.cameras.getRouteData();
    if (wazeAlerts && wazeAlerts.length > 0 && rd) {
      wazeAlerts.forEach(function (wa) {
        if (wa.type !== 'POLICE' && (wa.subtype || '').indexOf('CAMERA') < 0) return;
        var lat = wa.location.y, lon = wa.location.x;
        var snap = DR.snapToRoute(lat, lon, rd.route_ab, rd.route_ba, DR.cameras.getCumDist());
        if (snap.dist > 500) return; // not on route

        var wazeDist;
        if (dir === 'ab') {
          wazeDist = snap.km - userKm;
        } else {
          wazeDist = userKm - snap.km;
        }

        if (wazeDist > 0 && wazeDist < foundDist) {
          foundDist = wazeDist;
          found = {
            lat: lat,
            lon: lon,
            speed: '?',
            route_km: snap.km,
            source: 'waze_police'
          };
        }
      });
    }

    if (found) {
      nextCamera = { cam: found, distance: Math.max(0, foundDist) };
    } else {
      nextCamera = null;
    }

    // Update UI
    updateAlertBanner(nextCamera);

    // Check speed vs limit
    checkSpeedLimit(gpsState, found);

    // Process alert zones
    if (nextCamera) {
      processAlertZones(nextCamera);
    }
  }

  /** Process alert zones for the next camera */
  function processAlertZones(nc) {
    var key = camKey(nc.cam);
    var dist = nc.distance; // km
    var now = Date.now();

    if (!alertedCameras[key]) {
      alertedCameras[key] = {};
    }

    // Check each zone from farthest to closest
    for (var i = 0; i < ZONES.length; i++) {
      var zone = ZONES[i];
      if (dist <= zone.dist && !alertedCameras[key][zone.label]) {
        // Don't spam alerts
        if (now - lastAlertTime < MIN_ALERT_INTERVAL) continue;

        alertedCameras[key][zone.label] = true;
        lastAlertTime = now;

        if (zone.label === 'passing') {
          playPassingChime();
          flashCameraPass();
        } else if (zone.label === '200m') {
          playDoubleBeep(zone.freq, zone.duration);
          vibrate([200]);
          setAlertLevel('red');
        } else if (zone.label === '500m') {
          playTone(zone.freq, zone.duration);
          setAlertLevel('orange');
        } else if (zone.label === '1000m') {
          playTone(zone.freq, zone.duration);
          setAlertLevel('yellow');
        }
        break; // only fire one zone per check
      }
    }

    // If passed camera (distance grew again or very close), allow re-alert for different cameras
    if (dist > 1.5) {
      // Camera is far enough, could be a different one now
      // Clean up old camera alerts for cameras we've clearly passed
    }
  }

  /** Update the alert banner UI */
  function updateAlertBanner(nc) {
    var banner = document.getElementById('alertBanner');
    var text = document.getElementById('alertText');
    var limitEl = document.getElementById('alertLimit');
    if (!banner || !text) return;

    if (!nc) {
      text.textContent = 'NO CAMERA AHEAD';
      if (limitEl) limitEl.textContent = '';
      banner.className = 'alert-banner';
      return;
    }

    var dist = nc.distance;
    var cam = nc.cam;

    if (dist < 0.05) {
      text.textContent = 'CAMERA';
    } else if (dist < 1) {
      text.textContent = 'CAMERA IN ' + (dist * 1000).toFixed(0) + 'm';
    } else {
      text.textContent = 'CAMERA IN ' + dist.toFixed(1) + ' km';
    }

    if (limitEl) {
      var spd = cam.speed;
      if (spd && spd !== '?') {
        limitEl.textContent = 'LIMIT ' + spd;
      } else {
        limitEl.textContent = cam.source === 'waze_police' ? 'POLICE' : '';
      }
    }

    // Color based on distance
    banner.classList.remove('alert-yellow', 'alert-orange', 'alert-red', 'alert-flash');
    if (dist <= 0.2) {
      banner.classList.add('alert-red');
    } else if (dist <= 0.5) {
      banner.classList.add('alert-orange');
    } else if (dist <= 1.0) {
      banner.classList.add('alert-yellow');
    }
  }

  /** Set alert level class on banner */
  function setAlertLevel(level) {
    var banner = document.getElementById('alertBanner');
    if (!banner) return;
    banner.classList.remove('alert-yellow', 'alert-orange', 'alert-red', 'alert-flash');
    banner.classList.add('alert-' + level);
  }

  /** Flash screen when passing camera */
  function flashCameraPass() {
    var banner = document.getElementById('alertBanner');
    if (!banner) return;
    banner.classList.add('alert-flash');
    setTimeout(function () {
      banner.classList.remove('alert-flash');
    }, 1000);
  }

  /** Hide alert banner */
  function hideAlertBanner() {
    var banner = document.getElementById('alertBanner');
    if (banner) {
      banner.className = 'alert-banner';
      var text = document.getElementById('alertText');
      if (text) text.textContent = '';
      var limitEl = document.getElementById('alertLimit');
      if (limitEl) limitEl.textContent = '';
    }
  }

  /** Check speed vs camera speed limit */
  function checkSpeedLimit(gpsState, cam) {
    var overlay = document.getElementById('slowDownOverlay');
    if (!overlay) return;

    if (!cam || !gpsState.speed || gpsState.speed === null) {
      overlay.style.display = 'none';
      return;
    }

    var limit = cam.speed;
    if (!limit || limit === '?') {
      overlay.style.display = 'none';
      return;
    }

    var limitNum = parseInt(limit, 10);
    var speed = Math.round(gpsState.speed);

    // Show SLOW DOWN if over limit and camera is within 2km
    var nc = nextCamera;
    if (nc && nc.distance < 2 && speed > limitNum + 10) {
      overlay.style.display = 'flex';
    } else {
      overlay.style.display = 'none';
    }
  }

  /** Hide slow down overlay */
  function hideSlowDown() {
    var overlay = document.getElementById('slowDownOverlay');
    if (overlay) overlay.style.display = 'none';
  }

  DR.alerts = {
    initAudio: initAudio,
    check: check,
    reset: reset,
    getNextCamera: getNextCamera,
    getNextCameraDistance: getNextCameraDistance,
    playTone: playTone
  };
})();
