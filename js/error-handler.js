/* js/error-handler.js -- Centralized error handling and user feedback */
(function () {
  'use strict';
  var DR = window.DibbaRadar = window.DibbaRadar || {};

  var toastQueue = [];
  var isShowingToast = false;

  /** Show error toast */
  function showError(message, duration) {
    showToast(message, 'error', duration || 4000);
  }

  /** Show success toast */
  function showSuccess(message, duration) {
    showToast(message, 'success', duration || 3000);
  }

  /** Show info toast */
  function showInfo(message, duration) {
    showToast(message, 'info', duration || 3000);
  }

  /** Generic toast display */
  function showToast(message, type, duration) {
    toastQueue.push({ message: message, type: type, duration: duration });
    if (!isShowingToast) {
      processToastQueue();
    }
  }

  /** Process toast queue */
  function processToastQueue() {
    if (toastQueue.length === 0) {
      isShowingToast = false;
      return;
    }

    isShowingToast = true;
    var toast = toastQueue.shift();
    displayToast(toast.message, toast.type, toast.duration);
  }

  /** Display a single toast */
  function displayToast(message, type, duration) {
    var toastEl = document.getElementById('tripToast');
    var textEl = document.getElementById('tripToastText');
    
    if (!toastEl || !textEl) {
      setTimeout(processToastQueue, 100);
      return;
    }

    textEl.textContent = message;
    
    // Set color based on type
    var bgColor;
    switch (type) {
      case 'error':
        bgColor = 'rgba(244, 67, 54, 0.95)';
        break;
      case 'success':
        bgColor = 'rgba(76, 175, 80, 0.95)';
        break;
      case 'info':
        bgColor = 'rgba(33, 150, 243, 0.95)';
        break;
      default:
        bgColor = 'rgba(255, 255, 255, 0.95)';
    }
    
    toastEl.style.background = bgColor;
    toastEl.style.display = 'block';
    
    setTimeout(function() {
      toastEl.style.display = 'none';
      toastEl.style.background = '';
      setTimeout(processToastQueue, 100);
    }, duration);
  }

  /** Handle GPS errors */
  function handleGPSError(error) {
    var message;
    switch (error.code) {
      case error.PERMISSION_DENIED:
        message = 'Location permission denied. Enable in browser settings.';
        break;
      case error.POSITION_UNAVAILABLE:
        message = 'Location unavailable. Check GPS signal.';
        break;
      case error.TIMEOUT:
        message = 'Location request timed out. Try again.';
        break;
      default:
        message = 'Failed to get location.';
    }
    showError(message);
  }

  /** Handle network errors */
  function handleNetworkError(error, context) {
    var message = 'Network error';
    if (context) message += ': ' + context;
    showError(message);
    console.error('Network error:', error);
  }

  /** Handle API errors */
  function handleAPIError(response, context) {
    var message = 'API error';
    if (context) message += ': ' + context;
    if (response && response.status) {
      message += ' (HTTP ' + response.status + ')';
    }
    showError(message);
  }

  /** Handle data loading errors */
  function handleDataError(error, resourceName) {
    var message = 'Failed to load ' + (resourceName || 'data');
    showError(message);
    console.error('Data error:', error);
  }

  /** Retry wrapper for async operations */
  function retryOperation(fn, maxRetries, delay) {
    maxRetries = maxRetries || 3;
    delay = delay || 1000;
    
    return new Promise(function(resolve, reject) {
      var attempt = 0;
      
      function tryOnce() {
        attempt++;
        fn()
          .then(resolve)
          .catch(function(error) {
            if (attempt >= maxRetries) {
              reject(error);
            } else {
              setTimeout(tryOnce, delay * attempt);
            }
          });
      }
      
      tryOnce();
    });
  }

  /** Safe async wrapper with error handling */
  function safeAsync(fn, errorContext) {
    return fn().catch(function(error) {
      handleNetworkError(error, errorContext);
      throw error;
    });
  }

  // Expose module
  DR.errorHandler = {
    showError: showError,
    showSuccess: showSuccess,
    showInfo: showInfo,
    showToast: showToast,
    handleGPSError: handleGPSError,
    handleNetworkError: handleNetworkError,
    handleAPIError: handleAPIError,
    handleDataError: handleDataError,
    retryOperation: retryOperation,
    safeAsync: safeAsync
  };

})();
