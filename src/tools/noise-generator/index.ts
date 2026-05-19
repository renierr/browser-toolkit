import { NoiseGenerator } from './noise-utils';
import { acquireWakeLock } from '@js/wake-lock';

// noinspection JSUnusedGlobalSymbols
export default function init() {
  const noiseBtns = document.querySelectorAll('.noise-btn');
  const btnNoiseToggle = document.getElementById('btn-noise-toggle') as HTMLButtonElement;
  const noiseVolumeSlider = document.getElementById('noise-volume') as HTMLInputElement;
  const noiseVolumeDisplay = document.getElementById('noise-volume-display') as HTMLElement;
  const currentNoiseStatus = document.getElementById('current-noise-status') as HTMLElement;

  // Timer Elements
  const timerSection = document.getElementById('noise-timer-section') as HTMLElement;
  const timerDisplay = document.getElementById('noise-timer-display') as HTMLElement;
  const timerPresetBtns = document.querySelectorAll('.noise-timer-preset');
  const timerCustomInput = document.getElementById('noise-timer-custom-min') as HTMLInputElement;
  const btnTimerSet = document.getElementById('btn-noise-timer-set') as HTMLButtonElement;
  const btnTimerCancel = document.getElementById('btn-noise-timer-cancel') as HTMLButtonElement;

  // Breathing Guide Elements
  const btnBreathingToggle = document.getElementById('btn-breathing-toggle') as HTMLButtonElement;
  const breathingCircle = document.getElementById('breathing-circle') as HTMLElement;
  const breathingText = document.getElementById('breathing-text') as HTMLElement;
  const breathingModeBtns = document.querySelectorAll('.breathing-mode-btn');

  const noiseGenerator = new NoiseGenerator(parseInt(noiseVolumeSlider.value) / 100);

  // Wake Lock State
  let releaseWakeLock: (() => void) | null = null;

  // Breathing Guide State
  let isBreathingActive = false;
  let breathingMode: 'box' | 'relax' | 'calm' = 'relax';
  let breathingTimeout: number | null = null;

  // Timer State
  let timerTarget: number | null = null; // timestamp in ms when audio should stop
  let timerTimeoutId: number | null = null;
  let timerUiIntervalId: number | null = null; // dedicated UI refresh interval (1s)
  const MAX_SAFE_TIMEOUT = 2147483647 - 1000; // setTimeout max on browsers (~2^31-1 ms ~24.8 days). Keep safe margin.

  const breathingPatterns = {
    box: [
      { text: 'Inhale', duration: 4000, scale: 2 },
      { text: 'Hold', duration: 4000, scale: 2 },
      { text: 'Exhale', duration: 4000, scale: 1 },
      { text: 'Hold', duration: 4000, scale: 1 },
    ],
    relax: [
      { text: 'Inhale', duration: 4000, scale: 2 },
      { text: 'Hold', duration: 7000, scale: 2 },
      { text: 'Exhale', duration: 8000, scale: 1 },
    ],
    calm: [
      { text: 'Inhale', duration: 5000, scale: 2 },
      { text: 'Exhale', duration: 5000, scale: 1 },
    ],
  };

  const updateWakeLock = () => {
    if (isBreathingActive && !releaseWakeLock) {
      releaseWakeLock = acquireWakeLock();
    } else if (!isBreathingActive && releaseWakeLock) {
      releaseWakeLock();
      releaseWakeLock = null;
    }
  };

  const updateBreathingUI = () => {
    breathingModeBtns.forEach((btn) => {
      const mode = btn.getAttribute('data-mode');
      if (mode === breathingMode) {
        btn.classList.add('btn-active', 'btn-primary');
        btn.classList.remove('btn-outline');
      } else {
        btn.classList.remove('btn-active', 'btn-primary');
        btn.classList.add('btn-outline');
      }
    });

    if (isBreathingActive) {
      btnBreathingToggle.innerHTML = `<i data-lucide="square" class="w-4 h-4 mr-1"></i> Stop Breathing Guide`;
      btnBreathingToggle.classList.replace('btn-outline', 'btn-secondary');
    } else {
      btnBreathingToggle.innerHTML = `<i data-lucide="wind" class="w-4 h-4 mr-1"></i> Start Breathing Guide`;
      btnBreathingToggle.classList.replace('btn-secondary', 'btn-outline');
      breathingCircle.style.transform = 'scale(1)';
      breathingText.textContent = 'Ready';
    }
  };

  const runBreathingCycle = (stepIndex: number = 0) => {
    if (!isBreathingActive) return;

    const pattern = breathingPatterns[breathingMode];
    const step = pattern[stepIndex];

    breathingText.textContent = step.text;

    // Use transition timing function that matches the phase
    // Inhale/Exhale are linear for smooth expansion, Holds have no transition needed but duration still matters
    breathingCircle.style.transitionProperty = 'transform';
    breathingCircle.style.transitionDuration = `${step.duration}ms`;
    breathingCircle.style.transitionTimingFunction = 'linear';
    breathingCircle.style.transform = `scale(${step.scale})`;

    breathingTimeout = window.setTimeout(() => {
      runBreathingCycle((stepIndex + 1) % pattern.length);
    }, step.duration);
  };

  const toggleBreathing = () => {
    isBreathingActive = !isBreathingActive;
    if (isBreathingActive) {
      runBreathingCycle();
    } else {
      if (breathingTimeout) {
        clearTimeout(breathingTimeout);
        breathingTimeout = null;
      }
    }
    updateBreathingUI();
    updateWakeLock();
  };

  const updateNoiseVolume = () => {
    const val = parseInt(noiseVolumeSlider.value) / 100;
    noiseGenerator.setVolume(val);
    noiseVolumeDisplay.textContent = `${Math.round(val * 100)}%`;
  };

  const formatRemaining = (ms: number) => {
    if (ms <= 0) return '00:00:00';
    const totalSec = Math.floor(ms / 1000);
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    if (hrs > 0) return `${hrs}h ${String(mins).padStart(2, '0')}m`;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const showTimerSection = (show: boolean) => {
    if (!timerSection) return;
    if (show) {
      timerSection.classList.remove('hidden');
    } else {
      timerSection.classList.add('hidden');
    }
  };

  const setTimerUIActive = (active: boolean) => {
    // When active: show running text, enable cancel, disable set to avoid duplicates
    if (active) {
      btnTimerCancel.classList.remove('btn-ghost');
      btnTimerCancel.classList.add('btn-sm', 'btn-warning');
      btnTimerCancel.disabled = false;
      btnTimerSet.disabled = true;
      timerCustomInput.disabled = true;
    } else {
      btnTimerCancel.classList.remove('btn-warning');
      btnTimerCancel.classList.add('btn-ghost');
      btnTimerSet.disabled = false;
      btnTimerCancel.disabled = true;
      timerCustomInput.disabled = false;
    }
  };

  const clearTimer = () => {
    if (timerTimeoutId) {
      clearTimeout(timerTimeoutId);
      timerTimeoutId = null;
    }
    timerTarget = null;
    timerDisplay.textContent = 'No timer set';
    // update preset button states
    timerPresetBtns.forEach((b) => b.classList.remove('btn-active', 'btn-primary'));
    setTimerUIActive(false);
    // stop UI updates
    clearTimerUiUpdates();
  };

  const stopNoiseAndClearTimer = () => {
    noiseGenerator.stop();
    clearTimer();
    updateUI();
    showTimerSection(false);
  };

  const scheduleTimerTick = () => {
    if (!timerTarget) return;
    const now = Date.now();
    const remaining = timerTarget - now;
    if (remaining <= 0) {
      stopNoiseAndClearTimer();
      return;
    }

    // Update display
    timerDisplay.textContent = `Will stop in ${formatRemaining(remaining)}`;

    // Schedule next wake: use safe chunking in case of very long durations or platform limitations
    const delay = Math.min(remaining, MAX_SAFE_TIMEOUT);
    timerTimeoutId = window.setTimeout(() => {
      // If there is still time left, schedule again; otherwise stop
      scheduleTimerTick();
    }, delay);
  };

  const startTimerUiUpdates = () => {
    if (timerUiIntervalId) return;
    // Immediately update once, then start 1s interval
    if (timerTarget) {
      const remaining = Math.max(0, timerTarget - Date.now());
      timerDisplay.textContent = `Will stop in ${formatRemaining(remaining)}`;
    }
    timerUiIntervalId = window.setInterval(() => {
      if (!timerTarget) return;
      const remaining = timerTarget - Date.now();
      if (remaining <= 0) {
        timerDisplay.textContent = `00:00:00`;
        // UI update will be cleared by clearTimer when scheduleTimerTick handles stop
        return;
      }
      timerDisplay.textContent = `Will stop in ${formatRemaining(remaining)}`;
    }, 1000);
  };

  const clearTimerUiUpdates = () => {
    if (timerUiIntervalId) {
      clearInterval(timerUiIntervalId);
      timerUiIntervalId = null;
    }
  };

  const setTimerMinutes = (minutes: number) => {
    if (!noiseGenerator.getIsPlaying()) {
      // start playing if not already
      const currentNoiseType = noiseGenerator.getCurrentType();
      if (currentNoiseType) {
        noiseGenerator.play(currentNoiseType);
      } else {
        noiseGenerator.play('white');
      }
      updateUI();
    }

    // compute target
    const now = Date.now();
    timerTarget = now + minutes * 60 * 1000;
    if (timerTimeoutId) {
      clearTimeout(timerTimeoutId);
      timerTimeoutId = null;
    }

    // highlight preset if matches one
    timerPresetBtns.forEach((b) => {
      const val = parseInt(b.getAttribute('data-min') || '0', 10);
      if (val === minutes) {
        b.classList.add('btn-active', 'btn-primary');
      } else {
        b.classList.remove('btn-active', 'btn-primary');
      }
    });

    // Show timer UI since audio is playing now
    showTimerSection(true);
    setTimerUIActive(true);

    // start UI-only updates (1s) for a smooth countdown
    startTimerUiUpdates();

    scheduleTimerTick();
  };

  const updateUI = () => {
    const isPlaying = noiseGenerator.getIsPlaying();
    const currentNoiseType = noiseGenerator.getCurrentType();

    // Update buttons state
    noiseBtns.forEach((btn) => {
      const type = btn.getAttribute('data-type');
      if (type === currentNoiseType) {
        btn.classList.add('btn-active', 'btn-primary');
        btn.classList.remove('btn-outline');
      } else {
        btn.classList.remove('btn-active', 'btn-primary');
        btn.classList.add('btn-outline');
      }
    });

    // Update toggle button
    if (isPlaying) {
      btnNoiseToggle.innerHTML = `<i data-lucide="pause" class="w-4 h-4 mr-2"></i> Stop Noise`;
      btnNoiseToggle.classList.replace('btn-primary', 'btn-secondary');
      currentNoiseStatus.textContent = `Playing: ${currentNoiseType?.charAt(0).toUpperCase() + currentNoiseType?.slice(1)!}`;
      // Show timer controls when playing
      showTimerSection(true);
    } else {
      btnNoiseToggle.innerHTML = `<i data-lucide="play" class="w-4 h-4 mr-2"></i> Start Noise`;
      btnNoiseToggle.classList.replace('btn-secondary', 'btn-primary');
      currentNoiseStatus.textContent = currentNoiseType
        ? `Selected: ${currentNoiseType.charAt(0).toUpperCase() + currentNoiseType.slice(1)} (Paused)`
        : 'Select a noise type to start';
      // Hide timer controls when not playing
      showTimerSection(false);
    }

    // If no timer target or timer has passed, show default
    if (!timerTarget) {
      timerDisplay.textContent = 'No timer set';
      setTimerUIActive(false);
    }
  };

  const toggleNoise = () => {
    if (noiseGenerator.getIsPlaying()) {
      noiseGenerator.stop();
      // clear timer when user stops manually
      clearTimer();
      showTimerSection(false);
    } else {
      const currentNoiseType = noiseGenerator.getCurrentType();
      if (currentNoiseType) {
        noiseGenerator.play(currentNoiseType);
      } else {
        // Default to white if nothing selected
        noiseGenerator.play('white');
      }
      // When starting noise, reveal timer controls (even if no timer yet)
      showTimerSection(true);
    }
    updateUI();
  };

  // Event Listeners for Noise
  noiseBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = btn.getAttribute('data-type');
      if (type) {
        if (noiseGenerator.getIsPlaying() && noiseGenerator.getCurrentType() === type) {
          // If clicking the same active noise, stop it
          noiseGenerator.stop();
          // stop timer as well
          clearTimer();
          showTimerSection(false);
        } else {
          // If clicking a different noise or starting new, play it
          noiseGenerator.play(type);
          showTimerSection(true);
        }
        updateUI();
      }
    });
  });

  btnNoiseToggle.addEventListener('click', toggleNoise);
  noiseVolumeSlider.addEventListener('input', updateNoiseVolume);

  // Timer event wiring
  timerPresetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const min = parseInt(btn.getAttribute('data-min') || '0', 10);
      if (min > 0) setTimerMinutes(min);
    });
  });

  btnTimerSet.addEventListener('click', () => {
    const val = parseInt(timerCustomInput.value || '0', 10);
    if (val > 0) setTimerMinutes(val);
  });

  btnTimerCancel.addEventListener('click', () => {
    clearTimer();
  });

  // Event Listeners for Breathing Guide
  btnBreathingToggle.addEventListener('click', toggleBreathing);

  breathingModeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-mode') as 'box' | 'relax' | 'calm';
      if (mode) {
        breathingMode = mode;
        if (isBreathingActive) {
          // Restart cycle with new mode
          if (breathingTimeout) clearTimeout(breathingTimeout);
          runBreathingCycle(0);
        }
        updateBreathingUI();
      }
    });
  });

  // Initial UI state
  updateBreathingUI();
  updateUI();

  // Cleanup
  return () => {
    if (breathingTimeout) clearTimeout(breathingTimeout);
    if (releaseWakeLock) releaseWakeLock();
    noiseGenerator.cleanup();
    if (timerTimeoutId) clearTimeout(timerTimeoutId);
    if (timerUiIntervalId) clearInterval(timerUiIntervalId);
  };
}
