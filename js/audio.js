/* js/audio.js -- Proper alert audio using Web Audio API */
(function () {
  'use strict';
  var DR = window.DibbaRadar = window.DibbaRadar || {};

  var audioContext = null;
  var isEnabled = true;

  function init() {
    // Initialize Web Audio Context on first user interaction
    document.addEventListener('click', initAudioContext, { once: true });
    document.addEventListener('touchstart', initAudioContext, { once: true });
    
    // Listen for settings changes
    document.addEventListener('settingsChange', function(e) {
      if (e.detail.type === 'audio') {
        isEnabled = e.detail.value;
      }
    });
  }

  function initAudioContext() {
    if (!audioContext) {
      try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        console.warn('Web Audio API not supported:', e);
      }
    }
  }

  function ensureAudioContext() {
    if (!audioContext) {
      initAudioContext();
    }
    
    // Resume context if suspended (mobile Safari)
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume();
    }
    
    return audioContext;
  }

  /** Play 1000m warning: short double-beep, medium pitch */
  function play1000mWarning() {
    if (!isEnabled) return;
    var ctx = ensureAudioContext();
    if (!ctx) return;

    playBeepSequence(ctx, [
      { freq: 600, duration: 0.15, delay: 0 },
      { freq: 600, duration: 0.15, delay: 0.25 }
    ], 0.6);
  }

  /** Play 500m warning: triple-beep, higher pitch, slightly longer */
  function play500mWarning() {
    if (!isEnabled) return;
    var ctx = ensureAudioContext();
    if (!ctx) return;

    playBeepSequence(ctx, [
      { freq: 800, duration: 0.2, delay: 0 },
      { freq: 800, duration: 0.2, delay: 0.3 },
      { freq: 800, duration: 0.2, delay: 0.6 }
    ], 0.7);
  }

  /** Play 200m warning: urgent rapid beeps + vibration */
  function play200mWarning() {
    if (!isEnabled) return;
    var ctx = ensureAudioContext();
    if (!ctx) return;

    playBeepSequence(ctx, [
      { freq: 1000, duration: 0.1, delay: 0 },
      { freq: 1000, duration: 0.1, delay: 0.15 },
      { freq: 1000, duration: 0.1, delay: 0.3 },
      { freq: 1000, duration: 0.1, delay: 0.45 },
      { freq: 1000, duration: 0.1, delay: 0.6 }
    ], 0.9);

    // Trigger vibration if supported
    if ('vibrate' in navigator) {
      navigator.vibrate([100, 50, 100, 50, 100]);
    }
  }

  /** Play camera passing chime: pleasant descending notes */
  function playCameraPassed() {
    if (!isEnabled) return;
    var ctx = ensureAudioContext();
    if (!ctx) return;

    playBeepSequence(ctx, [
      { freq: 880, duration: 0.3, delay: 0 },
      { freq: 660, duration: 0.4, delay: 0.2 },
      { freq: 440, duration: 0.5, delay: 0.4 }
    ], 0.6);
  }

  /** Play speed warning: continuous low pulsing tone */
  function playSpeedWarning() {
    if (!isEnabled) return;
    var ctx = ensureAudioContext();
    if (!ctx) return;

    // Create a pulsing low-frequency tone
    var oscillator = ctx.createOscillator();
    var gainNode = ctx.createGain();
    var pulseGain = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(pulseGain);
    pulseGain.connect(ctx.destination);
    
    oscillator.frequency.value = 300; // Low frequency
    oscillator.type = 'sine';
    
    // Create pulsing effect
    var now = ctx.currentTime;
    gainNode.gain.setValueAtTime(0, now);
    
    for (var i = 0; i < 10; i++) { // 5 seconds of pulsing
      var time = now + i * 0.5;
      gainNode.gain.setValueAtTime(0, time);
      gainNode.gain.linearRampToValueAtTime(0.7, time + 0.1);
      gainNode.gain.linearRampToValueAtTime(0, time + 0.4);
    }
    
    pulseGain.gain.value = 0.6;
    
    oscillator.start(now);
    oscillator.stop(now + 5);
  }

  /** Play a sequence of beeps */
  function playBeepSequence(ctx, beeps, volume) {
    volume = volume || 0.3;
    var now = ctx.currentTime;
    
    beeps.forEach(function(beep) {
      var oscillator = ctx.createOscillator();
      var gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.frequency.value = beep.freq;
      oscillator.type = 'sine';
      
      var startTime = now + beep.delay;
      var endTime = startTime + beep.duration;
      
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, endTime);
      
      oscillator.start(startTime);
      oscillator.stop(endTime);
    });
  }

  /** Play alert by type: 'warning' or 'critical' */
  function playAlert(type) {
    if (!isEnabled) return;
    var ctx = ensureAudioContext();
    if (!ctx) return;

    if (type === 'critical') {
      // Rapid triple-beep at 1000Hz, 0.8 volume, 150ms
      playBeepSequence(ctx, [
        { freq: 1000, duration: 0.15, delay: 0 },
        { freq: 1000, duration: 0.15, delay: 0.2 },
        { freq: 1000, duration: 0.15, delay: 0.4 }
      ], 0.8);
      // Vibration for critical
      if ('vibrate' in navigator) {
        navigator.vibrate([150, 80, 150, 80, 150]);
      }
    } else {
      // Double-beep warning tone at 800Hz, 0.6 volume, 200ms
      playBeepSequence(ctx, [
        { freq: 800, duration: 0.2, delay: 0 },
        { freq: 800, duration: 0.2, delay: 0.3 }
      ], 0.6);
    }
  }

  /** Stop any ongoing speed warning */
  function stopSpeedWarning() {
    // Speed warning naturally stops after 5 seconds
    // Could track and stop early if needed
  }

  /** Test audio system */
  function testAudio() {
    if (!isEnabled) {
      alert('Audio is disabled in settings');
      return;
    }
    
    var ctx = ensureAudioContext();
    if (!ctx) {
      alert('Audio not supported on this device');
      return;
    }
    
    // Play a simple test beep
    playBeepSequence(ctx, [
      { freq: 440, duration: 0.2, delay: 0 }
    ], 0.7);
  }

  function isAudioEnabled() {
    return isEnabled && audioContext !== null;
  }

  function setEnabled(enabled) {
    isEnabled = enabled;
  }

  // Public API
  DR.audio = {
    init: init,
    playAlert: playAlert,
    play1000mWarning: play1000mWarning,
    play500mWarning: play500mWarning,
    play200mWarning: play200mWarning,
    playCameraPassed: playCameraPassed,
    playSpeedWarning: playSpeedWarning,
    stopSpeedWarning: stopSpeedWarning,
    testAudio: testAudio,
    isEnabled: isAudioEnabled,
    setEnabled: setEnabled
  };
})();