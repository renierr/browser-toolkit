
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

export default function init() {
  const input = document.getElementById('input-text') as HTMLTextAreaElement;
  const outputMorse = document.getElementById('output-morse') as HTMLDivElement;
  const btnPlay = document.getElementById('btn-play') as HTMLButtonElement;
  const btnStop = document.getElementById('btn-stop') as HTMLButtonElement;
  const spinner = document.getElementById('spinner') as HTMLElement;
  const status = document.getElementById('status') as HTMLDivElement;

  const speedSlider = document.getElementById('speed-slider') as HTMLInputElement;
  const wpmDisplay = document.getElementById('wpm-display') as HTMLElement;
  const volumeSlider = document.getElementById('volume-slider') as HTMLInputElement;
  const volumeDisplay = document.getElementById('volume-display') as HTMLElement;
  const modeSelect = document.getElementById('output-mode') as HTMLSelectElement;

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

  return () => {
    if (currentAbortController) currentAbortController.abort();
    flashIndicator = null;
  };
}
