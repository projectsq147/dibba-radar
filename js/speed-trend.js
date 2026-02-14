/* js/speed-trend.js -- Speed trend graph for HUD */
(function () {
  'use strict';
  var DR = window.DibbaRadar = window.DibbaRadar || {};

  var canvas = null;
  var ctx = null;
  var speedHistory = [];
  var maxHistory = 150; // 5 minutes at 2 second intervals
  var lastUpdate = 0;
  var currentSpeedLimit = 0;

  function init() {
    canvas = document.getElementById('speedTrendCanvas');
    if (!canvas) return;

    ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Listen for drive updates
    document.addEventListener('driveUpdate', function(e) {
      if (e.detail && e.detail.speed !== undefined) {
        updateSpeedHistory(e.detail.speed, e.detail.speedLimit || 0);
      }
    });

    // Listen for HUD mode changes
    document.addEventListener('hudModeChange', function(e) {
      if (e.detail && e.detail.active) {
        startUpdating();
      } else {
        stopUpdating();
      }
    });

    // Clear history when drive stops
    document.addEventListener('driveStop', function() {
      speedHistory = [];
      clearCanvas();
    });
  }

  function updateSpeedHistory(speed, speedLimit) {
    var now = Date.now();
    
    // Only update every 2 seconds to avoid too much noise
    if (now - lastUpdate < 2000) return;
    lastUpdate = now;

    currentSpeedLimit = speedLimit;
    
    speedHistory.push({
      time: now,
      speed: speed,
      limit: speedLimit
    });

    // Remove old entries (keep 5 minutes)
    var cutoff = now - (5 * 60 * 1000);
    speedHistory = speedHistory.filter(function(entry) {
      return entry.time > cutoff;
    });

    // Trim to max length
    if (speedHistory.length > maxHistory) {
      speedHistory = speedHistory.slice(-maxHistory);
    }

    if (isVisible()) {
      drawGraph();
    }
  }

  function drawGraph() {
    if (!ctx || speedHistory.length < 2) {
      clearCanvas();
      return;
    }

    var width = canvas.width;
    var height = canvas.height;
    var padding = 5;
    var graphWidth = width - (padding * 2);
    var graphHeight = height - (padding * 2);

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Find min/max speeds for scaling
    var speeds = speedHistory.map(function(entry) { return entry.speed; });
    var minSpeed = Math.min.apply(Math, speeds);
    var maxSpeed = Math.max.apply(Math, speeds);
    
    // Include speed limit in range if it exists
    if (currentSpeedLimit > 0) {
      maxSpeed = Math.max(maxSpeed, currentSpeedLimit);
      minSpeed = Math.min(minSpeed, currentSpeedLimit * 0.8);
    }

    // Add some margin
    var range = maxSpeed - minSpeed;
    minSpeed = Math.max(0, minSpeed - range * 0.1);
    maxSpeed = maxSpeed + range * 0.1;

    if (maxSpeed <= minSpeed) {
      maxSpeed = minSpeed + 20; // Fallback
    }

    // Draw speed limit line if exists
    if (currentSpeedLimit > 0) {
      var limitY = padding + ((maxSpeed - currentSpeedLimit) / (maxSpeed - minSpeed)) * graphHeight;
      
      ctx.strokeStyle = 'rgba(255, 193, 7, 0.6)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(padding, limitY);
      ctx.lineTo(width - padding, limitY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw speed line
    ctx.strokeStyle = getSpeedColor(speedHistory[speedHistory.length - 1].speed, currentSpeedLimit);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    
    speedHistory.forEach(function(entry, index) {
      var x = padding + (index / (speedHistory.length - 1)) * graphWidth;
      var y = padding + ((maxSpeed - entry.speed) / (maxSpeed - minSpeed)) * graphHeight;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    // Draw gradient under the line for visual appeal
    if (speedHistory.length > 1) {
      var gradient = ctx.createLinearGradient(0, 0, 0, height);
      var baseColor = getSpeedColor(speedHistory[speedHistory.length - 1].speed, currentSpeedLimit);
      gradient.addColorStop(0, baseColor.replace('rgb', 'rgba').replace(')', ', 0.3)'));
      gradient.addColorStop(1, baseColor.replace('rgb', 'rgba').replace(')', ', 0.1)'));
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      
      speedHistory.forEach(function(entry, index) {
        var x = padding + (index / (speedHistory.length - 1)) * graphWidth;
        var y = padding + ((maxSpeed - entry.speed) / (maxSpeed - minSpeed)) * graphHeight;
        
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      
      // Close path to bottom
      var lastX = padding + graphWidth;
      ctx.lineTo(lastX, height - padding);
      ctx.lineTo(padding, height - padding);
      ctx.closePath();
      ctx.fill();
    }
  }

  function getSpeedColor(speed, limit) {
    if (limit > 0 && speed > limit) {
      return '#ff3b3b'; // Red when over limit
    } else if (limit > 0 && speed > limit * 0.9) {
      return '#ffc107'; // Yellow when approaching limit
    } else {
      return '#00ff88'; // Green when under limit
    }
  }

  function clearCanvas() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function isVisible() {
    return canvas && canvas.style.display !== 'none' && 
           document.body.classList.contains('hud-active');
  }

  function startUpdating() {
    // Graph updates on demand when new speed data comes in
  }

  function stopUpdating() {
    // Nothing to stop, updates are event-driven
  }

  function reset() {
    speedHistory = [];
    currentSpeedLimit = 0;
    clearCanvas();
  }

  function getSpeedHistory() {
    return speedHistory.slice(); // Return copy
  }

  // Public API
  DR.speedTrend = {
    init: init,
    updateSpeedHistory: updateSpeedHistory,
    drawGraph: drawGraph,
    reset: reset,
    getSpeedHistory: getSpeedHistory
  };
})();