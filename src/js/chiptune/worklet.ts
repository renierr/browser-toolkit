declare const AudioWorkletProcessor: any;
declare const registerProcessor: any;

import type {
  WorkletModule,
  WorkletInstrument,
  WorkletInstrumentSample,
  WorkletNote,
  Envelope,
} from './types';

const EFFECT_ARPEGGIO = 0x00;
const EFFECT_PORTA_UP = 0x01;
const EFFECT_PORTA_DOWN = 0x02;
const EFFECT_TONE_PORTA = 0x03;
const EFFECT_VIBRATO = 0x04;
const EFFECT_TONE_PORTA_VOL = 0x05;
const EFFECT_VIBRATO_VOL = 0x06;
const EFFECT_TREMOLO = 0x07;
const EFFECT_PANNING = 0x08;
const EFFECT_SAMPLE_OFFSET = 0x09;
const EFFECT_VOLUME_SLIDE = 0x0a;
const EFFECT_POSITION_JUMP = 0x0b;
const EFFECT_SET_VOLUME = 0x0c;
const EFFECT_PATTERN_BREAK = 0x0d;
const EFFECT_EXTENDED = 0x0e;
const EFFECT_SET_SPEED = 0x0f;
const EFFECT_GLOBAL_VOLUME = 0x10; // G
const EFFECT_GLOBAL_VOL_SLIDE = 0x11; // H
const EFFECT_ENVELOPE_POS = 0x15; // L
const EFFECT_PANNING_SLIDE = 0x19; // P
const EFFECT_MULTI_RETRIG = 0x1b; // R
const EFFECT_TREMOR = 0x1d;

// IT-specific effect constants (must match it-parser.ts exports)
const IT_EFFECT_SET_SPEED = 0x20;
const IT_EFFECT_SET_TEMPO = 0x21;
const IT_EFFECT_FINE_VOLSLIDE_UP = 0x22;
const IT_EFFECT_FINE_VOLSLIDE_DOWN = 0x23;
const IT_EFFECT_FINE_PORTA_DOWN = 0x24;
const IT_EFFECT_FINE_PORTA_UP = 0x25;
const IT_EFFECT_EXTRA_FINE_PORTA_DOWN = 0x26;
const IT_EFFECT_EXTRA_FINE_PORTA_UP = 0x27;
const IT_EFFECT_SET_CHANNEL_VOLUME = 0x28;
const IT_EFFECT_CHANNEL_VOL_SLIDE = 0x29;
const IT_EFFECT_FINE_VIBRATO = 0x2a;
const IT_EFFECT_TEMPO_SLIDE = 0x2b;

const SINE_TABLE = [
  0, 24, 49, 74, 97, 120, 141, 161, 180, 197, 212, 224, 235, 244, 250, 253, 255, 253, 250, 244, 235,
  224, 212, 197, 180, 161, 141, 120, 97, 74, 49, 24,
];

/**
 * BackgroundVoice: lightweight voice for IT NNA (New Note Action).
 * When a new note triggers on a channel with NNA != cut, the old playing
 * state is moved here so it continues rendering (with fadeout/envelope).
 */
class BackgroundVoice {
  sample: WorkletInstrumentSample;
  instrument: WorkletInstrument | null;
  sampleIndex: number;
  sampleSpeed: number;
  volume: number;
  channelVolume: number;
  panning: number;
  keyOn: boolean;
  fadeoutVolume: number;
  volumeEnvTick: number;
  panningEnvTick: number;
  volumeEnvValue: number;
  panningEnvValue: number;
  playing: boolean;
  globalVolumeRef: ModPlayerWorklet;

  constructor(ch: WorkletChannel) {
    this.sample = ch.sample!;
    this.instrument = ch.instrument;
    this.sampleIndex = ch.sampleIndex;
    this.sampleSpeed = ch.sampleSpeed;
    this.volume = ch.volume;
    this.channelVolume = ch.channelVolume;
    this.panning = ch.panning;
    this.keyOn = ch.keyOn;
    this.fadeoutVolume = ch.fadeoutVolume;
    this.volumeEnvTick = ch.volumeEnvTick;
    this.panningEnvTick = ch.panningEnvTick;
    this.volumeEnvValue = ch.volumeEnvValue;
    this.panningEnvValue = ch.panningEnvValue;
    this.playing = true;
    this.globalVolumeRef = ch.worklet;
  }

  /** Apply NNA action: 1=continue, 2=noteOff (start release), 3=fade */
  applyNNA(nna: number): void {
    switch (nna) {
      case 1: // Continue: keep playing as-is
        break;
      case 2: // Note Off: start envelope release/fadeout
        this.keyOn = false;
        break;
      case 3: // Note Fade: immediate fadeout
        this.keyOn = false;
        this.fadeoutVolume = Math.min(this.fadeoutVolume, 16384); // accelerate fade
        break;
    }
  }

  performTick(): void {
    if (!this.playing) return;

    // Process envelope/fadeout
    if (this.instrument) {
      if (this.keyOn) {
        if (this.instrument.volumeEnv) {
          this.volumeEnvValue = this.calcEnv(this.instrument.volumeEnv, this.volumeEnvTick++);
        }
      } else {
        if (this.instrument.volumeFadeout !== undefined && this.instrument.volumeFadeout > 0) {
          this.fadeoutVolume = Math.max(0, this.fadeoutVolume - this.instrument.volumeFadeout);
          if (this.fadeoutVolume <= 0) {
            this.playing = false;
            return;
          }
        } else {
          // No fadeout defined + key off = stop immediately
          this.playing = false;
          return;
        }
      }
    }
  }

  calcEnv(env: Envelope, tick: number): number {
    const points = env.points;
    if (!points || points.length === 0) return 64;
    if (env.type & 4 && env.loopEnd !== undefined && env.loopEnd < points.length) {
      const loopEndTick = points[env.loopEnd].tick;
      const loopStartTick = points[env.loopStart ?? 0]?.tick ?? 0;
      if (tick >= loopEndTick && loopEndTick > loopStartTick) {
        tick = loopStartTick + ((tick - loopStartTick) % (loopEndTick - loopStartTick + 1));
      }
    }
    if (
      this.keyOn &&
      env.type & 2 &&
      env.sustainStart !== undefined &&
      env.sustainStart < points.length
    ) {
      const susTick = points[env.sustainStart].tick;
      if (tick >= susTick) tick = susTick;
    }
    if (tick <= points[0].tick) return points[0].value;
    for (let i = 0; i < points.length - 1; i++) {
      if (tick <= points[i + 1].tick) {
        const t = (tick - points[i].tick) / (points[i + 1].tick - points[i].tick);
        return points[i].value + (points[i + 1].value - points[i].value) * t;
      }
    }
    return points[points.length - 1].value;
  }

  nextSample(): [number, number] {
    if (!this.playing || !this.sample || !this.sample.data || this.sample.data.length === 0)
      return [0, 0];

    if (this.sample.loopLength > 2) {
      const loopEnd = this.sample.loopStart + this.sample.loopLength;
      if (this.sampleIndex >= loopEnd)
        this.sampleIndex =
          this.sample.loopStart + ((this.sampleIndex - loopEnd) % this.sample.loopLength);
    } else if (this.sampleIndex >= this.sample.length) {
      this.playing = false;
      return [0, 0];
    }

    const sIdx = Math.floor(this.sampleIndex);
    const raw = this.sample.data[sIdx];
    this.sampleIndex += this.sampleSpeed;

    let vol =
      (this.volume / 64) *
      (this.channelVolume / 64) *
      (this.sample.volume / 64) *
      (this.globalVolumeRef.globalVolume / 64);
    if (this.instrument) vol *= (this.volumeEnvValue / 64) * (this.fadeoutVolume / 32768);

    const panTheta = (this.panning / 255) * (Math.PI / 2);
    const l = raw * vol * Math.cos(panTheta);
    const r = raw * vol * Math.sin(panTheta);
    return [l, r];
  }
}

class WorkletChannel {
  worklet: ModPlayerWorklet;
  channelIndex: number;

  instrument: WorkletInstrument | null = null;
  sample: WorkletInstrumentSample | null = null;
  note: number | null = null;

  playing = false;
  keyOn = false;

  period = 0;
  targetPeriod = 0;
  currentPeriod = 0;

  volume = 64;
  channelVolume = 64;
  panning = 128;
  baseVolume = 64;

  sampleIndex = 0;
  sampleFraction = 0;
  sampleSpeed = 0;

  vibratoPhase = 0;
  vibratoSpeed = 0;
  vibratoDepth = 0;
  vibratoWaveform = 0;
  fineVibratoDepth = 0;

  tremoloPhase = 0;
  tremoloSpeed = 0;
  tremoloDepth = 0;
  tremoloWaveform = 0;

  slideSpeed = 0;
  volSlideSpeed = 0;
  channelVolSlide = 0;
  tempoSlide = 0;
  fineSlideSpeed = 0;

  arpeggioNotes: number[] = [];

  volumeEnvTick = 0;
  panningEnvTick = 0;
  volumeEnvValue = 64;
  panningEnvValue = 128;
  fadeoutVolume = 32768;

  retrig = 0;
  globalVolSlide = 0;
  panningSlide = 0;
  tremorCounter = 0;
  tremorOn = false;

  pendingNote: WorkletNote | null = null;
  delayNoteTick = -1;

  constructor(worklet: ModPlayerWorklet, index: number) {
    this.worklet = worklet;
    this.channelIndex = index;
    this.reset();
  }

  reset() {
    this.playing = false;
    this.sampleIndex = 0;
    this.sampleFraction = 0;
    // Preservation: We DO NOT reset this.instrument, this.volume, or this.panning
    // because subsequent notes in a tracker row often omit instrument bytes.
    // Clearing them causes silence after seeking or restarting.
    this.vibratoPhase = 0;
    this.tremoloPhase = 0;
    this.volumeEnvTick = 0;
    this.panningEnvTick = 0;
  }

  trigger(note: WorkletNote) {
    if (!note.instrument && !note.period && note.note === null) {
      this.handleEffect(note); // Still parse effects on empty note rows
      return;
    }

    // Handle EDx Note Delay
    let noteDelay = 0;
    if (note.effect === EFFECT_EXTENDED && ((note.effectParam >> 4) & 0x0f) === 0x0d) {
      noteDelay = note.effectParam & 0x0f;
    }

    if (noteDelay > 0 && this.worklet.tick === 0) {
      this.pendingNote = note;
      this.delayNoteTick = noteDelay;
      return;
    }

    this.processTrigger(note);
  }

  processTrigger(note: WorkletNote) {
    let tonePorta = note.effect === EFFECT_TONE_PORTA || note.effect === EFFECT_TONE_PORTA_VOL;

    if (note.instrument !== undefined && note.instrument > 0) {
      const inst = this.worklet.mod!.instruments[note.instrument - 1];
      if (inst) {
        this.instrument = inst;
        if (inst.samples.length > 0) {
          this.baseVolume = inst.samples[0].volume;
        }

        // MOD quirk: choosing instrument without note restarts volume but NOT sample position (Sample Swapping)
        // XM quirk: choosing instrument without note resets volume/panning but NOT envelopes/position
        if (note.note === null) {
          this.volume = this.baseVolume;
          // MOD files use fixed channel panning; only XM/IT use sample-based panning overrides.
          if (this.worklet.mod!.type !== 'MOD' && inst.samples.length > 0) {
            this.panning = inst.samples[0].panning;
          }
        }

        this.assignSample(note.note ?? this.note ?? 1);
      }
    }

    if (note.note !== null) {
      if (note.note === 97) {
        // KeyOff
        this.keyOn = false;
        if (this.worklet.mod!.type === 'MOD') {
          this.playing = false;
          this.volume = 0;
        }
      } else {
        if (tonePorta) {
          this.targetPeriod = this.calculatePeriod(note.note ?? 0, note.instrument ?? 0);
        } else {
          // IT NNA: before killing old note, check if it should continue in background
          if (
            this.playing &&
            this.sample &&
            this.worklet.mod!.type === 'IT' &&
            this.instrument &&
            this.instrument.nna !== undefined &&
            this.instrument.nna > 0
          ) {
            this.worklet.spawnBackgroundVoice(this, this.instrument.nna);
          }

          this.note = note.note ?? 0;
          this.assignSample(note.note ?? 0);
          this.period = note.period || this.calculatePeriod(note.note ?? 0, note.instrument ?? 0);
          this.currentPeriod = this.period;

          // FT2 quirk: only reset volume if instrument is provided
          if (note.instrument !== undefined && note.instrument > 0) {
            this.volume = this.baseVolume;
          }

          this.sampleIndex = 0;
          this.sampleFraction = 0;
          this.keyOn = true;
          this.volumeEnvTick = 0;
          this.panningEnvTick = 0;
          this.fadeoutVolume = 32768;
          this.playing = !!this.sample && this.period > 0;
        }
      }
    }

    // Standard volume command
    if (note.volume !== null && note.volume !== undefined && note.volume <= 64) {
      this.volume = note.volume;
    }

    // Handle Volume Column (XM)
    if (note.volumeColumn !== null && note.volumeColumn !== undefined) {
      const vc = note.volumeColumn;
      if (vc >= 0x10 && vc <= 0x50)
        this.volume = vc - 0x10; // Set volume
      else if (vc >= 0x60 && vc <= 0x6f)
        this.volSlideSpeed = -(vc & 0x0f); // Vol slide down
      else if (vc >= 0x70 && vc <= 0x7f)
        this.volSlideSpeed = vc & 0x0f; // Vol slide up
      else if (vc >= 0x80 && vc <= 0x8f) {
        // Fine vol slide down
        if (this.worklet.tick === 0) this.volume = Math.max(0, this.volume - (vc & 0x0f));
      } else if (vc >= 0x90 && vc <= 0x9f) {
        // Fine vol slide up
        if (this.worklet.tick === 0) this.volume = Math.min(64, this.volume + (vc & 0x0f));
      } else if (vc >= 0xa0 && vc <= 0xaf) this.vibratoSpeed = (vc & 0x0f) * 2;
      else if (vc >= 0xb0 && vc <= 0xbf) {
        if (vc & 0x0f) this.vibratoDepth = vc & 0x0f;
      } else if (vc >= 0xc0 && vc <= 0xcf) this.panning = (vc & 0x0f) * 16 + 8;
      else if (vc >= 0xd0 && vc <= 0xdf)
        this.panningSlide = -(vc & 0x0f); // Pan slide left
      else if (vc >= 0xe0 && vc <= 0xef)
        this.panningSlide = vc & 0x0f; // Pan slide right
      else if (vc >= 0xf0 && vc <= 0xff) {
        // Tone porta
        if (vc & 0x0f) this.slideSpeed = (vc & 0x0f) * 16;
        tonePorta = true;
      }
    }

    this.handleEffect(note);
  }

  assignSample(noteValue: number) {
    if (!this.instrument) return;
    let sIdx = 0;
    const maxNote = this.worklet.mod!.type === 'IT' ? 120 : 96;
    if (this.instrument.sampleMap && noteValue >= 1 && noteValue <= maxNote) {
      sIdx = this.instrument.sampleMap[noteValue - 1];
    }
    if (sIdx < 0 || sIdx >= this.instrument.samples.length) sIdx = 0;
    this.sample = this.instrument.samples[sIdx] || this.instrument.samples[0] || null;
    // Don't overwrite MOD hardcoded panning
    if (this.sample && this.worklet.mod!.type !== 'MOD') {
      this.panning = this.sample.panning;
    }
  }

  calculatePeriod(noteValue: number, instrumentIdx: number) {
    if (!this.worklet.mod) return 0;
    const inst =
      instrumentIdx > 0 ? this.worklet.mod.instruments[instrumentIdx - 1] : this.instrument;
    if (!inst || inst.samples.length === 0) return 0;

    let sIdx = 0;
    const maxNote = this.worklet.mod.type === 'IT' ? 120 : 96;
    if (inst.sampleMap && noteValue >= 1 && noteValue <= maxNote)
      sIdx = inst.sampleMap[noteValue - 1];
    if (sIdx < 0 || sIdx >= inst.samples.length) sIdx = 0;
    const sample = inst.samples[sIdx] || inst.samples[0];

    if (this.worklet.mod.type === 'IT') {
      // Apply IT noteMap translation: the instrument maps input notes to output notes
      if (inst.noteMap && noteValue >= 1 && noteValue <= 120) {
        const mappedNote = inst.noteMap[noteValue - 1];
        if (mappedNote >= 0 && mappedNote <= 119) return mappedNote + 1; // convert 0-based to 1-based
      }
      return noteValue;
    }

    const actualNote = noteValue - 1 + (sample.baseNote || 0);
    const isXmOrIt = this.worklet.mod.type === 'XM' || (this.worklet.mod.type as string) === 'IT';
    if (isXmOrIt) {
      if (this.worklet.mod.linearFrequencies) {
        return 10 * 12 * 16 * 4 - actualNote * 16 * 4 - (sample.finetune || 0) / 2;
      } else {
        const AMIGA_TABLE = [1712, 1616, 1525, 1440, 1357, 1281, 1209, 1141, 1077, 1017, 961, 907];
        let n = actualNote;
        let octave = 0;
        while (n >= 12) {
          n -= 12;
          octave++;
        }
        while (n < 0) {
          n += 12;
          octave--;
        }
        let p = AMIGA_TABLE[n] / Math.pow(2, octave);
        return p * 16;
      }
    }

    const AMIGA_TABLE = [1712, 1616, 1525, 1440, 1357, 1281, 1209, 1141, 1077, 1017, 961, 907];
    let n = noteValue - 1 + (sample.baseNote || 0);
    let octave = 0;
    while (n >= 12) {
      n -= 12;
      octave++;
    }
    while (n < 0) {
      n += 12;
      octave--;
    }
    let p = AMIGA_TABLE[n] / Math.pow(2, octave);
    return p;
  }

  handleEffect(note: WorkletNote) {
    const isIT = this.worklet.mod!.type === 'IT';

    if (this.worklet.tick === 0) {
      // For IT: preserve effect memory — only reset values that get explicitly set.
      // For MOD/XM: reset as before (no effect memory).
      if (!isIT) {
        this.slideSpeed = 0;
        this.volSlideSpeed = 0;
        this.channelVolSlide = 0;
        this.fineSlideSpeed = 0;
      }
      this.arpeggioNotes = [];
      this.retrig = 0;
      this.globalVolSlide = 0;
      this.panningSlide = 0;
    }

    const effectId = note.effect;
    const param = note.effectParam;

    switch (effectId) {
      case EFFECT_ARPEGGIO:
        if (param > 0) this.arpeggioNotes = [0, (param >> 4) & 0x0f, param & 0x0f];
        break;
      case EFFECT_PORTA_UP:
        if (param > 0 || !isIT) this.slideSpeed = -param;
        break;
      case EFFECT_PORTA_DOWN:
        if (param > 0 || !isIT) this.slideSpeed = param;
        break;
      case EFFECT_TONE_PORTA:
        if (param > 0) this.slideSpeed = param;
        // IT: param 0 means use last non-zero slide speed (already preserved)
        break;
      case EFFECT_VIBRATO:
        if (param & 0x0f) this.vibratoDepth = param & 0x0f;
        if (param & 0xf0) this.vibratoSpeed = ((param >> 4) & 0x0f) * 2;
        break;
      case IT_EFFECT_FINE_VIBRATO:
        if (param & 0x0f) this.fineVibratoDepth = param & 0x0f;
        if (param & 0xf0) this.vibratoSpeed = ((param >> 4) & 0x0f) * 2;
        break;
      case EFFECT_TONE_PORTA_VOL:
        if (param > 0) {
          if (param & 0xf0) this.volSlideSpeed = (param >> 4) & 0x0f;
          else if (param & 0x0f) this.volSlideSpeed = -(param & 0x0f);
        }
        break;
      case EFFECT_VIBRATO_VOL:
        if (param > 0) {
          if (param & 0xf0) this.volSlideSpeed = (param >> 4) & 0x0f;
          else if (param & 0x0f) this.volSlideSpeed = -(param & 0x0f);
        }
        break;
      case EFFECT_TREMOLO:
        if (param & 0x0f) this.tremoloDepth = param & 0x0f;
        if (param & 0xf0) this.tremoloSpeed = ((param >> 4) & 0x0f) * 2;
        break;
      case EFFECT_PANNING:
        this.panning = param;
        break;
      case EFFECT_SAMPLE_OFFSET:
        this.sampleIndex = param * 256;
        break;
      case EFFECT_POSITION_JUMP:
        this.worklet.setPatternJump(param);
        break;
      case EFFECT_VOLUME_SLIDE:
        if (param > 0 || !isIT) {
          if (param & 0xf0) this.volSlideSpeed = (param >> 4) & 0x0f;
          else if (param & 0x0f) this.volSlideSpeed = -(param & 0x0f);
        }
        // IT: param 0 means use last non-zero volSlideSpeed (already preserved)
        break;
      case EFFECT_SET_VOLUME:
        this.volume = Math.min(64, param);
        break;
      case EFFECT_PATTERN_BREAK:
        // IT uses hex param (already translated); XM uses hex too; only MOD uses BCD
        if (this.worklet.mod!.type === 'MOD') {
          this.worklet.setPatternBreak(((param >> 4) & 0x0f) * 10 + (param & 0x0f));
        } else {
          this.worklet.setPatternBreak(param);
        }
        break;
      case EFFECT_SET_SPEED:
        if (param >= 1 && param < 32) this.worklet.setTicksPerRow(param);
        else if (param >= 32) this.worklet.setBpm(param);
        break;
      // IT-specific: Axx always sets speed, Txx always sets tempo
      case IT_EFFECT_SET_SPEED:
        if (param >= 1) this.worklet.setTicksPerRow(param);
        break;
      case IT_EFFECT_SET_TEMPO:
        if (param >= 32) this.worklet.setBpm(param);
        break;
      case IT_EFFECT_TEMPO_SLIDE: {
        const hi = (param >> 4) & 0x0f;
        const lo = param & 0x0f;
        if (hi > 0 && lo === 0) this.tempoSlide = hi;
        else if (lo > 0 && hi === 0) this.tempoSlide = -lo;
        break;
      }
      // IT-specific fine volume slides (tick 0 only)
      case IT_EFFECT_FINE_VOLSLIDE_UP:
        if (this.worklet.tick === 0) this.volume = Math.min(64, this.volume + param);
        break;
      case IT_EFFECT_FINE_VOLSLIDE_DOWN:
        if (this.worklet.tick === 0) this.volume = Math.max(0, this.volume - param);
        break;
      // IT-specific fine/extra-fine portamento (tick 0 only)
      case IT_EFFECT_FINE_PORTA_DOWN:
        if (this.worklet.tick === 0) this.currentPeriod += param / 64;
        break;
      case IT_EFFECT_FINE_PORTA_UP:
        if (this.worklet.tick === 0) this.currentPeriod -= param / 64;
        break;
      case IT_EFFECT_EXTRA_FINE_PORTA_DOWN:
        if (this.worklet.tick === 0) this.currentPeriod += param / 256;
        break;
      case IT_EFFECT_EXTRA_FINE_PORTA_UP:
        if (this.worklet.tick === 0) this.currentPeriod -= param / 256;
        break;
      case IT_EFFECT_SET_CHANNEL_VOLUME:
        this.channelVolume = Math.max(0, Math.min(64, param));
        break;
      case IT_EFFECT_CHANNEL_VOL_SLIDE:
        if (param > 0 || !isIT) {
          if (param & 0xf0) this.channelVolSlide = (param >> 4) & 0x0f;
          else if (param & 0x0f) this.channelVolSlide = -(param & 0x0f);
        }
        break;
      case EFFECT_GLOBAL_VOLUME:
        this.worklet.globalVolume = Math.min(64, param);
        break;
      case EFFECT_GLOBAL_VOL_SLIDE:
        if (param > 0) {
          if (param & 0xf0) this.globalVolSlide = param >> 4;
          else if (param & 0x0f) this.globalVolSlide = -(param & 0x0f);
        }
        break;
      case EFFECT_PANNING_SLIDE:
        if (param > 0) {
          if (param & 0xf0) this.panningSlide = param >> 4;
          else if (param & 0x0f) this.panningSlide = -(param & 0x0f);
        }
        break;
      case EFFECT_MULTI_RETRIG:
        if (param & 0x0f) this.retrig = param & 0x0f;
        break;
      case EFFECT_TREMOR:
        if (param > 0) {
          this.tremorOn = true;
          this.tremorCounter = 0;
        }
        break;
      case EFFECT_ENVELOPE_POS:
        this.volumeEnvTick = param;
        this.panningEnvTick = param;
        break;
      case EFFECT_EXTENDED:
        const sub = (param >> 4) & 0x0f;
        const subParam = param & 0x0f;
        switch (sub) {
          case 0x1:
            if (isIT) this.currentPeriod -= subParam / 64;
            else if (this.worklet.mod!.type === 'XM') this.currentPeriod -= subParam * 4;
            else this.currentPeriod -= subParam;
            break;
          case 0x2:
            if (isIT) this.currentPeriod += subParam / 64;
            else if (this.worklet.mod!.type === 'XM') this.currentPeriod += subParam * 4;
            else this.currentPeriod += subParam;
            break;
          case 0x4:
            this.vibratoWaveform = subParam & 3;
            break;
          case 0x5:
            this.worklet.setPatternLoopStart();
            break;
          case 0x6:
            if (subParam === 0) this.worklet.setPatternLoopStart();
            else this.worklet.setPatternLoop(subParam);
            break;
          case 0x7:
            this.tremoloWaveform = subParam & 3;
            break;
          case 0x9:
            this.retrig = subParam;
            break;
          case 0xa:
            this.volume = Math.min(64, this.volume + subParam);
            break;
          case 0xb:
            this.volume = Math.max(0, this.volume - subParam);
            break;
          case 0xc:
            if (this.worklet.tick === subParam) this.volume = 0;
            break;
          case 0xe:
            this.worklet.setPatternDelay(subParam);
            break;
        }
        break;
    }
  }

  performTick() {
    if (this.delayNoteTick !== -1) {
      if (this.worklet.tick === this.delayNoteTick) {
        if (this.pendingNote) this.processTrigger(this.pendingNote);
        this.delayNoteTick = -1;
        this.pendingNote = null;
      }
    }

    if (!this.playing) return;

    if (this.worklet.tick > 0) {
      if (this.volSlideSpeed !== 0) {
        this.volume = Math.max(0, Math.min(64, this.volume + this.volSlideSpeed));
      }
      if (this.channelVolSlide !== 0) {
        this.channelVolume = Math.max(0, Math.min(64, this.channelVolume + this.channelVolSlide));
      }
      const rowEffect = this.worklet.currentRowNotes[this.channelIndex]?.effect;
      if (
        this.tempoSlide !== 0 &&
        this.worklet.mod!.type === 'IT' &&
        rowEffect === IT_EFFECT_TEMPO_SLIDE
      ) {
        this.worklet.setBpm(Math.max(32, Math.min(255, this.worklet.bpm + this.tempoSlide)));
      }
      if (this.globalVolSlide !== 0) {
        this.worklet.globalVolume = Math.max(
          0,
          Math.min(64, this.worklet.globalVolume + this.globalVolSlide)
        );
      }
      if (this.panningSlide !== 0) {
        this.panning = Math.max(0, Math.min(255, this.panning + this.panningSlide));
      }

      const effect = this.worklet.currentRowNotes[this.channelIndex]?.effect;
      if (effect === EFFECT_TONE_PORTA || effect === EFFECT_TONE_PORTA_VOL) {
        if (this.worklet.mod!.type === 'IT') {
          // IT: period is note number; slide in fractional note units (param/64 semitones per tick)
          const slideAmt = this.slideSpeed / 64;
          if (this.targetPeriod !== 0) {
            if (this.currentPeriod < this.targetPeriod) {
              this.currentPeriod = Math.min(this.currentPeriod + slideAmt, this.targetPeriod);
            } else {
              this.currentPeriod = Math.max(this.currentPeriod - slideAmt, this.targetPeriod);
            }
          }
        } else if (this.worklet.mod!.type === 'XM') {
          if (this.targetPeriod !== 0) {
            if (this.currentPeriod < this.targetPeriod) {
              this.currentPeriod = Math.min(
                this.currentPeriod + this.slideSpeed * 4,
                this.targetPeriod
              );
            } else {
              this.currentPeriod = Math.max(
                this.currentPeriod - this.slideSpeed * 4,
                this.targetPeriod
              );
            }
          } else if (this.slideSpeed !== 0) {
            this.currentPeriod += this.slideSpeed * 4;
          }
        } else {
          // MOD standard periods
          if (this.targetPeriod !== 0) {
            if (this.currentPeriod < this.targetPeriod) {
              this.currentPeriod = Math.min(
                this.currentPeriod + this.slideSpeed,
                this.targetPeriod
              );
            } else {
              this.currentPeriod = Math.max(
                this.currentPeriod - this.slideSpeed,
                this.targetPeriod
              );
            }
          } else if (this.slideSpeed !== 0) {
            this.currentPeriod += this.slideSpeed;
          }
        }
      } else if (this.slideSpeed !== 0) {
        if (this.worklet.mod!.type === 'IT') {
          // IT: slide in fractional note units (param/64 semitones per tick)
          this.currentPeriod += this.slideSpeed / 64;
        } else if (this.worklet.mod!.type === 'XM') {
          this.currentPeriod += this.slideSpeed * 4;
        } else {
          this.currentPeriod += this.slideSpeed;
        }
      }

      if (this.retrig > 0 && this.worklet.tick % this.retrig === 0) {
        this.sampleIndex = 0;
      }

      if (this.tremorOn) {
        const p = this.worklet.currentRowNotes[this.channelIndex]?.effectParam || 0;
        const p1 = (p >> 4) & 0x0f;
        const p2 = p & 0x0f;
        this.tremorCounter++;
        if (this.tremorCounter > p1 + p2) this.tremorCounter = 0;
      }
    }

    if (this.instrument) {
      if (this.keyOn) {
        if (this.instrument.volumeEnv) {
          this.volumeEnvValue = this.calculateEnvelope(
            this.instrument.volumeEnv,
            this.volumeEnvTick++
          );
        }
        if (this.instrument.panningEnv) {
          this.panningEnvValue = this.calculateEnvelope(
            this.instrument.panningEnv,
            this.panningEnvTick++
          );
        }
      } else {
        if (this.instrument.volumeFadeout !== undefined && this.instrument.volumeFadeout > 0) {
          this.fadeoutVolume = Math.max(0, this.fadeoutVolume - this.instrument.volumeFadeout);
          if (this.fadeoutVolume <= 0) this.playing = false;
        } else {
          this.playing = false;
        }
      }
    }

    let renderPeriod = this.currentPeriod;

    // Arpeggio logic
    if (this.arpeggioNotes.length > 0) {
      const isXmOrIt =
        (this.worklet.mod!.type as string) === 'XM' || (this.worklet.mod!.type as string) === 'IT';
      const isIT = (this.worklet.mod!.type as string) === 'IT';

      // ProTracker Arpeggio Quirk: Does not play on Tick 0
      if (!isXmOrIt && this.worklet.tick % this.worklet.ticksPerRow === 0) {
        // Stay on base note
      } else {
        const cycle = this.worklet.tick % 3;
        let arpNote = 0;
        if (isXmOrIt) {
          // FT2/IT Arpeggio cycle: 0, y, x
          if (cycle === 0) arpNote = 0;
          else if (cycle === 1)
            arpNote = this.arpeggioNotes[1]; // low nibble
          else arpNote = this.arpeggioNotes[2]; // high nibble
        } else {
          arpNote = this.arpeggioNotes[cycle];
        }

        if (arpNote > 0) {
          if (isIT) {
            // IT: period is note number, just add semitones directly
            renderPeriod += arpNote;
          } else if (this.worklet.mod!.type === 'XM') {
            if (this.worklet.mod!.linearFrequencies) renderPeriod -= arpNote * 16 * 4;
            else renderPeriod /= Math.pow(2, arpNote / 12);
          } else {
            renderPeriod /= Math.pow(2, arpNote / 12);
          }
        }
      }
    }

    const isFineVibratoRow =
      this.worklet.currentRowNotes[this.channelIndex]?.effect === IT_EFFECT_FINE_VIBRATO;
    const activeVibratoDepth = isFineVibratoRow
      ? this.fineVibratoDepth / 4
      : this.vibratoDepth;

    if (activeVibratoDepth > 0) {
      let phase = Math.floor(this.vibratoPhase * 64) & 63;
      let mod = 0;
      if (phase < 32) mod = SINE_TABLE[phase];
      else mod = -SINE_TABLE[phase - 32];

      const isIT = (this.worklet.mod!.type as string) === 'IT';

      if (isIT) {
        // IT: period is note number, vibrato adds fractional semitones
        renderPeriod += (mod * activeVibratoDepth) / (128 * 16);
      } else {
        const isXm = (this.worklet.mod!.type as string) === 'XM';
        let depthScale = isXm && this.worklet.mod!.linearFrequencies ? 4 : 1;

        if (this.worklet.mod!.linearFrequencies)
          renderPeriod += (mod * activeVibratoDepth * depthScale) / 128;
        else renderPeriod += (mod * activeVibratoDepth * depthScale * 4) / 128;
      }

      this.vibratoPhase += this.vibratoSpeed / 256;
    }

    const freq = this.getFrequency(renderPeriod);
    this.sampleSpeed = freq / this.worklet.sampleRate;
  }

  calculateEnvelope(_env: Envelope, tick: number) {
    if (this.instrument?.volumeEnv) {
      const volEnv = this.instrument.volumeEnv;
      const points = volEnv.points;
      if (volEnv.type & 4 && volEnv.loopEnd !== undefined && volEnv.loopEnd < points.length) {
        const loopEndTick = points[volEnv.loopEnd].tick;
        const loopStartTick = points[volEnv.loopStart ?? 0]?.tick ?? 0;
        if (tick >= loopEndTick) {
          tick = loopStartTick + ((tick - loopStartTick) % (loopEndTick - loopStartTick + 1));
        }
      }
      if (
        this.keyOn &&
        volEnv.type & 2 &&
        volEnv.sustainStart !== undefined &&
        volEnv.sustainStart < points.length
      ) {
        const susTick = points[volEnv.sustainStart].tick;
        if (tick >= susTick) tick = susTick;
      }

      if (tick <= points[0].tick) return points[0].value;
      for (let i = 0; i < points.length - 1; i++) {
        if (tick <= points[i + 1].tick) {
          const t = (tick - points[i].tick) / (points[i + 1].tick - points[i].tick);
          return points[i].value + (points[i + 1].value - points[i].value) * t;
        }
      }
      return points[points.length - 1].value;
    }
    return 64;
  }

  getFrequency(period: number) {
    if (period <= 0) return 0;
    if (this.worklet.mod!.type === 'IT') {
      // IT: period IS the note number (1-120). C-5 = note 61.
      // Frequency = C5Speed * 2^((note - 61) / 12)
      const semitoneFromC5 = period - 61;
      return (this.sample?.c5speed || 8363) * Math.pow(2, semitoneFromC5 / 12);
    }
    if (this.worklet.mod!.linearFrequencies) {
      return 8363 * Math.pow(2, (4608 - period) / 768);
    }
    const ft = this.sample ? this.sample.finetune : 0;
    const isXmOrIt = this.worklet.mod!.type === 'XM' || (this.worklet.mod!.type as string) === 'IT';
    if (isXmOrIt) {
      period *= Math.pow(2, -ft / (128 * 12));
      return (this.worklet.mod!.clock || 7093789.2) / ((period * 2) / 16);
    } else {
      period *= Math.pow(2, -ft / (8 * 12));
      return (this.worklet.mod!.clock || 7093789.2) / (period * 2);
    }
  }

  nextSample(): [number, number] {
    if (!this.playing || !this.sample || !this.sample.data || this.sample.data.length === 0)
      return [0, 0];
    if (this.sample.loopLength > 2) {
      const loopEnd = this.sample.loopStart + this.sample.loopLength;
      if (this.sampleIndex >= loopEnd)
        this.sampleIndex =
          this.sample.loopStart + ((this.sampleIndex - loopEnd) % this.sample.loopLength);
    } else if (this.sampleIndex >= this.sample.length) {
      this.playing = false;
      return [0, 0];
    }
    let sIdx = Math.floor(this.sampleIndex);
    let raw = this.sample.data[sIdx];
    this.sampleIndex += this.sampleSpeed;
    let vol =
      (this.volume / 64) *
      (this.channelVolume / 64) *
      (this.sample.volume / 64) *
      (this.worklet.globalVolume / 64);
    if (this.tremorOn) {
      const p = this.worklet.currentRowNotes[this.channelIndex]?.effectParam ?? 0;
      if (this.tremorCounter > ((p >> 4) & 0x0f)) vol = 0;
    }
    if (this.instrument) vol *= (this.volumeEnvValue / 64) * (this.fadeoutVolume / 32768);

    // Equal Power Panning Law: L = Vol * cos(theta), R = Vol * sin(theta)
    // theta = (panning/255) * (PI/2)
    const panTheta = (this.panning / 255) * (Math.PI / 2);
    const l = raw * vol * Math.cos(panTheta);
    const r = raw * vol * Math.sin(panTheta);

    return [l, r];
  }
}

class ModPlayerWorklet extends AudioWorkletProcessor {
  mod: WorkletModule | null = null;
  channels: WorkletChannel[] = [];
  backgroundVoices: BackgroundVoice[] = [];
  static readonly MAX_BACKGROUND_VOICES = 64;
  playing = false;
  sampleRate = 44100;
  tick = 0;
  ticksPerRow = 6;
  bpm = 125;
  position = 0;
  rowIndex = 0;
  outputsPerTick = 0;
  outputsUntilNextTick = 0;
  globalVolume = 64;
  masterVolume = 0.7;
  patternLoopRow = -1;
  patternLoopCount = 0;
  patternLoopPosition = -1;
  jumpPosition = -1;
  jumpRowIndex = -1;
  patternDelay = 0;
  currentRowNotes: WorkletNote[] = [];

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent) => {
      const data = e.data;
      if (data.type === 'play') {
        this.mod = data.mod;
        this.sampleRate = data.sampleRate;
        this.globalVolume = this.mod!.globalVolume ?? 64;
        this.setBpm(this.mod!.defaultBpm || 125);
        this.setTicksPerRow(this.mod!.defaultSpeed || 6);
        this.channels = [];
        for (let i = 0; i < this.mod!.channels; i++) {
          const ch = new WorkletChannel(this, i);
          // Standard Amiga panning: LRRL (Channels 0, 3 Left-ish; 1, 2 Right-ish)
          if (this.mod!.type === 'MOD') {
            ch.panning = i % 4 === 1 || i % 4 === 2 ? 200 : 56;
          } else if (this.mod!.channelPanning && i < this.mod!.channelPanning.length) {
            ch.panning = this.mod!.channelPanning[i];
          }

          if (this.mod!.channelVolumes && i < this.mod!.channelVolumes.length) {
            ch.channelVolume = this.mod!.channelVolumes[i];
          }
          this.channels.push(ch);
        }
        this.position = this.mod!.restartPosition || 0;
        this.rowIndex = -1;
        this.tick = this.ticksPerRow; // Force immediate Row 0 trigger on first process sample
        this.backgroundVoices = [];
        this.playing = true;
      } else if (data.type === 'stop') {
        this.playing = false;
        // Optional: clear active channel output to avoid buzzing
        this.channels.forEach((ch) => (ch.playing = false));
        this.backgroundVoices = [];
      } else if (data.type === 'resume') {
        this.playing = true;
        this.channels.forEach((ch) => {
          if (ch.sample) ch.playing = true;
        });
      } else if (data.type === 'seek') {
        this.position = data.position;
        this.rowIndex = data.rowIndex - 1;
        this.tick = this.ticksPerRow;
        this.channels.forEach((ch) => ch.reset());
        this.backgroundVoices = [];
      } else if (data.type === 'setVolume') {
        this.masterVolume = data.volume;
      } else if (data.type === 'setSpeed') {
        this.setTicksPerRow(data.speed);
      } else if (data.type === 'setBpm') {
        this.setBpm(data.bpm);
      }
    };
  }

  setTicksPerRow(tpr: number) {
    this.ticksPerRow = tpr || 6;
    this.port.postMessage({ type: 'speed', speed: this.ticksPerRow });
  }
  setBpm(bpm: number) {
    this.bpm = bpm || 125;
    this.outputsPerTick = (this.sampleRate * 2.5) / this.bpm;
    this.port.postMessage({ type: 'bpm', bpm: this.bpm });
  }
  setPatternBreak(row: number) {
    this.jumpRowIndex = row;
    if (this.jumpPosition === -1) this.jumpPosition = this.position + 1;
  }
  setPatternJump(pos: number) {
    this.jumpPosition = pos;
    this.jumpRowIndex = 0;
  }
  setPatternLoopStart() {
    this.patternLoopRow = this.rowIndex;
    this.patternLoopPosition = this.position;
  }
  setPatternLoop(count: number) {
    this.patternLoopCount = count;
  }
  setPatternDelay(frames: number) {
    this.patternDelay = frames;
  }

  /** Spawn a background voice from a channel's current playing state (IT NNA) */
  spawnBackgroundVoice(ch: WorkletChannel, nna: number): void {
    if (!ch.sample || !ch.playing) return;
    // Limit background voices to prevent CPU overload
    if (this.backgroundVoices.length >= ModPlayerWorklet.MAX_BACKGROUND_VOICES) {
      // Remove the oldest/quietest voice
      let minIdx = 0;
      let minVol = Infinity;
      for (let i = 0; i < this.backgroundVoices.length; i++) {
        const v = this.backgroundVoices[i].volume * this.backgroundVoices[i].fadeoutVolume;
        if (v < minVol) {
          minVol = v;
          minIdx = i;
        }
      }
      this.backgroundVoices.splice(minIdx, 1);
    }
    const bg = new BackgroundVoice(ch);
    bg.applyNNA(nna);
    this.backgroundVoices.push(bg);
  }

  nextRow() {
    if (this.patternDelay > 0) {
      this.patternDelay--;
      return;
    }
    if (this.jumpPosition !== -1) {
      this.position = this.jumpPosition;
      this.rowIndex = this.jumpRowIndex !== -1 ? this.jumpRowIndex : 0;
      this.jumpPosition = -1;
      this.jumpRowIndex = -1;
    } else if (this.patternLoopRow >= 0 && this.patternLoopCount > 0) {
      this.rowIndex = this.patternLoopRow;
      this.position = this.patternLoopPosition;
      this.patternLoopCount--;
    } else {
      this.rowIndex++;
      const curPat = this.mod!.patterns[this.mod!.patternTable[this.position]];
      if (curPat && this.rowIndex >= curPat.rows.length) {
        this.rowIndex = 0;
        this.position++;
      }
    }
    if (this.position >= this.mod!.length || this.position < 0)
      this.position = this.mod!.restartPosition || 0;
    const patIdx = this.mod!.patternTable[this.position];
    const pat = this.mod!.patterns[patIdx];
    if (pat) {
      this.currentRowNotes = pat.rows[this.rowIndex].notes;
      this.channels.forEach((ch, i) => {
        // For MOD/XM: reset row-specific slide memory before processing new row/note
        // For IT: preserve effect memory (reset is handled in handleEffect)
        if (this.mod!.type !== 'IT') {
          ch.volSlideSpeed = 0;
          ch.panningSlide = 0;
          ch.vibratoDepth = 0; // Standard trackers reset these unless re-triggered
        }

        if (this.currentRowNotes[i]) ch.trigger(this.currentRowNotes[i]);
      });
    }
    const activeChannels = this.channels.map((ch) => ch.playing && ch.volume > 0);
    const channelInstruments = this.channels.map((ch) => ch.instrument?.index ?? 0);
    this.port.postMessage({
      type: 'row',
      position: this.position,
      rowIndex: this.rowIndex,
      activeChannels,
      channelInstruments,
    });
  }

  process(_inputs: any, outputs: any) {
    if (!this.playing || !this.mod) return true;
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const leftChannel = output[0];
    const rightChannel = output[1];
    const numSamples = leftChannel.length;

    for (let i = 0; i < numSamples; i++) {
      if (this.outputsUntilNextTick <= 0) {
        this.tick++;
        if (this.tick >= this.ticksPerRow) {
          this.tick = 0;
          this.nextRow();
        }
        this.channels.forEach((ch) => ch.performTick());
        // Tick background voices (IT NNA)
        for (let bg = this.backgroundVoices.length - 1; bg >= 0; bg--) {
          this.backgroundVoices[bg].performTick();
          if (!this.backgroundVoices[bg].playing) {
            this.backgroundVoices.splice(bg, 1);
          }
        }
        this.outputsUntilNextTick += this.outputsPerTick;
      }
      this.outputsUntilNextTick--;

      let lOut = 0,
        rOut = 0;
      this.channels.forEach((ch) => {
        const [l, r] = ch.nextSample();
        lOut += l;
        rOut += r;
      });
      // Mix background voices (IT NNA)
      for (let bg = this.backgroundVoices.length - 1; bg >= 0; bg--) {
        const bgv = this.backgroundVoices[bg];
        if (!bgv.playing) {
          this.backgroundVoices.splice(bg, 1);
          continue;
        }
        const [bl, br] = bgv.nextSample();
        lOut += bl;
        rOut += br;
      }

      if (leftChannel) leftChannel[i] = Math.tanh(lOut * 0.42 * this.masterVolume);
      if (rightChannel) rightChannel[i] = Math.tanh(rOut * 0.42 * this.masterVolume);
    }
    return true;
  }
}

registerProcessor('chiptune-worklet', ModPlayerWorklet);
