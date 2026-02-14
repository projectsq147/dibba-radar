/* js/routing.js -- OSRM route calculation */
(function () {
  'use strict';
  var DR = window.DibbaRadar = window.DibbaRadar || {};

  var requestId = 0; // cancel stale requests
  var _steps = [];          // OSRM maneuver steps for current route
  var _currentStepIndex = 0; // which step the user is at

  /**
   * Calculate a driving route via OSRM.
   * @param {number} startLat
   * @param {number} startLon
   * @param {number} endLat
   * @param {number} endLon
   * @param {function} cb  callback({ routePoints, distanceKm, durationMin }) or null on error
   */
  function calculate(startLat, startLon, endLat, endLon, cb) {
    requestId++;
    var myId = requestId;

    var url = 'https://router.project-osrm.org/route/v1/driving/' +
      startLon.toFixed(6) + ',' + startLat.toFixed(6) + ';' +
      endLon.toFixed(6) + ',' + endLat.toFixed(6) +
      '?overview=full&geometries=geojson&steps=true';

    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (myId !== requestId) return; // stale
        if (!data.routes || data.routes.length === 0) {
          console.warn('OSRM: no route found');
          if (cb) cb(null);
          return;
        }

        var route = data.routes[0];
        var coords = route.geometry.coordinates; // [lon, lat]
        var routePoints = coords.map(function (c) {
          return [c[1], c[0]]; // [lat, lon]
        });

        var distanceKm = route.distance / 1000;
        var durationMin = route.duration / 60;

        // Extract maneuver steps
        _steps = [];
        _currentStepIndex = 0;
        var legs = route.legs;
        if (legs && legs.length > 0 && legs[0].steps) {
          _steps = legs[0].steps.map(function (s) {
            return {
              maneuver: {
                type: s.maneuver.type,
                modifier: s.maneuver.modifier || null,
                location: s.maneuver.location // [lng, lat]
              },
              name: s.name || '',
              distance: s.distance,  // meters
              duration: s.duration   // seconds
            };
          });
        }

        if (cb) cb({
          routePoints: routePoints,
          distanceKm: distanceKm,
          durationMin: durationMin
        });
      })
      .catch(function (err) {
        console.error('OSRM routing error:', err);
        if (myId === requestId && cb) cb(null);
      });
  }

  /** Cancel any pending route calculation */
  function cancel() {
    requestId++;
  }

  /** Clear stored steps (called when stopping navigation) */
  function clearSteps() {
    _steps = [];
    _currentStepIndex = 0;
  }

  /** Get all stored maneuver steps */
  function getSteps() {
    return _steps;
  }

  /** Get the current step index */
  function getCurrentStepIndex() {
    return _currentStepIndex;
  }

  /**
   * Get the next maneuver relative to the user's current position.
   * Returns { type, modifier, name, distance } or null if no route.
   */
  function getNextManeuver() {
    if (!_steps.length || _currentStepIndex >= _steps.length - 1) return null;
    var nextIdx = _currentStepIndex + 1;
    var nextStep = _steps[nextIdx];
    // Distance to next maneuver = remaining distance in current step
    // (updated by updateProgress)
    return {
      type: nextStep.maneuver.type,
      modifier: nextStep.maneuver.modifier,
      name: nextStep.name,
      distance: _distToNextManeuver
    };
  }

  var _distToNextManeuver = null; // meters to next maneuver point

  /**
   * Update progress along the route based on current GPS position.
   * Called from gps.js on each position update.
   */
  function updateProgress(lat, lon) {
    if (!_steps.length) {
      _distToNextManeuver = null;
      return;
    }
    // Advance step index if within 50m of the next maneuver point
    while (_currentStepIndex < _steps.length - 1) {
      var nextIdx = _currentStepIndex + 1;
      var loc = _steps[nextIdx].maneuver.location; // [lng, lat]
      var d = _haversineDist(lat, lon, loc[1], loc[0]); // meters
      if (d < 50) {
        _currentStepIndex = nextIdx;
      } else {
        break;
      }
    }

    // Calculate distance to the NEXT maneuver point
    if (_currentStepIndex < _steps.length - 1) {
      var nLoc = _steps[_currentStepIndex + 1].maneuver.location;
      _distToNextManeuver = _haversineDist(lat, lon, nLoc[1], nLoc[0]);
    } else {
      // At the last step (arrive)
      var aLoc = _steps[_currentStepIndex].maneuver.location;
      _distToNextManeuver = _haversineDist(lat, lon, aLoc[1], aLoc[0]);
    }
  }

  /** Haversine distance in meters between two lat/lon points */
  function _haversineDist(lat1, lon1, lat2, lon2) {
    var R = 6371000;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  DR.routing = {
    calculate: calculate,
    cancel: cancel,
    clearSteps: clearSteps,
    getSteps: getSteps,
    getCurrentStepIndex: getCurrentStepIndex,
    getNextManeuver: getNextManeuver,
    updateProgress: updateProgress
  };
})();
