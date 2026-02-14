/* js/pins.js -- Custom pin add/remove/export, localStorage + backend sync prep */
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
    var pin = { 
      lat: lat, 
      lon: lon, 
      speed: speed,
      added: new Date().toISOString(),
      deviceId: DR.storage.getDeviceUUID(),
      confirmed: 1,
      id: generatePinId()
    };
    
    customCameras.push(pin);
    DR.storage.savePins(customCameras);
    
    // Try to sync to backend (graceful fallback if unavailable)
    syncPinToBackend(pin);
  }

  function removePin(lat, lon) {
    customCameras = customCameras.filter(function (c) {
      return Math.abs(c.lat - lat) > 0.00001 || Math.abs(c.lon - lon) > 0.00001;
    });
    DR.storage.savePins(customCameras);
  }

  function generatePinId() {
    return Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  function syncPinToBackend(pin) {
    // Prepare for future backend integration
    if (!navigator.onLine) return; // Skip if offline

    // Would POST to /api/pins when backend is ready
    fetch('/api/pins', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(pin)
    }).then(function(response) {
      if (response.ok) {
        console.log('Pin synced to backend:', pin.id);
      } else {
        console.warn('Failed to sync pin to backend:', response.status);
      }
    }).catch(function(err) {
      console.log('Backend unavailable, using local storage only');
    });
  }

  function syncPinsFromBackend() {
    // Prepare for future backend integration
    if (!navigator.onLine) return Promise.resolve();

    return fetch('/api/pins?device=' + encodeURIComponent(DR.storage.getDeviceUUID()))
      .then(function(response) {
        if (!response.ok) throw new Error('Backend unavailable');
        return response.json();
      })
      .then(function(backendPins) {
        // Merge backend pins with local pins
        var merged = mergeBackendPins(backendPins);
        if (merged.length !== customCameras.length) {
          customCameras = merged;
          DR.storage.savePins(customCameras);
          return true; // Data changed
        }
        return false; // No changes
      })
      .catch(function(err) {
        console.log('Backend sync not available, using local storage only');
        return false;
      });
  }

  function mergeBackendPins(backendPins) {
    var localMap = {};
    var merged = [];

    // Index local pins
    customCameras.forEach(function(pin) {
      if (pin.id) {
        localMap[pin.id] = pin;
      }
      merged.push(pin);
    });

    // Add backend pins not in local storage
    backendPins.forEach(function(pin) {
      if (pin.id && !localMap[pin.id]) {
        merged.push(pin);
      }
    });

    return merged;
  }

  function exportPins() {
    var text = customCameras.map(function (c) {
      return c.lat.toFixed(6) + ',' + c.lon.toFixed(6) + ',' + c.speed;
    }).join('\n');
    
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () {
        var b = document.getElementById('exportBtn');
        if (b) {
          b.textContent = 'COPIED';
          setTimeout(function () { b.textContent = 'COPY PINS'; }, 1500);
        }
      }).catch(function() {
        fallbackCopyPins(text);
      });
    } else {
      fallbackCopyPins(text);
    }
  }

  function fallbackCopyPins(text) {
    prompt('Copy these pins:', text);
  }

  function importPins(csvText) {
    try {
      var lines = csvText.trim().split('\n');
      var imported = 0;
      
      lines.forEach(function(line) {
        var parts = line.split(',');
        if (parts.length >= 3) {
          var lat = parseFloat(parts[0]);
          var lon = parseFloat(parts[1]);
          var speed = parts[2].trim();
          
          if (!isNaN(lat) && !isNaN(lon)) {
            addPin(lat, lon, speed);
            imported++;
          }
        }
      });
      
      return imported;
    } catch (e) {
      console.error('Failed to import pins:', e);
      return 0;
    }
  }

  function clearAllPins() {
    if (confirm('Delete all custom pins?')) {
      customCameras = [];
      DR.storage.savePins(customCameras);
      return true;
    }
    return false;
  }

  function getStats() {
    var now = new Date();
    var thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    var thisWeekCount = customCameras.filter(function(pin) {
      return pin.added && new Date(pin.added) > thisWeek;
    }).length;

    return {
      total: customCameras.length,
      thisWeek: thisWeekCount,
      confirmed: customCameras.filter(function(pin) { return pin.confirmed > 1; }).length
    };
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
    importPins: importPins,
    clearAllPins: clearAllPins,
    syncPinsFromBackend: syncPinsFromBackend,
    getStats: getStats,
    count: count
  };
})();
