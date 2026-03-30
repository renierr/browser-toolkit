export interface ModSample {
  name: string;
  length: number;
  finetune: number;
  volume: number;
  loopStart: number;
  loopLength: number;
  data: Float32Array;
}

export interface ModNote {
  note: string | null;
  octave: number | null;
  period: number;
  instrument: number;
  volume: number | null;
  effect: number;
  effectParam: number;
}

export interface ModPattern {
  rows: ModNote[][];
}

export interface ModFile {
  title: string;
  samples: ModSample[];
  patterns: ModPattern[];
  sequence: number[];
  channels: number;
  defaultBpm: number;
  defaultSpeed: number;
}

const AMIGA_PERIOD_TABLE: { note: string; octave: number; period: number }[] = [
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

function readString(data: Uint8Array, offset: number, length: number): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    const char = data[offset + i];
    if (char >= 32 && char <= 126) {
      result += String.fromCharCode(char);
    }
  }
  return result.trim();
}

function readUint8(data: Uint8Array, offset: number): number {
  return data[offset];
}

function readUint16BE(data: Uint8Array, offset: number): number {
  return (data[offset] << 8) | data[offset + 1];
}

function noteFromPeriod(period: number): { note: string; octave: number } | null {
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

  if (minDiff <= 2) {
    return { note: closest.note, octave: closest.octave };
  }

  return null;
}

export function periodToFrequency(period: number, finetune: number = 0): number {
  if (period === 0) return 0;
  const AMIGA_CLOCK = 7093789;
  const adjustedPeriod = period + finetune;
  return AMIGA_CLOCK / (2 * adjustedPeriod);
}

function getChannelsFromMarker(marker: string): number {
  const m = marker.toUpperCase();
  if (m === 'M.K.' || m === 'M!K!' || m === 'FLT4' || m === 'FEST' || m === 'NSMS') {
    return 4;
  }
  if (m === 'M.V.' || m === '6CHN' || m === 'FLT6') {
    return 6;
  }
  if (m === '8CHN' || m === 'FLT8') {
    return 8;
  }
  if (m === '16CN') {
    return 16;
  }
  const num = parseInt(m.replace(/[A-Z!]/g, ''));
  if (!isNaN(num) && num > 0) {
    return num;
  }
  return 4;
}

export function parseModFile(data: ArrayBuffer): ModFile {
  const bytes = new Uint8Array(data);
  const buffer = bytes.buffer as ArrayBuffer;

  const title = readString(bytes, 0, 20);

  const samples: ModSample[] = [];
  let sampleDataOffset = 1084;

  for (let i = 0; i < 31; i++) {
    const offset = 20 + i * 30;
    const name = readString(bytes, offset, 22);
    const length = readUint16BE(bytes, offset + 22) * 2;
    const finetune = bytes[offset + 24] & 0x0f;
    const volume = Math.min(bytes[offset + 25], 64);
    const loopStart = readUint16BE(bytes, offset + 26) * 2;
    const loopLength = readUint16BE(bytes, offset + 28) * 2;

    let sampleData: Float32Array;
    if (length > 0 && sampleDataOffset + length <= bytes.length) {
      const rawData = new Int8Array(buffer, sampleDataOffset, length);
      sampleData = new Float32Array(length);
      for (let j = 0; j < length; j++) {
        sampleData[j] = rawData[j] / 128;
      }
      sampleDataOffset += length;
    } else {
      sampleData = new Float32Array(0);
    }

    samples.push({
      name: name || `Sample ${i + 1}`,
      length,
      finetune,
      volume,
      loopStart,
      loopLength,
      data: sampleData,
    });
  }

  const songLength = readUint8(bytes, 950);
  readUint8(bytes, 951);
  const patternTable = new Uint8Array(128);
  for (let i = 0; i < 128; i++) {
    patternTable[i] = bytes[952 + i];
  }

  const formatMarker = readString(bytes, 1080, 4);
  let channels = getChannelsFromMarker(formatMarker);

  const uniquePatterns = new Set(patternTable.slice(0, songLength));
  const numPatterns = Math.max(...uniquePatterns) + 1;

  const patterns: ModPattern[] = [];
  const patternSize = 64 * channels * 4;

  for (let pat = 0; pat < numPatterns; pat++) {
    const patOffset = sampleDataOffset + pat * patternSize;
    const rows: ModNote[][] = [];

    for (let row = 0; row < 64; row++) {
      const rowData: ModNote[] = [];
      for (let ch = 0; ch < channels; ch++) {
        const cellOffset = patOffset + (row * channels + ch) * 4;
        if (cellOffset + 4 > bytes.length) {
          rowData.push({
            note: null,
            octave: null,
            period: 0,
            instrument: 0,
            volume: null,
            effect: 0,
            effectParam: 0,
          });
          continue;
        }

        const byte0 = bytes[cellOffset];
        const byte1 = bytes[cellOffset + 1];
        const byte2 = bytes[cellOffset + 2];
        const byte3 = bytes[cellOffset + 3];

        const sampleNum = ((byte0 & 0xf0) >> 4) | (byte2 & 0xf0);
        const period = ((byte0 & 0x0f) << 8) | byte1;
        const effect = byte2 & 0x0f;
        const effectParam = byte3;

        const noteInfo = noteFromPeriod(period);

        let volume: number | null = null;
        if (effect === 0x0c) {
          volume = Math.min(effectParam, 64);
        }

        rowData.push({
          note: noteInfo?.note ?? null,
          octave: noteInfo?.octave ?? null,
          period,
          instrument: sampleNum,
          volume,
          effect,
          effectParam,
        });
      }
      rows.push(rowData);
    }
    patterns.push({ rows });
  }

  const sequence: number[] = [];
  for (let i = 0; i < songLength; i++) {
    sequence.push(patternTable[i]);
  }

  const defaultSpeed = 6;
  const defaultBpm = 125;

  return {
    title,
    samples,
    patterns,
    sequence,
    channels,
    defaultBpm,
    defaultSpeed,
  };
}
