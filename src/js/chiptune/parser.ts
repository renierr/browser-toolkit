import type { ModuleFile, Instrument, Note, Pattern, Sample } from './types';
import { AMIGA_PERIOD_TABLE, readString } from './types';

export abstract class BaseParser {
  protected data: Uint8Array;
  protected pos = 0;

  constructor(data: Uint8Array) {
    this.data = data;
    this.pos = 0;
  }

  protected readU8(): number {
    return this.pos < this.data.length ? this.data[this.pos++] : 0;
  }

  protected readS8(): number {
    const v = this.readU8();
    return v > 127 ? v - 256 : v;
  }

  protected readU16LE(): number {
    if (this.pos + 1 >= this.data.length) return 0;
    const v = this.data[this.pos] | (this.data[this.pos + 1] << 8);
    this.pos += 2;
    return v;
  }

  protected readU16BE(): number {
    if (this.pos + 1 >= this.data.length) return 0;
    const v = (this.data[this.pos] << 8) | this.data[this.pos + 1];
    this.pos += 2;
    return v;
  }

  protected readU32LE(): number {
    if (this.pos + 3 >= this.data.length) return 0;
    const v = (this.data[this.pos] | (this.data[this.pos + 1] << 8) | (this.data[this.pos + 2] << 16) | (this.data[this.pos + 3] << 24)) >>> 0;
    this.pos += 4;
    return v;
  }

  protected readStr(len: number): string {
    const s = readString(this.data, this.pos, len);
    this.pos += len;
    return s;
  }

  protected setPos(offset: number): void {
    if (offset >= 0 && offset <= this.data.length) {
      this.pos = offset;
    }
  }

  abstract parse(): ModuleFile;
}

function getModNoteFromPeriod(period: number): number | null {
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
  // Base note C-1 starts at note=1
  return closestIdx >= 0 ? closestIdx + 1 : null;
}

export class ModParser extends BaseParser {
  parse(): ModuleFile {
    if (this.data.length < 1084) throw new Error("Invalid MOD file size");
    
    this.setPos(0);
    const title = this.readStr(20);
    const instruments: Instrument[] = [];
    
    // 31 samples
    for (let i = 0; i < 31; i++) {
      this.setPos(20 + i * 30);
      const name = this.readStr(22);
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
        samples: [{
          name: name,
          length,
          finetune,
          volume,
          loopStart,
          loopLength,
          panning: 128,
          data: new Float32Array(length)
        }],
        sampleMap: new Array(120).fill(0),
        volumeFadeout: 0
      });
    }

    this.setPos(950);
    const songLength = this.readU8();
    this.readU8(); // skip
    const sequence: number[] = [];
    for (let i = 0; i < 128; i++) {
      sequence.push(this.readU8());
    }

    this.setPos(1080);
    const marker = this.readStr(4);
    let channels = 4;
    const markerUpper = marker.toUpperCase();
    if (markerUpper.includes('6CHN')) channels = 6;
    else if (markerUpper.includes('8CHN')) channels = 8;
    else if (markerUpper.includes('CH')) {
      const parsed = parseInt(marker.replace(/[^0-9]/g, ''));
      if (!isNaN(parsed) && parsed > 0) channels = parsed;
    } else if (markerUpper === 'M.K.' || markerUpper === 'M!K!' || markerUpper === 'FLT4') channels = 4;

    const numPatterns = Math.max(...sequence.slice(0, songLength)) + 1;
    const patterns: Pattern[] = [];
    this.setPos(1084);
    
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
            effect,
            effectParam
          });
        }
        rows.push(row);
      }
      patterns.push({ rows });
    }

    // Load samples
    for (let i = 0; i < instruments.length; i++) {
      const smp = instruments[i].samples[0];
      if (smp.length > 0 && this.pos + smp.length <= this.data.length) {
        for (let j = 0; j < smp.length; j++) {
          const b = this.data[this.pos++];
          smp.data[j] = b > 127 ? (b - 256) / 128 : b / 128;
        }
      }
    }

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
      linearFrequencies: false
    };
  }
}

export class XmParser extends BaseParser {
  parse(): ModuleFile {
    if (this.data.length < 60) throw new Error("Invalid XM file size");
    this.setPos(0);
    const sig = this.readStr(17);
    if (sig !== 'Extended Module: ') throw new Error("Not XM signature");
    const title = this.readStr(20);
    this.readU8(); // 0x1A
    this.readStr(20); // tracker name
    this.readU16LE(); // version
    const headerSize = this.readU32LE();
    const songLength = this.readU16LE();
    this.readU16LE(); // restart
    const channels = this.readU16LE();
    const numPatterns = this.readU16LE();
    const numInstruments = this.readU16LE();
    const flags = this.readU16LE();
    const linearFrequencies = (flags & 1) !== 0;
    const defaultSpeed = this.readU16LE();
    const defaultBpm = this.readU16LE();

    const sequence: number[] = [];
    for (let i = 0; i < 256; i++) {
      const order = this.readU8();
      if (i < songLength) sequence.push(order);
    }
    
    // Jump past header
    this.setPos(60 + headerSize);

    const patterns: Pattern[] = [];
    for (let p = 0; p < numPatterns; p++) {
      const _pHeaderSize = this.readU32LE();
      const _packingType = this.readU8();
      const numRows = this.readU16LE() || 64;
      const packedSize = this.readU16LE();
      
      const patDataOffset = this.pos;
      const rows: Note[][] = [];
      let r = 0;
      let c = 0;
      let rowData: Note[] = [];
      
      while (r < numRows) {
        let note: number | null = null;
        let instrument = 0;
        let volume: number | null = null;
        let effect = 0;
        let effectParam = 0;
        
        if (packedSize > 0 && this.pos < patDataOffset + packedSize) {
          let mask = this.readU8();
          if ((mask & 0x80) === 0) {
            // Uncompressed, the byte read was actually the note
            // XM note: 1-96, 97 is Key off
            note = mask;
            mask = 0x1E; // 2|4|8|16
          } else {
            if (mask & 1) note = this.readU8();
          }
          if (mask & 2) instrument = this.readU8();
          if (mask & 4) volume = this.readU8(); // 0x10-0x50 is volume 0-64
          if (mask & 8) effect = this.readU8();
          if (mask & 16) effectParam = this.readU8();
        }
        
        // Map volume column
        let mappedVol = null;
        if (volume !== null) {
          if (volume >= 0x10 && volume <= 0x50) mappedVol = volume - 0x10;
          // Vol pan, effects omitted for simplicity, left mapped to volume
        }

        rowData.push({
          note: note === 97 ? 97 : (note && note > 0 && note < 97 ? note : null),
          period: null,
          instrument,
          volume: mappedVol,
          effect,
          effectParam
        });
        
        c++;
        if (c >= channels) {
          rows.push(rowData);
          rowData = [];
          c = 0;
          r++;
        }
      }
      this.setPos(patDataOffset + packedSize);
      patterns.push({ rows });
    }

    const instruments: Instrument[] = [];
    for (let i = 0; i < numInstruments; i++) {
      const iSize = this.readU32LE();
      const name = this.readStr(22);
      this.readU8(); // type
      const numSamples = this.readU16LE();
      
      let sampleMap = new Array(96).fill(0);
      let volFadeout = 0;
      if (numSamples > 0) {
        this.readU32LE(); // sh size
        for(let z=0; z<96; z++) sampleMap[z] = this.readU8(); // sample map
        // read envelopes here ideally, skip for now.
        // the remaining of the instrument header:
      }
      const dataOffset = this.pos - 29 + iSize; // jump past instrument header
      this.setPos(dataOffset);

      const samples: Sample[] = [];
      const sampleHeaders: any[] = [];
      // Read sample headers
      for (let s = 0; s < numSamples; s++) {
        const slen = this.readU32LE();
        const loopStart = this.readU32LE();
        const loopLength = this.readU32LE();
        const sVol = this.readU8();
        const sFine = this.readS8();
        const type = this.readU8();
        const sPan = this.readU8();
        const relNote = this.readS8();
        this.readU8(); // res
        this.readStr(22); // name
        sampleHeaders.push({ slen, loopStart, loopLength, sVol, sFine, type, sPan, relNote });
      }

      // Read sample data
      for (let s = 0; s < numSamples; s++) {
        const sh = sampleHeaders[s];
        const is16 = (sh.type & 16) !== 0;
        const lengthFrames = is16 ? sh.slen / 2 : sh.slen;
        const floatData = new Float32Array(lengthFrames);
        let old = 0;
        for (let j = 0; j < lengthFrames; j++) {
          if (is16) {
            const low = this.readU8();
            let high = this.readU8();
            if (high > 127) high -= 256;
            let combined = low | (high << 8);
            if (combined >= 32768) combined -= 65536; // signed 16-bit
            old = (old + combined) & 0xffff;
            let val = old >= 32768 ? old - 65536 : old;
            floatData[j] = val / 32768;
          } else {
            const d = this.readS8();
            old = (old + d) & 0xff;
            let val = old >= 128 ? old - 256 : old;
            floatData[j] = val / 128;
          }
        }
        samples.push({
          name: name,
          length: lengthFrames,
          finetune: sh.sFine,
          volume: Math.min(sh.sVol, 64),
          loopStart: is16 ? sh.loopStart / 2 : sh.loopStart,
          loopLength: (sh.type & 3) !== 0 ? (is16 ? sh.loopLength / 2 : sh.loopLength) : 0,
          panning: sh.sPan,
          baseNote: sh.relNote,
          data: floatData
        });
      }

      instruments.push({
        name: name || `Instrument ${i + 1}`,
        samples,
        sampleMap,
        volumeFadeout: volFadeout
      });
    }

    return {
      type: 'XM',
      title,
      instruments,
      patterns,
      sequence,
      channels,
      defaultBpm,
      defaultSpeed,
      rowsPerPattern: Math.max(...patterns.map(p => p.rows.length), 64),
      linearFrequencies
    };
  }
}

// Minimal IT Parser stub. Full IT implementation involves deeply stateful packing. 
// We parse the headers and basic fields to remain compatible with older toolkit requirements.
export class ItParser extends BaseParser {
  parse(): ModuleFile {
    if (this.data.length < 192 || this.readStr(4) !== 'IMPM') throw new Error("Not an IT file");
    
    this.setPos(4);
    const title = this.readStr(26);
    this.setPos(32);
    const ordNum = this.readU16LE();
    const insNum = this.readU16LE();
    const smpNum = this.readU16LE();
    const patNum = this.readU16LE();
    this.setPos(48);
    const flags = this.readU16LE();
    this.setPos(52);
    const initSpeed = this.readU8();
    const initTempo = this.readU8();
    this.readU8(); // sepx
    const _initVol = this.readU8();
    
    // Jump to channel pan
    this.setPos(64);
    const chanPan = [];
    for(let i=0; i<64; i++) chanPan.push(this.readU8());
    // Channel vols
    const chanVol = [];
    for(let i=0; i<64; i++) chanVol.push(this.readU8());

    const sequence: number[] = [];
    for(let i=0; i<ordNum; i++) sequence.push(this.readU8());

    const maxChannels = chanPan.filter(p => !(p & 128)).length;
    const channels = maxChannels;

    const dataOffsets = { ins: [] as number[], smp: [] as number[], pat: [] as number[] };
    for(let i=0; i<insNum; i++) dataOffsets.ins.push(this.readU32LE());
    for(let i=0; i<smpNum; i++) dataOffsets.smp.push(this.readU32LE());
    for(let i=0; i<patNum; i++) dataOffsets.pat.push(this.readU32LE());

    const instruments: Instrument[] = [];
    // Just map Samples as Instruments for minimal loading
    for(let i=0; i<smpNum; i++) {
        let name = `Instrument ${i+1}`;
        let sampleData = new Float32Array(0);
        let smpLength = 0;
        let loopStart = 0;
        let loopLength = 0;
        let _c5speed = 8363;
        let sVol = 64;

        if (dataOffsets.smp[i] > 0) {
            this.setPos(dataOffsets.smp[i]);
            if (this.readStr(4) === 'IMPS') {
                this.readStr(12); // dos filename
                this.readU8(); // zeroes
                const _gVol = this.readU8();
                const flags = this.readU8();
                sVol = this.readU8();
                name = this.readStr(26);
                const cvt = this.readU8();
                const _dfp = this.readU8();
                smpLength = this.readU32LE();
                loopStart = this.readU32LE();
                const loopEnd = this.readU32LE();
                if ((flags & 16) !== 0) loopLength = loopEnd - loopStart;
                _c5speed = this.readU32LE();    // C5 Speed
                const _susLoopStart = this.readU32LE();
                const _susLoopEnd = this.readU32LE();
                const samplePointer = this.readU32LE();
                
                if (samplePointer > 0 && samplePointer < this.data.length && smpLength > 0 && (flags & 8) === 0) { // non-compressed
                   this.setPos(samplePointer);
                   const is16 = (flags & 2) !== 0;
                   const isSigned = (cvt & 1) !== 0; // standard IT samples are signed if cvt & 1 = 1
                   sampleData = new Float32Array(smpLength);
                   for(let j=0; j<smpLength; j++) {
                     if (is16) {
                        let v = this.readU16LE();
                        if (isSigned && v >= 32768) v -= 65536;
                        else if (!isSigned) v -= 32768;
                        sampleData[j] = v / 32768;
                     } else {
                        let v = this.readU8();
                        if (isSigned) { if (v >= 128) v -= 256; }
                        else { v -= 128; }
                        sampleData[j] = v / 128;
                     }
                   }
                }
            }
        }

        instruments.push({
            name,
            volumeFadeout: 0,
            sampleMap: new Array(120).fill(0),
            samples: [{
                name,
                length: smpLength,
                finetune: 0, // IT uses C5Speed instead
                volume: Math.min(sVol, 64),
                loopStart,
                loopLength,
                panning: 128,
                data: sampleData,
                baseNote: 0, // To be mapped via C5Speed in player
                c5speed: _c5speed
            }]
        });
    }

    const patterns: Pattern[] = [];
    for(let i=0; i<patNum; i++) {
        if (dataOffsets.pat[i] === 0) {
            patterns.push({ rows: Array(64).fill(null).map(() => Array(channels).fill({note:null, instrument:0, volume:null, effect:0, effectParam:0}))});
            continue;
        }
        this.setPos(dataOffsets.pat[i]);
        const _pLen = this.readU16LE();
        const pRows = this.readU16LE();
        this.readU32LE(); // junk
        let r = 0;
        const rows: Note[][] = [];
        let chState = Array(64).fill(null).map(() => ({ mask: 0, note: null as number | null, inst: 0, vol: null as number | null, cmd: 0, param: 0 }));
        
        while (r < pRows) {
            const row: Note[] = [];
            for(let c=0; c<channels; c++) row.push({ note: null, period: null, instrument: 0, volume: null, effect: 0, effectParam: 0 });
            
            while (true) {
                const b = this.readU8();
                if (b === 0) break; // end of row
                const ch = (b & 127) - 1;
                let mask = 0;
                if (b & 128) mask = this.readU8();
                else mask = ch >= 0 ? chState[ch]?.mask || 0 : 0;
                
                if (ch >= 0 && ch < 64) {
                    chState[ch].mask = mask;
                    let hasNote = false;
                    let hasInst = false;
                    let hasVol = false;
                    let hasCmd = false;

                    if (mask & 1) { chState[ch].note = this.readU8(); hasNote = true; }
                    if (mask & 2) { chState[ch].inst = this.readU8(); hasInst = true; }
                    if (mask & 4) { chState[ch].vol = this.readU8(); hasVol = true; }
                    if (mask & 8) { 
                        chState[ch].cmd = this.readU8(); 
                        chState[ch].param = this.readU8(); 
                        hasCmd = true; 
                    }

                    if (mask & 16) hasNote = true;
                    if (mask & 32) hasInst = true;
                    if (mask & 64) hasVol = true;
                    if (mask & 128) hasCmd = true;

                    if (ch < channels) {
                        let logicalNote = null;
                        if (hasNote) {
                            let note = chState[ch].note;
                            if (note !== null && note < 120) logicalNote = note + 1;
                            else if (note === 255 || note === 254) logicalNote = 97; // KeyOff
                        }

                        row[ch] = {
                            note: logicalNote,
                            period: null, // Computed linearly dynamically
                            instrument: hasInst ? (chState[ch].inst || 0) : 0,
                            volume: hasVol && chState[ch].vol !== null && chState[ch].vol <= 64 ? chState[ch].vol : null,
                            effect: hasCmd ? (chState[ch].cmd || 0) : 0,
                            effectParam: hasCmd ? (chState[ch].param || 0) : 0
                        };
                    }
                }
            }
            rows.push(row);
            r++;
        }
        patterns.push({ rows });
    }

    return {
      type: 'IT',
      title,
      instruments,
      patterns,
      sequence: sequence.filter(o => o < 254),
      channels,
      defaultBpm: initTempo,
      defaultSpeed: initSpeed,
      rowsPerPattern: Math.max(...patterns.map(p => p.rows.length), 64),
      linearFrequencies: (flags & 8) !== 0
    };
  }
}

export function parseModule(data: Uint8Array): ModuleFile {
  const impm = readString(data, 0, 4);
  if (impm === 'IMPM') return new ItParser(data).parse();
  const extMod = readString(data, 0, 17);
  if (extMod === 'Extended Module: ') return new XmParser(data).parse();
  return new ModParser(data).parse();
}
