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
  vibratoType?: number;
  vibratoSweep?: number;
  vibratoDepth?: number;
  vibratoRate?: number;
}

export interface Instrument {
  name: string;
  samples: Sample[];
  sampleMap: number[]; // 0-95 array mapping note index to sample index
  noteMap?: number[]; // IT: note-to-note translation (maps input note → output note)
  volumeEnv?: Envelope;
  panningEnv?: Envelope;
  volumeFadeout: number; // 0-32768
  nna?: number; // IT: New Note Action (0=cut, 1=continue, 2=noteOff, 3=fade)
  dct?: number; // IT: Duplicate Check Type (0=off, 1=note, 2=sample, 3=instrument)
  dca?: number; // IT: Duplicate Check Action (0=cut, 1=off, 2=fade)
}

export interface Note {
  note: number | null; // 1-120 notes, 97=KeyOff, 98=NoteCut, 99=NoteFade, null=Empty
  period: number | null; // Raw exact tracker period, if standard.
  instrument: number; // 1-128, 0=Empty
  volume: number | null; // 0-64
  volumeColumn: number | null; // Raw volume column byte for XM
  effect: number; // 0-255 (effect type)
  effectParam: number; // 0-255 (effect parameter)
  itVolumeEffect?: number; // IT-only secondary effect from volume column
  itVolumeEffectParam?: number; // IT-only secondary effect parameter
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
  clock?: number;
  restartPosition?: number;
  globalVolume?: number; // IT: initial global volume (0-128)
  channelVolumes?: number[]; // Optional per-channel defaults (0-64)
  channelPanning?: number[]; // Optional per-channel defaults (0-255)
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

export interface WorkletInstrumentSample {
  length: number;
  finetune: number;
  volume: number;
  loopStart: number;
  loopLength: number;
  panning: number;
  data: Float32Array;
  baseNote?: number;
  c5speed?: number;
  vibratoType?: number;
  vibratoSweep?: number;
  vibratoDepth?: number;
  vibratoRate?: number;
}

export interface WorkletInstrument {
  index: number;
  name: string;
  samples: WorkletInstrumentSample[];
  sampleMap?: number[];
  noteMap?: number[];
  volumeEnv?: Envelope;
  panningEnv?: Envelope;
  volumeFadeout?: number;
  nna?: number; // IT: New Note Action (0=cut, 1=continue, 2=noteOff, 3=fade)
  dct?: number;
  dca?: number;
}

export interface WorkletNote {
  instrument: number;
  period: number;
  effect: number;
  effectParam: number;
  itVolumeEffect?: number;
  itVolumeEffectParam?: number;
  volume?: number | null;
  volumeColumn?: number | null;
  note?: number | null;
}

export interface WorkletRow {
  notes: WorkletNote[];
}

export interface WorkletPattern {
  rows: WorkletRow[];
}

export interface WorkletModule {
  type: 'MOD' | 'XM' | 'IT';
  name: string;
  length: number;
  sequence: number[];
  patternTable: number[];
  instruments: WorkletInstrument[];
  patterns: WorkletPattern[];
  channels: number;
  defaultBpm: number;
  defaultSpeed: number;
  rowsPerPattern: number;
  linearFrequencies: boolean;
  restartPosition: number;
  clock: number;
  globalVolume: number;
  channelVolumes?: number[];
  channelPanning?: number[];
}

export function serializeModuleForWorklet(mod: ModuleFile): WorkletModule {
  const instruments: WorkletInstrument[] = [];

  // Cache converted samples to avoid re-converting shared sample pools (critical for IT format
  // where all instruments reference the same sample array)
  const sampleCache = new Map<Sample, WorkletInstrumentSample>();

  function convertSample(sample: Sample): WorkletInstrumentSample {
    const cached = sampleCache.get(sample);
    if (cached) return cached;

    const floatData = new Float32Array(sample.data.length);
    floatData.set(sample.data);

    const converted: WorkletInstrumentSample = {
      length: sample.length,
      finetune: sample.finetune,
      volume: sample.volume,
      loopStart: sample.loopStart,
      loopLength: sample.loopLength,
      panning: sample.panning,
      data: floatData,
      baseNote: sample.baseNote,
      c5speed: sample.c5speed,
      vibratoType: sample.vibratoType,
      vibratoSweep: sample.vibratoSweep,
      vibratoDepth: sample.vibratoDepth,
      vibratoRate: sample.vibratoRate,
    };
    sampleCache.set(sample, converted);
    return converted;
  }

  for (let i = 0; i < mod.instruments.length; i++) {
    const inst = mod.instruments[i];
    const samples: WorkletInstrumentSample[] = [];

    for (let s = 0; s < inst.samples.length; s++) {
      samples.push(convertSample(inst.samples[s]));
    }

    instruments.push({
      index: i + 1,
      name: inst.name,
      samples,
      sampleMap: inst.sampleMap,
      noteMap: inst.noteMap,
      volumeEnv: inst.volumeEnv,
      panningEnv: inst.panningEnv,
      volumeFadeout: inst.volumeFadeout,
      nna: inst.nna,
      dct: inst.dct,
      dca: inst.dca,
    });
  }

  const patterns: WorkletPattern[] = [];
  for (let p = 0; p < mod.patterns.length; p++) {
    const pattern = mod.patterns[p];
    const rows: WorkletRow[] = [];

    for (let r = 0; r < pattern.rows.length; r++) {
      const row = pattern.rows[r];
      const notes: WorkletNote[] = [];

      for (let c = 0; c < row.length; c++) {
        const note = row[c];
        notes.push({
          instrument: note.instrument,
          period: note.period || 0,
          effect: note.effect,
          effectParam: note.effectParam,
          itVolumeEffect: note.itVolumeEffect,
          itVolumeEffectParam: note.itVolumeEffectParam,
          volume: note.volume,
          volumeColumn: note.volumeColumn,
          note: note.note,
        });
      }

      rows.push({ notes });
    }

    patterns.push({ rows });
  }

  return {
    type: mod.type,
    name: mod.title,
    length: mod.sequence.length,
    sequence: mod.sequence,
    patternTable: mod.sequence,
    instruments,
    patterns,
    channels: mod.channels,
    defaultBpm: mod.defaultBpm,
    defaultSpeed: mod.defaultSpeed,
    rowsPerPattern: mod.rowsPerPattern,
    linearFrequencies: !!mod.linearFrequencies,
    restartPosition: mod.restartPosition || 0,
    clock: mod.clock || 7093789.2,
    globalVolume: mod.globalVolume ?? 64,
    channelVolumes: mod.channelVolumes,
    channelPanning: mod.channelPanning,
  };
}
