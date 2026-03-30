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

  const periods = [
    { note: 'C', octave: 0, period: 1712 },
    { note: 'C#', octave: 0, period: 1616 },
    { note: 'D', octave: 0, period: 1524 },
    { note: 'D#', octave: 0, period: 1440 },
    { note: 'E', octave: 0, period: 1356 },
    { note: 'F', octave: 0, period: 1280 },
    { note: 'F#', octave: 0, period: 1208 },
    { note: 'G', octave: 0, period: 1140 },
    { note: 'G#', octave: 0, period: 1076 },
    { note: 'A', octave: 0, period: 1016 },
    { note: 'A#', octave: 0, period: 960 },
    { note: 'B', octave: 0, period: 906 },
  ];

  const basePeriod = periods.find((p) => p.period === period);
  if (basePeriod) {
    return { note: basePeriod.note, octave: basePeriod.octave };
  }

  for (let oct = 0; oct <= 7; oct++) {
    for (let i = 0; i < NOTE_TABLE.length; i++) {
      const baseP = periods[i].period >> oct;
      if (Math.abs(baseP - period) < 10) {
        return { note: NOTE_TABLE[i], octave: oct };
      }
    }
  }

  const midiNote = Math.round(12 * Math.log2(8363 / period));
  const octave = Math.floor(midiNote / 12) - 1;
  const noteIdx = ((midiNote % 12) + 12) % 12;
  return { note: NOTE_TABLE[noteIdx], octave: Math.max(0, octave) };
}

function getChannelsFromMarker(marker: string): number {
  const m = marker.toUpperCase();
  if (m === 'M.K.' || m === 'M!K!' || m === 'FLT4' || m === 'FEST') {
    return 4;
  }
  if (m === 'M.V.' || m === '6CHN') {
    return 6;
  }
  if (m === '8CHN') {
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

  const title = readString(bytes, 0, 20);

  const samples: ModSample[] = [];
  let sampleDataOffset = 1084;

  for (let i = 0; i < 31; i++) {
    const offset = 20 + i * 30;
    const name = readString(bytes, offset, 22);
    const length = readUint16BE(bytes, offset + 22) * 2;
    const finetune = bytes[offset + 24] & 0x0f;
    const volume = bytes[offset + 25];
    const loopStart = readUint16BE(bytes, offset + 26) * 2;
    const loopLength = readUint16BE(bytes, offset + 28) * 2;

    let sampleData: Float32Array;
    if (length > 0) {
      const rawData = new Int8Array(bytes.buffer, sampleDataOffset, length);
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

        let volume = 0;
        if (effect === 0x0c) {
          volume = effectParam;
        } else if (sampleNum > 0 && samples[sampleNum - 1]) {
          volume = samples[sampleNum - 1].volume;
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
