/* js/share.js -- Share route functionality */
(function () {
  'use strict';
  var DR = window.DibbaRadar = window.DibbaRadar || {};

  function init() {
    // Initialize share functionality
  }

  function openSharePanel() {
    var route = DR.routePicker ? DR.routePicker.getSelectedRoute() : null;
    if (!route) {
      alert('No route selected to share');
      return;
    }

    var panel = document.getElementById('sharePanel');
    var urlEl = document.getElementById('shareUrl');
    
    if (!panel) return;

    // Generate shareable URL
    var shareUrl = generateShareUrl(route);
    if (urlEl) {
      urlEl.textContent = shareUrl;
    }

    panel.style.display = 'block';
    panel.classList.add('show');
  }

  function closeSharePanel() {
    var panel = document.getElementById('sharePanel');
    if (panel) {
      panel.style.display = 'none';
      panel.classList.remove('show');
    }
  }

  function generateShareUrl(route) {
    var baseUrl = window.location.origin + window.location.pathname;
    return baseUrl + '?route=' + encodeURIComponent(route.id);
  }

  function shareRoute(method) {
    var route = DR.routePicker ? DR.routePicker.getSelectedRoute() : null;
    if (!route) return;

    switch (method) {
      case 'url':
        shareUrl(route);
        break;
      case 'text':
        shareText(route);
        break;
      case 'native':
        shareNative(route);
        break;
    }
  }

  function shareUrl(route) {
    var url = generateShareUrl(route);
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function() {
        showShareFeedback('URL copied to clipboard!');
      }).catch(function(err) {
        console.warn('Failed to copy URL:', err);
        fallbackCopyText(url);
      });
    } else {
      fallbackCopyText(url);
    }
  }

  function shareText(route) {
    var text = 'Check out this route on Dibba Radar: ' + route.name + 
               ' - ' + route.camera_count + ' cameras, ' + route.distance_km + ' km\n' +
               generateShareUrl(route);
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function() {
        showShareFeedback('Route info copied to clipboard!');
      }).catch(function(err) {
        console.warn('Failed to copy text:', err);
        fallbackCopyText(text);
      });
    } else {
      fallbackCopyText(text);
    }
  }

  function shareNative(route) {
    if (!navigator.share) {
      alert('Native sharing not supported on this device');
      return;
    }

    var shareData = {
      title: 'Dibba Radar Route',
      text: route.name + ' - ' + route.camera_count + ' cameras, ' + route.distance_km + ' km',
      url: generateShareUrl(route)
    };

    navigator.share(shareData).then(function() {
      showShareFeedback('Route shared successfully!');
      closeSharePanel();
    }).catch(function(err) {
      if (err.name !== 'AbortError') {
        console.warn('Share failed:', err);
        alert('Failed to share route');
      }
    });
  }

  function fallbackCopyText(text) {
    // Create a temporary textarea for copying
    var textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    
    try {
      textarea.select();
      document.execCommand('copy');
      showShareFeedback('Copied to clipboard!');
    } catch (err) {
      console.warn('Fallback copy failed:', err);
      // Show the text in a prompt as last resort
      prompt('Copy this:', text);
    }
    
    document.body.removeChild(textarea);
  }

  function showShareFeedback(message) {
    // Create temporary feedback element
    var feedback = document.createElement('div');
    feedback.textContent = message;
    feedback.style.position = 'fixed';
    feedback.style.bottom = '20px';
    feedback.style.left = '50%';
    feedback.style.transform = 'translateX(-50%)';
    feedback.style.background = 'rgba(0, 255, 136, 0.9)';
    feedback.style.color = '#000';
    feedback.style.padding = '8px 16px';
    feedback.style.borderRadius = '20px';
    feedback.style.fontSize = '12px';
    feedback.style.fontWeight = '600';
    feedback.style.zIndex = '9999';
    feedback.style.pointerEvents = 'none';
    
    document.body.appendChild(feedback);
    
    // Remove after 2 seconds
    setTimeout(function() {
      if (feedback.parentNode) {
        feedback.parentNode.removeChild(feedback);
      }
    }, 2000);
  }

  function handleUrlParams() {
    // Check for route parameter in URL
    var urlParams = new URLSearchParams(window.location.search);
    var routeId = urlParams.get('route');
    
    if (routeId && DR.routePicker) {
      // Wait a bit for the route picker to initialize
      setTimeout(function() {
        DR.routePicker.selectRoute(routeId);
      }, 500);
    }
  }

  function generateQRCode(route) {
    // Simple QR code generation would require a library
    // For now, just return the URL
    return generateShareUrl(route);
  }

  function getShareableData(route) {
    return {
      title: 'Dibba Radar Route',
      description: route.name,
      url: generateShareUrl(route),
      text: 'Check out this route on Dibba Radar: ' + route.name + 
            ' - ' + route.camera_count + ' cameras, ' + route.distance_km + ' km',
      hashtags: ['DibbaRadar', 'UAE', 'SpeedCamera', 'Navigation'],
      route: {
        id: route.id,
        name: route.name,
        distance: route.distance_km,
        cameras: route.camera_count,
        duration: route.duration_min
      }
    };
  }

  // Check URL parameters when page loads
  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(handleUrlParams, 1000);
  });

  // Public API
  DR.share = {
    init: init,
    openSharePanel: openSharePanel,
    closeSharePanel: closeSharePanel,
    shareRoute: shareRoute,
    generateShareUrl: generateShareUrl,
    getShareableData: getShareableData,
    handleUrlParams: handleUrlParams
  };

  // Global functions for onclick handlers
  window.openSharePanel = openSharePanel;
  window.closeSharePanel = closeSharePanel;
  window.shareRoute = shareRoute;
})();