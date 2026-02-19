/* js/hud-v2.js -- Enhanced HUD for Dibba Radar 2.0 with gap intelligence */
(function () {
  'use strict';
  var DR = window.DibbaRadar = window.DibbaRadar || {};

  var isActive = false;
  var updateInterval = null;
  var lastGapData = null;

  /**
   * Activate enhanced HUD
   */
  function activate() {
    var hud = document.getElementById('hudV2');
    if (!hud) return;

    hud.style.display = 'flex';
    isActive = true;

    // Start update loop
    if (!updateInterval) {
      updateInterval = setInterval(update, 200); // 5 FPS for smooth updates
    }
  }

  /**
   * Deactivate HUD
   */
  function deactivate() {
    var hud = document.getElementById('hudV2');
    if (hud) {
      hud.style.display = 'none';
    }
    isActive = false;

    if (updateInterval) {
      clearInterval(updateInterval);
      updateInterval = null;
    }
  }

  /**
   * Main update loop
   */
  function update() {
    if (!isActive) return;

    // Get current GPS state
    var gpsState = DR.gps ? DR.gps.getState() : {};
    var speed = gpsState.speed || 0;

    // Get camera data
    var cameras = DR.cameras ? DR.cameras.getAllCameras() : [];
    var userDistance = calculateUserDistance(gpsState);

    // Analyze gaps
    if (DR.gapEngine) {
      lastGapData = DR.gapEngine.analyzeGaps(cameras, userDistance);
    }

    // Update display elements
    updateSpeedDisplay(speed);
    updateZoneDisplay(lastGapData);
    updateCameraTimeline(lastGapData);
    updateSpeedMargin(speed, lastGapData);
  }

  /**
   * Update speed display
   */
  function updateSpeedDisplay(speed) {
    var speedEl = document.getElementById('hudV2Speed');
    if (speedEl) {
      speedEl.textContent = Math.round(speed);
    }
  }

  /**
   * Update zone status display
   */
  function updateZoneDisplay(gapData) {
    if (!gapData || !gapData.currentZone) return;

    var zoneEl = document.getElementById('hudV2Zone');
    var zone = gapData.currentZone;

    if (!zoneEl) return;

    if (zone.type === 'in-gap') {
      var zoneInfo = DR.gapEngine.getZoneInfo(zone.zone);
      var distanceText = zone.distanceRemaining < 1
        ? Math.round(zone.distanceRemaining * 1000) + 'm'
        : zone.distanceRemaining.toFixed(1) + 'km';

      zoneEl.textContent = zoneInfo.label + ' - ' + distanceText;
      zoneEl.style.background = zoneInfo.color;
      zoneEl.style.color = '#fff';
    } else if (zone.type === 'clear') {
      zoneEl.textContent = 'CLEAR - NO CAMERAS AHEAD';
      zoneEl.style.background = '#00e676';
      zoneEl.style.color = '#fff';
    } else {
      zoneEl.textContent = 'STANDBY';
      zoneEl.style.background = '#78909c';
      zoneEl.style.color = '#fff';
    }
  }

  /**
   * Update camera timeline (next 3-5 cameras)
   */
  function updateCameraTimeline(gapData) {
    var timelineEl = document.getElementById('hudV2Timeline');
    if (!timelineEl || !gapData || !gapData.upcoming) return;

    var html = '';
    var cameras = gapData.upcoming.slice(0, 5);

    for (var i = 0; i < cameras.length; i++) {
      var cam = cameras[i];
      var distText = cam.distanceToCamera < 1
        ? Math.round(cam.distanceToCamera * 1000) + 'm'
        : cam.distanceToCamera.toFixed(1) + 'km';

      var gapText = '';
      if (cam.gapAfter) {
        gapText = ' → ' + cam.gapAfter.toFixed(1) + 'km';
        
        // Color code gap
        var gapClass = '';
        if (cam.gapAfter >= DR.gapEngine.SAFE_ZONE_MIN) {
          gapClass = 'gap-safe';
        } else if (cam.gapAfter >= DR.gapEngine.MODERATE_ZONE_MIN) {
          gapClass = 'gap-moderate';
        } else {
          gapClass = 'gap-danger';
        }
        gapText = ' → <span class="' + gapClass + '">' + cam.gapAfter.toFixed(1) + 'km</span>';
      }

      html += '<div class="timeline-item">';
      html += '<span class="camera-icon">📷</span> ';
      html += '<span class="camera-dist">' + distText + '</span>';
      html += gapText;
      html += '</div>';
    }

    if (cameras.length === 0) {
      html = '<div class="timeline-empty">No cameras ahead</div>';
    }

    timelineEl.innerHTML = html;
  }

  /**
   * Update speed margin display
   */
  function updateSpeedMargin(currentSpeed, gapData) {
    if (!gapData || !gapData.upcoming || gapData.upcoming.length === 0) return;

    var nextCam = gapData.upcoming[0];
    var speedLimit = nextCam.camera.speed_limit;

    var safeSpeed = DR.gapEngine ? DR.gapEngine.calculateSafeSpeed(speedLimit) : null;
    var marginStatus = DR.gapEngine ? DR.gapEngine.getSpeedMarginStatus(currentSpeed, speedLimit) : null;

    // Update safe speed display
    var safeSpeedEl = document.getElementById('hudV2SafeSpeed');
    var limitEl = document.getElementById('hudV2Limit');
    
    if (safeSpeedEl && safeSpeed) {
      safeSpeedEl.textContent = 'Safe: ' + safeSpeed;
    }
    
    if (limitEl && speedLimit && speedLimit !== '?' && speedLimit !== 'unknown') {
      limitEl.textContent = 'Limit: ' + speedLimit;
    }

    // Update margin bar
    var marginBar = document.getElementById('hudV2MarginBar');
    var marginText = document.getElementById('hudV2MarginText');
    
    if (marginStatus && marginBar && marginText) {
      var percentage = safeSpeed ? Math.max(0, Math.min(100, (currentSpeed / safeSpeed) * 100)) : 0;
      marginBar.style.width = percentage + '%';
      marginBar.style.background = marginStatus.color;
      
      if (marginStatus.margin !== null) {
        marginText.textContent = marginStatus.label + ' (' + (marginStatus.margin > 0 ? '+' : '') + marginStatus.margin + ')';
        marginText.style.color = marginStatus.color;
      }
    }
  }

  /**
   * Calculate user's distance along route
   * This is a simplified version - real implementation would use route geometry
   */
  function calculateUserDistance(gpsState) {
    // For now, return 0 - this needs integration with routing module
    // In real implementation, calculate distance along route from start point
    return 0;
  }

  /**
   * Flash zone change (green for safe, red for danger)
   */
  function flashZoneChange(zoneType) {
    var flashEl = document.getElementById('zoneFlash');
    if (!flashEl) return;

    var zoneInfo = DR.gapEngine ? DR.gapEngine.getZoneInfo(zoneType) : null;
    if (!zoneInfo) return;

    flashEl.style.background = zoneInfo.color;
    flashEl.style.opacity = '0.8';
    flashEl.style.display = 'block';

    setTimeout(function() {
      flashEl.style.opacity = '0';
      setTimeout(function() {
        flashEl.style.display = 'none';
      }, 300);
    }, 500);
  }

  /**
   * Get last gap analysis data
   */
  function getLastGapData() {
    return lastGapData;
  }

  // Expose module
  DR.hudV2 = {
    activate: activate,
    deactivate: deactivate,
    update: update,
    flashZoneChange: flashZoneChange,
    getLastGapData: getLastGapData
  };

})();
