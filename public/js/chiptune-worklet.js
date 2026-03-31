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
  }

  trigger(note) {
    if (!note.instrument && !note.period && note.note === null) return;

    let tonePorta = note.effect === EFFECT_TONE_PORTA || note.effect === EFFECT_TONE_PORTA_VOL;

    if (note.instrument > 0) {
      this.instrument = this.worklet.mod.instruments[note.instrument - 1];
      if (this.instrument && this.instrument.samples.length > 0) {
        this.baseVolume = this.instrument.samples[0].volume;
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
          this.sampleIndex = this.sampleOffset;
          this.sampleOffset = 0;
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
      else if (vc >= 0x60 && vc <= 0x6f) {} // Vol slide down (continuous)
      else if (vc >= 0x70 && vc <= 0x7f) {} // Vol slide up (continuous)
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
    if (this.sample) {
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
    
    if (this.worklet.mod.linearFrequencies) {
      const actualNote = noteValue - 1 + (sample.baseNote || 0);
      return 10 * 12 * 16 * 4 - actualNote * 16 * 4 - (sample.finetune || 0) / 2;
    }
    
    // Amiga periods
    const AMIGA_TABLE = [1712, 1616, 1525, 1440, 1357, 1281, 1209, 1141, 1077, 1017, 961, 907];
    let n = noteValue - 1;
    let octave = 0;
    while (n >= 12) { n -= 12; octave++; }
    let p = AMIGA_TABLE[n] / Math.pow(2, octave);
    return p;
  }

  handleEffect(note) {
    this.slideSpeed = 0;
    this.volSlideSpeed = 0;
    this.fineSlideSpeed = 0;
    this.arpeggioNotes = [];
    this.retrig = 0;

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
        this.setVolume = Math.min(64, param);
        break;
      case EFFECT_PATTERN_BREAK:
        this.worklet.setPatternBreak(((param >> 4) & 0x0f) * 10 + (param & 0x0f));
        break;
      case EFFECT_SET_SPEED:
        if (param >= 1 && param <= 31) this.worklet.setTicksPerRow(param);
        else if (param > 31) this.worklet.setBpm(param);
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
    if (!this.playing) return;

    // Continuous effects
    if (this.worklet.tick > 0) {
      // Volume Slide
      if (this.volSlideSpeed !== 0) {
        this.volume = Math.max(0, Math.min(64, this.volume + this.volSlideSpeed));
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
    
    if (this.arpeggioNotes.length > 0) {
      const arpNote = this.arpeggioNotes[this.worklet.tick % 3];
      if (arpNote > 0) renderPeriod /= Math.pow(2, arpNote / 12);
    }
    
    if (this.vibratoDepth > 0) {
      let mod = 0;
      if (this.vibratoWaveform === 0 || this.vibratoWaveform === 3) mod = Math.sin(this.vibratoPhase * Math.PI * 2);
      else if (this.vibratoWaveform === 1) mod = (this.vibratoPhase < 0.5) ? (this.vibratoPhase * 4 - 1) : (3 - this.vibratoPhase * 4);
      else if (this.vibratoWaveform === 2) mod = (this.vibratoPhase < 0.5) ? 1 : -1;
      
      renderPeriod += mod * this.vibratoDepth * 4;
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
    return (this.worklet.mod.clock || 3546894.6) / (period * 2);
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
    let vol = (this.volume / 64) * (this.sample.volume / 64);
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
    this.patternLoopRow = -1;
    this.patternLoopCount = 0;
    this.patternLoopPosition = -1;
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
    }
  }

  play(mod, sampleRate) {
    this.mod = mod;
    this.sampleRate = sampleRate;
    this.setBpm(mod.defaultBpm || 125);
    this.setTicksPerRow(mod.defaultSpeed || 6);

    this.channels = [];
    for (let i = 0; i < mod.channels; i++) {
      this.channels.push(new WorkletChannel(this, i));
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
  setPatternBreak(row) { this.patternBreak = row; }
  setPatternJump(pos) { this.patternJump = pos; }
  setPatternLoop(row) { this.patternLoopRow = row; this.patternLoopPosition = this.position; }
  setPatternLoopCount(count) { this.patternLoopCount = count; }
  setPatternDelay(frames) { this.patternDelay = frames; }

  nextRow() {
    if (this.patternDelay > 0) {
      this.patternDelay--;
      return;
    }

    if (this.patternJump !== -1) {
      this.position = this.patternJump;
      this.rowIndex = this.patternBreak !== false ? this.patternBreak : 0;
      this.patternJump = -1;
      this.patternBreak = false;
    } else if (this.patternBreak !== false) {
      this.rowIndex = this.patternBreak;
      this.position++;
      this.patternBreak = false;
    } else {
      this.rowIndex++;
    }

    if (this.rowIndex >= this.mod.rowsPerPattern) {
      this.rowIndex = 0;
      this.position++;
    }

    if (this.position >= this.mod.length || this.position < 0) {
      this.position = this.mod.restartPosition || 0;
    }

    const patternIndex = this.mod.patternTable[this.position];
    if (patternIndex === undefined) return;
    
    const pattern = this.mod.patterns[patternIndex];
    if (pattern) {
      const row = pattern.rows[this.rowIndex];
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
      
      // Soft clipping and channel safety
      const lOut = Math.tanh(leftOutput * 0.5);
      const rOut = Math.tanh(rightOutput * 0.5);
      
      if (leftChannel) leftChannel[i] = lOut;
      if (rightChannel) rightChannel[i] = rOut;
      else if (leftChannel) leftChannel[i] = Math.tanh((leftOutput + rightOutput) * 0.5); // Mix to mono if only 1 channel
    }
    
    return true;
  }
}

registerProcessor('chiptune-worklet', ModPlayerWorklet);
