/* js/storage.js -- localStorage wrapper for custom pins + backend sync prep */
(function () {
  'use strict';
  var DR = window.DibbaRadar = window.DibbaRadar || {};

  var PINS_KEY = 'dibba_custom';
  var UUID_KEY = 'dibba_device_uuid';
  var SETTINGS_KEY = 'dibba_settings';
  var HISTORY_KEY = 'dibba_drive_history';
  var deviceUUID = null;

  function init() {
    // Generate or load device UUID
    deviceUUID = getDeviceUUID();
  }

  function getDeviceUUID() {
    var stored = localStorage.getItem(UUID_KEY);
    if (stored) {
      return stored;
    }

    // Generate new UUID
    var uuid = generateUUID();
    localStorage.setItem(UUID_KEY, uuid);
    return uuid;
  }

  function generateUUID() {
    // Simple UUID v4 generator
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0;
      var v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function loadPins() {
    try {
      return JSON.parse(localStorage.getItem(PINS_KEY) || '[]');
    } catch (e) {
      console.warn('Failed to load pins:', e);
      return [];
    }
  }

  function savePins(pins) {
    try {
      localStorage.setItem(PINS_KEY, JSON.stringify(pins));
    } catch (e) {
      console.warn('Failed to save pins:', e);
    }
  }

  function clearPins() {
    localStorage.removeItem(PINS_KEY);
  }

  function loadSettings() {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    } catch (e) {
      console.warn('Failed to load settings:', e);
      return {};
    }
  }

  function saveSettings(settings) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      console.warn('Failed to save settings:', e);
    }
  }

  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    } catch (e) {
      console.warn('Failed to load history:', e);
      return [];
    }
  }

  function saveHistory(history) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (e) {
      console.warn('Failed to save history:', e);
    }
  }

  // Generic storage functions
  function getItem(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn('Failed to get item:', key, e);
      return null;
    }
  }

  function setItem(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      console.warn('Failed to set item:', key, e);
      return false;
    }
  }

  function removeItem(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      console.warn('Failed to remove item:', key, e);
      return false;
    }
  }

  function clear() {
    try {
      localStorage.clear();
      return true;
    } catch (e) {
      console.warn('Failed to clear storage:', e);
      return false;
    }
  }

  function getStorageInfo() {
    try {
      var used = 0;
      for (var key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
          used += localStorage[key].length + key.length;
        }
      }
      
      return {
        used: used,
        usedKB: Math.round(used / 1024),
        quota: 5 * 1024 * 1024, // 5MB typical quota
        quotaKB: 5 * 1024
      };
    } catch (e) {
      return { used: 0, usedKB: 0, quota: 0, quotaKB: 0 };
    }
  }

  // Backend sync preparation (for future Phase 2+)
  function syncPinsToBackend() {
    // TODO: Implement backend sync when API is ready
    // This would POST pins to /api/pins with device UUID
    console.log('Backend sync not yet implemented');
    return Promise.resolve(false);
  }

  function syncPinsFromBackend() {
    // TODO: Implement backend sync when API is ready
    // This would GET pins from /api/pins with device UUID
    console.log('Backend sync not yet implemented');
    return Promise.resolve([]);
  }

  function syncWithBackend() {
    // TODO: Implement full sync when backend is ready
    return Promise.all([
      syncPinsToBackend(),
      syncPinsFromBackend()
    ]).then(function(results) {
      console.log('Sync results:', results);
      return results;
    }).catch(function(err) {
      console.warn('Sync failed:', err);
      return [false, []];
    });
  }

  DR.storage = {
    init: init,
    getDeviceUUID: function() { return deviceUUID; },
    loadPins: loadPins,
    savePins: savePins,
    clearPins: clearPins,
    loadSettings: loadSettings,
    saveSettings: saveSettings,
    loadHistory: loadHistory,
    saveHistory: saveHistory,
    getItem: getItem,
    setItem: setItem,
    removeItem: removeItem,
    clear: clear,
    getStorageInfo: getStorageInfo,
    syncPinsToBackend: syncPinsToBackend,
    syncPinsFromBackend: syncPinsFromBackend,
    syncWithBackend: syncWithBackend
  };
})();
