import type { ModuleFile, Instrument, Note, Pattern, Sample } from './types';
import { BaseParser } from './base-parser';

export class XmParser extends BaseParser {
  parse(): ModuleFile {
    if (this.data.length < 60) throw new Error("Invalid XM file size");
    this.setPos(0);
    const sig = this.readStr(17);
    if (!sig.startsWith('Extended Module:')) throw new Error("Not XM signature");
    const title = this.readStr(20).trim();
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
      this.readU32LE(); // _pHeaderSize
      this.readU8(); // _packingType
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
      const insStart = this.pos;
      const iSize = this.readU32LE();
      const name = this.readStr(22).trim();
      this.readU8(); // type
      const numSamples = this.readU16LE();
      
      let sampleMap = new Array(96).fill(0);
      let volFadeout = 0;
      if (numSamples > 0) {
        this.readU32LE(); // sh size
        for(let z=0; z<96; z++) sampleMap[z] = this.readU8(); // sample map
        // read envelopes here ideally, skip for now.
      }
      // Accurately jump to the end of the Instrument Header using absolute starting position
      this.setPos(insStart + iSize);

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
        this.readStr(22).trim(); // name
        sampleHeaders.push({ slen, loopStart, loopLength, sVol, sFine, type, sPan, relNote });
      }

      // Read sample data
      for (let s = 0; s < numSamples; s++) {
        const sh = sampleHeaders[s];
        const is16 = (sh.type & 16) !== 0;
        let lengthFrames = is16 ? sh.slen / 2 : sh.slen;
        
        // Safety check to prevent browser memory freeze from corrupted slen
        if (lengthFrames > this.data.length * 2) lengthFrames = 0;
        
        let floatData = new Float32Array(lengthFrames);
        let old = 0;
        for (let j = 0; j < lengthFrames; j++) {
          if (is16) {
            const low = this.readU8();
            const high = this.readU8();
            let d = low | (high << 8);
            if (d >= 32768) d -= 65536;
            old = (old + d) & 0xffff;
            let val = old >= 32768 ? old - 65536 : old;
            floatData[j] = val / 32768;
          } else {
            const d = this.readS8();
            old = (old + d) & 0xff;
            let val = old >= 128 ? old - 256 : old;
            floatData[j] = val / 128;
          }
        }
        
        // Unroll ping-pong loops for Web Audio
        const ltype = sh.type & 3;
        let lstart = is16 ? sh.loopStart / 2 : sh.loopStart;
        let llen = is16 ? sh.loopLength / 2 : sh.loopLength;
        if (ltype === 0) llen = 0;

        if (ltype === 2 && llen > 0) {
            let lend = lstart + llen;
            if (lend > lengthFrames) lend = lengthFrames;
            llen = lend - lstart;
            const newData = new Float32Array(lend + llen);
            for(let i=0; i<lend; i++) newData[i] = floatData[i];
            for(let i=0; i<llen; i++) newData[lend + i] = floatData[lend - 1 - i];
            floatData = newData;
            llen *= 2;
            lengthFrames = floatData.length;
        }

        samples.push({
          name: name,
          length: lengthFrames,
          finetune: sh.sFine,
          volume: Math.min(sh.sVol, 64),
          loopStart: lstart,
          loopLength: ltype !== 0 ? llen : 0,
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
