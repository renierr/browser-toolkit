import { NoiseGenerator } from './noise-utils';
import { acquireWakeLock } from '../../js/utils';

// noinspection JSUnusedGlobalSymbols
export default function init() {
  const noiseBtns = document.querySelectorAll('.noise-btn');
  const btnNoiseToggle = document.getElementById('btn-noise-toggle') as HTMLButtonElement;
  const noiseVolumeSlider = document.getElementById('noise-volume') as HTMLInputElement;
  const noiseVolumeDisplay = document.getElementById('noise-volume-display') as HTMLElement;
  const currentNoiseStatus = document.getElementById('current-noise-status') as HTMLElement;

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
    } else {
      btnNoiseToggle.innerHTML = `<i data-lucide="play" class="w-4 h-4 mr-2"></i> Start Noise`;
      btnNoiseToggle.classList.replace('btn-secondary', 'btn-primary');
      currentNoiseStatus.textContent = currentNoiseType
        ? `Selected: ${currentNoiseType.charAt(0).toUpperCase() + currentNoiseType.slice(1)} (Paused)`
        : 'Select a noise type to start';
    }
  };

  const toggleNoise = () => {
    if (noiseGenerator.getIsPlaying()) {
      noiseGenerator.stop();
    } else {
      const currentNoiseType = noiseGenerator.getCurrentType();
      if (currentNoiseType) {
        noiseGenerator.play(currentNoiseType);
      } else {
        // Default to white if nothing selected
        noiseGenerator.play('white');
      }
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
        } else {
          // If clicking a different noise or starting new, play it
          noiseGenerator.play(type);
        }
        updateUI();
      }
    });
  });

  btnNoiseToggle.addEventListener('click', toggleNoise);
  noiseVolumeSlider.addEventListener('input', updateNoiseVolume);

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

  // Cleanup
  return () => {
    if (breathingTimeout) clearTimeout(breathingTimeout);
    if (releaseWakeLock) releaseWakeLock();
    noiseGenerator.cleanup();
  };
}
