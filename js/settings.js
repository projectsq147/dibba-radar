/* js/settings.js -- App settings management */
(function () {
  'use strict';
  var DR = window.DibbaRadar = window.DibbaRadar || {};

  var SETTINGS_KEY = 'dibba_settings';
  var settings = {
    units: 'kmh',           // 'kmh' or 'mph'
    alertDistance: 'medium', // 'short', 'medium', 'long'
    audioEnabled: true,
    voiceEnabled: true,
    theme: 'auto'           // 'auto', 'dark', 'light'
  };

  var alertDistances = {
    short: { warn1: 500, warn2: 300, warn3: 100 },
    medium: { warn1: 1000, warn2: 500, warn3: 200 },
    long: { warn1: 1500, warn2: 750, warn3: 300 }
  };

  function init() {
    loadSettings();
    updateUI();
  }

  function loadSettings() {
    try {
      var saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) {
        var parsed = JSON.parse(saved);
        settings = Object.assign(settings, parsed);
      }
    } catch (e) {
      console.warn('Failed to load settings:', e);
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      console.warn('Failed to save settings:', e);
    }
  }

  function updateUI() {
    // Update units buttons
    var unitsButtons = ['unitsKmh', 'unitsMph'];
    unitsButtons.forEach(function(id) {
      var btn = document.getElementById(id);
      if (btn) {
        btn.classList.remove('active');
        if ((id === 'unitsKmh' && settings.units === 'kmh') ||
            (id === 'unitsMph' && settings.units === 'mph')) {
          btn.classList.add('active');
        }
      }
    });

    // Update alert distance buttons
    var alertButtons = ['alertShort', 'alertMedium', 'alertLong'];
    alertButtons.forEach(function(id) {
      var btn = document.getElementById(id);
      if (btn) {
        btn.classList.remove('active');
        if ((id === 'alertShort' && settings.alertDistance === 'short') ||
            (id === 'alertMedium' && settings.alertDistance === 'medium') ||
            (id === 'alertLong' && settings.alertDistance === 'long')) {
          btn.classList.add('active');
        }
      }
    });

    // Update audio toggle
    var audioToggle = document.getElementById('audioToggle');
    if (audioToggle) {
      audioToggle.checked = settings.audioEnabled;
    }

    // Update voice toggle
    var voiceToggle = document.getElementById('voiceToggle');
    if (voiceToggle) {
      voiceToggle.checked = settings.voiceEnabled;
    }

    // Update theme buttons (handled by theme.js)
    if (DR.theme && DR.theme.updateTheme) {
      DR.theme.updateTheme();
    }
  }

  function showSettings() {
    var panel = document.getElementById('settingsPanel');
    if (panel) {
      panel.style.display = 'block';
      panel.classList.add('show');
      updateUI();
    }
  }

  function closeSettings() {
    var panel = document.getElementById('settingsPanel');
    if (panel) {
      panel.style.display = 'none';
      panel.classList.remove('show');
    }
  }

  function setUnits(units) {
    settings.units = units;
    saveSettings();
    updateUI();
    
    // Trigger UI updates throughout the app
    document.dispatchEvent(new CustomEvent('settingsChange', {
      detail: { type: 'units', value: units }
    }));
  }

  function setAlertDistance(distance) {
    settings.alertDistance = distance;
    saveSettings();
    updateUI();
    
    // Trigger alert system update
    document.dispatchEvent(new CustomEvent('settingsChange', {
      detail: { type: 'alertDistance', value: distance }
    }));
  }

  function toggleAudio() {
    settings.audioEnabled = !settings.audioEnabled;
    saveSettings();
    updateUI();
    
    document.dispatchEvent(new CustomEvent('settingsChange', {
      detail: { type: 'audio', value: settings.audioEnabled }
    }));
  }

  function getSettings() {
    return Object.assign({}, settings);
  }

  function getSetting(key) {
    return settings[key];
  }

  function getAlertDistances() {
    return alertDistances[settings.alertDistance];
  }

  function convertSpeed(speed, toUnit) {
    if (toUnit === 'mph') {
      return speed * 0.621371; // km/h to mph
    } else {
      return speed / 0.621371; // mph to km/h
    }
  }

  function formatSpeed(speed, unit) {
    unit = unit || settings.units;
    var value = unit === 'mph' ? convertSpeed(speed, 'mph') : speed;
    return Math.round(value) + (unit === 'mph' ? 'mph' : 'km/h');
  }

  function formatDistance(distance, unit) {
    unit = unit || settings.units;
    if (unit === 'mph') {
      var miles = distance * 0.621371;
      return miles < 1 ? 
        Math.round(miles * 5280) + 'ft' : 
        miles.toFixed(1) + 'mi';
    } else {
      return distance < 1 ? 
        Math.round(distance * 1000) + 'm' : 
        distance.toFixed(1) + 'km';
    }
  }

  // Listen for audio and voice toggle clicks
  document.addEventListener('change', function(e) {
    if (e.target.id === 'audioToggle') {
      settings.audioEnabled = e.target.checked;
      saveSettings();
      
      document.dispatchEvent(new CustomEvent('settingsChange', {
        detail: { type: 'audio', value: settings.audioEnabled }
      }));
    } else if (e.target.id === 'voiceToggle') {
      settings.voiceEnabled = e.target.checked;
      saveSettings();
      
      document.dispatchEvent(new CustomEvent('settingsChange', {
        detail: { type: 'voice', value: settings.voiceEnabled }
      }));
    }
  });

  // Public API
  DR.settings = {
    init: init,
    showSettings: showSettings,
    closeSettings: closeSettings,
    setUnits: setUnits,
    setAlertDistance: setAlertDistance,
    toggleAudio: toggleAudio,
    getSettings: getSettings,
    getSetting: getSetting,
    getAlertDistances: getAlertDistances,
    convertSpeed: convertSpeed,
    formatSpeed: formatSpeed,
    formatDistance: formatDistance
  };

  // Global functions for onclick handlers
  window.showSettings = showSettings;
  window.closeSettings = closeSettings;
  window.setUnits = setUnits;
  window.setAlertDistance = setAlertDistance;
})();