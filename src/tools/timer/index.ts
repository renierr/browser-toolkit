
// noinspection JSUnusedGlobalSymbols
export default function init() {
  let timeLeft = 0;
  let isRunning = false;
  let endTime: number | null = null;
  let audioCtx: AudioContext | null = null;
  let silentSource: AudioBufferSourceNode | null = null;
  let displayIntervalId: number | null = null;

  const display = document.getElementById('timer-display') as HTMLElement;
  const status = document.getElementById('timer-status') as HTMLElement;
  const startStopBtn = document.getElementById('start-stop-btn') as HTMLButtonElement;
  const resetBtn = document.getElementById('reset-btn') as HTMLButtonElement;
  const customInput = document.getElementById('custom-minutes') as HTMLInputElement;
  const setCustomBtn = document.getElementById('set-custom') as HTMLButtonElement;
  const presetBtns = document.querySelectorAll('.preset-btn');
  const notifPermission = document.getElementById('notif-permission') as HTMLElement;

  const storedDocTitle = document.title;

  // Send message to service worker
  function sendToSW(type: string, data: any = {}) {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type, data });
    }
  }

  // Request state from service worker
  function requestStateFromSW() {
    sendToSW('timer-get-state');
  }

  // Handle messages from service worker
  function handleSWMessage(event: MessageEvent) {
    const { type, state } = event.data || {};

    switch (type) {
      case 'timer-state':
      case 'timer-update':
      case 'timer-started':
      case 'timer-tick':
        timeLeft = state.timeLeft;
        isRunning = state.isRunning;
        endTime = state.endTime;
        updateDisplay();
        updateUI();
        if (isRunning) {
          startSilentAudio();
          startDisplayInterval();
        }
        break;

      case 'timer-paused':
        timeLeft = state.timeLeft;
        isRunning = false;
        endTime = null;
        updateDisplay();
        updateUI();
        stopSilentAudio();
        stopDisplayInterval();
        break;

      case 'timer-reset':
        timeLeft = 0;
        isRunning = false;
        endTime = null;
        updateDisplay();
        updateUI();
        stopSilentAudio();
        stopDisplayInterval();
        break;

      case 'timer-finished':
        timeLeft = 0;
        isRunning = false;
        endTime = null;
        updateDisplay();
        updateUI();
        stopSilentAudio();
        stopDisplayInterval();
        playAlarmSound();
        status.textContent = 'Finished';
        break;
    }
  }

  function updateUI() {
    if (isRunning) {
      startStopBtn.textContent = 'Pause';
      startStopBtn.classList.remove('btn-primary');
      startStopBtn.classList.add('btn-warning');
      status.textContent = 'Running...';
    } else {
      startStopBtn.textContent = 'Start';
      startStopBtn.classList.remove('btn-warning');
      startStopBtn.classList.add('btn-primary');
      if (timeLeft > 0) {
        status.textContent = 'Paused';
      } else {
        status.textContent = 'Ready';
      }
    }
  }

  // Local display interval for smooth UI updates (SW only ticks every second)
  function startDisplayInterval() {
    if (displayIntervalId) return;

    displayIntervalId = window.setInterval(() => {
      if (endTime) {
        const remaining = Math.round((endTime - Date.now()) / 1000);
        if (remaining >= 0) {
          timeLeft = remaining;
          updateDisplay();
        }
      }
    }, 100); // Update display 10x per second for smooth countdown
  }

  function stopDisplayInterval() {
    if (displayIntervalId) {
      clearInterval(displayIntervalId);
      displayIntervalId = null;
    }
  }

  function startSilentAudio() {
    // Initialize AudioContext on first user interaction (required by browsers)
    if (!audioCtx) {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      audioCtx = new AudioContext();
    }

    // If it was suspended, wake it up
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    // Create the silent loop if it isn't already running
    if (!silentSource) {
      // Create a longer buffer (1 second at low sample rate) for better device compatibility
      // Some mobile browsers throttle very short buffers
      const sampleRate = audioCtx.sampleRate;
      const bufferLength = sampleRate; // 1 second of audio
      const buffer = audioCtx.createBuffer(1, bufferLength, sampleRate);

      // Fill buffer with near-silence (tiny amplitude to keep audio pipeline active)
      const channelData = buffer.getChannelData(0);
      for (let i = 0; i < bufferLength; i++) {
        // Imperceptible audio signal that keeps the audio context alive
        channelData[i] = Math.random() * 0.00001 - 0.000005;
      }

      silentSource = audioCtx.createBufferSource();
      silentSource.buffer = buffer;
      silentSource.loop = true;
      silentSource.connect(audioCtx.destination);
      silentSource.start();
    }
  }

  function stopSilentAudio() {
    if (silentSource) {
      silentSource.stop();
      silentSource.disconnect();
      silentSource = null;
    }
    // Suspend the context to save battery when the timer isn't running
    if (audioCtx && audioCtx.state === 'running') {
      audioCtx.suspend();
    }
  }

  function playAlarmSound() {
    if (!audioCtx) return;

    // Wake up the context just in case it was suspended
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    // Play a pleasant multi-tone alarm pattern (3 ascending chimes, repeated twice)
    const frequencies = [523.25, 659.25, 783.99]; // C5, E5, G5 (C major chord - pleasant sound)
    const beepDuration = 0.15; // Duration of each beep
    const beepGap = 0.1; // Gap between beeps
    const patternGap = 0.4; // Gap between pattern repetitions
    const repetitions = 2;

    for (let rep = 0; rep < repetitions; rep++) {
      const patternStart = rep * (frequencies.length * (beepDuration + beepGap) + patternGap);

      frequencies.forEach((freq, index) => {
        const startTime = audioCtx!.currentTime + patternStart + index * (beepDuration + beepGap);

        // Create oscillator for this beep
        const oscillator = audioCtx!.createOscillator();
        const gainNode = audioCtx!.createGain();

        // Use sine wave for a softer, more pleasant tone
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(freq, startTime);

        // Connect nodes
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx!.destination);

        // Envelope: quick attack, sustain, smooth decay for a chime-like sound
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.6, startTime + 0.02); // Quick attack
        gainNode.gain.setValueAtTime(0.6, startTime + beepDuration * 0.6); // Sustain
        gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + beepDuration); // Decay

        // Play the beep
        oscillator.start(startTime);
        oscillator.stop(startTime + beepDuration);
      });
    }
  }

  function updateDisplay() {
    const mins = Math.floor(Math.max(0, timeLeft) / 60);
    const secs = Math.max(0, timeLeft) % 60;
    const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    display.textContent = timeStr;
    document.title = isRunning ? `(${timeStr}) Timer` : 'Timer';
  }

  function requestNotificationPermission() {
    if (!('Notification' in window)) {
      notifPermission.textContent = 'Not supported';
      return;
    }
    if (Notification.permission === 'granted') {
      notifPermission.textContent = 'Enabled';
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then((permission) => {
        notifPermission.textContent = permission === 'granted' ? 'Enabled' : 'Denied';
      });
    } else {
      notifPermission.textContent = 'Denied';
    }
  }

  function stopTimer() {
    // Send pause to service worker
    sendToSW('timer-pause', { timeLeft });
    isRunning = false;
    endTime = null;
    stopSilentAudio();
    stopDisplayInterval();
    updateUI();
  }

  function startTimer() {
    if (timeLeft <= 0) return;

    const newEndTime = Date.now() + timeLeft * 1000;
    endTime = newEndTime;
    isRunning = true;

    // Send start to service worker
    sendToSW('timer-start', {
      endTime: newEndTime,
      originalTimeSet: timeLeft,
      timeLeft,
    });

    startSilentAudio();
    startDisplayInterval();
    updateUI();
  }

  function setTime(seconds: number) {
    sendToSW('timer-set', { timeLeft: seconds });
    timeLeft = seconds;
    isRunning = false;
    endTime = null;
    stopSilentAudio();
    stopDisplayInterval();
    updateDisplay();
    updateUI();
    status.textContent = 'Ready';
  }

  startStopBtn.addEventListener('click', () => {
    if (isRunning) {
      stopTimer();
    } else {
      startTimer();
    }
  });

  resetBtn.addEventListener('click', () => {
    sendToSW('timer-reset');
    timeLeft = 0;
    isRunning = false;
    endTime = null;
    stopSilentAudio();
    stopDisplayInterval();
    updateDisplay();
    updateUI();
    status.textContent = 'Ready';
  });

  setCustomBtn.addEventListener('click', () => {
    const mins = parseInt(customInput.value);
    if (mins > 0) {
      setTime(mins * 60);
    }
  });

  presetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const secs = parseInt(btn.getAttribute('data-seconds') || '0');
      setTime(secs);
    });
  });

  // Setup service worker message listener
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', handleSWMessage);

    // Request current state when page loads
    navigator.serviceWorker.ready.then(() => {
      requestStateFromSW();
    });
  }

  requestNotificationPermission();
  updateDisplay();

  // Handle visibility changes - request state from SW when page becomes visible
  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
      requestStateFromSW();
    }
  }
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Handle focus events (additional reliability for some browsers)
  function handleFocus() {
    requestStateFromSW();
  }
  window.addEventListener('focus', handleFocus);

  return () => {
    stopSilentAudio();
    stopDisplayInterval();
    document.title = storedDocTitle;
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('focus', handleFocus);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.removeEventListener('message', handleSWMessage);
    }
  };
}
