import type { ModuleFile } from '../../js/chiptune/types';
import { calculatePeriod, ROWS_PER_PATTERN } from './note-utils';

export function serializeMod(m: ModuleFile): Blob {
  if (m.type !== 'MOD') {
    console.warn('[ChiptuneTracker] Export only supports MOD format currently');
  }

  const parts: Uint8Array[] = [];

  // Title (20 bytes)
  const title = new Uint8Array(20);
  title.set(new TextEncoder().encode(m.title.substring(0, 20)));
  parts.push(title);

  // 31 samples (30 bytes each)
  for (let i = 0; i < 31; i++) {
    const sample = new Uint8Array(30);
    const inst = m.instruments[i];
    const sampleData = inst?.samples[0];

    if (inst) {
      sample.set(new TextEncoder().encode(inst.name.substring(0, 22)));
    }

    if (sampleData) {
      // MOD stores lengths in WORDS (2-byte units), big-endian
      const lenWords = Math.min(Math.floor(sampleData.length / 2), 0xffff);
      sample[22] = (lenWords >> 8) & 0xff;
      sample[23] = lenWords & 0xff;
      sample[24] = sampleData.finetune & 0x0f;
      sample[25] = Math.min(sampleData.volume, 64);
      const loopStartWords = Math.min(Math.floor(sampleData.loopStart / 2), 0xffff);
      sample[26] = (loopStartWords >> 8) & 0xff;
      sample[27] = loopStartWords & 0xff;
      const loopLenWords = Math.min(Math.floor(sampleData.loopLength / 2), 0xffff);
      sample[28] = (loopLenWords >> 8) & 0xff;
      sample[29] = loopLenWords & 0xff;
    }

    parts.push(sample);
  }

  // Song length + unused byte
  parts.push(new Uint8Array([Math.min(m.sequence.length, 128)]));
  parts.push(new Uint8Array([0]));

  // Pattern table (128 bytes)
  const patternTable = new Uint8Array(128);
  for (let i = 0; i < 128; i++) {
    patternTable[i] = i < m.sequence.length ? m.sequence[i] : 0;
  }
  parts.push(patternTable);

  // Format marker
  parts.push(new TextEncoder().encode('M.K.'));

  // Pattern data
  const numPatterns = Math.max(...m.sequence) + 1;
  for (let p = 0; p < numPatterns; p++) {
    const pattern = m.patterns[p];
    if (!pattern) continue;
    for (let r = 0; r < ROWS_PER_PATTERN; r++) {
      for (let ch = 0; ch < m.channels; ch++) {
        const cell = pattern.rows[r]?.[ch];
        if (!cell) {
          parts.push(new Uint8Array([0, 0, 0, 0]));
          continue;
        }

        let period = cell.period || 0;
        if (!period && cell.note && cell.note > 0 && cell.note <= 96) {
          period = calculatePeriod(cell.note);
        }

        const sampleNum = Math.min(cell.instrument || 0, 0x1f);
        const effect = cell.effect || 0;
        const effectParam = cell.effectParam || 0;

        const byte0 = ((sampleNum & 0x10) << 4) | ((period >> 8) & 0x0f);
        const byte1 = period & 0xff;
        const byte2 = ((sampleNum & 0x0f) << 4) | (effect & 0x0f);
        const byte3 = effectParam & 0xff;

        parts.push(new Uint8Array([byte0, byte1, byte2, byte3]));
      }
    }
  }

  // Sample data (word-aligned)
  for (let i = 0; i < 31; i++) {
    const inst = m.instruments[i];
    const sampleData = inst?.samples[0];
    if (sampleData && sampleData.data && sampleData.data.length > 0) {
      const len = Math.min(sampleData.length, 0xffff);
      const int8 = new Int8Array(len);
      for (let j = 0; j < len; j++) {
        int8[j] = Math.max(-128, Math.min(127, Math.round(sampleData.data[j] * 127)));
      }
      parts.push(new Uint8Array(int8.buffer));
      if (len % 2 !== 0) {
        parts.push(new Uint8Array([0]));
      }
    }
  }

  const totalLen = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }

  return new Blob([result], { type: 'audio/x-mod' });
}
