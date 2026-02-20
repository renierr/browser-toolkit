
// noinspection JSUnusedGlobalSymbols
/**
 * Timer Tool - Client Side
 *
 * This is a display-only client. All timer logic runs in the Service Worker.
 * The SW handles:
 * - Timer countdown (survives page refresh/navigation)
 * - Notifications when timer finishes
 * - State persistence in IndexedDB
 *
 * This client handles:
 * - Displaying timer state from SW
 * - Sending commands to SW (start/pause/reset/set)
 * - Playing alarm audio (SW cannot access AudioContext)
 */
export default function init() {
  // UI Elements
  const display = document.getElementById('timer-display') as HTMLElement;
  const status = document.getElementById('timer-status') as HTMLElement;
  const startStopBtn = document.getElementById('start-stop-btn') as HTMLButtonElement;
  const resetBtn = document.getElementById('reset-btn') as HTMLButtonElement;
  const customInput = document.getElementById('custom-minutes') as HTMLInputElement;
  const setCustomBtn = document.getElementById('set-custom') as HTMLButtonElement;
  const presetBtns = document.querySelectorAll('.preset-btn');
  const notifPermission = document.getElementById('notif-permission') as HTMLElement;

  const storedDocTitle = document.title;

  // Local state (mirror of SW state for display)
  let timeLeft = 0;
  let isRunning = false;
  let endTime: number | null = null;

  // Audio context for alarm (lazily initialized on user interaction)
  let audioCtx: AudioContext | null = null;

  // Display update interval for smooth countdown
  let displayIntervalId: number | null = null;

  // ==================== Service Worker Communication ====================

  function sendToSW(type: string, data: Record<string, unknown> = {}) {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type, data });
    }
  }

  function requestStateFromSW() {
    sendToSW('timer-get-state');
  }

  function handleSWMessage(event: MessageEvent) {
    const { type, state } = event.data || {};
    if (!state) return;

    // Update local state from SW
    timeLeft = state.timeLeft ?? 0;
    isRunning = state.isRunning ?? false;
    endTime = state.endTime ?? null;

    // Update display
    updateDisplay();
    updateUI();

    // Handle specific events
    switch (type) {
      case 'timer-started':
      case 'timer-tick':
      case 'timer-state':
      case 'timer-update':
        if (isRunning) startDisplayInterval();
        else stopDisplayInterval();
        break;

      case 'timer-paused':
      case 'timer-reset':
        stopDisplayInterval();
        break;

      case 'timer-finished':
        stopDisplayInterval();
        playAlarmSound();
        status.textContent = 'Finished';
        break;
    }
  }

  // ==================== Display ====================

  function updateDisplay() {
    const mins = Math.floor(Math.max(0, timeLeft) / 60);
    const secs = Math.max(0, timeLeft) % 60;
    const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    display.textContent = timeStr;
    document.title = isRunning ? `(${timeStr}) Timer` : 'Timer';
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
      status.textContent = timeLeft > 0 ? 'Paused' : 'Ready';
    }
  }

  // Smooth display updates between SW ticks (SW ticks every 1s, we update every 300ms)
  function startDisplayInterval() {
    if (displayIntervalId) return;
    displayIntervalId = window.setInterval(() => {
      if (endTime) {
        const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
        if (remaining !== timeLeft) {
          timeLeft = remaining;
          updateDisplay();
        }
      }
    }, 300);
  }

  function stopDisplayInterval() {
    if (displayIntervalId) {
      clearInterval(displayIntervalId);
      displayIntervalId = null;
    }
  }

  // ==================== Audio (Client-side only - SW cannot play audio) ====================

  function ensureAudioContext() {
    if (!audioCtx) {
      const AC = window.AudioContext || (window as never as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playAlarmSound() {
    ensureAudioContext();
    if (!audioCtx) return;

    // Pleasant multi-tone alarm: C major arpeggio (C5, E5, G5) repeated 3 times
    const frequencies = [523.25, 659.25, 783.99];
    const noteDuration = 0.15;
    const noteGap = 0.08;
    const patternGap = 0.3;
    const repetitions = 3;

    for (let rep = 0; rep < repetitions; rep++) {
      const patternStart = rep * (frequencies.length * (noteDuration + noteGap) + patternGap);

      frequencies.forEach((freq, i) => {
        const startTime = audioCtx!.currentTime + patternStart + i * (noteDuration + noteGap);

        const osc = audioCtx!.createOscillator();
        const gain = audioCtx!.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        osc.connect(gain);
        gain.connect(audioCtx!.destination);

        // Smooth envelope: attack -> sustain -> decay
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.5, startTime + 0.02);
        gain.gain.setValueAtTime(0.5, startTime + noteDuration * 0.7);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + noteDuration);

        osc.start(startTime);
        osc.stop(startTime + noteDuration);
      });
    }
  }

  // ==================== Timer Commands (sent to SW) ====================

  function startTimer() {
    if (timeLeft <= 0) return;
    ensureAudioContext(); // Initialize audio on user gesture

    const newEndTime = Date.now() + timeLeft * 1000;
    sendToSW('timer-start', {
      endTime: newEndTime,
      originalTimeSet: timeLeft,
      timeLeft,
    });

    // Optimistic UI update
    isRunning = true;
    endTime = newEndTime;
    updateUI();
    startDisplayInterval();
  }

  function pauseTimer() {
    sendToSW('timer-pause', { timeLeft });

    // Optimistic UI update
    isRunning = false;
    endTime = null;
    updateUI();
    stopDisplayInterval();
  }

  function resetTimer() {
    sendToSW('timer-reset');

    // Optimistic UI update
    timeLeft = 0;
    isRunning = false;
    endTime = null;
    updateDisplay();
    updateUI();
    stopDisplayInterval();
  }

  function setTime(seconds: number) {
    sendToSW('timer-set', { timeLeft: seconds });

    // Optimistic UI update
    timeLeft = seconds;
    isRunning = false;
    endTime = null;
    updateDisplay();
    updateUI();
    stopDisplayInterval();
  }

  // ==================== Notifications ====================

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

  // ==================== Event Listeners ====================

  startStopBtn.addEventListener('click', () => {
    if (isRunning) {
      pauseTimer();
    } else {
      startTimer();
    }
  });

  resetBtn.addEventListener('click', resetTimer);

  setCustomBtn.addEventListener('click', () => {
    const mins = parseInt(customInput.value);
    if (mins > 0) setTime(mins * 60);
  });

  presetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const secs = parseInt(btn.getAttribute('data-seconds') || '0');
      if (secs > 0) setTime(secs);
    });
  });

  // ==================== Initialization ====================

  // Listen for SW messages
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', handleSWMessage);
    navigator.serviceWorker.ready.then(() => requestStateFromSW());
  }

  // Sync state when page becomes visible
  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
      requestStateFromSW();
    }
  }
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Request notification permission
  requestNotificationPermission();

  // Initial display
  updateDisplay();

  // ==================== Cleanup ====================

  return () => {
    stopDisplayInterval();
    document.title = storedDocTitle;
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.removeEventListener('message', handleSWMessage);
    }
  };
}
