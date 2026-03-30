import type { ModuleFile, Instrument, Note, Pattern, Sample } from './types';
import { BaseParser } from './base-parser';
import { decompressIT8, decompressIT16 } from './it-decompress';

// Minimal IT Parser stub. Full IT implementation involves deeply stateful packing. 
// We parse the headers and basic fields to remain compatible with older toolkit requirements.
export class ItParser extends BaseParser {
  parse(): ModuleFile {
    if (this.data.length < 192 || this.readStr(4) !== 'IMPM') throw new Error("Not an IT file");
    
    this.setPos(4);
    const title = this.readStr(26).trim();
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
    this.readU8(); // _initVol
    
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

    const rawSamples: Sample[] = [];
    for(let i=0; i<smpNum; i++) {
        let name = `Sample ${i+1}`;
        let sampleData = new Float32Array(0);
        let smpLength = 0;
        let loopStart = 0;
        let loopLength = 0;
        let _c5speed = 8363;
        let sVol = 64;
        let isPingPong = false;
        let hasLoop = false;

        if (dataOffsets.smp[i] > 0) {
            this.setPos(dataOffsets.smp[i]);
            if (this.readStr(4) === 'IMPS') {
                this.readStr(12); // dos filename
                this.readU8(); // zeroes
                this.readU8(); // _gVol
                const sFlags = this.readU8();
                sVol = this.readU8();
                name = this.readStr(26).trim();
                const cvt = this.readU8();
                this.readU8(); // _dfp
                smpLength = this.readU32LE();
                loopStart = this.readU32LE();
                const loopEnd = this.readU32LE();
                
                hasLoop = (sFlags & 16) !== 0;
                isPingPong = (sFlags & 64) !== 0;
                
                if (hasLoop) loopLength = loopEnd - loopStart;
                
                _c5speed = this.readU32LE();    // C5 Speed
                this.readU32LE(); // _susLoopStart
                this.readU32LE(); // _susLoopEnd
                const samplePointer = this.readU32LE();
                
                if (samplePointer > 0 && samplePointer < this.data.length && smpLength > 0) { 
                   this.setPos(samplePointer);
                   const is16 = (sFlags & 2) !== 0;
                   const isSigned = (cvt & 1) !== 0; // standard IT samples are signed if cvt & 1 = 1
                   const isCompressed = (sFlags & 8) !== 0;
                   
                   if (isCompressed) {
                       if (is16) {
                           sampleData = decompressIT16(this.data, this.pos, smpLength, isSigned) as Float32Array;
                       } else {
                           sampleData = decompressIT8(this.data, this.pos, smpLength, isSigned) as Float32Array;
                       }
                   } else {
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
                   
                   // Unroll pingpong loops
                   if (hasLoop && isPingPong && loopLength > 0) {
                       let lend = loopStart + loopLength;
                       if (lend > smpLength) lend = smpLength;
                       loopLength = lend - loopStart;
                       const newData = new Float32Array(lend + loopLength);
                       for(let j=0; j<lend; j++) newData[j] = sampleData[j];
                       for(let j=0; j<loopLength; j++) newData[lend + j] = sampleData[lend - 1 - j];
                       sampleData = newData;
                       loopLength *= 2;
                       smpLength = sampleData.length;
                   }
                }
            }
        }
        
        rawSamples.push({
            name,
            length: smpLength,
            finetune: 0,
            volume: Math.min(sVol, 64),
            loopStart,
            loopLength: hasLoop ? loopLength : 0,
            panning: 128,
            baseNote: 0,
            data: sampleData,
            c5speed: _c5speed
        });
    }

    const instruments: Instrument[] = [];
    if ((flags & 4) !== 0 && insNum > 0) {
        // Use true IT Instruments
        for (let i = 0; i < insNum; i++) {
            let name = `Instrument ${i+1}`;
            let volFadeout = 0;
            let sampleMap = new Array(120).fill(-1);
            if (dataOffsets.ins[i] > 0) {
                this.setPos(dataOffsets.ins[i]);
                if (this.readStr(4) === 'IMPI') {
                    this.readStr(12); // dos
                    this.readU8(); // zero
                    this.readU8(); // nna
                    this.readU16LE(); // trc
                    volFadeout = this.readU16LE();
                    this.setPos(dataOffsets.ins[i] + 32);
                    name = this.readStr(26).trim();
                    this.setPos(dataOffsets.ins[i] + 64);
                    // 120 note pairs (note, sample index)
                    for (let n = 0; n < 120; n++) {
                        this.readU8(); // translated note (unused)
                        const smp = this.readU8(); // 1-255, 0 = no sample
                        sampleMap[n] = smp === 0 ? -1 : smp - 1;
                    }
                }
            }
            instruments.push({
                name,
                volumeFadeout: volFadeout,
                sampleMap,
                samples: rawSamples
            });
        }
    } else {
        // Sample Mode, strictly 1:1 mapped
        for (let i = 0; i < rawSamples.length; i++) {
             const smaps = new Array(120).fill(i);
             instruments.push({
                 name: rawSamples[i].name,
                 volumeFadeout: 0,
                 sampleMap: smaps,
                 samples: rawSamples
             });
        }
    }

    const patterns: Pattern[] = [];
    for(let i=0; i<patNum; i++) {
        if (dataOffsets.pat[i] === 0) {
            patterns.push({ rows: Array(64).fill(null).map(() => Array(channels).fill({note:null, instrument:0, volume:null, effect:0, effectParam:0}))});
            continue;
        }
        this.setPos(dataOffsets.pat[i]);
        this.readU16LE(); // _pLen
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
