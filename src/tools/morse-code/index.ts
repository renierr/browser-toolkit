import { hideProgress, showMessage, showProgress } from '../../js/ui.ts';
import { downloadFile } from '../../js/file-utils.ts';
import { ensureAudioContextReady, exportAudio, playTone } from './audio.ts';
import { textToMorse, textToMorseHtml } from './morsecode.ts';
import { decodeArrayBufferToMonoPCM } from './decoder.ts';
import DecodeWorker from './decode.worker?worker';
import type { WorkerOutMessage } from './worker-protocol';

let currentAbortController: AbortController | null = null;
let isPlaying = false;

function wpmToUnitMs(wpm: number): number {
  // Standard: "PARIS" = 50 units -> 1200 / WPM = duration of one unit
  return Math.round(1200 / wpm);
}

let flashIndicator: HTMLElement | null = null;

function flashElement(durationMs: number): void {
  if (!flashIndicator) {
    flashIndicator = document.getElementById('flash-indicator');
    if (!flashIndicator) return;
  }

  // Turn ON
  flashIndicator.classList.add('on');

  // Turn OFF after duration
  setTimeout(() => {
    flashIndicator?.classList.remove('on');
  }, durationMs);
}

async function playMorse(
  morse: string,
  unitMs: number,
  wordGapUnits: number,
  mode: 'both' | 'sound' | 'flash',
  volume: number,
  signal: AbortSignal
): Promise<void> {
  if (signal.aborted) return;

  const outputMorse = document.getElementById('output-morse');

  // Ensure AudioContext is created and ready before starting
  if (mode === 'both' || mode === 'sound') {
    await ensureAudioContextReady();
    await delay(50);
  }

  const parts = morse.split(' ');

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (signal.aborted) return;

    // Highlight the current part
    const partElement = outputMorse?.querySelector(`[data-index="${i}"]`);
    if (partElement) {
      partElement.classList.add('highlight');
      partElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    if (part === '//') {
      await delay(unitMs * wordGapUnits); // standard is 7
    } else if (part === '/') {
      await delay(unitMs * 3); // standard is 3
    } else {
      for (let j = 0; j < part.length; j++) {
        if (signal.aborted) {
          partElement?.classList.remove('highlight');
          return;
        }

        const durUnits = part[j] === '-' ? 3 : 1;
        const duration = durUnits * unitMs;

        if (mode === 'both' || mode === 'flash') {
          flashElement(duration);
        }

        if (mode === 'both' || mode === 'sound') {
          await playTone(duration, volume);
        } else {
          // Flash-only mode - wait for duration
          await delay(duration);
        }

        // add 1-unit gap between ONLY if this is another dot/dash in this same letter
        if (j < part.length - 1) {
          await delay(unitMs);
        }
      }
    }

    // Remove highlight
    partElement?.classList.remove('highlight');
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// noinspection JSUnusedGlobalSymbols
export default function init(payload?: any) {
  const input = document.getElementById('input-text') as HTMLTextAreaElement;
  const outputMorse = document.getElementById('output-morse') as HTMLDivElement;
  const btnPlay = document.getElementById('btn-play') as HTMLButtonElement;
  const btnStop = document.getElementById('btn-stop') as HTMLButtonElement;
  const btnExport = document.getElementById('btn-export-audio') as HTMLButtonElement;
  const btnImport = document.getElementById('btn-import-audio') as HTMLButtonElement;
  const fileInput = document.getElementById('audio-file-input') as HTMLInputElement;

  const spinner = document.getElementById('spinner') as HTMLElement;
  const status = document.getElementById('status') as HTMLDivElement;

  const speedSlider = document.getElementById('speed-slider') as HTMLInputElement;
  const wpmDisplay = document.getElementById('wpm-display') as HTMLElement;
  const wordGapSlider = document.getElementById('word-gap-slider') as HTMLInputElement;
  const wordGapDisplay = document.getElementById('word-gap-display') as HTMLElement;
  const volumeSlider = document.getElementById('volume-slider') as HTMLInputElement;
  const volumeDisplay = document.getElementById('volume-display') as HTMLElement;
  const modeSelect = document.getElementById('output-mode') as HTMLSelectElement;
  const exportFormatSelect = document.getElementById('export-format') as HTMLSelectElement;

  // Live Morse preview
  function updatePreview() {
    const text = input.value.trim();
    outputMorse.innerHTML = textToMorseHtml(text);
  }
  input.addEventListener('input', updatePreview);
  updatePreview();

  // Update slider display
  speedSlider.addEventListener('input', () => {
    wpmDisplay.textContent = `${speedSlider.value} WPM`;
  });

  wordGapSlider.addEventListener('input', () => {
    wordGapDisplay.textContent = `${wordGapSlider.value} units`;
  });

  volumeSlider.addEventListener('input', () => {
    volumeDisplay.textContent = `${volumeSlider.value}%`;
  });

  btnPlay.addEventListener('click', async () => {
    if (isPlaying) return;

    const text = input.value.trim();
    if (!text) {
      showMessage('Please enter text to play...', { timeoutMs: 5000 });
      return;
    }

    isPlaying = true;
    currentAbortController = new AbortController();
    const signal = currentAbortController.signal;

    btnPlay.disabled = true;
    btnStop.classList.remove('hidden');
    spinner.classList.remove('hidden');
    status.textContent = 'Playing...';

    try {
      const morse = textToMorse(text);
      const wpm = parseInt(speedSlider.value, 10);
      const wordGapUnits = parseInt(wordGapSlider.value, 10);
      const unitMs = wpmToUnitMs(wpm);
      const volume = parseInt(volumeSlider.value, 10) / 100;
      const mode = modeSelect.value as 'both' | 'sound' | 'flash';

      await playMorse(morse, unitMs, wordGapUnits, mode, volume, signal);
    } catch (err: any) {
      if (!signal.aborted) {
        console.error(err);
        showMessage('Error during playback', { type: 'alert' });
      }
    } finally {
      isPlaying = false;
      btnPlay.disabled = false;
      btnStop.classList.add('hidden');
      spinner.classList.add('hidden');

      // Clear all highlights
      const outputMorse = document.getElementById('output-morse');
      outputMorse?.querySelectorAll('.morse-part.highlight').forEach((el) => {
        el.classList.remove('highlight');
      });

      if (signal.aborted) {
        showMessage('Playback cancelled', { timeoutMs: 3000 });
      }
      status.textContent = '';
    }
  });

  btnStop.addEventListener('click', () => {
    currentAbortController?.abort();
    currentAbortController = null;
  });

  btnExport.addEventListener('click', async () => {
    const text = input.value.trim();
    if (!text) {
      showMessage('Please enter text to export...', { timeoutMs: 5000 });
      return;
    }

    btnExport.disabled = true;
    showProgress('Generating audio...');

    try {
      const morse = textToMorse(text);
      const wpm = parseInt(speedSlider.value, 10);
      const wordGapUnits = parseInt(wordGapSlider.value, 10);
      const unitMs = wpmToUnitMs(wpm);
      const format = exportFormatSelect.value as 'wav' | 'webm';

      const blob = await exportAudio(morse, unitMs, wordGapUnits, format, (pct) => {
        showProgress(`Exporting ${format.toUpperCase()}... ${pct}%`);
      });

      await downloadFile(blob, `morse_code.${format}`);
      showMessage('Audio exported!', { timeoutMs: 3000 });
    } catch (err) {
      console.error(err);
      showMessage('Error exporting audio', { type: 'alert' });
    } finally {
      btnExport.disabled = false;
      hideProgress();
    }
  });

  btnImport.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    await handleAudioFile(file);
    fileInput.value = '';
  });

  async function handleAudioFile(file: File) {
    showProgress('Decoding audio...');
    btnImport.disabled = true;

    try {
      const arrayBuffer = await file.arrayBuffer();

      const { audio: audioForWorker, sampleRate } = await decodeArrayBufferToMonoPCM(arrayBuffer);

      const worker = new DecodeWorker();
      const id = 1;

      const resultObj = await new Promise<{ text: string | null; reason?: string }>(
        (resolve, reject) => {
          const onmsg = (ev: MessageEvent<WorkerOutMessage>) => {
            const m = ev.data;
            if (m.id === id && m.type === 'decode-result') {
              worker.removeEventListener('message', onmsg);
              worker.terminate();
              resolve({ text: m.text ?? null, reason: m.reason });
            }
          };
          worker.addEventListener('message', onmsg);
          const msg = { type: 'decode-pcm', id, audio: audioForWorker, sampleRate } as const;
          try {
            // Transfer the underlying ArrayBuffer of the Float32Array to avoid copy when possible
            worker.postMessage(msg, [audioForWorker.buffer]);
          } catch (e) {
            worker.terminate();
            reject(e);
          }
        }
      );

      // If decode failed and we have a reason from the worker, show it
      if (resultObj.text) {
        input.value = resultObj.text;
        updatePreview();
        showMessage('Audio decoded!', { timeoutMs: 3000 });
      } else if (resultObj.reason) {
        console.warn('Worker decode failed:', resultObj.reason);
        showMessage(`Decoding failed: ${resultObj.reason}`, { type: 'alert' });
      } else {
        showMessage('No Morse detected in audio.', { type: 'info' });
      }
    } catch (err) {
      console.error(err);
      showMessage('Error decoding audio', { type: 'alert' });
    } finally {
      hideProgress();
      btnImport.disabled = false;
    }
  }

  if (payload?.sharedFiles?.length > 0) {
    const file = payload.sharedFiles[0];
    if (file.type.startsWith('audio/')) {
      handleAudioFile(file);
    }
  }

  return () => {
    if (currentAbortController) currentAbortController.abort();
    flashIndicator = null;
  };
}
