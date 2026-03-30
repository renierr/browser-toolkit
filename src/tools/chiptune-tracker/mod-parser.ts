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
  instrument: number;
  volume: number;
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

const NOTE_TABLE: string[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const AMIGA_PERIOD_TABLE: { note: string; octave: number; period: number }[] = [];
for (let oct = 0; oct <= 6; oct++) {
  for (let i = 0; i < NOTE_TABLE.length; i++) {
    const basePeriod = [1712, 1616, 1524, 1440, 1356, 1280, 1208, 1140, 1076, 1016, 960, 906][i];
    const period = Math.round(basePeriod / Math.pow(2, oct));
    AMIGA_PERIOD_TABLE.push({ note: NOTE_TABLE[i], octave: oct + 1, period });
  }
}
AMIGA_PERIOD_TABLE.sort((a, b) => a.period - b.period);

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

  if (minDiff <= 10) {
    return { note: closest.note, octave: closest.octave };
  }

  return null;
}

export function periodToFrequency(period: number, finetune: number = 0): number {
  if (period === 0) return 0;
  const adjustedPeriod = period + finetune;
  return ((8363 * 709.3789) / adjustedPeriod / 44100) * 2;
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
            instrument: 0,
            volume: 0,
            effect: 0,
            effectParam: 0,
          });
          continue;
        }

        const byte0 = bytes[cellOffset];
        const byte1 = bytes[cellOffset + 1];
        const byte2 = bytes[cellOffset + 2];
        const byte3 = bytes[cellOffset + 3];

        const sampleNum = (byte0 & 0xf0) | ((byte2 & 0xf0) >> 4);
        const period = ((byte0 & 0x0f) << 8) | byte1;
        const effect = byte2 & 0x0f;
        const effectParam = byte3;

        const noteInfo = noteFromPeriod(period);

        let volume = 64;
        if (effect === 0x0c) {
          volume = Math.min(effectParam, 64);
        } else if (sampleNum > 0 && samples[sampleNum - 1]) {
          volume = samples[sampleNum - 1].volume || 64;
        }

        rowData.push({
          note: noteInfo?.note ?? null,
          octave: noteInfo?.octave ?? null,
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
