import type { ModuleFile, Instrument, Note, Pattern } from './types';
import { AMIGA_PERIOD_TABLE, PAL_CLOCK } from './types';
import { BaseParser } from './base-parser';

export function getModNoteFromPeriod(period: number): number | null {
  if (period === 0) return null;
  let closestDist = Infinity;
  let closestIdx = -1;
  for (let i = 0; i < AMIGA_PERIOD_TABLE.length; i++) {
    const dist = Math.abs(AMIGA_PERIOD_TABLE[i] - period);
    if (dist < closestDist) {
      closestDist = dist;
      closestIdx = i;
    }
  }
  return closestIdx >= 0 ? closestIdx + 1 : null;
}

export class ModParser extends BaseParser {
  parse(): ModuleFile {
    this.setPos(1080);
    const marker = this.readStr(4);
    let channels = 4;
    let is15Sample = false;

    const markerUpper = marker.toUpperCase();
    // Standard 31-sample markers: M.K., M!K!, FLT4, FLT8, 4CHN, 6CHN, 8CHN, XXCH, XXCN, etc.
    if (markerUpper === 'M.K.' || markerUpper === 'M!K!' || markerUpper === 'FLT4') {
      channels = 4;
    } else if (markerUpper === 'FLT8') {
      channels = 8;
    } else if (markerUpper.endsWith('CHN') || markerUpper.endsWith('CH')) {
      const numStr = markerUpper.replace(/[^0-9]/g, '');
      channels = parseInt(numStr) || 4;
    } else if (markerUpper.endsWith('CN')) {
       // StarTrekker 4CN, 8CN
       const numStr = markerUpper.replace(/[^0-9]/g, '');
       channels = parseInt(numStr) || 4;
    } else if (['OKTA', 'OCTA', 'CD81'].includes(markerUpper)) {
      channels = 8;
    } else {
      // No standard 31-sample marker found at 1080, assume 15-sample legacy MOD
      is15Sample = true;
      channels = 4;
    }

    this.setPos(0);
    const title = this.readStr(20).trim();
    const instruments: Instrument[] = [];

    // Reading samples (15 or 31)
    const numSamples = is15Sample ? 15 : 31;
    for (let i = 0; i < numSamples; i++) {
      this.setPos(20 + i * 30);
      const name = this.readStr(22).trim();
      const lenWords = this.readU16BE();
      const length = lenWords * 2;
      const fineNibble = this.readU8() & 0x0f;
      const finetune = fineNibble > 7 ? fineNibble - 16 : fineNibble; // 4-bit signed
      let volume = this.readU8();
      volume = Math.min(volume, 64);
      const loopStartWords = this.readU16BE();
      const loopStart = loopStartWords * 2;
      const loopLenWords = this.readU16BE();
      const loopLength = loopLenWords > 1 ? loopLenWords * 2 : 0;

      instruments.push({
        name: name || `Instrument ${i + 1}`,
        samples: [
          {
            name: name,
            length,
            finetune,
            volume,
            loopStart,
            loopLength,
            panning: 128,
            data: new Float32Array(length),
          },
        ],
        sampleMap: new Array(120).fill(0),
        volumeFadeout: 0,
      });
    }

    // Positions differ between 15 and 31 sample MODs
    const infoPos = is15Sample ? 470 : 950;
    this.setPos(infoPos);
    const songLength = this.readU8();
    const restartPosition = this.readU8();
    const sequence: number[] = [];
    for (let i = 0; i < 128; i++) {
      sequence.push(this.readU8());
    }

    const numPatterns = Math.max(...sequence.slice(0, songLength)) + 1;
    const patterns: Pattern[] = [];
    const patternStart = is15Sample ? 600 : 1084;
    this.setPos(patternStart);

    for (let pat = 0; pat < numPatterns; pat++) {
      const rows: Note[][] = [];
      for (let r = 0; r < 64; r++) {
        const row: Note[] = [];
        for (let c = 0; c < channels; c++) {
          const b0 = this.readU8();
          const b1 = this.readU8();
          const b2 = this.readU8();
          const b3 = this.readU8();

          const instrument = (b0 & 0xf0) | ((b2 & 0xf0) >> 4);
          const period = ((b0 & 0x0f) << 8) | b1;
          const effect = b2 & 0x0f;
          const effectParam = b3;
          let volume: number | null = null;
          if (effect === 0x0c) volume = Math.min(effectParam, 64);

          row.push({
            note: getModNoteFromPeriod(period),
            period: period === 0 ? null : period,
            instrument,
            volume,
            volumeColumn: null,
            effect,
            effectParam,
          });
        }
        rows.push(row);
      }
      patterns.push({ rows });
    }

    // Load samples (signed 8-bit PCM)
    for (let i = 0; i < instruments.length; i++) {
      const smp = instruments[i].samples[0];
      if (smp.length > 0 && this.pos + smp.length <= this.data.length) {
        for (let j = 0; j < smp.length; j++) {
          const b = this.data[this.pos++];
          const signed = b > 127 ? b - 256 : b;
          smp.data[j] = signed / 128;
        }
      }
    }

    const clock = PAL_CLOCK;

    return {
      type: 'MOD',
      title,
      instruments,
      patterns,
      sequence: sequence.slice(0, songLength),
      channels,
      defaultBpm: 125,
      defaultSpeed: 6,
      rowsPerPattern: 64,
      linearFrequencies: false,
      clock,
      restartPosition: restartPosition < songLength ? restartPosition : 0,
    };
  }
}
