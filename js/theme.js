/* js/theme.js -- Night/Day theme auto-switching */
(function () {
  'use strict';
  var DR = window.DibbaRadar = window.DibbaRadar || {};

  var currentTheme = 'auto'; // auto, dark, light
  var isManualOverride = false;
  var lastPosition = null;

  function init() {
    // Load saved theme preference
    var saved = localStorage.getItem('dibba_theme');
    if (saved) {
      currentTheme = saved;
      isManualOverride = saved !== 'auto';
    }

    // Apply initial theme
    updateTheme();

    // Check theme every 10 minutes
    setInterval(updateTheme, 600000);

    // Update theme when GPS position changes significantly
    if (DR.gps) {
      // Hook into GPS updates if available
      document.addEventListener('gpsUpdate', handleGPSUpdate);
    }
  }

  function handleGPSUpdate(event) {
    if (!event.detail || isManualOverride || currentTheme !== 'auto') return;

    var pos = event.detail;
    if (!lastPosition || 
        Math.abs(pos.lat - lastPosition.lat) > 0.01 || 
        Math.abs(pos.lon - lastPosition.lon) > 0.01) {
      lastPosition = pos;
      updateTheme();
    }
  }

  function updateTheme() {
    if (isManualOverride || currentTheme !== 'auto') {
      applyTheme(currentTheme);
      return;
    }

    // Get current position for sunrise/sunset calculation
    var pos = getCurrentPosition();
    if (!pos) {
      // Default to dark theme if no position
      applyTheme('dark');
      return;
    }

    var now = new Date();
    var times = calculateSolarTimes(pos.lat, pos.lon, now);
    
    var isDaytime = now >= times.sunrise && now <= times.sunset;
    applyTheme(isDaytime ? 'light' : 'dark');
  }

  function getCurrentPosition() {
    // Try to get position from GPS module
    if (DR.gps && DR.gps.getState) {
      var state = DR.gps.getState();
      if (state.lat !== null && state.lon !== null) {
        return { lat: state.lat, lon: state.lon };
      }
    }

    // Use last known position
    if (lastPosition) {
      return lastPosition;
    }

    // Default to Dubai coordinates
    return { lat: 25.2048, lon: 55.2708 };
  }

  function calculateSolarTimes(lat, lon, date) {
    // Simplified sunrise/sunset calculation
    var dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);
    var p = Math.asin(0.39795 * Math.cos(0.98563 * (dayOfYear - 173) * Math.PI / 180));
    var a = 0.0;
    var argument = Math.sin(a * Math.PI / 180) - Math.sin(lat * Math.PI / 180) * Math.sin(p);
    var numerator = Math.cos(lat * Math.PI / 180) * Math.cos(p);
    argument = argument / numerator;
    
    if (Math.abs(argument) > 1) {
      // Polar day or night
      return {
        sunrise: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 6, 0),
        sunset: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 18, 0)
      };
    }

    var hourAngle = Math.acos(argument) * 180 / Math.PI / 15;
    var sunrise = 12 - hourAngle - lon / 15;
    var sunset = 12 + hourAngle - lon / 15;

    // Convert to Date objects
    var sunriseDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    sunriseDate.setHours(Math.floor(sunrise), (sunrise % 1) * 60);
    
    var sunsetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    sunsetDate.setHours(Math.floor(sunset), (sunset % 1) * 60);

    return {
      sunrise: sunriseDate,
      sunset: sunsetDate
    };
  }

  function applyTheme(theme) {
    var body = document.body;
    
    // Remove existing theme classes
    body.classList.remove('light-theme', 'dark-theme');
    
    if (theme === 'light') {
      body.classList.add('light-theme');
    } else {
      body.classList.add('dark-theme');
    }

    // Update meta theme-color for mobile browsers
    var metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.content = theme === 'light' ? '#1a1f2e' : '#060a0f';
    }
  }

  function setTheme(theme) {
    currentTheme = theme;
    isManualOverride = theme !== 'auto';
    
    // Save preference
    localStorage.setItem('dibba_theme', theme);
    
    // Update UI
    updateThemeButtons();
    updateTheme();
  }

  function updateThemeButtons() {
    var buttons = ['themeAuto', 'themeDark', 'themeLight'];
    buttons.forEach(function(id) {
      var btn = document.getElementById(id);
      if (btn) {
        btn.classList.remove('active');
        if ((id === 'themeAuto' && currentTheme === 'auto') ||
            (id === 'themeDark' && currentTheme === 'dark') ||
            (id === 'themeLight' && currentTheme === 'light')) {
          btn.classList.add('active');
        }
      }
    });
  }

  function getCurrentTheme() {
    return currentTheme;
  }

  function getEffectiveTheme() {
    if (currentTheme === 'auto') {
      var pos = getCurrentPosition();
      if (pos) {
        var now = new Date();
        var times = calculateSolarTimes(pos.lat, pos.lon, now);
        return (now >= times.sunrise && now <= times.sunset) ? 'light' : 'dark';
      }
      return 'dark';
    }
    return currentTheme;
  }

  // Public API
  DR.theme = {
    init: init,
    setTheme: setTheme,
    getCurrentTheme: getCurrentTheme,
    getEffectiveTheme: getEffectiveTheme,
    updateTheme: updateTheme
  };

  // Global function for settings
  window.setTheme = setTheme;
})();