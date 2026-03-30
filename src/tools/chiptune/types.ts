export interface Sample {
  name: string;
  length: number;
  finetune: number;
  volume: number;
  loopStart: number;
  loopLength: number;
  data: Float32Array;
}

export interface Note {
  note: string | null;
  octave: number | null;
  period: number;
  instrument: number;
  volume: number | null;
  effect: number;
  effectParam: number;
}

export interface Pattern {
  rows: Note[][];
}

export interface ModuleFile {
  type: 'MOD' | 'XM' | 'IT';
  title: string;
  samples: Sample[];
  patterns: Pattern[];
  sequence: number[];
  channels: number;
  defaultBpm: number;
  defaultSpeed: number;
  rowsPerPattern: number;
}

export const AMIGA_PERIOD_TABLE: { note: string; octave: number; period: number }[] = [
  { note: 'C', octave: 0, period: 1712 },
  { note: 'C#', octave: 0, period: 1616 },
  { note: 'D', octave: 0, period: 1525 },
  { note: 'D#', octave: 0, period: 1440 },
  { note: 'E', octave: 0, period: 1357 },
  { note: 'F', octave: 0, period: 1281 },
  { note: 'F#', octave: 0, period: 1209 },
  { note: 'G', octave: 0, period: 1141 },
  { note: 'G#', octave: 0, period: 1077 },
  { note: 'A', octave: 0, period: 1017 },
  { note: 'A#', octave: 0, period: 961 },
  { note: 'B', octave: 0, period: 907 },
  { note: 'C', octave: 1, period: 856 },
  { note: 'C#', octave: 1, period: 808 },
  { note: 'D', octave: 1, period: 762 },
  { note: 'D#', octave: 1, period: 720 },
  { note: 'E', octave: 1, period: 678 },
  { note: 'F', octave: 1, period: 640 },
  { note: 'F#', octave: 1, period: 604 },
  { note: 'G', octave: 1, period: 570 },
  { note: 'G#', octave: 1, period: 538 },
  { note: 'A', octave: 1, period: 508 },
  { note: 'A#', octave: 1, period: 480 },
  { note: 'B', octave: 1, period: 453 },
  { note: 'C', octave: 2, period: 428 },
  { note: 'C#', octave: 2, period: 404 },
  { note: 'D', octave: 2, period: 381 },
  { note: 'D#', octave: 2, period: 360 },
  { note: 'E', octave: 2, period: 339 },
  { note: 'F', octave: 2, period: 320 },
  { note: 'F#', octave: 2, period: 302 },
  { note: 'G', octave: 2, period: 285 },
  { note: 'G#', octave: 2, period: 269 },
  { note: 'A', octave: 2, period: 254 },
  { note: 'A#', octave: 2, period: 240 },
  { note: 'B', octave: 2, period: 226 },
  { note: 'C', octave: 3, period: 214 },
  { note: 'C#', octave: 3, period: 202 },
  { note: 'D', octave: 3, period: 190 },
  { note: 'D#', octave: 3, period: 180 },
  { note: 'E', octave: 3, period: 170 },
  { note: 'F', octave: 3, period: 160 },
  { note: 'F#', octave: 3, period: 151 },
  { note: 'G', octave: 3, period: 143 },
  { note: 'G#', octave: 3, period: 135 },
  { note: 'A', octave: 3, period: 127 },
  { note: 'A#', octave: 3, period: 120 },
  { note: 'B', octave: 3, period: 113 },
  { note: 'C', octave: 4, period: 107 },
  { note: 'C#', octave: 4, period: 101 },
  { note: 'D', octave: 4, period: 95 },
  { note: 'D#', octave: 4, period: 90 },
  { note: 'E', octave: 4, period: 85 },
  { note: 'F', octave: 4, period: 80 },
  { note: 'F#', octave: 4, period: 76 },
  { note: 'G', octave: 4, period: 71 },
  { note: 'G#', octave: 4, period: 67 },
  { note: 'A', octave: 4, period: 64 },
  { note: 'A#', octave: 4, period: 60 },
  { note: 'B', octave: 4, period: 57 },
];

export function noteFromPeriod(period: number): { note: string; octave: number } | null {
  if (period === 0) return null;
  let closest = AMIGA_PERIOD_TABLE[0];
  let minDiff = Math.abs(closest.period - period);
  for (const entry of AMIGA_PERIOD_TABLE) {
    const diff = Math.abs(entry.period - period);
    if (diff < minDiff) {
      minDiff = diff;
      closest = entry;
    }
  }
  return minDiff <= 2 ? { note: closest.note, octave: closest.octave } : null;
}

export function periodToFrequency(period: number, finetune: number = 0): number {
  if (period === 0) return 0;
  const AMIGA_CLOCK = 7093789;
  return AMIGA_CLOCK / (2 * (period + finetune));
}

export function readString(data: Uint8Array, offset: number, length: number): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    const char = data[offset + i];
    if (char >= 32 && char <= 126) result += String.fromCharCode(char);
  }
  return result.trim();
}
