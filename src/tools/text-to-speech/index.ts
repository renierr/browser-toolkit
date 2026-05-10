import { SpeechEngine } from './speech-engine';
import type { TTSOptions } from './speech-engine';
import { getSettings } from '../../js/settings';
import { yieldToUI } from '../../js/ui';

export default function init(): void | (() => void) {
  const container = document.getElementById('tool-content');
  if (!container) return;

  const engine = new SpeechEngine();
  const settings = getSettings('text-to-speech');

  const textInput = container.querySelector('#tts-text') as HTMLTextAreaElement;
  const voiceSelect = container.querySelector('#voice-select') as HTMLSelectElement;
  const btnRefresh = container.querySelector('#btn-refresh-voices') as HTMLButtonElement;
  const btnInit = container.querySelector('#btn-init-engine') as HTMLButtonElement;
  const btnSpeak = container.querySelector('#btn-speak') as HTMLButtonElement;
  const btnTogglePause = container.querySelector('#btn-toggle-pause') as HTMLButtonElement;
  const btnStop = container.querySelector('#btn-stop') as HTMLButtonElement;
  const btnTogglePauseIcon = container.querySelector('#btn-toggle-pause-icon') as HTMLElement;
  const btnTogglePauseLabel = container.querySelector('#btn-toggle-pause-label') as HTMLSpanElement;

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

  const updateControlState = (forcedPaused: boolean | null = null) => {
    const speaking = engine.isSpeaking();
    const paused = forcedPaused ?? engine.isPaused();
    const active = speaking || paused;

    btnTogglePause.disabled = !active;
    btnTogglePauseIcon.setAttribute('data-lucide', paused ? 'play-circle' : 'pause');
    btnTogglePauseLabel.textContent = paused ? 'Resume' : 'Pause';
    btnStop.disabled = !active;
  };

  const populateVoices = async () => {
    btnRefresh.classList.add('animate-spin');
    const voices = await engine.loadVoices();
    btnRefresh.classList.remove('animate-spin');

    const savedVoiceValue = settings.get('voice');

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

      if (savedVoiceValue !== undefined && savedVoiceValue !== null) {
        voiceSelect.value = String(savedVoiceValue);
      }
    }
  };

  const getOptions = (): TTSOptions => ({
    voiceIndex: parseInt(voiceSelect.value),
    rate: parseFloat(rateRange.value),
    pitch: parseFloat(pitchRange.value),
    volume: parseFloat(volumeRange.value),
  });

  const onSpeak = () => {
    const text = textInput.value.trim();
    if (!text) return;
    updateStatus(true, 'Speaking...');
    updateControlState(false);
    engine.speak(
      text,
      getOptions(),
      () => {
        updateStatus(false);
        updateControlState();
      },
      (errorMsg) => {
        updateStatus(true, errorMsg, true);
        updateControlState();
      }
    );
    setTimeout(updateControlState, 80);
  };

  const syncRange = (input: HTMLInputElement, display: HTMLSpanElement) => {
    display.textContent = input.value;
    input.addEventListener('input', () => {
      display.textContent = input.value;
    });
  };

  syncRange(rateRange, rateVal);
  syncRange(pitchRange, pitchVal);
  syncRange(volumeRange, volumeVal);

  btnSpeak.addEventListener('click', onSpeak);
  btnTogglePause.addEventListener('click', async () => {
    const shouldPause = !engine.isPaused();

    if (!shouldPause) {
      engine.resume();
      updateStatus(true, 'Speaking...', false);
      updateControlState(false);
    } else {
      engine.pause();
      updateStatus(true, 'Paused', false);
      updateControlState(true);
    }

    await yieldToUI(true);
    updateControlState(shouldPause);
    setTimeout(() => updateControlState(), 120);
  });
  btnStop.addEventListener('click', () => {
    engine.stop();
    updateStatus(true, 'Stopped', false);
    updateControlState(false);
  });
  btnRefresh.addEventListener('click', populateVoices);
  btnInit.addEventListener('click', () => {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    window.speechSynthesis.speak(u);
    populateVoices();
  });

  populateVoices();
  updateControlState();

  return () => {
    engine.stop();
  };
}
