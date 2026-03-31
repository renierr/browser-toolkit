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
const EFFECT_SET_VOLUME = 0x0c;
const EFFECT_PATTERN_BREAK = 0x0d;
const EFFECT_EXTENDED = 0x0e;
const EFFECT_SET_SPEED = 0x0f;

class WorkletChannel {
  constructor(worklet, index) {
    this.worklet = worklet;
    this.channelIndex = index;
    this.instrument = null;
    this.playing = false;
    this.period = 0;
    this.currentPeriod = 0;
    this.volume = 64;
    this.currentVolume = 64;
    this.panning = 128;
    this.sampleIndex = 0;
    this.sampleSpeed = 0;
    this.vibratoDepth = 0;
    this.vibratoSpeed = 0;
    this.vibratoIndex = 0;
    this.vibratoWaveform = 0;
    this.tremoloDepth = 0;
    this.tremoloSpeed = 0;
    this.tremoloIndex = 0;
    this.tremoloWaveform = 0;
    this.slideSpeed = 0;
    this.volSlideSpeed = 0;
    this.fineSlideSpeed = 0;
    this.arpeggio = null;
    this.portaSpeed = 0;
    this.porta = false;
    this.loopStartRow = -1;
    this.loopCount = 0;
    this.setInstrument = null;
    this.setVolume = null;
    this.setPeriod = 0;
    this.setSampleIndex = null;
    this.delayNote = -1;
    this.retrig = 0;
  }

  nextSample() {
    if (!this.instrument || !this.period || this.currentVolume <= 0) return 0;

    const sampleIdx = this.sampleIndex | 0;
    if (sampleIdx >= this.instrument.length) {
      if (this.instrument.loopLength > 2) {
        this.sampleIndex =
          this.instrument.loopStart +
          ((this.sampleIndex - this.instrument.loopStart) % this.instrument.loopLength);
      } else {
        return 0;
      }
    }

    const sample = this.instrument.data[sampleIdx];
    this.sampleIndex += this.sampleSpeed;

    return (sample / 128) * (this.currentVolume / 64);
  }

  performTick() {
    if (this.volSlideSpeed && this.worklet.tick > 0) {
      this.currentVolume += this.volSlideSpeed;
      if (this.currentVolume < 0) this.currentVolume = 0;
      if (this.currentVolume > 64) this.currentVolume = 64;
    }

    if (this.vibratoDepth > 0) {
      this.vibratoIndex = (this.vibratoIndex + this.vibratoSpeed) % 64;
      let mod = 0;
      const wf = this.vibratoWaveform;
      if (wf === 0 || wf === 3) {
        mod = Math.sin((this.vibratoIndex / 64) * Math.PI * 2);
      } else if (wf === 1) {
        mod = ((this.vibratoIndex * 64) % 1) * 2 - 1;
      } else if (wf === 2) {
        const saw = (this.vibratoIndex * 32) % 1;
        mod = saw >= 0.5 ? 1 : -1;
      }
      this.currentPeriod = this.period + mod * this.vibratoDepth;
    } else if (this.porta && this.period !== this.currentPeriod) {
      const sign = Math.sign(this.period - this.currentPeriod);
      const distance = Math.abs(this.currentPeriod - this.period);
      const diff = Math.min(distance, this.portaSpeed);
      this.currentPeriod += sign * diff;
    } else if (this.slideSpeed) {
      this.currentPeriod += this.slideSpeed;
    } else if (this.arpeggio && this.arpeggio.length > 0) {
      const idx = this.worklet.tick % this.arpeggio.length;
      const halfNotes = this.arpeggio[idx];
      if (halfNotes !== 0) {
        this.currentPeriod = this.period / Math.pow(2, halfNotes / 12);
      }
    }

    if (this.retrig > 0 && this.worklet.tick > 0 && this.worklet.tick % this.retrig === 0) {
      this.sampleIndex = 0;
      this.currentVolume = this.volume;
    }

    if (this.currentPeriod < 113) this.currentPeriod = 113;
    if (this.currentPeriod > 856) this.currentPeriod = 856;

    const freq = this.worklet.getFrequency(this.currentPeriod);
    this.sampleSpeed = freq / this.worklet.sampleRate;
  }

  play(note) {
    if (!note.instrument && !note.period) return;

    this.setInstrument = null;
    this.setVolume = null;
    this.setPeriod = 0;
    this.setSampleIndex = null;
    this.delayNote = -1;

    if (note.instrument) {
      const instIndex = note.instrument - 1;
      const inst = this.worklet.mod.instruments[instIndex];
      if (inst && inst.samples && inst.samples.length > 0) {
        this.setInstrument = inst.samples[0];
        this.setVolume = this.setInstrument.volume;
      }
    }

    if (note.period) {
      const finetune = this.setInstrument ? this.setInstrument.finetune : 0;
      this.setPeriod = note.period - finetune;
      this.setSampleIndex = 0;
    }

    this.effect(note);

    if (this.delayNote >= 0) return;

    if (this.setInstrument) {
      this.instrument = this.setInstrument;
      if (this.setVolume !== null) {
        this.volume = this.setVolume;
        this.currentVolume = this.volume;
      }
    } else if (this.setVolume !== null) {
      this.volume = this.setVolume;
      this.currentVolume = this.volume;
    }

    if (this.setPeriod > 0) {
      this.period = this.setPeriod;
      this.currentPeriod = this.period;
    }

    if (this.setSampleIndex !== null) {
      this.sampleIndex = this.setSampleIndex;
    }

    this.playing = !!this.instrument && !!this.period;
  }

  effect(note) {
    this.volSlideSpeed = 0;
    this.slideSpeed = 0;
    this.porta = false;
    this.arpeggio = null;
    this.retrig = 0;
    this.delayNote = -1;

    if (!note.effect) return;

    const effectId = note.effect;
    const param = note.effectParam;

    switch (effectId) {
      case EFFECT_ARPEGGIO:
        if (param > 0) this.arpeggio = [0, (param >> 4) & 0x0f, param & 0x0f];
        break;
      case EFFECT_PORTA_UP:
        this.slideSpeed = -param;
        break;
      case EFFECT_PORTA_DOWN:
        this.slideSpeed = param;
        break;
      case EFFECT_TONE_PORTA:
        this.porta = true;
        if (param > 0) this.portaSpeed = param;
        this.slideSpeed = this.portaSpeed;
        break;
      case EFFECT_VIBRATO:
        if (param & 0x0f) this.vibratoDepth = param & 0x0f;
        if (param & 0xf0) this.vibratoSpeed = ((param >> 4) & 0x0f) * 2;
        break;
      case EFFECT_TONE_PORTA_VOL:
        this.porta = true;
        if (param > 0) this.portaSpeed = param;
        this.slideSpeed = this.portaSpeed;
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
        this.setSampleIndex = param * 256;
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
          case 0x1:
            this.period = Math.max(1, this.period - subParam * 4);
            break;
          case 0x2:
            this.period += subParam * 4;
            break;
          case 0x4:
            this.vibratoWaveform = subParam & 3;
            break;
          case 0x5:
            this.loopStartRow = this.worklet.rowIndex;
            break;
          case 0x6:
            if (subParam === 0)
              this.worklet.setPatternLoop(this.loopStartRow >= 0 ? this.loopStartRow : 0);
            else this.worklet.setPatternLoopCount(subParam);
            break;
          case 0x7:
            this.tremoloWaveform = subParam & 3;
            break;
          case 0x9:
            this.retrig = subParam;
            break;
          case 0xa:
            this.volume = Math.min(64, this.volume + subParam);
            this.currentVolume = this.volume;
            break;
          case 0xb:
            this.volume = Math.max(0, this.volume - subParam);
            this.currentVolume = this.volume;
            break;
          case 0xc:
            if (this.worklet.tick === subParam) this.currentVolume = 0;
            break;
          case 0xd:
            this.delayNote = subParam;
            break;
          case 0xe:
            this.worklet.setPatternDelay(subParam);
            break;
        }
        break;
    }
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
    this.publishRow = false;
    this.publishStop = false;
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
      case 'resume':
        this.playing = true;
        break;
      case 'setRow':
        this.setRow(data.position, data.row);
        break;
      case 'enableRowSubscription':
        this.publishRow = true;
        break;
      case 'disableRowSubscription':
        this.publishRow = false;
        break;
      case 'enableStopSubscription':
        this.publishStop = true;
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

    this.position = -1;
    this.rowIndex = 63;
    this.tick = this.ticksPerRow - 1;
    this.outputsUntilNextTick = 0;
    this.patternBreak = false;
    this.patternLoopRow = -1;
    this.patternLoopCount = 0;
    this.patternLoopPosition = -1;
    this.patternDelay = 0;
    this.playing = true;
    this.publishRow = true;
  }

  setRow(position, row) {
    this.rowIndex = row - 1;
    if (this.rowIndex < 0) {
      this.rowIndex = 63;
      this.position = position - 1;
    } else {
      this.position = position;
    }
    this.tick = this.ticksPerRow - 1;
    this.outputsUntilNextTick = 0;
    this.patternBreak = false;
  }

  setTicksPerRow(tpr) {
    this.ticksPerRow = tpr;
  }

  setBpm(bpm) {
    this.bpm = bpm;
    this.outputsPerTick = (this.sampleRate * 60) / this.bpm / 4 / 6;
    if (bpm === 0 && this.publishStop) this.port.postMessage({ type: 'stop' });
  }

  setPatternBreak(row) {
    this.patternBreak = row;
  }

  setPatternLoop(row) {
    this.patternLoopRow = row;
    this.patternLoopCount = 0;
    this.patternLoopPosition = this.position;
  }

  setPatternLoopCount(count) {
    this.patternLoopCount = count;
  }

  setPatternDelay(frames) {
    this.patternDelay = frames;
  }

  getFrequency(period) {
    if (!this.mod || period <= 0) return 0;
    return (this.mod.clock || 3546894.6) / (period * 2);
  }

  nextRow() {
    if (this.patternDelay > 0) {
      this.patternDelay--;
      return;
    }

    this.rowIndex++;

    if (this.patternBreak !== false) {
      this.rowIndex = this.patternBreak;
      this.position++;
      this.patternBreak = false;
    } else if (this.patternLoopRow >= 0) {
      if (this.patternLoopCount > 0) {
        this.rowIndex = this.patternLoopRow;
        this.position = this.patternLoopPosition >= 0 ? this.patternLoopPosition : this.position;
        this.patternLoopCount--;
      } else if (this.patternLoopPosition >= 0 && this.rowIndex >= this.mod.rowsPerPattern) {
        this.rowIndex = this.patternLoopRow;
        this.position = this.patternLoopPosition;
      }
    }

    if (this.rowIndex >= this.mod.rowsPerPattern) {
      this.rowIndex = 0;
      this.position++;
    }

    if (this.position >= this.mod.length) {
      this.position = this.mod.restartPosition || 0;
    }

    const patternIndex = this.mod.patternTable[this.position];
    const pattern = this.mod.patterns[patternIndex];
    if (!pattern) return;

    const row = pattern.rows[this.rowIndex];
    if (!row) return;

    const notes = row.notes;
    if (!notes) return;

    for (let i = 0; i < this.channels.length; i++) {
      const note = notes[i] || { instrument: 0, period: 0, effect: 0, effectParam: 0 };
      this.channels[i].play(note);
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

  nextSample() {
    if (!this.mod || !this.playing) return 0;

    if (this.outputsUntilNextTick <= 0) {
      this.nextTick();
      this.outputsUntilNextTick += this.outputsPerTick;
    }

    this.outputsUntilNextTick--;

    let output = 0;
    for (let i = 0; i < this.channels.length; i++) {
      const ch = this.channels[i];
      output += ch.nextSample();
    }

    return Math.tanh(output * 0.5);
  }

  process(_inputs, outputs) {
    try {
      const output = outputs[0];
      if (!output || output.length === 0) return true;

      const channel = output[0];
      for (let i = 0; i < channel.length; i++) {
        channel[i] = this.nextSample();
      }

      if (output.length > 1) {
        const channel2 = output[1];
        for (let i = 0; i < channel2.length; i++) {
          channel2[i] = channel[i];
        }
      }
    } catch (e) {
      console.error('[Worklet] process() error:', e);
    }
    return true;
  }
}

registerProcessor('chiptune-worklet', ModPlayerWorklet);
