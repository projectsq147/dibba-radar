/* js/route-picker.js -- Route selection home screen, multi-route support */
(function () {
  'use strict';
  var DR = window.DibbaRadar = window.DibbaRadar || {};

  var routesIndex = [];
  var selectedRoute = null;
  var isVisible = true;

  function init() {
    // Show route picker on app start
    showRouteSelection();
    
    // Load routes index
    loadRoutesIndex(function(routes) {
      routesIndex = routes;
      renderRoutes(routes);
      updateStats(routes);
    });
  }

  /** Load routes index from JSON */
  function loadRoutesIndex(cb) {
    fetch('data/routes-index.json')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (cb) cb(data || []);
      })
      .catch(function(err) {
        console.warn('Failed to load routes index:', err);
        // Fallback to single route
        var fallback = [{
          id: 'dubai-dibba',
          name: 'Dubai to Dibba Al Hisn',
          description: 'ENOC Al Awir to Wave Cafe',
          distance_km: 115.8,
          duration_min: 85,
          camera_count: 28,
          start_name: 'ENOC Al Awir',
          end_name: 'Wave Cafe Dibba',
          data_file: 'data/dubai-dibba.js',
          featured: true
        }];
        if (cb) cb(fallback);
      });
  }

  /** Render route cards */
  function renderRoutes(routes) {
    var container = document.getElementById('routeCards');
    if (!container) return;

    container.innerHTML = '';

    routes.forEach(function(route, idx) {
      var card = document.createElement('div');
      card.className = 'route-card loading';
      card.style.animationDelay = (idx * 0.1) + 's';
      card.onclick = function() { selectRoute(route.id); };

      var statsHtml = '<div class="route-card-stats">' +
        '<div class="route-stat"><span class="route-stat-value">' + route.distance_km + '</span> km</div>' +
        '<div class="route-stat"><span class="route-stat-value">' + route.duration_min + '</span> min</div>' +
        '<div class="route-stat"><span class="route-stat-value">' + route.camera_count + '</span> cams</div>' +
        '</div>';

      card.innerHTML = 
        '<div class="route-card-icon">🛣️</div>' +
        '<div class="route-card-content">' +
          '<div class="route-card-title">' + escapeHtml(route.name.toUpperCase()) + '</div>' +
          '<div class="route-card-description">' + escapeHtml(route.description) + '</div>' +
          statsHtml +
        '</div>' +
        '<div class="route-card-arrow">→</div>';

      container.appendChild(card);
    });
  }

  /** Update summary stats */
  function updateStats(routes) {
    var totalRoutes = routes.length;
    var totalCameras = routes.reduce(function(sum, r) { return sum + r.camera_count; }, 0);
    var totalKm = routes.reduce(function(sum, r) { return sum + r.distance_km; }, 0);

    var routesEl = document.getElementById('totalRoutes');
    var camerasEl = document.getElementById('totalCameras');
    var kmEl = document.getElementById('totalKm');

    if (routesEl) routesEl.textContent = totalRoutes;
    if (camerasEl) camerasEl.textContent = totalCameras;
    if (kmEl) kmEl.textContent = Math.round(totalKm);
  }

  /** Select a pre-defined route */
  function selectRoute(routeId) {
    var route = routesIndex.find(function(r) { return r.id === routeId; });
    if (!route) return;

    selectedRoute = route;
    
    // Hide route picker
    hideRouteSelection();
    
    // Load route data dynamically
    loadRouteData(route, function(success) {
      if (success) {
        // Update UI with route info
        updateRouteInfo(route);
        
        // Initialize map and other modules
        DR.mapModule.init();
        DR.mapModule.drawRoutes(DR.cameras.getRouteData());
        DR.mapModule.drawMap();

        // Fetch Waze alerts
        DR.waze.fetch(DR.mapModule.getWazeLayer());
        DR.waze.startAutoRefresh(DR.mapModule.getWazeLayer());

        // GPS setup
        if (DR.gps && DR.gps.setupMapDragHandler) {
          DR.gps.setupMapDragHandler();
        }
        
        checkGPSAvailability();
        
        // Show share button
        var shareBtn = document.getElementById('shareBtn');
        if (shareBtn) shareBtn.style.display = 'block';
      }
    });
  }

  /** Load route data file dynamically */
  function loadRouteData(route, cb) {
    // Show loading
    var loadingEl = document.getElementById('loadingOverlay');
    var loadingText = document.getElementById('loadingText');
    if (loadingEl && loadingText) {
      loadingText.textContent = 'LOADING ROUTE...';
      loadingEl.style.display = 'block';
    }

    // Determine if it's a .js or .json file
    var dataFile = route.data_file;
    var isJsFile = dataFile.endsWith('.js');

    if (isJsFile) {
      // Load .js file by adding script tag
      var script = document.createElement('script');
      script.src = dataFile;
      script.onload = function() {
        // .js file should have set DR._routeData
        if (DR._routeData) {
          if (loadingEl) loadingEl.style.display = 'none';
          if (cb) cb(true);
        } else {
          console.error('Route data not found after loading .js file');
          if (loadingEl) loadingEl.style.display = 'none';
          if (cb) cb(false);
        }
      };
      script.onerror = function() {
        console.error('Failed to load route .js file:', dataFile);
        if (loadingEl) loadingEl.style.display = 'none';
        if (cb) cb(false);
      };
      document.head.appendChild(script);
    } else {
      // Load .json file via fetch
      var jsonFile = dataFile.replace('.js', '.json');
      fetch(jsonFile)
        .then(function(r) { return r.json(); })
        .then(function(data) {
          DR._routeData = data;
          if (loadingEl) loadingEl.style.display = 'none';
          if (cb) cb(true);
        })
        .catch(function(err) {
          console.error('Failed to load route .json file:', jsonFile, err);
          if (loadingEl) loadingEl.style.display = 'none';
          if (cb) cb(false);
        });
    }
  }

  /** Update route info in header */
  function updateRouteInfo(route) {
    var titleEl = document.getElementById('panelTitle');
    var subEl = document.getElementById('panelSub');
    var dirLabel = document.getElementById('dirLabel');
    var routeKmEl = document.getElementById('routeKmVal');
    var routeMinEl = document.getElementById('routeMinVal');

    if (titleEl) titleEl.textContent = route.name.toUpperCase();
    if (subEl) subEl.textContent = route.start_name + ' to ' + route.end_name + ' • Fixed + live alerts';
    if (dirLabel) dirLabel.textContent = route.start_name.substring(0, 3).toUpperCase() + ' > ' + 
                                        route.end_name.substring(0, 6).toUpperCase();
    if (routeKmEl) routeKmEl.textContent = route.distance_km;
    if (routeMinEl) routeMinEl.textContent = route.duration_min;
  }

  /** Select custom route (search-based) */
  function selectCustomRoute() {
    selectedRoute = null;
    
    // Hide route picker
    hideRouteSelection();
    
    // Load default route data for the search/routing system to work
    var defaultRoute = routesIndex.find(function(r) { return r.featured; }) || routesIndex[0];
    if (defaultRoute) {
      loadRouteData(defaultRoute, function(success) {
        if (success) {
          // Initialize map
          DR.mapModule.init();
          DR.mapModule.drawRoutes(DR.cameras.getRouteData());
          DR.mapModule.drawMap();
          
          // Initialize search
          DR.search.init();
          
          // Show search bar
          var searchBar = document.getElementById('searchBar');
          if (searchBar) {
            searchBar.style.display = 'block';
            var input = document.getElementById('searchInput');
            if (input) {
              input.focus();
              input.placeholder = 'Search destination...';
            }
          }
          
          // Fetch Waze
          DR.waze.fetch(DR.mapModule.getWazeLayer());
          
          // GPS setup
          if (DR.gps && DR.gps.setupMapDragHandler) {
            DR.gps.setupMapDragHandler();
          }
          
          checkGPSAvailability();
        }
      });
    }
  }

  /** Show route selection screen */
  function showRouteSelection() {
    isVisible = true;
    var picker = document.getElementById('routePicker');
    var body = document.body;
    
    if (picker) {
      picker.style.display = 'block';
      body.classList.remove('map-active');
    }
    
    // Hide map UI elements
    var panel = document.getElementById('panel');
    var searchBar = document.getElementById('searchBar');
    var startBtn = document.getElementById('startDriveBtn');
    
    if (panel) panel.style.display = 'none';
    if (searchBar) searchBar.style.display = 'none';
    if (startBtn) startBtn.style.display = 'none';
  }

  /** Hide route selection screen */
  function hideRouteSelection() {
    isVisible = false;
    var picker = document.getElementById('routePicker');
    var body = document.body;
    
    if (picker) {
      picker.style.display = 'none';
      body.classList.add('map-active');
    }
    
    // Show map UI elements
    var panel = document.getElementById('panel');
    var searchBar = document.getElementById('searchBar');
    
    if (panel) panel.style.display = 'block';
    
    // Only show search bar if this is a custom route
    if (searchBar && !selectedRoute) {
      searchBar.style.display = 'block';
    }
  }

  /** Return to route selection from map */
  function backToRouteSelection() {
    // Clear any active navigation
    if (DR.gps && DR.gps.stopTracking) {
      DR.gps.stopTracking();
    }
    
    // Clear dynamic route
    if (DR.cameras && DR.cameras.clearDynamicRoute) {
      DR.cameras.clearDynamicRoute();
    }
    
    // Clear search
    if (DR.search && DR.search.clear) {
      DR.search.clear();
    }
    
    // Hide route info and other UI
    DR.mapModule.hideRouteInfo();
    DR.mapModule.clearDynamicRoute();
    
    var shareBtn = document.getElementById('shareBtn');
    if (shareBtn) shareBtn.style.display = 'none';
    
    // Reset selected route
    selectedRoute = null;
    
    // Show route picker
    showRouteSelection();
  }

  /** Check GPS availability and show appropriate buttons */
  function checkGPSAvailability() {
    var startBtn = document.getElementById('startDriveBtn');
    if (!startBtn) return;
    
    if ('geolocation' in navigator) {
      // Only show start button if not navigating (dynamic route has its own GO button)
      if (!DR.cameras.isNavigating()) {
        startBtn.style.display = 'block';
      }
      if (DR.gps && DR.gps.locatePassive) {
        DR.gps.locatePassive();
      }
    } else {
      startBtn.style.display = 'none';
    }
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function getSelectedRoute() {
    return selectedRoute;
  }

  function isRoutePickerVisible() {
    return isVisible;
  }

  // Public API
  DR.routePicker = {
    init: init,
    selectRoute: selectRoute,
    selectCustomRoute: selectCustomRoute,
    backToRouteSelection: backToRouteSelection,
    getSelectedRoute: getSelectedRoute,
    isVisible: isRoutePickerVisible
  };

  // Global functions for onclick handlers
  window.selectCustomRoute = selectCustomRoute;
  window.backToRouteSelection = backToRouteSelection;
})();