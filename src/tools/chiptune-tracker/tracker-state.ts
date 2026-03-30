export type WaveformType = 'square' | 'sawtooth' | 'triangle' | 'pulse' | 'noise';

export interface Instrument {
  id: number;
  name: string;
  waveform: WaveformType;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  duty: number;
  sampleIndex?: number;
  sampleData?: Float32Array;
  sampleLoopStart?: number;
  sampleLoopLength?: number;
}

export interface CellData {
  note: string | null;
  octave: number | null;
  instrument: number | null;
  volume: number | null;
}

export interface Pattern {
  id: number;
  rows: CellData[][];
}

export interface TrackerState {
  bpm: number;
  channels: number;
  rowsPerPattern: number;
  instruments: Instrument[];
  patterns: Pattern[];
  order: number[];
  currentPattern: number;
  currentRow: number;
  isPlaying: boolean;
  isLooping: boolean;
  modSamples?: Float32Array[];
  modTitle?: string;
  modChannels?: number;
  modSampleCount?: number;
  modPatternCount?: number;
}

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const NOTE_TO_MIDI: Record<string, number> = {};
NOTE_NAMES.forEach((note, idx) => {
  NOTE_TO_MIDI[note] = idx;
});

export function noteToFrequency(note: string | null, octave: number | null): number {
  if (note === null || octave === null) return 0;
  const semitone = NOTE_TO_MIDI[note];
  if (semitone === undefined) return 0;
  const midiNote = (octave + 1) * 12 + semitone;
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}

export function createDefaultInstruments(): Instrument[] {
  return [
    {
      id: 1,
      name: 'Lead',
      waveform: 'square',
      attack: 0.01,
      decay: 0.1,
      sustain: 0.7,
      release: 0.2,
      duty: 50,
    },
    {
      id: 2,
      name: 'Bass',
      waveform: 'pulse',
      attack: 0.01,
      decay: 0.2,
      sustain: 0.5,
      release: 0.15,
      duty: 25,
    },
    {
      id: 3,
      name: 'Pad',
      waveform: 'triangle',
      attack: 0.1,
      decay: 0.3,
      sustain: 0.8,
      release: 0.5,
      duty: 50,
    },
    {
      id: 4,
      name: 'Pluck',
      waveform: 'pulse',
      attack: 0.001,
      decay: 0.3,
      sustain: 0.1,
      release: 0.1,
      duty: 50,
    },
    {
      id: 5,
      name: 'Arp',
      waveform: 'square',
      attack: 0.001,
      decay: 0.05,
      sustain: 0.3,
      release: 0.05,
      duty: 50,
    },
    {
      id: 6,
      name: 'Organ',
      waveform: 'square',
      attack: 0.01,
      decay: 0.01,
      sustain: 0.9,
      release: 0.1,
      duty: 50,
    },
    {
      id: 7,
      name: 'Noise',
      waveform: 'noise',
      attack: 0.001,
      decay: 0.1,
      sustain: 0,
      release: 0.1,
      duty: 50,
    },
    {
      id: 8,
      name: 'Strings',
      waveform: 'sawtooth',
      attack: 0.2,
      decay: 0.3,
      sustain: 0.6,
      release: 0.4,
      duty: 50,
    },
  ];
}

export function createDefaultPattern(id: number, channels: number, rows: number): Pattern {
  const patternRows: CellData[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: CellData[] = [];
    for (let c = 0; c < channels; c++) {
      row.push({ note: null, octave: null, instrument: null, volume: null });
    }
    patternRows.push(row);
  }
  return { id, rows: patternRows };
}

export function createInitialState(): TrackerState {
  const channels = 4;
  const rowsPerPattern = 64;
  const instruments = createDefaultInstruments();

  const patterns: Pattern[] = [];
  for (let i = 0; i < 8; i++) {
    patterns.push(createDefaultPattern(i, channels, rowsPerPattern));
  }

  return {
    bpm: 120,
    channels,
    rowsPerPattern,
    instruments,
    patterns,
    order: [0, 1, 2, 3, 4, 5, 6, 7],
    currentPattern: 0,
    currentRow: 0,
    isPlaying: false,
    isLooping: true,
  };
}

export function serializeState(state: TrackerState): string {
  return JSON.stringify(state);
}

export function deserializeState(json: string): TrackerState | null {
  try {
    const parsed = JSON.parse(json);
    if (
      typeof parsed.bpm === 'number' &&
      Array.isArray(parsed.patterns) &&
      Array.isArray(parsed.order)
    ) {
      return parsed as TrackerState;
    }
    return null;
  } catch {
    return null;
  }
}
