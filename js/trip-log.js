/* js/trip-log.js -- Trip recording, speed log, trip history */
(function () {
  'use strict';
  var DR = window.DibbaRadar = window.DibbaRadar || {};

  var currentTrip = null;
  var trips = [];
  var STORAGE_KEY = 'dr_trips';
  var MAX_TRIPS = 50;

  function init() {
    loadTrips();
  }

  function startTrip() {
    currentTrip = {
      id: Date.now(),
      startTime: new Date().toISOString(),
      endTime: null,
      points: [],
      maxSpeed: 0,
      totalDistance: 0,
      camerasEncountered: 0
    };
  }

  function recordPoint(lat, lon, speed) {
    if (!currentTrip) return;
    var point = { lat: lat, lon: lon, speed: speed || 0, time: Date.now() };

    // Only record every 5 seconds
    var lastPoint = currentTrip.points[currentTrip.points.length - 1];
    if (lastPoint && (point.time - lastPoint.time) < 5000) return;

    currentTrip.points.push(point);
    if (speed && speed > currentTrip.maxSpeed) currentTrip.maxSpeed = speed;

    // Calculate distance from last point
    if (lastPoint) {
      currentTrip.totalDistance += haversine(lastPoint.lat, lastPoint.lon, lat, lon);
    }
  }

  function recordCamera() {
    if (currentTrip) currentTrip.camerasEncountered++;
  }

  function endTrip() {
    if (!currentTrip) return null;
    currentTrip.endTime = new Date().toISOString();

    // Calculate avg speed
    var speeds = currentTrip.points.filter(function (p) { return p.speed > 0; }).map(function (p) { return p.speed; });
    currentTrip.avgSpeed = speeds.length > 0 ? speeds.reduce(function (a, b) { return a + b; }, 0) / speeds.length : 0;

    // Store compactly (drop raw points for storage, keep summary)
    var summary = {
      id: currentTrip.id,
      startTime: currentTrip.startTime,
      endTime: currentTrip.endTime,
      maxSpeed: Math.round(currentTrip.maxSpeed),
      avgSpeed: Math.round(currentTrip.avgSpeed),
      totalDistance: parseFloat(currentTrip.totalDistance.toFixed(1)),
      camerasEncountered: currentTrip.camerasEncountered,
      pointCount: currentTrip.points.length,
      durationMin: Math.round((new Date(currentTrip.endTime) - new Date(currentTrip.startTime)) / 60000)
    };

    trips.unshift(summary);
    if (trips.length > MAX_TRIPS) trips = trips.slice(0, MAX_TRIPS);
    saveTrips();

    var result = summary;
    currentTrip = null;
    return result;
  }

  function getTrips() {
    return trips;
  }

  function getCurrentTrip() {
    return currentTrip;
  }

  function loadTrips() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) trips = JSON.parse(raw);
    } catch (e) {
      trips = [];
    }
  }

  function saveTrips() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
    } catch (e) { /* storage full or unavailable */ }
  }

  /** Haversine distance between two lat/lon pairs in km */
  function haversine(lat1, lon1, lat2, lon2) {
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.asin(Math.sqrt(a));
  }

  DR.tripLog = {
    init: init,
    startTrip: startTrip,
    recordPoint: recordPoint,
    recordCamera: recordCamera,
    endTrip: endTrip,
    getTrips: getTrips,
    getCurrentTrip: getCurrentTrip
  };
})();
