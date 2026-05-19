import { hideProgress, showMessage, showProgress } from '@js/ui.ts';
import { acquireWakeLock } from '@js/utils.ts';
import { downloadFile } from '@js/file-utils.ts';
import { ensureAudioContextReady, exportAudio, playTone } from './audio.ts';
import { textToMorse, textToMorseHtml } from './morsecode.ts';
import { decodeArrayBufferToMonoPCM } from './decoder.ts';
import DecodeWorker from './decode.worker?worker';
import type { WorkerOutMessage } from './worker-protocol';
import type { ToolPayload } from '@js/types';

let currentAbortController: AbortController | null = null;
let isPlaying = false;
let liveWorker: Worker | null = null;
let liveStream: MediaStream | null = null;
let liveAudioCtx: AudioContext | null = null;
let liveSourceNode: MediaStreamAudioSourceNode | null = null;
let liveProcessor: ScriptProcessorNode | null = null;
let liveChunks: Float32Array[] = [];
let liveDecodeTimer: number | null = null;
let releaseWakeLock: (() => void) | null = null;
let isListening = false;
let liveDecodeId = 0;

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

/** Bandpass filter centered on 600Hz (standard CW tone). */
function bandpass600Hz(data: Float32Array, sampleRate: number): Float32Array {
  const out = new Float32Array(data.length);
  const fc = 600 / sampleRate;
  const Q = 10;

  const w0 = 2 * Math.PI * fc;
  const alpha = Math.sin(w0) / (2 * Q);

  const b0 = alpha;
  const b1 = 0;
  const b2 = -alpha;
  const a0 = 1 + alpha;
  const a1 = -2 * Math.cos(w0);
  const a2 = 1 - alpha;

  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const b0_a0 = b0 / a0;
  const b1_a0 = b1 / a0;
  const b2_a0 = b2 / a0;
  const a1_a0 = a1 / a0;
  const a2_a0 = a2 / a0;

  for (let i = 0; i < data.length; i++) {
    const x = data[i];
    const y = b0_a0 * x + b1_a0 * x1 + b2_a0 * x2 - a1_a0 * y1 - a2_a0 * y2;
    x2 = x1; x1 = x;
    y2 = y1; y1 = y;
    out[i] = y;
  }
  return out;
}

function stopLiveListen() {
  isListening = false;

  if (liveDecodeTimer) {
    clearInterval(liveDecodeTimer);
    liveDecodeTimer = null;
  }
  if (liveProcessor) {
    liveProcessor.disconnect();
    liveProcessor = null;
  }
  if (liveSourceNode) {
    liveSourceNode.disconnect();
    liveSourceNode = null;
  }
  if (liveStream) {
    liveStream.getTracks().forEach((t) => t.stop());
    liveStream = null;
  }
  if (liveAudioCtx) {
    liveAudioCtx.close();
    liveAudioCtx = null;
  }
  if (liveWorker) {
    liveWorker.terminate();
    liveWorker = null;
  }
  liveChunks = [];
  if (releaseWakeLock) {
    releaseWakeLock();
    releaseWakeLock = null;
  }

  document.getElementById('flash-indicator')?.classList.remove('on');
  document.getElementById('btn-live-start')?.classList.remove('hidden');
  document.getElementById('btn-live-stop')?.classList.add('hidden');
  document.getElementById('live-status')?.classList.add('hidden');
}

async function startLiveListen() {
  if (isListening) return;

  try {
    liveStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    liveAudioCtx = new AudioContext();

    if (liveAudioCtx.state === 'suspended') {
      await liveAudioCtx.resume();
    }

    liveSourceNode = liveAudioCtx.createMediaStreamSource(liveStream);
    liveProcessor = liveAudioCtx.createScriptProcessor(4096, 1, 1);
    liveSourceNode.connect(liveProcessor);
    liveProcessor.connect(liveAudioCtx.destination);

    liveProcessor.onaudioprocess = (e: AudioProcessingEvent) => {
      const inputData = e.inputBuffer.getChannelData(0);
      liveChunks.push(new Float32Array(inputData));

      // RMS for lamp visual feedback — computed directly from PCM to avoid
      // any AuditionNode / rAF timing issues.
      let sumSq = 0;
      for (let i = 0; i < inputData.length; i++) {
        sumSq += inputData[i] * inputData[i];
      }
      const rms = Math.sqrt(sumSq / inputData.length);
      const fi = document.getElementById('flash-indicator');
      if (fi) {
        fi.classList.toggle('on', rms > 0.008);
      }
    };

    liveWorker = new DecodeWorker();
    liveWorker.addEventListener('message', (ev: MessageEvent<WorkerOutMessage>) => {
      const m = ev.data;
      if (m.type !== 'decode-result') return;

      const el = document.getElementById('input-text') as HTMLTextAreaElement | null;
      if (!el) return;

      if (m.text) {
        el.value = m.text;
        const out = document.getElementById('output-morse') as HTMLDivElement | null;
        if (out) {
          out.innerHTML = textToMorseHtml(m.text);
          out.style.transition = 'box-shadow 0.15s';
          out.style.boxShadow = '0 0 24px var(--color-primary)';
          setTimeout(() => {
            out.style.boxShadow = '';
          }, 300);
        }
      }
    });

    liveDecodeTimer = window.setInterval(() => {
      if (liveChunks.length === 0) return;

      const sr = liveAudioCtx!.sampleRate;
      const totalSamples = liveChunks.reduce((sum, c) => sum + c.length, 0);
      const combined = new Float32Array(totalSamples);
      let offset = 0;
      for (const chunk of liveChunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }

      // Narrow bandpass around 600Hz to suppress everything except the CW tone
      const filtered = bandpass600Hz(combined, sr);

      // Skip decode when filtered energy is near-zero (just noise)
      let energy = 0;
      for (let i = 0; i < filtered.length; i++) {
        energy += filtered[i] * filtered[i];
      }
      const rms = Math.sqrt(energy / filtered.length);
      if (rms < 0.002) return;

      const id = ++liveDecodeId;
      const msg = {
        type: 'decode-pcm' as const,
        id,
        audio: filtered,
        sampleRate: sr,
      };
      liveWorker?.postMessage(msg, [filtered.buffer]);
    }, 2000);

    isListening = true;
    releaseWakeLock = acquireWakeLock();

    document.getElementById('btn-live-start')?.classList.add('hidden');
    document.getElementById('btn-live-stop')?.classList.remove('hidden');
    document.getElementById('live-status')?.classList.remove('hidden');
  } catch (err) {
    console.error('Failed to start live listen:', err);
    showMessage('Could not access microphone. Please ensure you have granted permission.', {
      type: 'alert',
    });
    stopLiveListen();
  }
}

// noinspection JSUnusedGlobalSymbols
export default function init(payload?: ToolPayload) {
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

  const btnLiveStart = document.getElementById('btn-live-start') as HTMLButtonElement;
  const btnLiveStop = document.getElementById('btn-live-stop') as HTMLButtonElement;

  btnLiveStart.addEventListener('click', startLiveListen);
  btnLiveStop.addEventListener('click', stopLiveListen);

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

  if (payload?.sharedFiles?.length) {
    const file = payload.sharedFiles![0];
    if (file.type.startsWith('audio/')) {
      handleAudioFile(file);
    }
  }

  return () => {
    if (currentAbortController) currentAbortController.abort();
    stopLiveListen();
    flashIndicator = null;
  };
}
