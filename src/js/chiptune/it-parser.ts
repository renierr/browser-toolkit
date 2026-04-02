import type { ModuleFile, Instrument, Note, Pattern, Sample, Envelope } from './types';
import { BaseParser } from './base-parser';
import { decompressIT8, decompressIT16 } from './it-decompress';

/**
 * IT-specific effect constants (0x20+) to avoid collisions with MOD/XM effects.
 * These are handled specially by the worklet and player for IT format.
 */
export const IT_EFFECT_SET_SPEED = 0x20; // Axx: always speed (ticks/row)
export const IT_EFFECT_SET_TEMPO = 0x21; // Txx: always tempo (BPM)
export const IT_EFFECT_FINE_VOLSLIDE_UP = 0x22; // DxF fine volume slide up
export const IT_EFFECT_FINE_VOLSLIDE_DOWN = 0x23; // DFy fine volume slide down
export const IT_EFFECT_FINE_PORTA_DOWN = 0x24; // EFx fine portamento down
export const IT_EFFECT_FINE_PORTA_UP = 0x25; // FFx fine portamento up
export const IT_EFFECT_EXTRA_FINE_PORTA_DOWN = 0x26; // EEx extra-fine porta down
export const IT_EFFECT_EXTRA_FINE_PORTA_UP = 0x27; // FEx extra-fine porta up
export const IT_EFFECT_SET_CHANNEL_VOLUME = 0x28; // Mxx set channel volume
export const IT_EFFECT_CHANNEL_VOL_SLIDE = 0x29; // Nxx channel volume slide
export const IT_EFFECT_FINE_VIBRATO = 0x2a; // Uxx fine vibrato
export const IT_EFFECT_TEMPO_SLIDE = 0x2b; // T0x / Tx0 tempo slide
export const IT_EFFECT_SET_FILTER_CUTOFF = 0x2c; // Zxx default macro cutoff

/**
 * IT effect letter → effect number translation.
 * IT stores effects as 1-based letter indices (A=1, B=2, ...).
 * We translate to MOD/XM-compatible numbering where possible, and use
 * IT-specific constants (0x20+) for effects that differ from MOD/XM semantics.
 */
function translateItEffect(itCmd: number, itParam: number): [number, number] {
  // itCmd: 0=none, 1=A, 2=B, 3=C, ...
  switch (itCmd) {
    case 0:
      return [0, 0]; // No effect
    case 1: // A: Set Speed (ticks/row) — IT A is ALWAYS speed, never tempo
      return [IT_EFFECT_SET_SPEED, itParam];
    case 2: // B: Position Jump → MOD 0x0B
      return [0x0b, itParam];
    case 3: // C: Pattern Break → MOD 0x0D (IT uses hex param, NOT BCD)
      return [0x0d, itParam];
    case 4: // D: Volume Slide — detect fine variants
      return translateItVolSlide(itParam);
    case 5: // E: Portamento Down — detect fine/extra-fine variants
      return translateItPortaDown(itParam);
    case 6: // F: Portamento Up — detect fine/extra-fine variants
      return translateItPortaUp(itParam);
    case 7: // G: Tone Portamento → MOD 0x03
      return [0x03, itParam];
    case 8: // H: Vibrato → MOD 0x04
      return [0x04, itParam];
    case 9: // I: Tremor → 0x1D (already defined in worklet)
      return [0x1d, itParam];
    case 10: // J: Arpeggio → MOD 0x00
      return [0x00, itParam];
    case 11: // K: Vibrato + Volume Slide → MOD 0x06
      return [0x06, itParam];
    case 12: // L: Tone Porta + Volume Slide → MOD 0x05
      return [0x05, itParam];
    case 13: // M: Set Channel Volume (IT-specific)
      return [IT_EFFECT_SET_CHANNEL_VOLUME, Math.min(itParam, 64)];
    case 14: // N: Channel Volume Slide (IT-specific)
      return [IT_EFFECT_CHANNEL_VOL_SLIDE, itParam];
    case 15: // O: Sample Offset → MOD 0x09
      return [0x09, itParam];
    case 16: // P: Panning Slide → 0x19
      return [0x19, itParam];
    case 17: // Q: Retrigger + Volume Slide → 0x1B
      return [0x1b, itParam];
    case 18: // R: Tremolo → MOD 0x07
      return [0x07, itParam];
    case 19: // S: Special/Extended → MOD 0x0E (sub-commands map mostly 1:1)
      return translateItSCommand(itParam);
    case 20: // T: Tempo command
      // IT: T20..FF set tempo, T0x/Tx0 slide tempo.
      if (itParam >= 0x20) return [IT_EFFECT_SET_TEMPO, itParam];
      return [IT_EFFECT_TEMPO_SLIDE, itParam];
    case 21: // U: Fine Vibrato (IT-specific)
      return [IT_EFFECT_FINE_VIBRATO, itParam];
    case 22: // V: Set Global Volume → 0x10
      // IT Vxx is 0-128, internal engine uses 0-64.
      return [0x10, Math.min(64, Math.round(itParam / 2))];
    case 23: // W: Global Volume Slide → 0x11
      return translateItGlobalVolSlide(itParam);
    case 24: // X: Set Panning → MOD 0x08
      // IT X panning: 0x00=left, 0x80=center, 0xFF=right
      return [0x08, itParam];
    case 25: // Y: Panbrello (ignore)
      return [0, 0];
    case 26: // Z: MIDI Macro (default IT macro commonly maps to filter cutoff)
      return [IT_EFFECT_SET_FILTER_CUTOFF, itParam & 0x7f];
    default:
      return [0, 0];
  }
}

/** Translate IT Dxy (Volume Slide) with fine variant detection */
function translateItVolSlide(param: number): [number, number] {
  const hi = (param >> 4) & 0x0f;
  const lo = param & 0x0f;
  if (hi === 0x0f && lo > 0) {
    // DFy: Fine volume slide down by y (tick 0 only)
    return [IT_EFFECT_FINE_VOLSLIDE_DOWN, lo];
  }
  if (lo === 0x0f && hi > 0) {
    // DxF: Fine volume slide up by x (tick 0 only)
    return [IT_EFFECT_FINE_VOLSLIDE_UP, hi];
  }
  // Regular volume slide
  return [0x0a, param];
}

/** Translate IT Exx (Portamento Down) with fine/extra-fine detection */
function translateItPortaDown(param: number): [number, number] {
  if (param >= 0xf0) {
    // EFx: Fine portamento down (tick 0 only)
    return [IT_EFFECT_FINE_PORTA_DOWN, param & 0x0f];
  }
  if (param >= 0xe0) {
    // EEx: Extra-fine portamento down (tick 0 only, 4x smaller)
    return [IT_EFFECT_EXTRA_FINE_PORTA_DOWN, param & 0x0f];
  }
  // Regular portamento down
  return [0x02, param];
}

/** Translate IT Fxx (Portamento Up) with fine/extra-fine detection */
function translateItPortaUp(param: number): [number, number] {
  if (param >= 0xf0) {
    // FFx: Fine portamento up (tick 0 only)
    return [IT_EFFECT_FINE_PORTA_UP, param & 0x0f];
  }
  if (param >= 0xe0) {
    // FEx: Extra-fine portamento up (tick 0 only, 4x smaller)
    return [IT_EFFECT_EXTRA_FINE_PORTA_UP, param & 0x0f];
  }
  // Regular portamento up
  return [0x01, param];
}

/** Translate IT Wxy (Global Volume Slide) from 0-128 domain to internal 0-64 domain */
function translateItGlobalVolSlide(param: number): [number, number] {
  const up = (param >> 4) & 0x0f;
  const down = param & 0x0f;

  if (up > 0 && down === 0) {
    const scaledUp = Math.max(1, Math.round(up / 2));
    return [0x11, scaledUp << 4];
  }

  if (down > 0 && up === 0) {
    const scaledDown = Math.max(1, Math.round(down / 2));
    return [0x11, scaledDown];
  }

  // Mixed nibbles are uncommon; keep original encoding.
  return [0x11, param];
}

/** Translate IT S (Special) sub-commands to MOD E sub-commands */
function translateItSCommand(param: number): [number, number] {
  const sub = (param >> 4) & 0x0f;
  const subParam = param & 0x0f;
  switch (sub) {
    case 0x0: // S0x: Set Filter → E0x
      return [0x0e, param];
    case 0x1: // S1x: Set Glissando → E3x
      return [0x0e, 0x30 | subParam];
    case 0x3: // S3x: Vibrato Waveform → E4x
      return [0x0e, 0x40 | subParam];
    case 0x4: // S4x: Tremolo Waveform → E7x
      return [0x0e, 0x70 | subParam];
    case 0x8: // S8x: Set Panning (coarse) → E8x
      return [0x08, subParam * 17]; // 0-F → 0-255
    case 0xb: // SBx: Pattern Loop → E6x
      return [0x0e, 0x60 | subParam];
    case 0xc: // SCx: Note Cut → ECx
      return [0x0e, 0xc0 | subParam];
    case 0xd: // SDx: Note Delay → EDx
      return [0x0e, 0xd0 | subParam];
    case 0xe: // SEx: Pattern Delay → EEx
      return [0x0e, 0xe0 | subParam];
    default:
      return [0x0e, param];
  }
}

/** Parse an IT volume column byte into standard volume + volumeColumn fields */
function parseItVolumeColumn(vol: number): {
  volume: number | null;
  volumeColumn: number | null;
  effect: number;
  effectParam: number;
} {
  if (vol <= 64) {
    return { volume: vol, volumeColumn: null, effect: 0, effectParam: 0 };
  }
  if (vol >= 65 && vol <= 74) {
    // Fine Volume Up (tick 0 only) → E sub-command 0xA
    const amt = vol - 65;
    return { volume: null, volumeColumn: null, effect: 0x0e, effectParam: 0xa0 | amt };
  }
  if (vol >= 75 && vol <= 84) {
    // Fine Volume Down (tick 0 only) → E sub-command 0xB
    const amt = vol - 75;
    return { volume: null, volumeColumn: null, effect: 0x0e, effectParam: 0xb0 | amt };
  }
  if (vol >= 85 && vol <= 94) {
    // Volume Slide Up
    const amt = vol - 85;
    return { volume: null, volumeColumn: null, effect: 0x0a, effectParam: amt << 4 };
  }
  if (vol >= 95 && vol <= 104) {
    // Volume Slide Down
    const amt = vol - 95;
    return { volume: null, volumeColumn: null, effect: 0x0a, effectParam: amt };
  }
  if (vol >= 128 && vol <= 192) {
    // Set Panning (0-64 → 0-255)
    const pan = Math.round(((vol - 128) / 64) * 255);
    return { volume: null, volumeColumn: null, effect: 0x08, effectParam: pan };
  }
  if (vol >= 105 && vol <= 114) {
    // Portamento Down
    const spd = vol - 105;
    return { volume: null, volumeColumn: null, effect: 0x02, effectParam: spd * 4 };
  }
  if (vol >= 115 && vol <= 124) {
    // Portamento Up
    const spd = vol - 115;
    return { volume: null, volumeColumn: null, effect: 0x01, effectParam: spd * 4 };
  }
  if (vol >= 193 && vol <= 202) {
    // Tone Portamento
    const spd = vol - 193;
    return { volume: null, volumeColumn: null, effect: 0x03, effectParam: spd * 4 };
  }
  if (vol >= 203 && vol <= 212) {
    // Vibrato Depth
    const depth = vol - 203;
    return { volume: null, volumeColumn: null, effect: 0x04, effectParam: depth };
  }
  return { volume: null, volumeColumn: null, effect: 0, effectParam: 0 };
}

function decodeCompressedItSample(
  data: Uint8Array,
  samplePointer: number,
  sampleLength: number,
  is16Bit: boolean,
  preferIT215: boolean,
  isSigned: boolean
): Float32Array {
  return is16Bit
    ? decompressIT16(data, samplePointer, sampleLength, preferIT215, isSigned)
    : decompressIT8(data, samplePointer, sampleLength, preferIT215, isSigned);
}

export class ItParser extends BaseParser {
  parse(): ModuleFile {
    if (this.data.length < 192 || this.readStr(4) !== 'IMPM') throw new Error('Not an IT file');

    this.setPos(4);
    const title = this.readStr(26).trim();
    this.setPos(32);
    const ordNum = this.readU16LE();
    const insNum = this.readU16LE();
    const smpNum = this.readU16LE();
    const patNum = this.readU16LE();
    this.setPos(40);
    this.readU16LE(); // created with tracker version
    const cmwt = this.readU16LE(); // compatible minimum tracker version
    const flags = this.readU16LE();
    this.readU16LE(); // special
    this.setPos(48);
    const globalVol = this.readU8(); // GV (0-128)
    const mixVol = this.readU8(); // MV (0-128)
    const initSpeed = this.readU8();
    const initTempo = this.readU8();
    this.readU8(); // sep
    this.readU8(); // pwd

    // Jump to channel pan
    this.setPos(64);
    const chanPan: number[] = [];
    for (let i = 0; i < 64; i++) chanPan.push(this.readU8());
    // Channel vols
    const chanVol: number[] = [];
    for (let i = 0; i < 64; i++) chanVol.push(this.readU8());

    const sequence: number[] = [];
    for (let i = 0; i < ordNum; i++) sequence.push(this.readU8());

    const activeChannels: number[] = [];
    for (let i = 0; i < 64; i++) {
      if ((chanPan[i] & 128) === 0) activeChannels.push(i);
    }
    const channels = activeChannels.length > 0 ? Math.max(...activeChannels) + 1 : 1;

    const channelVolumes = new Array(channels).fill(64);
    const channelPanning = new Array(channels).fill(128);
    for (let i = 0; i < channels; i++) {
      if ((chanPan[i] & 128) !== 0) {
        channelVolumes[i] = 0; // disabled channel
        channelPanning[i] = 128;
      } else {
        channelVolumes[i] = Math.max(0, Math.min(64, chanVol[i] & 0x7f));
        channelPanning[i] = Math.max(0, Math.min(255, Math.round(((chanPan[i] & 0x7f) / 64) * 255)));
      }
    }

    const dataOffsets = { ins: [] as number[], smp: [] as number[], pat: [] as number[] };
    for (let i = 0; i < insNum; i++) dataOffsets.ins.push(this.readU32LE());
    for (let i = 0; i < smpNum; i++) dataOffsets.smp.push(this.readU32LE());
    for (let i = 0; i < patNum; i++) dataOffsets.pat.push(this.readU32LE());

    const rawSamples: Sample[] = [];
    // IT compression mode must be consistent module-wide. Use compatibility target.
    const preferIT215ByCompat = cmwt >= 0x0215;
    for (let i = 0; i < smpNum; i++) {
      let name = `Sample ${i + 1}`;
      let sampleData = new Float32Array(0);
      let smpLength = 0;
      let loopStart = 0;
      let loopLength = 0;
      let c5speed = 8363;
      let sVol = 64;
      let sampleGlobalVolume = 64;
      let isPingPong = false;
      let hasLoop = false;
      let dfp = 128; // default panning
      let vibratoType = 0;
      let vibratoSweep = 0;
      let vibratoDepth = 0;
      let vibratoRate = 0;

      if (dataOffsets.smp[i] > 0) {
        this.setPos(dataOffsets.smp[i]);
        if (this.readStr(4) === 'IMPS') {
          this.readStr(12); // dos filename
          this.readU8(); // zero
          sampleGlobalVolume = this.readU8(); // global volume (0-64)
          const sFlags = this.readU8();
          sVol = this.readU8(); // default volume (0-64)
          name = this.readStr(26).trim();
          const cvt = this.readU8();
          dfp = this.readU8(); // default pan (bit 7 = has panning, bits 0-6 = pan 0-64)
          smpLength = this.readU32LE();
          loopStart = this.readU32LE();
          const loopEnd = this.readU32LE();

          hasLoop = (sFlags & 0x10) !== 0;
          isPingPong = (sFlags & 0x40) !== 0;

          if (hasLoop) loopLength = loopEnd - loopStart;

          c5speed = this.readU32LE(); // C5 Speed
          this.readU32LE(); // susLoopStart
          this.readU32LE(); // susLoopEnd
          const samplePointer = this.readU32LE();
          // IT sample vibrato bytes: speed, depth, rate, waveform
          vibratoSweep = this.readU8();
          vibratoDepth = this.readU8();
          vibratoRate = this.readU8();
          vibratoType = this.readU8();

          let pan = 128;
          if (dfp & 0x80) {
            pan = Math.round(((dfp & 0x7f) / 64) * 255);
          }

          if (
            samplePointer > 0 &&
            samplePointer < this.data.length &&
            smpLength > 0 &&
            sFlags & 1
          ) {
            this.setPos(samplePointer);
            const is16 = (sFlags & 0x02) !== 0;
            const isCompressed = (sFlags & 0x08) !== 0;
            // cvt bit 0: 0=unsigned, 1=signed (IT standard is signed)
            const isSigned = (cvt & 1) !== 0;

            const preferIT215 = preferIT215ByCompat;

            if (isCompressed) {
              const decoded = decodeCompressedItSample(
                this.data,
                this.pos,
                smpLength,
                is16,
                preferIT215,
                isSigned
              );

              sampleData = new Float32Array(smpLength);
              sampleData.set(decoded);
            } else {
              sampleData = new Float32Array(smpLength);
              for (let j = 0; j < smpLength; j++) {
                if (is16) {
                  let v = this.readU16LE();
                  if (isSigned) {
                    if (v >= 32768) v -= 65536;
                  } else {
                    v -= 32768;
                  }
                  sampleData[j] = v / 32768;
                } else {
                  let v = this.readU8();
                  if (isSigned) {
                    if (v >= 128) v -= 256;
                  } else {
                    v -= 128;
                  }
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
              for (let j = 0; j < lend; j++) newData[j] = sampleData[j];
              for (let j = 0; j < loopLength; j++) newData[lend + j] = sampleData[lend - 1 - j];
              sampleData = newData;
              loopLength *= 2;
              smpLength = sampleData.length;
            }
          }

          rawSamples.push({
            name,
            length: smpLength,
            finetune: 0,
            volume: Math.min(64, Math.round((Math.min(sVol, 64) * Math.min(sampleGlobalVolume, 64)) / 64)),
            loopStart,
            loopLength: hasLoop ? loopLength : 0,
            panning: pan,
            baseNote: 0,
            data: sampleData,
            c5speed,
            vibratoType,
            vibratoSweep,
            vibratoDepth,
            vibratoRate,
          });
          continue;
        }
      }

      rawSamples.push({
        name,
        length: smpLength,
        finetune: 0,
        volume: Math.min(64, Math.round((Math.min(sVol, 64) * Math.min(sampleGlobalVolume, 64)) / 64)),
        loopStart,
        loopLength: hasLoop ? loopLength : 0,
        panning: 128,
        baseNote: 0,
        data: sampleData,
        c5speed,
        vibratoType,
        vibratoSweep,
        vibratoDepth,
        vibratoRate,
      });
    }


    const instruments: Instrument[] = [];
    if ((flags & 4) !== 0 && insNum > 0) {
      // Use true IT Instruments
      for (let i = 0; i < insNum; i++) {
        let name = `Instrument ${i + 1}`;
        let volFadeout = 0;
        let nna = 0; // New Note Action: 0=cut, 1=continue, 2=noteOff, 3=fade
        let dct = 0;
        let dca = 0;
        const sampleMap = new Array(120).fill(-1);
        const noteMap = new Array(120).fill(0); // translated note for each slot
        let volumeEnv: Envelope | undefined;
        let panningEnv: Envelope | undefined;

        if (dataOffsets.ins[i] > 0) {
          this.setPos(dataOffsets.ins[i]);
          if (this.readStr(4) === 'IMPI') {
            this.readStr(12); // dos filename
            this.readU8(); // zero
            nna = Math.min(3, this.readU8()); // nna (0=cut, 1=continue, 2=noteOff, 3=fade)
            dct = Math.min(3, this.readU8()); // dct
            dca = Math.min(2, this.readU8()); // dca
            volFadeout = this.readU16LE(); // fadeout
            this.readU8(); // pps
            this.readU8(); // ppc
            this.setPos(dataOffsets.ins[i] + 32);
            name = this.readStr(26).trim();
            this.readU8(); // ifc
            this.readU8(); // ifr
            this.readU8(); // mch
            this.readU8(); // mpr
            this.readU16LE(); // midibnk

            // Note-sample table at offset 64: 120 pairs of (note, sample)
            this.setPos(dataOffsets.ins[i] + 64);
            for (let n = 0; n < 120; n++) {
              noteMap[n] = this.readU8(); // translated note (0-119)
              const smp = this.readU8(); // 1-based sample index, 0 = no sample
              sampleMap[n] = smp === 0 ? -1 : smp - 1;
            }

            // Volume envelope at offset 304
            this.setPos(dataOffsets.ins[i] + 304);
            volumeEnv = this.parseItEnvelope();

            // Panning envelope at offset 304 + 82 = 386
            this.setPos(dataOffsets.ins[i] + 386);
            panningEnv = this.parseItEnvelope();
          }
        }
        instruments.push({
          name,
          volumeFadeout: volFadeout,
          sampleMap,
          noteMap,
          samples: rawSamples,
          volumeEnv,
          panningEnv,
          nna,
          dct,
          dca,
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
          samples: rawSamples,
        });
      }
    }

    const patterns: Pattern[] = [];
    for (let i = 0; i < patNum; i++) {
      if (dataOffsets.pat[i] === 0) {
        patterns.push({
          rows: Array.from({ length: 64 }, () =>
            Array.from({ length: channels }, () => ({
              note: null,
              period: null,
              instrument: 0,
              volume: null,
              volumeColumn: null,
              effect: 0,
              effectParam: 0,
            }))
          ),
        });
        continue;
      }
      this.setPos(dataOffsets.pat[i]);
      const packedLen = this.readU16LE(); // packed pattern data length
      const pRows = this.readU16LE();
      this.readU32LE(); // reserved
      const patDataStart = this.pos;
      const patDataEnd = patDataStart + packedLen;

      const rows: Note[][] = [];
      const chState = Array.from({ length: 64 }, () => ({
        mask: 0,
        note: 0 as number,
        inst: 0,
        vol: 255 as number, // 255 = no volume column
        cmd: 0,
        param: 0,
      }));

      for (let r = 0; r < pRows; r++) {
        // Safety: don't read past the packed data boundary
        if (this.pos >= patDataEnd) {
          // Fill remaining rows with empty data
          for (let remaining = r; remaining < pRows; remaining++) {
            rows.push(
              Array.from({ length: channels }, () => ({
                note: null,
                period: null,
                instrument: 0,
                volume: null,
                volumeColumn: null,
                effect: 0,
                effectParam: 0,
              }))
            );
          }
          break;
        }

        const row: Note[] = Array.from({ length: channels }, () => ({
          note: null,
          period: null,
          instrument: 0,
          volume: null,
          volumeColumn: null,
          effect: 0,
          effectParam: 0,
        }));

        // Read packed row data until end-of-row marker (byte 0) or end of packed data
        while (this.pos < patDataEnd) {
          const b = this.readU8();
          if (b === 0) break;
          const ch = (b - 1) & 63;
          let mask: number;
          if (b & 128) {
            mask = this.readU8();
            chState[ch].mask = mask;
          } else {
            mask = chState[ch].mask;
          }

          // Read new values from stream (bits 0-3)
          if (mask & 1) chState[ch].note = this.readU8();
          if (mask & 2) chState[ch].inst = this.readU8();
          if (mask & 4) chState[ch].vol = this.readU8();
          if (mask & 8) {
            chState[ch].cmd = this.readU8();
            chState[ch].param = this.readU8();
          }

          // Bits 4-7 mean "use last value" (already stored in chState)
          const hasNote = !!(mask & (1 | 16));
          const hasInst = !!(mask & (2 | 32));
          const hasVol = !!(mask & (4 | 64));
          const hasCmd = !!(mask & (8 | 128));

          if (ch < channels) {
            // Convert IT note to our internal format
            // IT: 0=empty, 1-120=notes (1=C-0), 253=notecut, 254=noteoff, 255=notefade
            let logicalNote: number | null = null;
            if (hasNote) {
              const rawNote = chState[ch].note;
              if (rawNote >= 1 && rawNote <= 120) {
                // IT note 1=C-0, 61=C-5. Our internal: just store as-is (1-120)
                logicalNote = rawNote;
              } else if (rawNote === 253) {
                logicalNote = 98; // Note Cut
              } else if (rawNote === 254) {
                logicalNote = 97; // Note Off
              } else if (rawNote === 255) {
                logicalNote = 99; // Note Fade
              }
            }

            // Translate IT effects to MOD-compatible effect numbers
            let effect = 0;
            let effectParam = 0;
            if (hasCmd && chState[ch].cmd > 0) {
              [effect, effectParam] = translateItEffect(chState[ch].cmd, chState[ch].param);
            }

            // Handle IT volume column
            let volume: number | null = null;
            let itVolumeEffect = 0;
            let itVolumeEffectParam = 0;
            if (hasVol && chState[ch].vol !== 255) {
              const parsed = parseItVolumeColumn(chState[ch].vol);
              volume = parsed.volume;
              if (parsed.effect) {
                itVolumeEffect = parsed.effect;
                itVolumeEffectParam = parsed.effectParam;
              }
            }

            row[ch] = {
              note: logicalNote,
              period: null,
              instrument: hasInst ? chState[ch].inst : 0,
              volume,
              volumeColumn: null,
              effect,
              effectParam,
              itVolumeEffect,
              itVolumeEffectParam,
            };
          }
        }
        rows.push(row);
      }
      patterns.push({ rows });
    }

    return {
      type: 'IT',
      title,
      instruments,
      patterns,
      sequence: sequence.filter((o) => o < 254),
      channels,
      defaultBpm: initTempo,
      defaultSpeed: initSpeed,
      rowsPerPattern: Math.max(...patterns.map((p) => p.rows.length), 64),
      linearFrequencies: (flags & 8) !== 0,
      // IT stores global volume in 0-128; normalize to engine range 0-64.
      globalVolume: Math.min(64, Math.round(Math.min(globalVol, 128) / 2)),
      mixingVolume: Math.max(0, Math.min(mixVol, 128)),
      channelVolumes,
      channelPanning,
    };
  }

  /** Parse an IT envelope structure (volume or panning) */
  private parseItEnvelope(): Envelope | undefined {
    const flg = this.readU8(); // flags: bit 0=on, bit 1=loop, bit 2=sustain loop
    const num = this.readU8(); // number of node points
    const lpb = this.readU8(); // loop begin
    const lpe = this.readU8(); // loop end
    const slb = this.readU8(); // sustain loop begin
    const sle = this.readU8(); // sustain loop end

    if (!(flg & 1) || num === 0) {
      // Envelope not enabled, skip the node data (25 pairs × 3 bytes each)
      this.pos += 75;
      return undefined;
    }

    const points: { tick: number; value: number }[] = [];
    for (let j = 0; j < 25; j++) {
      const value = this.readU8(); // y-value (0-64)
      const tickLo = this.readU8();
      const tickHi = this.readU8();
      const tick = tickLo | (tickHi << 8);
      if (j < num) {
        points.push({ tick, value });
      }
    }

    let type = 1; // enabled
    if (flg & 2) type |= 4; // loop
    if (flg & 4) type |= 2; // sustain

    return {
      points,
      type,
      loopStart: lpb,
      loopEnd: lpe,
      sustainStart: slb,
      sustainEnd: sle,
    };
  }
}
