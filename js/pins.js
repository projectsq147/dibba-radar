/* js/pins.js -- Custom pin add/remove/export, localStorage */
(function () {
  'use strict';
  var DR = window.DibbaRadar = window.DibbaRadar || {};

  var customCameras = [];

  function init() {
    customCameras = DR.storage.loadPins();
  }

  function getCustom() {
    return customCameras;
  }

  function addPin(lat, lon, speed) {
    customCameras.push({ lat: lat, lon: lon, speed: speed });
    DR.storage.savePins(customCameras);
  }

  function removePin(lat, lon) {
    customCameras = customCameras.filter(function (c) {
      return Math.abs(c.lat - lat) > 0.00001 || Math.abs(c.lon - lon) > 0.00001;
    });
    DR.storage.savePins(customCameras);
  }

  function exportPins() {
    var text = customCameras.map(function (c) {
      return c.lat.toFixed(6) + ',' + c.lon.toFixed(6) + ',' + c.speed;
    }).join('\n');
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () {
        var b = document.getElementById('exportBtn');
        b.textContent = 'COPIED';
        setTimeout(function () { b.textContent = 'COPY PINS'; }, 1500);
      });
    } else {
      prompt('Copy:', text);
    }
  }

  function count() {
    return customCameras.length;
  }

  DR.pins = {
    init: init,
    getCustom: getCustom,
    addPin: addPin,
    removePin: removePin,
    exportPins: exportPins,
    count: count
  };
})();
