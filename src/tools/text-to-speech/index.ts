import { SpeechEngine } from './speech-engine';
import type { TTSOptions } from './speech-engine';

export default function init(): void | (() => void) {
  const container = document.getElementById('tool-container');
  if (!container) return;

  const engine = new SpeechEngine();

  // Elements
  const textInput = container.querySelector('#tts-text') as HTMLTextAreaElement;
  const voiceSelect = container.querySelector('#voice-select') as HTMLSelectElement;

  const rateRange = container.querySelector('#rate-range') as HTMLInputElement;
  const rateVal = container.querySelector('#rate-val') as HTMLSpanElement;

  const pitchRange = container.querySelector('#pitch-range') as HTMLInputElement;
  const pitchVal = container.querySelector('#pitch-val') as HTMLSpanElement;

  const volumeRange = container.querySelector('#volume-range') as HTMLInputElement;
  const volumeVal = container.querySelector('#volume-val') as HTMLSpanElement;

  const btnSpeak = container.querySelector('#btn-speak') as HTMLButtonElement;
  const btnPause = container.querySelector('#btn-pause') as HTMLButtonElement;
  const btnResume = container.querySelector('#btn-resume') as HTMLButtonElement;
  const btnStop = container.querySelector('#btn-stop') as HTMLButtonElement;

  const statusBadge = container.querySelector('#status-badge') as HTMLDivElement;
  const statusText = container.querySelector('#status-text') as HTMLSpanElement;

  const updateStatus = (speaking: boolean, text: string = 'Speaking...') => {
    if (speaking) {
      statusBadge.classList.remove('hidden');
      statusText.textContent = text;
    } else {
      statusBadge.classList.add('hidden');
    }
  };

  const populateVoices = async () => {
    const voices = await engine.loadVoices();
    voiceSelect.innerHTML = '';

    voices.forEach((voice, index) => {
      const option = document.createElement('option');
      option.value = index.toString();
      option.textContent = `${voice.name} (${voice.lang})`;
      if (voice.default) option.selected = true;
      voiceSelect.appendChild(option);
    });
  };

  const getOptions = (): TTSOptions => ({
    voiceIndex: parseInt(voiceSelect.value),
    rate: parseFloat(rateRange.value),
    pitch: parseFloat(pitchRange.value),
    volume: parseFloat(volumeRange.value),
  });

  // Event Listeners
  const onRateChange = () => {
    rateVal.textContent = rateRange.value;
  };
  const onPitchChange = () => {
    pitchVal.textContent = pitchRange.value;
  };
  const onVolumeChange = () => {
    volumeVal.textContent = volumeRange.value;
  };

  const onSpeak = () => {
    const text = textInput.value;
    if (!text) return;

    updateStatus(true);
    engine.speak(
      text,
      getOptions(),
      () => {
        updateStatus(false);
      },
      () => {
        updateStatus(false);
      }
    );
  };

  const onPause = () => {
    engine.pause();
    updateStatus(true, 'Paused');
  };

  const onResume = () => {
    engine.resume();
    updateStatus(true, 'Speaking...');
  };

  const onStop = () => {
    engine.stop();
    updateStatus(false);
  };

  rateRange.addEventListener('input', onRateChange);
  pitchRange.addEventListener('input', onPitchChange);
  volumeRange.addEventListener('input', onVolumeChange);

  btnSpeak.addEventListener('click', onSpeak);
  btnPause.addEventListener('click', onPause);
  btnResume.addEventListener('click', onResume);
  btnStop.addEventListener('click', onStop);

  // Initialize voices
  populateVoices();

  return () => {
    engine.stop();
    rateRange.removeEventListener('input', onRateChange);
    pitchRange.removeEventListener('input', onPitchChange);
    volumeRange.removeEventListener('input', onVolumeChange);
    btnSpeak.removeEventListener('click', onSpeak);
    btnPause.removeEventListener('click', onPause);
    btnResume.removeEventListener('click', onResume);
    btnStop.removeEventListener('click', onStop);
  };
}
