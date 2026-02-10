// prettier-ignore
const MORSE_CODE: Record<string, string> = {
  A: '.-',
  B: '-...',
  C: '-.-.',
  D: '-..',
  E: '.',
  F: '..-.',
  G: '--.',
  H: '....',
  I: '..',
  J: '.---',
  K: '-.-',
  L: '.-..',
  M: '--',
  N: '-.',
  O: '---',
  P: '.--.',
  Q: '--.-',
  R: '.-.',
  S: '...',
  T: '-',
  U: '..-',
  V: '...-',
  W: '.--',
  X: '-..-',
  Y: '-.--',
  Z: '--..',
  'Ä': '.-.-',
  'Ö': '---.',
  'Ü': '..--',
  'ß': '...--..',
  '0': '-----',
  '1': '.----',
  '2': '..---',
  '3': '...--',
  '4': '....-',
  '5': '.....',
  '6': '-....',
  '7': '--...',
  '8': '---..',
  '9': '----.',
  ' ': '/',
  '.': '.-.-.-',
  ',': '--..--',
  '?': '..--..',
  "'": '.----.',
  '!': '-.-.--',
  '/': '-..-.',
  '(': '-.--.',
  ')': '-.--.-',
  '&': '.-...',
  ':': '---...',
  ';': '-.-.-.',
  '=': '-...-',
  '+': '.-.-.',
  '-': '-....-',
  _: '..--.-',
  '"': '.-..-.',
  '@': '.--.-.',
};

const REVERSE_MORSE_CODE: Record<string, string> = Object.entries(MORSE_CODE).reduce(
  (acc, [char, code]) => {
    acc[code] = char;
    return acc;
  },
  {} as Record<string, string>
);

let audioCtx: AudioContext | null = null;
let currentAbortController: AbortController | null = null;
let isPlaying = false;

function getAudioContext(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
}

function textToMorse(text: string): string {
  return text
    .toUpperCase()
    .split('')
    .map((c) => MORSE_CODE[c] || '')
    .filter(Boolean)
    .join(' ');
}

function wpmToUnitMs(wpm: number): number {
  // Standard: "PARIS" = 50 units -> 1200 / WPM = duration of one unit
  return Math.round(1200 / wpm);
}

function playTone(durationMs: number, volume: number): Promise<void> {
  return new Promise((resolve) => {
    const ctx = getAudioContext();

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.value = 600; // Classic CW tone frequency

    // Use envelope to avoid clicking (attack/decay)
    const now = ctx.currentTime;
    const attackTime = 0.005; // 5ms attack
    const decayTime = 0.005; // 5ms decay
    const peakGain = volume * 0.3;

    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(peakGain, now + attackTime);
    gainNode.gain.setValueAtTime(peakGain, now + durationMs / 1000 - decayTime);
    gainNode.gain.linearRampToValueAtTime(0, now + durationMs / 1000);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + durationMs / 1000 + 0.01);

    osc.onended = () => resolve();
  });
}

let flashIndicator: HTMLElement | null = null;

function flashElement(durationMs: number): void {
  if (!flashIndicator) {
    flashIndicator = document.getElementById('flash-indicator');
  }
  if (!flashIndicator) return;

  flashIndicator.classList.add('bg-warning', 'border-warning');
  flashIndicator.classList.remove('bg-base-300', 'border-base-300');

  setTimeout(() => {
    if (flashIndicator) {
      flashIndicator.classList.remove('bg-warning', 'border-warning');
      flashIndicator.classList.add('bg-base-300', 'border-base-300');
    }
  }, durationMs);
}

async function playMorse(
  morse: string,
  unitMs: number,
  mode: 'both' | 'sound' | 'flash',
  volume: number,
  signal: AbortSignal
): Promise<void> {
  if (signal.aborted) return;

  // Ensure AudioContext is created and ready before starting
  if (mode === 'both' || mode === 'sound') {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    // Small delay to ensure audio system is fully ready
    await delay(50);
  }

  const parts = morse.split(' ');

  for (const part of parts) {
    if (signal.aborted) return;

    if (part === '/') {
      await delay(unitMs * 7);
      continue;
    }

    for (const sym of part) {
      if (signal.aborted) return;

      const isDash = sym === '-';
      const durUnits = isDash ? 3 : 1;
      const duration = durUnits * unitMs;

      if (mode === 'both' || mode === 'flash') {
        flashElement(duration);
      }

      if (mode === 'both' || mode === 'sound') {
        await playTone(duration, volume);
        // Add inter-element gap (1 unit silence)
        await delay(unitMs);
      } else {
        // Flash only mode - wait for duration + gap
        await delay(duration + unitMs);
      }
    }

    // Inter-character gap: 3 units total, but we already waited 1 unit after last element
    await delay(unitMs * 2);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// --- Audio Export ---

async function exportAudio(morse: string, wpm: number, format: 'wav' | 'webm'): Promise<Blob> {
  const unitMs = wpmToUnitMs(wpm);
  const unitSec = unitMs / 1000;
  const sampleRate = 44100;

  // Calculate total duration
  let totalUnits = 0;
  const parts = morse.split(' ');
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === '/') {
      totalUnits += 7;
    } else {
      for (let j = 0; j < part.length; j++) {
        const sym = part[j];
        totalUnits += sym === '-' ? 3 : 1;
        if (j < part.length - 1) totalUnits += 1; // Inter-element gap
      }
      if (i < parts.length - 1) totalUnits += 3; // Inter-char gap
    }
  }
  // Add a little padding
  totalUnits += 2;

  const totalDuration = totalUnits * unitSec;
  const offlineCtx = new OfflineAudioContext(1, sampleRate * totalDuration, sampleRate);

  const osc = offlineCtx.createOscillator();
  const gainNode = offlineCtx.createGain();

  osc.type = 'sine';
  osc.frequency.value = 600;
  osc.connect(gainNode);
  gainNode.connect(offlineCtx.destination);

  let currentTime = 0;
  const attackTime = 0.005;
  const decayTime = 0.005;
  const peakGain = 0.5;

  gainNode.gain.setValueAtTime(0, 0);
  osc.start(0);

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === '/') {
      currentTime += 7 * unitSec;
    } else {
      for (let j = 0; j < part.length; j++) {
        const sym = part[j];
        const duration = (sym === '-' ? 3 : 1) * unitSec;

        gainNode.gain.setTargetAtTime(peakGain, currentTime, attackTime / 3);
        gainNode.gain.setTargetAtTime(0, currentTime + duration - decayTime, decayTime / 3);

        currentTime += duration;
        currentTime += unitSec; // Inter-element gap
      }
      currentTime += 2 * unitSec; // Inter-char gap (already added 1 unit above)
    }
  }

  osc.stop(totalDuration);

  const renderedBuffer = await offlineCtx.startRendering();

  if (format === 'webm') {
    return bufferToWebM(renderedBuffer);
  } else {
    return bufferToWave(renderedBuffer, totalDuration * sampleRate);
  }
}

function bufferToWave(abuffer: AudioBuffer, len: number): Blob {
  const numOfChan = abuffer.numberOfChannels;
  const length = len * numOfChan * 2 + 44;
  const buffer = new ArrayBuffer(length);
  const view = new DataView(buffer);
  const channels = [];
  let i;
  let sample;
  let offset = 0;
  let pos = 0;

  // write WAVE header
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(abuffer.sampleRate);
  setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit (hardcoded in this function)

  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4); // chunk length

  // write interleaved data
  for (i = 0; i < abuffer.numberOfChannels; i++) channels.push(abuffer.getChannelData(i));

  const totalFrames = abuffer.length;
  while (offset < totalFrames && pos < length) {
    for (i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([buffer], { type: 'audio/wav' });

  function setUint16(data: number) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data: number) {
    view.setUint32(pos, data, true);
    pos += 4;
  }
}

async function bufferToWebM(buffer: AudioBuffer): Promise<Blob> {
  // Create a new context for recording
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const dest = ctx.createMediaStreamDestination();
  source.connect(dest);

  const recorder = new MediaRecorder(dest.stream, { mimeType: 'audio/webm' });
  const chunks: Blob[] = [];

  return new Promise((resolve) => {
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: 'audio/webm' }));
      ctx.close(); // Clean up context
    };

    recorder.start();
    source.start(0);

    // Stop recording when buffer finishes playing
    source.onended = () => {
      recorder.stop();
    };
  });
}

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
  const volumeSlider = document.getElementById('volume-slider') as HTMLInputElement;
  const volumeDisplay = document.getElementById('volume-display') as HTMLElement;
  const modeSelect = document.getElementById('output-mode') as HTMLSelectElement;
  const exportFormatSelect = document.getElementById('export-format') as HTMLSelectElement;

  // Live Morse preview
  function updatePreview() {
    const text = input.value.trim();
    outputMorse.textContent = text ? textToMorse(text) : '--- ... ---';
  }
  input.addEventListener('input', updatePreview);
  updatePreview();

  // Update slider display
  speedSlider.addEventListener('input', () => {
    wpmDisplay.textContent = `${speedSlider.value} WPM`;
  });

  volumeSlider.addEventListener('input', () => {
    volumeDisplay.textContent = `${volumeSlider.value}%`;
  });

  btnPlay.addEventListener('click', async () => {
    if (isPlaying) return;

    const text = input.value.trim();
    if (!text) {
      status.textContent = 'Please enter text...';
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
      const unitMs = wpmToUnitMs(wpm);
      const volume = parseInt(volumeSlider.value, 10) / 100;
      const mode = modeSelect.value as 'both' | 'sound' | 'flash';

      await playMorse(morse, unitMs, mode, volume, signal);

      if (!signal.aborted) {
        status.textContent = 'Playback finished';
      }
    } catch (err: any) {
      if (!signal.aborted) {
        console.error(err);
        status.textContent = 'Error during playback';
      }
    } finally {
      isPlaying = false;
      btnPlay.disabled = false;
      btnStop.classList.add('hidden');
      spinner.classList.add('hidden');
      if (signal.aborted) {
        status.textContent = 'Cancelled';
      }
    }
  });

  btnStop.addEventListener('click', () => {
    currentAbortController?.abort();
    currentAbortController = null;
  });

  btnExport.addEventListener('click', async () => {
    const text = input.value.trim();
    if (!text) {
      status.textContent = 'Please enter text to export...';
      return;
    }

    btnExport.disabled = true;
    status.textContent = 'Generating audio...';

    try {
      const morse = textToMorse(text);
      const wpm = parseInt(speedSlider.value, 10);
      const format = exportFormatSelect.value as 'wav' | 'webm';
      const blob = await exportAudio(morse, wpm, format);

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `morse_code.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      status.textContent = 'Audio exported!';
    } catch (err) {
      console.error(err);
      status.textContent = 'Error exporting audio';
    } finally {
      btnExport.disabled = false;
    }
  });

  btnImport.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    status.textContent = 'Decoding audio...';
    btnImport.disabled = true;

    try {
      const decodedText = await decodeAudioFile(file);
      input.value = decodedText;
      updatePreview();
      status.textContent = 'Audio decoded!';
    } catch (err) {
      console.error(err);
      status.textContent = 'Error decoding audio';
    } finally {
      btnImport.disabled = false;
      fileInput.value = ''; // Reset
    }
  });

  return () => {
    if (currentAbortController) currentAbortController.abort();
    flashIndicator = null;
  };
}
