/* js/storage.js -- localStorage wrapper for custom pins */
(function () {
  'use strict';
  var DR = window.DibbaRadar = window.DibbaRadar || {};

  var PINS_KEY = 'dibba_custom';

  function loadPins() {
    try {
      return JSON.parse(localStorage.getItem(PINS_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function savePins(pins) {
    localStorage.setItem(PINS_KEY, JSON.stringify(pins));
  }

  function clearPins() {
    localStorage.removeItem(PINS_KEY);
  }

  DR.storage = {
    loadPins: loadPins,
    savePins: savePins,
    clearPins: clearPins
  };
})();
