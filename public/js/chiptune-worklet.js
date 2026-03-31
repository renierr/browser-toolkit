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
const EFFECT_KEY_OFF = 0x14; // K
const EFFECT_ENVELOPE_POS = 0x15; // L
const EFFECT_PANNING_SLIDE = 0x19; // P
const EFFECT_MULTI_RETRIG = 0x1b; // R
const EFFECT_TREMOR = 0x1d; // T

class WorkletChannel {
  constructor(worklet, index) {
    this.worklet = worklet;
    this.channelIndex = index;
    
    this.reset();
  }

  reset() {
    this.instrument = null;
    this.sample = null;
    this.note = null;
    
    this.playing = false;
    this.keyOn = false;
    
    this.period = 0;
    this.targetPeriod = 0;
    this.currentPeriod = 0;
    
    this.volume = 64;
    this.panning = 128;
    this.baseVolume = 64;
    
    this.sampleIndex = 0;
    this.sampleSpeed = 0;
    this.sampleOffset = 0;

    this.vibratoPhase = 0;
    this.vibratoSpeed = 0;
    this.vibratoDepth = 0;
    this.vibratoWaveform = 0;

    this.tremoloPhase = 0;
    this.tremoloSpeed = 0;
    this.tremoloDepth = 0;
    this.tremoloWaveform = 0;

    this.slideSpeed = 0;
    this.volSlideSpeed = 0;
    this.fineSlideSpeed = 0;
    
    this.arpeggioNotes = [];
    
    this.volumeEnvTick = 0;
    this.panningEnvTick = 0;
    this.volumeEnvValue = 64;
    this.panningEnvValue = 128;
    this.fadeoutVolume = 32768;

    this.retrig = 0;
    this.delayNote = -1;
    this.globalVolSlide = 0;
    this.panningSlide = 0;
    this.tremorCounter = 0;
    this.tremorOn = false;
    this.pendingNote = null;
    this.delayNoteTick = -1;
  }

  trigger(note) {
    if (!note.instrument && !note.period && note.note === null) return;

    let tonePorta = note.effect === EFFECT_TONE_PORTA || note.effect === EFFECT_TONE_PORTA_VOL;

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

  processTrigger(note) {
    let tonePorta = note.effect === EFFECT_TONE_PORTA || note.effect === EFFECT_TONE_PORTA_VOL;

    if (note.instrument > 0) {
      this.instrument = this.worklet.mod.instruments[note.instrument - 1];
      if (this.instrument && this.instrument.samples.length > 0) {
        this.baseVolume = this.instrument.samples[0].volume;
      }
      this.assignSample(note.note || this.note || 1);
      // Instrument only trigger resets volume
      if (note.note === null) {
        this.volume = this.baseVolume;
      }
    }

    if (note.note !== null) {
      if (note.note === 97) { // KeyOff
        this.keyOn = false;
        if (this.worklet.mod.type === 'MOD') {
          this.playing = false;
          this.volume = 0;
        }
      } else {
        if (tonePorta) {
          this.targetPeriod = this.calculatePeriod(note.note, note.instrument);
        } else {
          this.note = note.note;
          this.assignSample(note.note);
          this.period = note.period || this.calculatePeriod(note.note, note.instrument);
          this.currentPeriod = this.period;
          this.volume = this.baseVolume;
          this.sampleIndex = 0;
          this.vibratoPhase = 0;
          this.volumeEnvTick = 0;
          this.panningEnvTick = 0;
          this.fadeoutVolume = 32768;
          this.keyOn = true;
          this.playing = !!this.sample && this.period > 0;
        }
      }
    }

    // Set Volume
    if (note.volume !== null && note.volume !== undefined && note.volume <= 64) {
      this.volume = note.volume;
    }

    // Handle Volume Column (XM)
    if (note.volumeColumn !== null && note.volumeColumn !== undefined) {
      const vc = note.volumeColumn;
      if (vc >= 0x10 && vc <= 0x50) this.volume = vc - 0x10; // Set volume
      else if (vc >= 0x60 && vc <= 0x6f) this.volSlideSpeed = -(vc & 0x0f); // Vol slide down
      else if (vc >= 0x70 && vc <= 0x7f) this.volSlideSpeed = (vc & 0x0f); // Vol slide up
      else if (vc >= 0x80 && vc <= 0x8f) { // Fine vol slide down
        if (this.worklet.tick === 0) this.volume = Math.max(0, this.volume - (vc & 0x0f));
      }
      else if (vc >= 0x90 && vc <= 0x9f) { // Fine vol slide up
        if (this.worklet.tick === 0) this.volume = Math.min(64, this.volume + (vc & 0x0f));
      }
      else if (vc >= 0xa0 && vc <= 0xaf) this.vibratoSpeed = (vc & 0x0f) * 2;
      else if (vc >= 0xb0 && vc <= 0xbf) this.vibratoDepth = vc & 0x0f;
      else if (vc >= 0xc0 && vc <= 0xcf) this.panning = (vc & 0x0f) * 16 + 8;
    }

    this.handleEffect(note);
  }

  assignSample(noteValue) {
    if (!this.instrument) return;
    let sIdx = 0;
    if (this.instrument.sampleMap && noteValue >= 1 && noteValue <= 96) {
      sIdx = this.instrument.sampleMap[noteValue - 1];
    }
    this.sample = this.instrument.samples[sIdx] || this.instrument.samples[0] || null;
    if (this.sample && this.worklet.mod.type !== 'MOD') {
      this.panning = this.sample.panning;
    }
  }

  calculatePeriod(noteValue, instrumentIdx) {
    if (!this.worklet.mod) return 0;
    const inst = (instrumentIdx > 0 ? this.worklet.mod.instruments[instrumentIdx - 1] : this.instrument);
    if (!inst || inst.samples.length === 0) return 0;
    
    let sIdx = 0;
    if (inst.sampleMap && noteValue >= 1 && noteValue <= 96) sIdx = inst.sampleMap[noteValue - 1];
    const sample = inst.samples[sIdx] || inst.samples[0];
    
    if (this.worklet.mod.type === 'IT') return noteValue; 
    
    if (this.worklet.mod.type === 'XM' || this.worklet.mod.type === 'IT') {
      const actualNote = noteValue - 1 + (sample.baseNote || 0);
      if (this.worklet.mod.linearFrequencies) {
        return 10 * 12 * 16 * 4 - actualNote * 16 * 4 - (sample.finetune || 0) / 2;
      } else {
        const AMIGA_TABLE = [1712, 1616, 1525, 1440, 1357, 1281, 1209, 1141, 1077, 1017, 961, 907];
        let n = actualNote;
        let octave = 0;
        while (n >= 12) { n -= 12; octave++; }
        while (n < 0) { n += 12; octave--; }
        let p = AMIGA_TABLE[n] / Math.pow(2, octave);
        return p * 16; // XM Amiga periods are scaled
      }
    }
    
    // ProTracker Amiga periods
    const AMIGA_TABLE = [1712, 1616, 1525, 1440, 1357, 1281, 1209, 1141, 1077, 1017, 961, 907];
    let n = noteValue - 1 + (sample.baseNote || 0);
    let octave = 0;
    while (n >= 12) { n -= 12; octave++; }
    while (n < 0) { n += 12; octave--; }
    let p = AMIGA_TABLE[n] / Math.pow(2, octave);
    return p;
  }

  handleEffect(note) {
    if (this.worklet.tick === 0) {
      this.slideSpeed = 0;
      this.volSlideSpeed = 0;
      this.fineSlideSpeed = 0;
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
        this.slideSpeed = -param;
        break;
      case EFFECT_PORTA_DOWN:
        this.slideSpeed = param;
        break;
      case EFFECT_TONE_PORTA:
        if (param > 0) this.slideSpeed = param;
        break;
      case EFFECT_VIBRATO:
        if (param & 0x0f) this.vibratoDepth = param & 0x0f;
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
        this.sampleOffset = param * 256;
        break;
      case EFFECT_POSITION_JUMP:
        this.worklet.setPatternJump(param);
        break;
      case EFFECT_VOLUME_SLIDE:
        if (param & 0xf0) this.volSlideSpeed = (param >> 4) & 0x0f;
        else if (param & 0x0f) this.volSlideSpeed = -(param & 0x0f);
        break;
      case EFFECT_SET_VOLUME:
        this.volume = Math.min(64, param);
        break;
      case EFFECT_PATTERN_BREAK:
        this.worklet.setPatternBreak(((param >> 4) & 0x0f) * 10 + (param & 0x0f));
        break;
      case EFFECT_SET_SPEED:
        if (param >= 1 && param < 32) this.worklet.setTicksPerRow(param);
        else if (param >= 32) this.worklet.setBpm(param);
        break;
      case EFFECT_GLOBAL_VOLUME:
        this.worklet.globalVolume = Math.min(64, param);
        break;
      case EFFECT_GLOBAL_VOL_SLIDE:
        if (param > 0) {
          if (param & 0xf0) this.globalVolSlide = (param >> 4);
          else if (param & 0x0f) this.globalVolSlide = -(param & 0x0f);
        }
        break;
      case EFFECT_PANNING_SLIDE:
        if (param > 0) {
          if (param & 0xf0) this.panningSlide = (param >> 4);
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
      case EFFECT_EXTENDED:
        const sub = (param >> 4) & 0x0f;
        const subParam = param & 0x0f;
        switch (sub) {
          case 0x1: this.currentPeriod -= subParam * 4; break; // Fine porta up
          case 0x2: this.currentPeriod += subParam * 4; break; // Fine porta down
          case 0x4: this.vibratoWaveform = subParam & 3; break;
          case 0x5: this.loopStartRow = this.worklet.rowIndex; break;
          case 0x6:
            if (subParam === 0) this.worklet.setPatternLoop(this.loopStartRow >= 0 ? this.loopStartRow : 0);
            else this.worklet.setPatternLoopCount(subParam);
            break;
          case 0x7: this.tremoloWaveform = subParam & 3; break;
          case 0x9: this.retrig = subParam; break;
          case 0xa: this.volume = Math.min(64, this.volume + subParam); break;
          case 0xb: this.volume = Math.max(0, this.volume - subParam); break;
          case 0xc: if (this.worklet.tick === subParam) this.volume = 0; break;
          case 0xd: this.delayNote = subParam; break;
          case 0xe: this.worklet.setPatternDelay(subParam); break;
        }
        break;
    }
  }

  performTick() {
    // Process pending note delay
    if (this.delayNoteTick !== -1) {
       if (this.worklet.tick === this.delayNoteTick) {
         this.processTrigger(this.pendingNote);
         this.delayNoteTick = -1;
         this.pendingNote = null;
       }
    }

    if (!this.playing) return;

    // Continuous effects
    if (this.worklet.tick > 0) {
      // Volume Slide
      if (this.volSlideSpeed !== 0) {
        this.volume = Math.max(0, Math.min(64, this.volume + this.volSlideSpeed));
      }
      
      // Global Volume Slide
      if (this.globalVolSlide !== 0) {
        this.worklet.globalVolume = Math.max(0, Math.min(64, this.worklet.globalVolume + this.globalVolSlide));
      }

      // Panning Slide
      if (this.panningSlide !== 0) {
        this.panning = Math.max(0, Math.min(255, this.panning + this.panningSlide));
      }
      
      // Portamento
      if (this.worklet.tick > 0) {
        const effect = this.worklet.currentRowNotes[this.channelIndex].effect;
        if (effect === EFFECT_TONE_PORTA || effect === EFFECT_TONE_PORTA_VOL) {
           if (this.currentPeriod < this.targetPeriod) {
             this.currentPeriod = Math.min(this.targetPeriod, this.currentPeriod + Math.abs(this.slideSpeed) * 4);
           } else if (this.currentPeriod > this.targetPeriod) {
             this.currentPeriod = Math.max(this.targetPeriod, this.currentPeriod - Math.abs(this.slideSpeed) * 4);
           }
        } else if (this.slideSpeed !== 0) {
           this.currentPeriod += this.slideSpeed * 4;
        }
      }

      // Retrig
      if (this.retrig > 0 && (this.worklet.tick % this.retrig === 0)) {
        this.sampleIndex = 0;
      }
      
      // Tremor
      if (this.tremorOn) {
        const rowNote = this.worklet.currentRowNotes[this.channelIndex];
        const p1 = (rowNote.effectParam >> 4) & 0x0f;
        const p2 = rowNote.effectParam & 0x0f;
        this.tremorCounter++;
        if (this.tremorCounter > (p1 + p2)) this.tremorCounter = 0;
      }
    }

    // Update Envelopes
    if (this.instrument) {
      if (this.keyOn) {
        if (this.instrument.volumeEnv) {
          this.volumeEnvValue = this.calculateEnvelope(this.instrument.volumeEnv, this.volumeEnvTick++);
        }
        if (this.instrument.panningEnv) {
          this.panningEnvValue = this.calculateEnvelope(this.instrument.panningEnv, this.panningEnvTick++);
        }
      } else {
        if (this.instrument.volumeFadeout > 0) {
           this.fadeoutVolume = Math.max(0, this.fadeoutVolume - this.instrument.volumeFadeout);
           if (this.fadeoutVolume <= 0) this.playing = false;
        } else {
           this.playing = false;
        }
      }
    }

    // Final Period (Arpeggio & Vibrato)
    let renderPeriod = this.currentPeriod;
    const rowNote = this.worklet.currentRowNotes ? this.worklet.currentRowNotes[this.channelIndex] : null;
    
    if (this.arpeggioNotes.length > 0) {
      const arpNote = this.arpeggioNotes[this.worklet.tick % 3];
      if (arpNote > 0) {
         if (this.worklet.mod.linearFrequencies) renderPeriod -= arpNote * 16 * 4;
         else renderPeriod /= Math.pow(2, arpNote / 12);
      }
    }
    
    if (this.vibratoDepth > 0) {
      let mod = 0;
      if (this.vibratoWaveform === 0 || this.vibratoWaveform === 3) mod = Math.sin(this.vibratoPhase * Math.PI * 2);
      else if (this.vibratoWaveform === 1) mod = (this.vibratoPhase < 0.5) ? (this.vibratoPhase * 4 - 1) : (3 - this.vibratoPhase * 4);
      else if (this.vibratoWaveform === 2) mod = (this.vibratoPhase < 0.5) ? 1 : -1;
      
      if (this.worklet.mod.linearFrequencies) renderPeriod += mod * this.vibratoDepth * 2;
      else renderPeriod += mod * this.vibratoDepth * 4;
      this.vibratoPhase += this.vibratoSpeed / 256;
    }

    const freq = this.getFrequency(renderPeriod);
    this.sampleSpeed = freq / this.worklet.sampleRate;
  }

  calculateEnvelope(env, tick) {
    if (!env || !env.points || env.points.length === 0) return 64;
    const points = env.points;
    
    // Loop
    if ((env.type & 4) && env.loopEnd !== undefined) {
      const loopEndTick = points[env.loopEnd].tick;
      const loopStartTick = points[env.loopStart].tick;
      if (tick >= loopEndTick) {
        tick = loopStartTick + (tick - loopStartTick) % (loopEndTick - loopStartTick + 1);
      }
    }
    
    // Sustain
    if (this.keyOn && (env.type & 2) && env.sustainStart !== undefined) {
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

  getFrequency(period) {
    if (period <= 0) return 0;
    if (this.worklet.mod.type === 'IT') {
      const actualNote = period - 1;
      return (this.sample?.c5speed || 8363) * Math.pow(2, (actualNote - 60) / 12);
    }
    if (this.worklet.mod.linearFrequencies) {
      return 8363 * Math.pow(2, (4608 - period) / 768);
    }
    const ft = this.sample ? this.sample.finetune : 0;
    if (this.worklet.mod.type === 'XM' || this.worklet.mod.type === 'IT') {
      // XM finetune is in 1/128 semitone units
      period *= Math.pow(2, -ft / (128 * 12));
      return (this.worklet.mod.clock || 7093789.2) / (period * 2 / 16); 
    } else {
      // ProTracker finetune is in 1/8 semitone units
      period *= Math.pow(2, -ft / (8 * 12));
      return (this.worklet.mod.clock || 7093789.2) / (period * 2);
    }
  }

  nextSample() {
    if (!this.playing || !this.sample || !this.sample.data || this.sample.data.length === 0) {
      return [0, 0];
    }

    if (this.sample.loopLength > 2) {
      const loopEnd = this.sample.loopStart + this.sample.loopLength;
      if (this.sampleIndex >= loopEnd) {
        this.sampleIndex = this.sample.loopStart + (this.sampleIndex - loopEnd) % this.sample.loopLength;
      }
    } else if (this.sampleIndex >= this.sample.length) {
      this.playing = false;
      return [0, 0];
    }

    let sIdx = Math.floor(this.sampleIndex);
    const raw = this.sample.data[sIdx] / 128;
    this.sampleIndex += this.sampleSpeed;

    // Volume calculation
    let vol = (this.volume / 64) * (this.sample.volume / 64) * (this.worklet.globalVolume / 64);
    if (this.tremorOn) {
      const rowNote = this.worklet.currentRowNotes[this.channelIndex];
      const p1 = (rowNote.effectParam >> 4) & 0x0f;
      if (this.tremorCounter > p1) vol = 0;
    }
    if (this.instrument) {
       vol *= (this.volumeEnvValue / 64) * (this.fadeoutVolume / 32768);
    }
    
    // Panning calculation
    let pan = this.panning;
    if (this.instrument && this.instrument.panningEnv) {
       pan += (this.panningEnvValue - 128) * (1 - Math.abs(pan - 128) / 128);
    }
    pan = Math.max(0, Math.min(255, pan));

    const leftVol = vol * (1 - pan / 255);
    const rightVol = vol * (pan / 255);

    return [raw * leftVol, raw * rightVol];
  }
}

class ModPlayerWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this.port.onmessage = this.onmessage.bind(this);
    this.mod = null;
    this.channels = [];
    this.playing = false;
    this.sampleRate = 44100;
    this.tick = 0;
    this.ticksPerRow = 6;
    this.bpm = 125;
    this.position = 0;
    this.rowIndex = 0;
    this.outputsPerTick = 0;
    this.outputsUntilNextTick = 0;
    this.patternBreak = false;
    this.globalVolume = 64;
    this.masterVolume = 0.7;
    this.patternLoopRow = -1;
    this.patternLoopCount = 0;
    this.patternLoopPosition = -1;
    this.nextPosition = -1;
    this.jumpRowIndex = -1;
    this.patternDelay = 0;
    this.publishRow = true;
    this.currentRowNotes = [];
  }

  onmessage(event) {
    const data = event.data;
    switch (data.type) {
      case 'play':
        this.play(data.mod, data.sampleRate);
        break;
      case 'stop':
        this.playing = false;
        break;
      case 'setBpm':
        this.setBpm(data.bpm);
        break;
      case 'setSpeed':
        this.setTicksPerRow(data.speed);
        break;
      case 'setVolume':
        this.masterVolume = data.volume;
        break;
    }
  }

  play(mod, sampleRate) {
    this.mod = mod;
    this.sampleRate = sampleRate;
    this.setBpm(mod.defaultBpm || 125);
    this.setTicksPerRow(mod.defaultSpeed || 6);

    this.channels = [];
    for (let i = 0; i < mod.channels; i++) {
      const ch = new WorkletChannel(this, i);
      if (mod.type === 'MOD') {
        ch.panning = (i % 4 === 1 || i % 4 === 2) ? 200 : 56;
      }
      this.channels.push(ch);
    }

    this.position = 0;
    this.rowIndex = 0;
    this.tick = -1;
    this.outputsUntilNextTick = 0;
    this.patternBreak = false;
    this.patternJump = -1;
    this.playing = true;
    this.publishRow = true;
    
    this.tick = this.ticksPerRow - 1; 
  }

  setTicksPerRow(tpr) { 
    this.ticksPerRow = tpr || 6;
    this.port.postMessage({ type: 'speed', speed: this.ticksPerRow });
  }
  setBpm(bpm) { 
    this.bpm = bpm || 125; 
    this.outputsPerTick = (this.sampleRate * 2.5) / this.bpm;
    this.port.postMessage({ type: 'bpm', bpm: this.bpm });
  }
  setPatternBreak(row) { this.jumpRowIndex = row; if (this.nextPosition === -1) this.nextPosition = this.position + 1; }
  setPatternJump(pos) { this.nextPosition = pos; this.jumpRowIndex = 0; }
  setPatternLoop(row) { this.patternLoopRow = row; this.patternLoopPosition = this.position; }
  setPatternLoopCount(count) { this.patternLoopCount = count; }
  setPatternDelay(frames) { this.patternDelay = frames; }

  nextRow() {
    if (this.patternDelay > 0) {
      this.patternDelay--;
      return;
    }

    let currentPatternIndex = this.mod.patternTable[this.position];
    let currentPattern = this.mod.patterns[currentPatternIndex];

    if (this.nextPosition !== -1) {
      this.position = this.nextPosition;
      this.rowIndex = this.jumpRowIndex !== -1 ? this.jumpRowIndex : 0;
      this.nextPosition = -1;
      this.jumpRowIndex = -1;
    } else if (this.patternLoopRow >= 0 && this.patternLoopCount > 0) {
      this.rowIndex = this.patternLoopRow;
      this.position = this.patternLoopPosition;
      this.patternLoopCount--;
    } else {
      this.rowIndex++;
      if (currentPattern && this.rowIndex >= currentPattern.rows.length) {
        this.rowIndex = 0;
        this.position++;
      }
    }

    if (this.position >= this.mod.length || this.position < 0) {
      this.position = this.mod.restartPosition || 0;
    }

    const finalPatternIndex = this.mod.patternTable[this.position];
    const finalPattern = this.mod.patterns[finalPatternIndex];
    if (finalPattern) {
      const row = finalPattern.rows[this.rowIndex];
      if (row) {
        this.currentRowNotes = row.notes;
        for (let i = 0; i < this.channels.length; i++) {
          if (this.channels[i] && this.currentRowNotes[i]) {
            this.channels[i].trigger(this.currentRowNotes[i]);
          }
        }
      }
    }

    if (this.publishRow) {
      this.port.postMessage({ type: 'row', position: this.position, rowIndex: this.rowIndex });
    }
  }

  nextTick() {
    this.tick++;
    if (this.tick >= this.ticksPerRow) {
      this.tick = 0;
      this.nextRow();
    }

    for (let i = 0; i < this.channels.length; i++) {
      this.channels[i].performTick();
    }
  }

  process(_inputs, outputs) {
    if (!this.playing || !this.mod) return true;

    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const leftChannel = output[0];
    const rightChannel = output[1];
    const numSamples = leftChannel ? leftChannel.length : (rightChannel ? rightChannel.length : 0);
    
    for (let i = 0; i < numSamples; i++) {
      if (this.outputsUntilNextTick <= 0) {
        this.nextTick();
        this.outputsUntilNextTick += this.outputsPerTick;
      }
      this.outputsUntilNextTick--;

      let leftOutput = 0;
      let rightOutput = 0;
      for (let j = 0; j < this.channels.length; j++) {
        const [l, r] = this.channels[j].nextSample();
        leftOutput += l;
        rightOutput += r;
      }
      
      // Mixing with Master Volume scaling
      const lOut = Math.tanh(leftOutput * 0.4 * this.masterVolume);
      const rOut = Math.tanh(rightOutput * 0.4 * this.masterVolume);
      
      if (leftChannel) leftChannel[i] = lOut;
      if (rightChannel) rightChannel[i] = rOut;
      else if (leftChannel) leftChannel[i] = Math.tanh((leftOutput + rightOutput) * 0.5); // Mix to mono if only 1 channel
    }
    
    return true;
  }
}

registerProcessor('chiptune-worklet', ModPlayerWorklet);
