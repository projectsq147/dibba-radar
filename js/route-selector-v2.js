/* js/route-selector-v2.js -- Bottom sheet route selector with route cards */
(function () {
  'use strict';
  var DR = window.DibbaRadar = window.DibbaRadar || {};

  var routes = null;
  var selectedRoute = null;
  var isOpen = false;

  /** Initialize route selector */
  function init() {
    loadRoutes(function() {
      renderRoutes();
    });
  }

  /** Load routes from index */
  function loadRoutes(cb) {
    fetch('data/routes-index.json')
      .then(function(response) {
        if (!response.ok) throw new Error('Failed to load routes');
        return response.json();
      })
      .then(function(data) {
        routes = data;
        if (cb) cb();
      })
      .catch(function(err) {
        console.error('Error loading routes:', err);
        routes = [];
        if (cb) cb();
      });
  }

  /** Render route cards in selector */
  function renderRoutes() {
    var container = document.getElementById('routeSelectorContent');
    if (!container || !routes) return;

    if (routes.length === 0) {
      container.innerHTML = '<div class="route-selector-empty">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
        '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>' +
        '<polyline points="9 22 9 12 15 12 15 22"/>' +
        '</svg>' +
        '<p>No routes available</p>' +
        '</div>';
      return;
    }

    var html = '';
    for (var i = 0; i < routes.length; i++) {
      var route = routes[i];
      var featuredClass = route.featured ? ' featured' : '';
      
      html += '<div class="route-card' + featuredClass + '" onclick="DibbaRadar.routeSelectorV2.selectRoute(\'' + route.id + '\')">';
      html += '<div class="route-card-name">' + route.name + '</div>';
      html += '<div class="route-card-route">' + route.start_name + ' → ' + route.end_name + '</div>';
      html += '<div class="route-card-stats">';
      html += '<div class="route-card-stat">';
      html += '<div class="route-card-stat-value">' + route.distance_km.toFixed(0) + '</div>';
      html += '<div class="route-card-stat-label">km</div>';
      html += '</div>';
      html += '<div class="route-card-stat">';
      html += '<div class="route-card-stat-value">' + route.duration_min + '</div>';
      html += '<div class="route-card-stat-label">min</div>';
      html += '</div>';
      html += '<div class="route-card-stat route-card-cameras">';
      html += '<div class="route-card-stat-value">' + route.camera_count + '</div>';
      html += '<div class="route-card-stat-label">cameras</div>';
      html += '</div>';
      html += '</div>';
      html += '</div>';
    }

    container.innerHTML = html;
  }

  /** Open route selector */
  function open() {
    var selector = document.getElementById('routeSelector');
    var backdrop = document.getElementById('routeSelectorBackdrop');
    
    if (selector && backdrop) {
      selector.style.display = 'flex';
      backdrop.style.display = 'block';
      
      // Trigger reflow for transition
      selector.offsetHeight;
      
      selector.classList.add('visible');
      backdrop.classList.add('visible');
      isOpen = true;
    }
  }

  /** Close route selector */
  function close() {
    var selector = document.getElementById('routeSelector');
    var backdrop = document.getElementById('routeSelectorBackdrop');
    
    if (selector && backdrop) {
      selector.classList.remove('visible');
      backdrop.classList.remove('visible');
      
      setTimeout(function() {
        selector.style.display = 'none';
        backdrop.style.display = 'none';
      }, 300);
      
      isOpen = false;
    }
  }

  /** Toggle route selector */
  function toggle() {
    if (isOpen) {
      close();
    } else {
      open();
    }
  }

  /** Select a route and load its data */
  function selectRoute(routeId) {
    if (!routes) return;
    
    var route = null;
    for (var i = 0; i < routes.length; i++) {
      if (routes[i].id === routeId) {
        route = routes[i];
        break;
      }
    }
    
    if (!route) return;
    
    selectedRoute = route;
    close();
    
    // Show loading overlay
    showLoading('LOADING ' + route.name.toUpperCase() + '...');
    
    // Load route data file
    var script = document.createElement('script');
    script.src = route.data_file;
    script.onload = function() {
      hideLoading();
      
      // Notify other modules that route changed
      if (DR.radarMap && DR.radarMap.loadRouteData) {
        DR.radarMap.loadRouteData(routeId);
      }
      
      // Zoom map to route bounds if available
      if (DR.mapModule && route.bounds) {
        DR.mapModule.fitBounds(route.bounds);
      }
      
      // Show success toast
      showToast('Loaded ' + route.name);
    };
    script.onerror = function() {
      hideLoading();
      showToast('Failed to load route data', true);
    };
    document.head.appendChild(script);
  }

  /** Get currently selected route */
  function getSelectedRoute() {
    return selectedRoute;
  }

  /** Get all routes */
  function getAllRoutes() {
    return routes || [];
  }

  // Helper: Show loading overlay
  function showLoading(text) {
    var el = document.getElementById('loadingOverlay');
    var txt = document.getElementById('loadingText');
    if (el && txt) {
      txt.textContent = text;
      el.style.display = 'block';
    }
  }

  // Helper: Hide loading overlay
  function hideLoading() {
    var el = document.getElementById('loadingOverlay');
    if (el) el.style.display = 'none';
  }

  // Helper: Show toast notification
  function showToast(message, isError) {
    var toast = document.getElementById('tripToast');
    var text = document.getElementById('tripToastText');
    if (!toast || !text) return;
    
    text.textContent = message;
    toast.style.display = 'block';
    if (isError) {
      toast.style.background = 'rgba(244, 67, 54, 0.95)';
    } else {
      toast.style.background = 'rgba(76, 175, 80, 0.95)';
    }
    
    setTimeout(function() {
      toast.style.display = 'none';
      toast.style.background = ''; // reset
    }, 3000);
  }

  // Expose module
  DR.routeSelectorV2 = {
    init: init,
    open: open,
    close: close,
    toggle: toggle,
    selectRoute: selectRoute,
    getSelectedRoute: getSelectedRoute,
    getAllRoutes: getAllRoutes
  };

  // Setup global handlers
  window.openRouteSelector = open;
  window.closeRouteSelector = close;
  window.toggleRouteSelector = toggle;

})();
