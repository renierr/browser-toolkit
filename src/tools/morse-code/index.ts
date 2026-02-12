import { hideProgress, showMessage, showProgress } from '../../js/ui.ts';
import { downloadFile } from '../../js/file-utils.ts';
import { ensureAudioContextReady, playTone, exportAudio } from './audio.ts';
import { REVERSE_MORSE_CODE, textToMorse, textToMorseHtml } from './morsecode.ts';

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

// --- Audio Export ---

// --- Audio Import & Decoding ---

async function decodeAudioFile(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

  // We only need one channel
  const data = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;

  // 1. Calculate RMS envelope
  const windowSize = Math.floor(sampleRate * 0.01); // 10ms window
  const envelope = [];
  for (let i = 0; i < data.length; i += windowSize) {
    let sum = 0;
    for (let j = 0; j < windowSize && i + j < data.length; j++) {
      sum += data[i + j] * data[i + j];
    }
    envelope.push(Math.sqrt(sum / windowSize));
  }

  // 2. Thresholding
  const maxVal = Math.max(...envelope);
  const threshold = maxVal * 0.25; // 25% of max volume
  const states = envelope.map((v) => v > threshold);

  // 3. Run Length Encoding
  const durations: { state: boolean; count: number }[] = [];
  if (states.length > 0) {
    let currentState = states[0];
    let currentCount = 0;
    for (const s of states) {
      if (s === currentState) {
        currentCount++;
      } else {
        durations.push({ state: currentState, count: currentCount });
        currentState = s;
        currentCount = 1;
      }
    }
    durations.push({ state: currentState, count: currentCount });
  }

  // 4. Analyze durations to find unit length (dot)
  // Filter out very short glitches
  const significantOn = durations.filter((d) => d.state && d.count > 2).map((d) => d.count);
  if (significantOn.length === 0) return '';

  // Simple clustering: sort and find gaps
  significantOn.sort((a, b) => a - b);

  // Assume the smallest cluster is dots
  // We can take the median of the lower half as a rough estimate for dot length
  const medianDot = significantOn[Math.floor(significantOn.length / 4)]; // rough guess

  // Refine: anything < 2 * medianDot is a dot, anything > 2 * medianDot is a dash
  // Re-calculate unit length based on identified dots
  const dots = significantOn.filter((d) => d < medianDot * 2);
  const unitLength = dots.reduce((a, b) => a + b, 0) / dots.length;

  // 5. Decode
  let result = '';

  for (const d of durations) {
    const units = d.count / unitLength;

    if (d.state) {
      // ON
      if (units < 2.0) {
        result += '.';
      } else {
        result += '-';
      }
    } else {
      // OFF
      if (units < 2.0) {
        // Inter-element gap (1 unit), ignore
      } else if (units < 5.0) {
        // Inter-character gap (3 units)
        result += ' ';
      } else {
        // Word gap (7 units)
        result += ' / ';
      }
    }
  }

  // 6. Convert Morse to Text
  return result
    .trim()
    .split(' / ')
    .map((word) => {
      return word
        .split(' ')
        .map((char) => REVERSE_MORSE_CODE[char] || '')
        .join('');
    })
    .join(' ');
}

// noinspection JSUnusedGlobalSymbols
export default function init() {
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

    showProgress('Decoding audio...');
    btnImport.disabled = true;

    try {
      input.value = await decodeAudioFile(file);
      updatePreview();
      showMessage('Audio decoded!', { timeoutMs: 3000 });
    } catch (err) {
      console.error(err);
      showMessage('Error decoding audio', { type: 'alert' });
    } finally {
      hideProgress();
      btnImport.disabled = false;
      fileInput.value = '';
    }
  });

  return () => {
    if (currentAbortController) currentAbortController.abort();
    flashIndicator = null;
  };
}
