import { NoiseGenerator } from './noise-utils';

// noinspection JSUnusedGlobalSymbols
export default function init() {
  const noiseBtns = document.querySelectorAll('.noise-btn');
  const btnNoiseToggle = document.getElementById('btn-noise-toggle') as HTMLButtonElement;
  const noiseVolumeSlider = document.getElementById('noise-volume') as HTMLInputElement;
  const noiseVolumeDisplay = document.getElementById('noise-volume-display') as HTMLElement;
  const currentNoiseStatus = document.getElementById('current-noise-status') as HTMLElement;

  const noiseGenerator = new NoiseGenerator(parseInt(noiseVolumeSlider.value) / 100);

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

  // Cleanup
  return () => {
    noiseGenerator.cleanup();
  };
}
