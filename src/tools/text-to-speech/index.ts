import { SpeechEngine } from './speech-engine';
import type { TTSOptions } from './speech-engine';

export default function init(): void | (() => void) {
  const container = document.getElementById('tool-content');
  if (!container) return;

  const engine = new SpeechEngine();

  // Elements
  const textInput = container.querySelector('#tts-text') as HTMLTextAreaElement;
  const voiceSelect = container.querySelector('#voice-select') as HTMLSelectElement;
  const btnRefresh = container.querySelector('#btn-refresh-voices') as HTMLButtonElement;
  const btnInit = container.querySelector('#btn-init-engine') as HTMLButtonElement;
  const btnSpeak = container.querySelector('#btn-speak') as HTMLButtonElement;
  
  const rateRange = container.querySelector('#rate-range') as HTMLInputElement;
  const rateVal = container.querySelector('#rate-val') as HTMLSpanElement;
  const pitchRange = container.querySelector('#pitch-range') as HTMLInputElement;
  const pitchVal = container.querySelector('#pitch-val') as HTMLSpanElement;
  const volumeRange = container.querySelector('#volume-range') as HTMLInputElement;
  const volumeVal = container.querySelector('#volume-val') as HTMLSpanElement;

  const statusBadge = container.querySelector('#status-badge') as HTMLDivElement;
  const statusText = container.querySelector('#status-text') as HTMLSpanElement;

  const updateStatus = (active: boolean, msg: string = 'Speaking...', isError: boolean = false) => {
    if (active) {
      statusBadge.classList.remove('hidden', 'alert-info', 'alert-error', 'alert-warning');
      statusBadge.classList.add(isError ? 'alert-error' : 'alert-info');
      statusText.textContent = msg;
    } else {
      statusBadge.classList.add('hidden');
    }
  };

  const populateVoices = async () => {
    btnRefresh.classList.add('animate-spin');
    const voices = await engine.loadVoices();
    btnRefresh.classList.remove('animate-spin');

    voiceSelect.innerHTML = '';
    if (voices.length === 0) {
      const opt = document.createElement('option');
      opt.textContent = 'Use System Default';
      opt.value = '-1';
      voiceSelect.appendChild(opt);
      btnInit.classList.remove('hidden');
    } else {
      btnInit.classList.add('hidden');
      voices.forEach((v, i) => {
        const opt = document.createElement('option');
        opt.value = i.toString();
        opt.textContent = `${v.name} (${v.lang})`;
        voiceSelect.appendChild(opt);
      });
    }
  };

  const getOptions = (): TTSOptions => ({
    voiceIndex: parseInt(voiceSelect.value),
    rate: parseFloat(rateRange.value),
    pitch: parseFloat(pitchRange.value),
    volume: parseFloat(volumeRange.value)
  });

  const onSpeak = () => {
    const text = textInput.value.trim();
    if (!text) return;
    updateStatus(true, 'Speaking...');
    engine.speak(text, getOptions(), 
      () => updateStatus(false), 
      (errorMsg) => updateStatus(true, errorMsg, true)
    );
  };

  // UI Sync
  const syncRange = (input: HTMLInputElement, display: HTMLSpanElement) => {
    input.addEventListener('input', () => { display.textContent = input.value; });
  };

  syncRange(rateRange, rateVal);
  syncRange(pitchRange, pitchVal);
  syncRange(volumeRange, volumeVal);

  btnSpeak.addEventListener('click', onSpeak);
  btnRefresh.addEventListener('click', populateVoices);
  btnInit.addEventListener('click', () => {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    window.speechSynthesis.speak(u);
    populateVoices();
  });

  populateVoices();

  return () => {
    engine.stop();
  };
}
