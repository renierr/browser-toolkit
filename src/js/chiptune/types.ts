export interface Envelope {
  points: { tick: number; value: number }[];
  loopStart?: number;
  loopEnd?: number;
  sustainStart?: number;
  sustainEnd?: number;
  type: number; // bitmask: 1=enabled, 2=sustain, 4=loop
}

export interface Sample {
  name: string;
  length: number;
  finetune: number; // in octaves for XM/IT or simple nibble for MOD
  volume: number; // 0-64
  loopStart: number;
  loopLength: number; // 0 means no loop
  panning: number; // 0-255, 128 is center
  data: Float32Array;
  baseNote?: number; // Used for XM specific relative note mappings
  c5speed?: number; // Base frequency (IT)
}

export interface Instrument {
  name: string;
  samples: Sample[];
  sampleMap: number[]; // 0-95 array mapping note index to sample index
  volumeEnv?: Envelope;
  panningEnv?: Envelope;
  volumeFadeout: number; // 0-32768
}

export interface Note {
  note: number | null; // 1-96 (C-1 to B-8), 97=KeyOff, null=Empty
  period: number | null; // Raw exact tracker period, if standard.
  instrument: number; // 1-128, 0=Empty
  volume: number | null; // 0-64
  effect: number; // 0-255 (effect type)
  effectParam: number; // 0-255 (effect parameter)
}

export interface Pattern {
  rows: Note[][];
}

export interface ModuleFile {
  type: 'MOD' | 'XM' | 'IT';
  title: string;
  instruments: Instrument[];
  patterns: Pattern[];
  sequence: number[];
  channels: number;
  defaultBpm: number;
  defaultSpeed: number;
  rowsPerPattern: number;
  linearFrequencies: boolean;
  clock?: number; // Amiga clock frequency (PAL: 7093789.2, NTSC: 7159090.5)
}

// Helper for strings
export function readString(data: Uint8Array, offset: number, length: number): string {
  let str = '';
  for (let i = 0; i < length; i++) {
    const charCode = data[offset + i];
    if (charCode === 0) break;
    // Accept standard ascii characters
    if (charCode >= 32 && charCode <= 126) {
      str += String.fromCharCode(charCode);
    }
  }
  return str;
}

// MOD Amiga periods table
export const AMIGA_PERIOD_TABLE = [
  1712, 1616, 1525, 1440, 1357, 1281, 1209, 1141, 1077, 1017, 961, 907, 856, 808, 762, 720, 678,
  640, 604, 570, 538, 508, 480, 453, 428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113, 107, 101, 95, 90, 85, 80, 76, 71, 67,
  64, 60, 57,
];

export const PAL_CLOCK = 7093789.2;

export function periodToFrequencyAmiga(
  period: number,
  finetune: number = 0,
  clock: number = PAL_CLOCK
): number {
  if (period <= 0) return 0;
  let adjustedPeriod = period;
  if (finetune !== 0) {
    adjustedPeriod = period * Math.pow(2, -finetune / (12 * 8));
  }
  return clock / (adjustedPeriod * 2);
}

export function periodToFrequencyLinear(period: number): number {
  return 8363 * Math.pow(2, (4608 - period) / 768);
}
