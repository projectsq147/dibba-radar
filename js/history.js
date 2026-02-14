/* js/history.js -- Drive history and statistics tracking */
(function () {
  'use strict';
  var DR = window.DibbaRadar = window.DibbaRadar || {};

  var HISTORY_KEY = 'dibba_drive_history';
  var driveHistory = [];
  var currentDrive = null;

  function init() {
    // Load existing history
    driveHistory = loadHistory();
    
    // Listen for drive start/stop events
    document.addEventListener('driveStart', handleDriveStart);
    document.addEventListener('driveStop', handleDriveStop);
    document.addEventListener('driveUpdate', handleDriveUpdate);
  }

  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    } catch (e) {
      console.warn('Failed to load drive history:', e);
      return [];
    }
  }

  function saveHistory() {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(driveHistory));
    } catch (e) {
      console.warn('Failed to save drive history:', e);
    }
  }

  function handleDriveStart(event) {
    var route = DR.routePicker ? DR.routePicker.getSelectedRoute() : null;
    var routeName = route ? route.name : 'Custom Route';

    currentDrive = {
      id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      route: routeName,
      startTime: new Date().toISOString(),
      endTime: null,
      duration: 0,
      distance: 0,
      maxSpeed: 0,
      avgSpeed: 0,
      alertsTriggered: 0,
      speedViolations: 0,
      completed: false,
      speedSamples: [],
      lastPosition: null
    };
  }

  function handleDriveUpdate(event) {
    if (!currentDrive || !event.detail) return;

    var data = event.detail;
    
    // Update speed tracking
    if (data.speed !== undefined) {
      currentDrive.maxSpeed = Math.max(currentDrive.maxSpeed, data.speed);
      currentDrive.speedSamples.push({
        time: Date.now(),
        speed: data.speed,
        limit: data.speedLimit || 0,
        over: data.speed > (data.speedLimit || 0)
      });
      
      // Count speed violations
      if (data.speed > (data.speedLimit || 0) && data.speedLimit > 0) {
        currentDrive.speedViolations++;
      }
    }

    // Update distance if position provided
    if (data.position && currentDrive.lastPosition) {
      var dist = DR.haversine(currentDrive.lastPosition, data.position);
      currentDrive.distance += dist;
    }
    
    if (data.position) {
      currentDrive.lastPosition = data.position;
    }

    // Count alerts
    if (data.alertTriggered) {
      currentDrive.alertsTriggered++;
    }
  }

  function handleDriveStop(event) {
    if (!currentDrive) return;

    // Finalize drive record
    currentDrive.endTime = new Date().toISOString();
    currentDrive.duration = (new Date(currentDrive.endTime) - new Date(currentDrive.startTime)) / 1000;
    currentDrive.completed = true;

    // Calculate average speed
    if (currentDrive.speedSamples.length > 0) {
      var totalSpeed = currentDrive.speedSamples.reduce(function(sum, sample) {
        return sum + sample.speed;
      }, 0);
      currentDrive.avgSpeed = totalSpeed / currentDrive.speedSamples.length;
    }

    // Only save drives longer than 2 minutes
    if (currentDrive.duration > 120) {
      driveHistory.unshift(currentDrive); // Add to beginning
      
      // Keep only last 50 drives
      if (driveHistory.length > 50) {
        driveHistory = driveHistory.slice(0, 50);
      }
      
      saveHistory();
    }

    currentDrive = null;
  }

  function showDriveHistory() {
    var panel = document.getElementById('historyPanel');
    var statsEl = document.getElementById('historyStats');
    var contentEl = document.getElementById('historyContent');
    
    if (!panel) return;

    // Update statistics
    var stats = calculateStats();
    if (statsEl) {
      statsEl.innerHTML = 
        '<div class="hist-stat">' +
          '<span class="hist-stat-value">' + stats.totalDrives + '</span>' +
          '<span class="hist-stat-label">Total Drives</span>' +
        '</div>' +
        '<div class="hist-stat">' +
          '<span class="hist-stat-value">' + stats.totalDistance.toFixed(1) + '</span>' +
          '<span class="hist-stat-label">Total km</span>' +
        '</div>' +
        '<div class="hist-stat">' +
          '<span class="hist-stat-value">' + stats.compliance + '%</span>' +
          '<span class="hist-stat-label">Compliance</span>' +
        '</div>';
    }

    // Render drive list
    if (contentEl) {
      if (driveHistory.length === 0) {
        contentEl.innerHTML = '<div class="history-empty">No drives recorded yet</div>';
      } else {
        contentEl.innerHTML = driveHistory.map(function(drive) {
          return renderDriveEntry(drive);
        }).join('');
      }
    }

    panel.style.display = 'block';
    panel.classList.add('show');
  }

  function calculateStats() {
    var totalDrives = driveHistory.length;
    var totalDistance = driveHistory.reduce(function(sum, drive) {
      return sum + drive.distance;
    }, 0);
    
    var totalSamples = 0;
    var compliantSamples = 0;
    
    driveHistory.forEach(function(drive) {
      drive.speedSamples.forEach(function(sample) {
        if (sample.limit > 0) {
          totalSamples++;
          if (!sample.over) {
            compliantSamples++;
          }
        }
      });
    });
    
    var compliance = totalSamples > 0 ? Math.round((compliantSamples / totalSamples) * 100) : 100;
    
    return {
      totalDrives: totalDrives,
      totalDistance: totalDistance,
      compliance: compliance
    };
  }

  function renderDriveEntry(drive) {
    var date = new Date(drive.startTime);
    var dateStr = date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit'
    });
    var timeStr = date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit'
    });
    
    var durationMin = Math.round(drive.duration / 60);
    var durationStr = durationMin < 60 ? 
      durationMin + 'm' : 
      Math.floor(durationMin / 60) + 'h ' + (durationMin % 60) + 'm';

    return '<div class="history-entry">' +
      '<div class="history-entry-info">' +
        '<div class="history-entry-route">' + escapeHtml(drive.route) + '</div>' +
        '<div class="history-entry-date">' + dateStr + ' ' + timeStr + '</div>' +
      '</div>' +
      '<div class="history-entry-stats">' +
        '<div class="history-entry-duration">' + durationStr + '</div>' +
        '<div>' + drive.distance.toFixed(1) + 'km • ' + Math.round(drive.maxSpeed) + 'km/h max</div>' +
        '<div>' + drive.alertsTriggered + ' alerts • ' + drive.speedViolations + ' violations</div>' +
      '</div>' +
    '</div>';
  }

  function closeDriveHistory() {
    var panel = document.getElementById('historyPanel');
    if (panel) {
      panel.style.display = 'none';
      panel.classList.remove('show');
    }
  }

  function clearHistory() {
    if (confirm('Clear all drive history?')) {
      driveHistory = [];
      saveHistory();
      showDriveHistory(); // Refresh display
    }
  }

  function exportHistory() {
    if (driveHistory.length === 0) {
      alert('No drive history to export');
      return;
    }

    var csv = 'Date,Time,Route,Duration(min),Distance(km),Max Speed(km/h),Avg Speed(km/h),Alerts,Violations\n';
    
    driveHistory.forEach(function(drive) {
      var date = new Date(drive.startTime);
      var dateStr = date.toLocaleDateString('en-GB');
      var timeStr = date.toLocaleTimeString('en-GB');
      var durationMin = Math.round(drive.duration / 60);
      
      csv += [
        dateStr,
        timeStr,
        '"' + drive.route + '"',
        durationMin,
        drive.distance.toFixed(1),
        Math.round(drive.maxSpeed),
        Math.round(drive.avgSpeed),
        drive.alertsTriggered,
        drive.speedViolations
      ].join(',') + '\n';
    });

    // Download CSV
    var blob = new Blob([csv], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'dibba-radar-history.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function getDriveHistory() {
    return driveHistory;
  }

  function getCurrentDrive() {
    return currentDrive;
  }

  // Public API
  DR.history = {
    init: init,
    showDriveHistory: showDriveHistory,
    closeDriveHistory: closeDriveHistory,
    clearHistory: clearHistory,
    exportHistory: exportHistory,
    getDriveHistory: getDriveHistory,
    getCurrentDrive: getCurrentDrive
  };

  // Global functions for onclick handlers
  window.showDriveHistory = showDriveHistory;
  window.closeDriveHistory = closeDriveHistory;
})();