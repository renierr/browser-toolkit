

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

function playTone(durationMs: number, volume: number): void {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.value = 700; // 650-800 Hz is typical for morse
  gainNode.gain.value = volume * 0.5; // Scale volume to reasonable level

  osc.connect(gainNode);
  gainNode.connect(ctx.destination);

  const now = ctx.currentTime;
  osc.start(now);
  osc.stop(now + durationMs / 1000);
}

function flashScreen(durationMs: number): void {
  const original = document.body.style.backgroundColor;
  document.body.style.backgroundColor = '#ffffff';
  document.body.style.transition = 'background 0.06s';

  setTimeout(() => {
    document.body.style.backgroundColor = original || '';
    document.body.style.transition = '';
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

      if (mode === 'both' || mode === 'sound') {
        playTone(duration, volume);
      }
      if (mode === 'both' || mode === 'flash') {
        flashScreen(duration);
      }

      await delay(unitMs); // intra-character space
    }

    await delay(unitMs * 2); // inter-character = 3 units total (1 already above)
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
  };
}
