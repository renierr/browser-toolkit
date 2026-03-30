import {
  type Sample,
  type Note,
  type Pattern,
  type ModuleFile,
  readString,
  noteFromPeriod,
} from './types';
export type { Sample, Note, Pattern, ModuleFile };

function getChannelsFromMarker(marker: string): number {
  const m = marker.toUpperCase();
  if (m === 'M.K.' || m === 'M!K!' || m === 'FLT4' || m === 'FEST' || m === 'NSMS') return 4;
  if (m === 'M.V.' || m === '6CHN' || m === 'FLT6') return 6;
  if (m === '8CHN' || m === 'FLT8') return 8;
  if (m === '16CN') return 16;
  const num = parseInt(m.replace(/[A-Z!]/g, ''));
  return !isNaN(num) && num > 0 ? num : 4;
}

export function parseModFile(data: Uint8Array): ModuleFile {
  const title = readString(data, 0, 20);
  const samples: Sample[] = [];
  let sampleDataOffset = 1084;

  for (let i = 0; i < 31; i++) {
    const offset = 20 + i * 30;
    const name = readString(data, offset, 22);
    const length = (data[offset + 22] << 8) | data[offset + 23];
    const finetune = data[offset + 24] & 0x0f;
    const volume = Math.min(data[offset + 25], 64);
    const loopStart = ((data[offset + 26] << 8) | data[offset + 27]) * 2;
    const loopLength = ((data[offset + 28] << 8) | data[offset + 29]) * 2;

    const realLength = length * 2;
    let sampleData: Float32Array;

    if (realLength > 0 && sampleDataOffset + realLength <= data.length) {
      sampleData = new Float32Array(realLength);
      for (let j = 0; j < realLength; j++) {
        const b = data[sampleDataOffset + j];
        sampleData[j] = b > 127 ? (b - 256) / 128 : b / 128;
      }
      sampleDataOffset += realLength;
    } else {
      sampleData = new Float32Array(0);
    }

    samples.push({
      name: name || `Sample ${i + 1}`,
      length: realLength,
      finetune,
      volume,
      loopStart,
      loopLength,
      data: sampleData,
    });
  }

  const songLength = data[950];
  const patternTable = new Uint8Array(128);
  for (let i = 0; i < 128; i++) patternTable[i] = data[952 + i];

  const formatMarker = readString(data, 1080, 4);
  const channels = getChannelsFromMarker(formatMarker);

  const uniquePatterns = new Set(patternTable.slice(0, songLength));
  const numPatterns = Math.max(...uniquePatterns, 0) + 1;

  const patterns: Pattern[] = [];
  const patternSize = 64 * channels * 4;

  for (let pat = 0; pat < numPatterns; pat++) {
    const patOffset = sampleDataOffset + pat * patternSize;
    const rows: Note[][] = [];

    for (let row = 0; row < 64; row++) {
      const rowData: Note[] = [];
      for (let ch = 0; ch < channels; ch++) {
        const cellOffset = patOffset + (row * channels + ch) * 4;
        if (cellOffset + 4 > data.length) {
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

        const byte0 = data[cellOffset];
        const byte1 = data[cellOffset + 1];
        const byte2 = data[cellOffset + 2];
        const byte3 = data[cellOffset + 3];

        const period = ((byte0 & 0x0f) << 8) | byte1;
        const sampleNum = ((byte0 & 0xf0) >> 4) | (byte2 & 0xf0);
        const effect = byte2 & 0x0f;
        const effectParam = byte3;

        const noteInfo = noteFromPeriod(period);
        let volume: number | null = effect === 0x0c ? Math.min(effectParam, 64) : null;

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
  for (let i = 0; i < songLength; i++) sequence.push(patternTable[i]);

  return {
    type: 'MOD',
    title,
    samples,
    patterns,
    sequence,
    channels,
    defaultBpm: 125,
    defaultSpeed: 6,
    rowsPerPattern: 64,
  };
}

export function parseXmFile(data: Uint8Array): ModuleFile {
  const headerSize = 60;
  if (data.length < headerSize) throw new Error('Invalid XM file');

  const sig = readString(data, 0, 17);
  if (sig !== 'Extended Module: ') throw new Error('Not an XM file');

  const title = readString(data, 17, 20);
  const headerSize2 = (data[40] << 24) | (data[41] << 16) | (data[42] << 8) | data[43];
  const channels = (data[44] << 8) | data[45];
  const numPatterns = (data[46] << 8) | data[47];
  const numInstruments = (data[48] << 8) | data[49];
  const defaultSpeed2 = (data[52] << 8) | data[53];
  const defaultBpm = (data[54] << 8) | data[55];

  const patternDataOffsets: number[] = [];
  let ptr = headerSize2;
  for (let i = 0; i < numPatterns; i++) {
    patternDataOffsets.push(
      (data[ptr] << 24) | (data[ptr + 1] << 16) | (data[ptr + 2] << 8) | data[ptr + 3]
    );
    ptr += 4;
  }

  const instruments: Sample[] = [];
  for (let i = 0; i < numInstruments; i++) {
    const instHeaderSize =
      ptr + 4 <= data.length
        ? (data[ptr] << 24) | (data[ptr + 1] << 16) | (data[ptr + 2] << 8) | data[ptr + 3]
        : 0;
    const name = readString(data, ptr + 2, 22);
    const numSamples = (data[ptr + 26] << 8) | data[ptr + 27];

    let sampleData = new Float32Array(0);
    if (numSamples > 0 && instHeaderSize > 29) {
      const sampleHeaderSize = 40;
      const sampleDataOffset = ptr + instHeaderSize;
      for (let s = 0; s < numSamples; s++) {
        const sampleLength =
          (data[ptr + 29 + s * sampleHeaderSize] << 24) |
          (data[ptr + 30 + s * sampleHeaderSize] << 16) |
          (data[ptr + 31 + s * sampleHeaderSize] << 8) |
          data[ptr + 32 + s * sampleHeaderSize];
        if (sampleLength > 0 && sampleDataOffset + s * 2 < data.length) {
          const samples = new Float32Array(sampleLength);
          for (let j = 0; j < sampleLength; j++) {
            const b = data[sampleDataOffset + s * sampleLength * 2 + j * 2 + 1];
            samples[j] = b > 127 ? (b - 256) / 128 : b / 128;
          }
          sampleData = samples;
          break;
        }
      }
    }
    instruments.push({
      name: name || `Instrument ${i + 1}`,
      length: sampleData.length,
      finetune: 0,
      volume: 64,
      loopStart: 0,
      loopLength: 0,
      data: sampleData,
    });
    ptr += instHeaderSize;
  }

  const patterns: Pattern[] = [];
  for (let p = 0; p < numPatterns; p++) {
    const patPtr = patternDataOffsets[p];
    const rows = (data[patPtr + 2] << 8) | data[patPtr + 3];
    const patternRows: Note[][] = [];

    let notePtr = patPtr + 8;
    for (let r = 0; r < rows; r++) {
      const rowData: Note[] = [];
      for (let ch = 0; ch < channels; ch++) {
        if (notePtr >= data.length) {
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

        const noteByte = data[notePtr];
        if (noteByte === 0x80) {
          rowData.push({
            note: null,
            octave: null,
            period: 0,
            instrument: 0,
            volume: null,
            effect: 0,
            effectParam: 0,
          });
          notePtr++;
          continue;
        }

        let note: string | null = null;
        let octave: number | null = null;
        let period = 0;
        if ((noteByte & 0x80) === 0) {
          const periodVal = (data[notePtr] << 8) | data[notePtr + 1];
          const noteInfo = noteFromPeriod(periodVal);
          if (noteInfo) {
            note = noteInfo.note;
            octave = noteInfo.octave;
            period = periodVal;
          }
          notePtr += 2;
        }

        let instrument = 0;
        if (notePtr < data.length && (data[notePtr - 1] & 0x80) === 0) {
          instrument = data[notePtr];
          if (instrument > 0 && instrument <= instruments.length) instrument--;
          notePtr++;
        }

        let volume: number | null = null;
        if (
          notePtr < data.length &&
          (data[notePtr - 1] & 0x80) === 0 &&
          data[notePtr] >= 0x10 &&
          data[notePtr] <= 0x50
        ) {
          volume = data[notePtr] - 0x10;
          notePtr++;
        }

        let effect = 0;
        let effectParam = 0;
        if (notePtr < data.length && (data[notePtr - 1] & 0x80) === 0 && data[notePtr] < 0x0f) {
          effect = data[notePtr];
          effectParam = data[notePtr + 1] || 0;
          notePtr += 2;
        } else if (notePtr < data.length) {
          notePtr++;
        }

        rowData.push({ note, octave, period, instrument, volume, effect, effectParam });
      }
      patternRows.push(rowData);
    }
    patterns.push({ rows: patternRows });
  }

  const sequence: number[] = [];
  for (let i = 0; i < Math.min(numPatterns, 256); i++) sequence.push(i);

  return {
    type: 'XM',
    title,
    samples: instruments,
    patterns,
    sequence,
    channels,
    defaultBpm,
    defaultSpeed: defaultSpeed2 || 6,
    rowsPerPattern: Math.max(...patterns.map((p) => p.rows.length), 64),
  };
}

export function parseItFile(data: Uint8Array): ModuleFile {
  if (data.length < 4 || readString(data, 0, 4) !== 'IMPM') throw new Error('Not an IT file');

  const title = readString(data, 4, 26);
  const channels = data[34] || 4;
  const numPatterns = (data[35] << 8) | data[36];
  const numInstruments = (data[37] << 8) | data[38];
  const numSamples = (data[39] << 8) | data[40];
  const defaultSpeed2 = data[41] || 6;
  const defaultBpm = data[42] || 125;

  let ptr = 64;
  const sampleOffsets: number[] = [];
  for (let i = 0; i < numSamples; i++) {
    sampleOffsets.push(
      (data[ptr + 80] << 24) | (data[ptr + 81] << 16) | (data[ptr + 82] << 8) | data[ptr + 83]
    );
    ptr += 89;
  }

  const instruments: Sample[] = [];
  ptr = 64 + numSamples * 89;
  for (let i = 0; i < numInstruments; i++) {
    const name = readString(data, ptr, 26);
    instruments.push({
      name: name || `Instrument ${i + 1}`,
      length: 0,
      finetune: 0,
      volume: 64,
      loopStart: 0,
      loopLength: 0,
      data: new Float32Array(0),
    });
    ptr += 34;
  }

  for (let i = 0; i < numSamples && i < 200; i++) {
    const offset = sampleOffsets[i];
    if (offset > 0 && offset < data.length - 4) {
      const length =
        (data[offset] << 24) |
        (data[offset + 1] << 16) |
        (data[offset + 2] << 8) |
        data[offset + 3];
      const loopStart =
        (data[offset + 4] << 24) |
        (data[offset + 5] << 16) |
        (data[offset + 6] << 8) |
        data[offset + 7];
      const loopLength =
        (data[offset + 8] << 24) |
        (data[offset + 9] << 16) |
        (data[offset + 10] << 8) |
        data[offset + 11];
      const volume = data[offset + 12];
      const finetune = data[offset + 13];

      if (length > 0 && offset + 16 + length <= data.length) {
        const sampleData = new Float32Array(length);
        for (let j = 0; j < length; j++) {
          const b = data[offset + 16 + j];
          sampleData[j] = b > 127 ? (b - 256) / 128 : b / 128;
        }

        const existing = instruments[i] || {
          name: `Sample ${i + 1}`,
          length: 0,
          finetune: 0,
          volume: 64,
          loopStart: 0,
          loopLength: 0,
          data: new Float32Array(0),
        };
        instruments[i] = {
          ...existing,
          length,
          finetune,
          volume: volume > 64 ? 64 : volume,
          loopStart,
          loopLength,
          data: sampleData,
        };
      }
    }
  }

  const orderList: number[] = [];
  const orderPtr = 4 + 2 + 2 + 2 + 2 + 2 + 2 + 2 + 2 + 2 + 2 + 4 + 128 + 2;
  const orderCount =
    (data[4 + 2 + 2 + 2 + 2 + 2 + 2 + 2 + 2 + 2 + 2 + 4 + 128] << 8) |
    data[4 + 2 + 2 + 2 + 2 + 2 + 2 + 2 + 2 + 2 + 2 + 4 + 128 + 1];
  for (let i = 0; i < orderCount && i < 256; i++) orderList.push(data[orderPtr + i]);

  const patternOffsets: number[] = [];
  let patternPtr = 4 + 2 + 2 + 2 + 2 + 2 + 2 + 2 + 2 + 2 + 2 + 4 + 128 + 2 + orderCount;
  for (let i = 0; i < numPatterns; i++) {
    patternOffsets.push(
      (data[patternPtr + 1] << 16) | (data[patternPtr + 2] << 8) | data[patternPtr + 3]
    );
    patternPtr += 4;
  }

  const patterns: Pattern[] = [];
  for (let p = 0; p < numPatterns; p++) {
    const patOffset = patternOffsets[p];
    if (patOffset === 0 || patOffset >= data.length) {
      patterns.push({
        rows: Array(64)
          .fill(null)
          .map(() =>
            Array(channels).fill({
              note: null,
              octave: null,
              period: 0,
              instrument: 0,
              volume: null,
              effect: 0,
              effectParam: 0,
            })
          ),
      });
      continue;
    }

    const rowCount = (data[patOffset + 2] << 8) | data[patOffset + 3];
    const patternRows: Note[][] = [];
    let notePtr = patOffset + 8;

    for (let r = 0; r < Math.max(rowCount, 64); r++) {
      const rowData: Note[] = [];
      for (let ch = 0; ch < channels; ch++) {
        if (notePtr >= data.length) {
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

        const noteValue = data[notePtr];
        if (noteValue === 0) {
          rowData.push({
            note: null,
            octave: null,
            period: 0,
            instrument: 0,
            volume: null,
            effect: 0,
            effectParam: 0,
          });
          notePtr++;
          continue;
        }

        let note: string | null = null;
        let octave: number | null = null;
        let period = 0;
        if ((noteValue & 0x80) === 0) {
          const noteIndex = noteValue - 1;
          const periodTable = [
            1712, 1616, 1525, 1440, 1357, 1281, 1209, 1141, 1077, 1017, 961, 907, 856, 808, 762,
            720, 678, 640, 604, 570, 538, 508, 480, 453, 428, 404, 381, 360, 339, 320, 302, 285,
            269, 254, 240, 226, 214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113, 107,
            101, 95, 90, 85, 80, 76, 71, 67, 64, 60, 57,
          ];
          if (noteIndex >= 0 && noteIndex < periodTable.length) {
            period = periodTable[noteIndex];
            const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
            note = noteNames[Math.floor(noteIndex / 12)];
            octave = Math.floor(noteIndex / 12);
          }
          const inst = data[notePtr + 1];
          const volbyte = data[notePtr + 2];
          const eff = data[notePtr + 3];
          const effParam = data[notePtr + 4];
          let volume: number | null = null;
          if (volbyte >= 1 && volbyte <= 64) volume = volbyte;
          else if (volbyte >= 65 && volbyte <= 74) volume = volbyte - 65;
          rowData.push({
            note,
            octave,
            period,
            instrument: inst - 1,
            volume,
            effect: eff,
            effectParam: effParam,
          });
          notePtr += 4;
        } else {
          notePtr++;
          if (noteValue & 0x01) {
            notePtr++;
          }
          if (noteValue & 0x02) {
            notePtr++;
          }
          if (noteValue & 0x04) {
            notePtr++;
          }
          if (noteValue & 0x08) {
            notePtr++;
          }
          if (noteValue & 0x10) {
            notePtr++;
          }
          if (noteValue & 0x20) {
            notePtr++;
          }
          rowData.push({
            note: null,
            octave: null,
            period: 0,
            instrument: 0,
            volume: null,
            effect: 0,
            effectParam: 0,
          });
        }
      }
      patternRows.push(rowData);
    }
    patterns.push({ rows: patternRows });
  }

  return {
    type: 'IT',
    title,
    samples: instruments,
    patterns,
    sequence: orderList.filter((o) => o < numPatterns),
    channels,
    defaultBpm,
    defaultSpeed: defaultSpeed2,
    rowsPerPattern: Math.max(...patterns.map((p) => p.rows.length), 64),
  };
}

export function parseModule(data: Uint8Array): ModuleFile {
  const header = readString(data, 0, 4);
  if (header === 'IMPM') {
    return parseItFile(data);
  }
  if (readString(data, 0, 17) === 'Extended Module: ') {
    return parseXmFile(data);
  }
  return parseModFile(data);
}
