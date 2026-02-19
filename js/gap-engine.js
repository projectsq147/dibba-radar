/* js/gap-engine.js -- Camera gap analysis and zone classification */
(function () {
  'use strict';
  var DR = window.DibbaRadar = window.DibbaRadar || {};

  // Zone thresholds (in km)
  var SAFE_ZONE_MIN = 5.0;      // >5km = safe zone (can push speed)
  var MODERATE_ZONE_MIN = 2.0;  // 2-5km = moderate
  var DANGER_ZONE_MAX = 2.0;    // <2km = danger (camera cluster)

  /**
   * Calculate gaps between cameras and classify zones
   * @param {Array} cameras - Array of camera objects with {lat, lon, distance_from_start}
   * @param {Number} userDistance - User's current distance along route (km)
   * @returns {Object} Gap analysis data
   */
  function analyzeGaps(cameras, userDistance) {
    if (!cameras || cameras.length === 0) {
      return {
        upcoming: [],
        currentZone: null,
        nextZone: null
      };
    }

    // Sort cameras by distance
    var sorted = cameras.slice().sort(function(a, b) {
      return a.distance_from_start - b.distance_from_start;
    });

    // Find upcoming cameras (ahead of user)
    var upcoming = [];
    for (var i = 0; i < sorted.length; i++) {
      var cam = sorted[i];
      if (cam.distance_from_start > userDistance) {
        var distanceToCamera = cam.distance_from_start - userDistance;
        
        // Calculate gap to NEXT camera
        var gapAfter = null;
        if (i + 1 < sorted.length) {
          gapAfter = sorted[i + 1].distance_from_start - cam.distance_from_start;
        }
        
        upcoming.push({
          camera: cam,
          distanceToCamera: distanceToCamera,
          gapAfter: gapAfter,
          index: i
        });
      }
    }

    // Limit to next 5 cameras
    upcoming = upcoming.slice(0, 5);

    // Determine current zone (between last passed camera and next camera)
    var currentZone = calculateCurrentZone(sorted, userDistance);

    // Determine next zone (after next camera)
    var nextZone = upcoming.length > 0 && upcoming[0].gapAfter 
      ? classifyZone(upcoming[0].gapAfter)
      : null;

    return {
      upcoming: upcoming,
      currentZone: currentZone,
      nextZone: nextZone
    };
  }

  /**
   * Calculate zone user is currently in
   */
  function calculateCurrentZone(sortedCameras, userDistance) {
    // Find last passed camera
    var lastCam = null;
    var nextCam = null;

    for (var i = 0; i < sortedCameras.length; i++) {
      if (sortedCameras[i].distance_from_start <= userDistance) {
        lastCam = sortedCameras[i];
      } else {
        nextCam = sortedCameras[i];
        break;
      }
    }

    if (!lastCam && !nextCam) {
      return { type: 'unknown', distance: null };
    }

    // Before first camera
    if (!lastCam && nextCam) {
      var distToFirst = nextCam.distance_from_start - userDistance;
      return {
        type: 'approaching',
        distance: distToFirst,
        zone: 'pre-route'
      };
    }

    // After last camera
    if (lastCam && !nextCam) {
      return {
        type: 'clear',
        distance: null,
        zone: 'post-route'
      };
    }

    // Between cameras - calculate gap
    var gap = nextCam.distance_from_start - lastCam.distance_from_start;
    var distanceIntoGap = userDistance - lastCam.distance_from_start;
    var distanceRemaining = nextCam.distance_from_start - userDistance;

    return {
      type: 'in-gap',
      totalGap: gap,
      distanceIntoGap: distanceIntoGap,
      distanceRemaining: distanceRemaining,
      zone: classifyZone(gap),
      nextCamera: nextCam
    };
  }

  /**
   * Classify zone based on gap size
   */
  function classifyZone(gapKm) {
    if (gapKm >= SAFE_ZONE_MIN) {
      return 'safe';
    } else if (gapKm >= MODERATE_ZONE_MIN) {
      return 'moderate';
    } else {
      return 'danger';
    }
  }

  /**
   * Get zone display info
   */
  function getZoneInfo(zoneType) {
    switch (zoneType) {
      case 'safe':
        return {
          label: 'SAFE ZONE',
          color: '#00e676',
          description: 'Clear stretch - can push speed',
          alertLevel: 'low'
        };
      case 'moderate':
        return {
          label: 'MODERATE',
          color: '#ffd600',
          description: 'Normal spacing',
          alertLevel: 'medium'
        };
      case 'danger':
        return {
          label: 'DANGER ZONE',
          color: '#ff1744',
          description: 'Camera cluster - slow down',
          alertLevel: 'high'
        };
      default:
        return {
          label: 'UNKNOWN',
          color: '#78909c',
          description: '',
          alertLevel: 'medium'
        };
    }
  }

  /**
   * Generate voice alert text based on gap analysis
   */
  function generateVoiceAlert(gapData) {
    if (!gapData || !gapData.upcoming || gapData.upcoming.length === 0) {
      return null;
    }

    var next = gapData.upcoming[0];
    var distKm = next.distanceToCamera;
    var distText = distKm < 1 
      ? Math.round(distKm * 1000) + ' meters'
      : distKm.toFixed(1) + ' kilometers';

    // Single camera with big gap after
    if (next.gapAfter && next.gapAfter >= SAFE_ZONE_MIN) {
      return 'Camera in ' + distText + ', then clear for ' + next.gapAfter.toFixed(1) + ' kilometers';
    }

    // Single camera with moderate gap
    if (next.gapAfter && next.gapAfter >= MODERATE_ZONE_MIN) {
      return 'Camera in ' + distText;
    }

    // Camera cluster (multiple cameras close together)
    if (gapData.upcoming.length >= 2) {
      var secondGap = gapData.upcoming[1].distanceToCamera - next.distanceToCamera;
      if (secondGap < DANGER_ZONE_MAX) {
        var clusterCount = 1;
        for (var i = 1; i < gapData.upcoming.length; i++) {
          var gap = gapData.upcoming[i].distanceToCamera - gapData.upcoming[i-1].distanceToCamera;
          if (gap < DANGER_ZONE_MAX) {
            clusterCount++;
          } else {
            break;
          }
        }
        return 'Camera cluster ahead, ' + (clusterCount + 1) + ' cameras in next ' + 
               (gapData.upcoming[clusterCount].distanceToCamera).toFixed(1) + ' kilometers, slow down';
      }
    }

    // Default
    return 'Camera in ' + distText;
  }

  /**
   * Calculate safe speed based on limit + UAE margin
   */
  function calculateSafeSpeed(speedLimit) {
    if (!speedLimit || speedLimit === '?' || speedLimit === 'unknown') {
      return null;
    }
    var limit = parseInt(speedLimit, 10);
    return limit + 20; // UAE +20 km/h margin
  }

  /**
   * Get speed margin status
   */
  function getSpeedMarginStatus(currentSpeed, speedLimit) {
    var safeSpeed = calculateSafeSpeed(speedLimit);
    if (!safeSpeed) {
      return { status: 'unknown', margin: null };
    }

    var margin = safeSpeed - currentSpeed;

    if (currentSpeed > safeSpeed) {
      return {
        status: 'over',
        margin: margin,
        color: '#ff1744',
        label: 'OVER LIMIT'
      };
    } else if (margin <= 5) {
      return {
        status: 'close',
        margin: margin,
        color: '#ffd600',
        label: 'CLOSE'
      };
    } else {
      return {
        status: 'safe',
        margin: margin,
        color: '#00e676',
        label: 'SAFE'
      };
    }
  }

  // Expose module
  DR.gapEngine = {
    analyzeGaps: analyzeGaps,
    calculateCurrentZone: calculateCurrentZone,
    classifyZone: classifyZone,
    getZoneInfo: getZoneInfo,
    generateVoiceAlert: generateVoiceAlert,
    calculateSafeSpeed: calculateSafeSpeed,
    getSpeedMarginStatus: getSpeedMarginStatus,
    SAFE_ZONE_MIN: SAFE_ZONE_MIN,
    MODERATE_ZONE_MIN: MODERATE_ZONE_MIN,
    DANGER_ZONE_MAX: DANGER_ZONE_MAX
  };

})();
