/* js/simplified-ux.js -- Beginner-friendly UX flow */
(function () {
  'use strict';
  var DR = window.DibbaRadar = window.DibbaRadar || {};

  var isFirstTime = false;
  var selectedRouteId = null;
  var secondaryMenuOpen = false;

  function init() {
    // Check if first-time user
    isFirstTime = !localStorage.getItem('dr_route_selected');
    
    if (isFirstTime) {
      document.body.classList.add('first-time-user');
      showWelcomePrompt();
    } else {
      // Returning user - restore last route
      var lastRoute = localStorage.getItem('dr_last_route');
      if (lastRoute && DR.routeSelectorV2) {
        setTimeout(function() {
          DR.routeSelectorV2.selectRoute(lastRoute);
        }, 500);
      }
    }

    // Setup menu
    setupSecondaryMenu();
  }

  function showWelcomePrompt() {
    var prompt = document.getElementById('routePrompt');
    if (prompt) {
      prompt.style.display = 'block';
    }
  }

  function hideWelcomePrompt() {
    var prompt = document.getElementById('routePrompt');
    if (prompt) {
      prompt.style.display = 'none';
    }
  }

  function openRouteSelector() {
    hideWelcomePrompt();
    if (DR.routeSelectorV2) {
      DR.routeSelectorV2.open();
    }
  }

  function onRouteSelected(routeId) {
    selectedRouteId = routeId;
    
    // Mark as not first-time anymore
    if (isFirstTime) {
      localStorage.setItem('dr_route_selected', '1');
      document.body.classList.remove('first-time-user');
      isFirstTime = false;
    }
    
    // Save last route
    localStorage.setItem('dr_last_route', routeId);
    
    // Show route info badge
    showRouteInfoBadge();
    
    // Show enhanced drive button
    showEnhancedDriveButton();
  }

  function showRouteInfoBadge() {
    var badge = document.getElementById('routeInfoBadge');
    if (!badge) return;
    
    var route = DR.routeSelectorV2 ? DR.routeSelectorV2.getSelectedRoute() : null;
    if (!route) return;
    
    document.getElementById('routeBadgeName').textContent = route.name;
    document.getElementById('routeBadgeDist').textContent = route.distance_km.toFixed(0);
    document.getElementById('routeBadgeTime').textContent = route.duration_min;
    document.getElementById('routeBadgeCams').textContent = route.camera_count;
    
    badge.classList.add('visible');
  }

  function hideRouteInfoBadge() {
    var badge = document.getElementById('routeInfoBadge');
    if (badge) {
      badge.classList.remove('visible');
    }
  }

  function showEnhancedDriveButton() {
    // Hide old drive button
    var oldBtn = document.getElementById('startDriveBtn');
    if (oldBtn) oldBtn.style.display = 'none';
    
    // Show enhanced button
    var enhancedBtn = document.getElementById('driveBtnEnhanced');
    if (enhancedBtn) {
      enhancedBtn.style.display = 'flex';
      // Add pulse for first-time
      if (!isFirstTime) {
        enhancedBtn.classList.add('pulse');
      }
    }
  }

  function hideEnhancedDriveButton() {
    var btn = document.getElementById('driveBtnEnhanced');
    if (btn) {
      btn.style.display = 'none';
      btn.classList.remove('pulse');
    }
  }

  function setupSecondaryMenu() {
    // Menu is opened via menu button
    // Items: Legend, Trip History, Settings
  }

  function openSecondaryMenu() {
    var menu = document.getElementById('secondaryMenu');
    if (menu) {
      menu.classList.add('open');
      secondaryMenuOpen = true;
    }
    
    var backdrop = document.getElementById('secondaryMenuBackdrop');
    if (backdrop) {
      backdrop.style.display = 'block';
    }
  }

  function closeSecondaryMenu() {
    var menu = document.getElementById('secondaryMenu');
    if (menu) {
      menu.classList.remove('open');
      secondaryMenuOpen = false;
    }
    
    var backdrop = document.getElementById('secondaryMenuBackdrop');
    if (backdrop) {
      backdrop.style.display = 'none';
    }
  }

  function toggleSecondaryMenu() {
    if (secondaryMenuOpen) {
      closeSecondaryMenu();
    } else {
      openSecondaryMenu();
    }
  }

  function startDriveEnhanced() {
    // Same as original startDrive but with better UX
    hideEnhancedDriveButton();
    hideRouteInfoBadge();
    
    // Call original drive function
    if (window.startDrive) {
      window.startDrive();
    }
  }

  function stopDriveEnhanced() {
    // Show drive button again
    showEnhancedDriveButton();
    showRouteInfoBadge();
    
    // Call original stop function
    if (window.stopDrive) {
      window.stopDrive();
    }
  }

  // Expose module
  DR.simplifiedUX = {
    init: init,
    openRouteSelector: openRouteSelector,
    onRouteSelected: onRouteSelected,
    openSecondaryMenu: openSecondaryMenu,
    closeSecondaryMenu: closeSecondaryMenu,
    toggleSecondaryMenu: toggleSecondaryMenu,
    startDriveEnhanced: startDriveEnhanced,
    stopDriveEnhanced: stopDriveEnhanced
  };

  // Setup global handlers
  window.openRoutePrompt = openRouteSelector;
  window.toggleMenu = toggleSecondaryMenu;
  window.closeMenu = closeSecondaryMenu;
  window.startDriveEnhanced = startDriveEnhanced;

})();
