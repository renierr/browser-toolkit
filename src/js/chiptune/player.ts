import type { ModuleFile, Sample, Note, Pattern } from './types';
import { periodToFrequencyAmiga, periodToFrequencyLinear, AMIGA_PERIOD_TABLE } from './types';

interface ChannelState {
  instrument: number;
  note: number | null;
  period: number;
  targetPeriod: number;
  volume: number;
  panning: number;
  
  effect: number;
  effectParam: number;

  vibratoPhase: number;
  vibratoSpeed: number;
  vibratoDepth: number;
  
  slideSpeed: number;
  volSlideSpeed: number;

  arpeggioNotes: number[];
  sampleOffset: number;
  baseVolume: number; // mapped channel base vol
  
  sample: Sample | null;

  source: AudioBufferSourceNode | null;
  gain: GainNode | null;
  panNode: StereoPannerNode | null;
}

export class ChiptunePlayer {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private module: ModuleFile | null = null;
  private isPlaying = false;
  
  private currentPatternIdx = 0;
  private currentRow = 0;
  private currentTick = 0;
  
  private nextTickTime = 0;
  private schedulerTimer: number | null = null;
  private readonly lookAhead = 0.1;
  private scheduleInterval = 25;
  
  private channelStates: ChannelState[] = [];
  
  private isLooping = true;
  private speed = 6;
  private bpm = 125;
  private volume = 0.7;

  public onPositionChange: ((pattern: number, row: number) => void) | null = null;
  public onChannelActivity: ((activeChannels: boolean[]) => void) | null = null;

  constructor() {
    this.initAudio();
  }

  private initAudio(): void {
    try {
      this.audioContext = new AudioContext({ sampleRate: 44100 });
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.audioContext.destination);

      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.masterGain.connect(this.analyser);
    } catch (e) {
      console.error('[ChiptunePlayer] Failed to init audio:', e);
    }
  }

  loadModule(mod: ModuleFile): void {
    this.module = mod;
    this.speed = mod.defaultSpeed || 6;
    this.bpm = mod.defaultBpm || 125;
    this.channelStates = [];

    for (let i = 0; i < mod.channels; i++) {
        const pan = (i % 4 === 1 || i % 4 === 2) ? 200 : 56; // Standard LRRL Amiga panning
        this.channelStates.push({
            instrument: 0,
            note: null,
            period: 0,
            targetPeriod: 0,
            volume: 64,
            panning: pan,
            effect: 0,
            effectParam: 0,
            vibratoPhase: 0,
            vibratoSpeed: 0,
            vibratoDepth: 0,
            slideSpeed: 0,
            volSlideSpeed: 0,
            arpeggioNotes: [],
            sampleOffset: 0,
            baseVolume: 64,
            sample: null,
            source: null,
            gain: null,
            panNode: null
        });
    }
  }

  setLooping(loop: boolean): void { this.isLooping = loop; }
  setSpeed(spd: number): void { this.speed = Math.max(1, Math.min(32, spd)); }
  setBpm(bpm: number): void { this.bpm = Math.max(32, Math.min(255, bpm)); }
  setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.audioContext) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.audioContext.currentTime, 0.05);
    }
  }

  play(): void {
    if (!this.audioContext || !this.module) return;
    if (this.audioContext.state === 'suspended') this.audioContext.resume();

    this.isPlaying = true;
    this.currentPatternIdx = 0;
    this.currentRow = 0;
    this.currentTick = 0;
    this.nextTickTime = this.audioContext.currentTime + 0.05;

    for (const ch of this.channelStates) {
      this.stopChannel(ch);
      ch.period = 0;
      ch.targetPeriod = 0;
      ch.vibratoPhase = 0;
      ch.arpeggioNotes = [];
    }
    this.scheduler();
  }

  pause(): void {
    this.isPlaying = false;
    if (this.schedulerTimer !== null) {
      clearTimeout(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    if (this.audioContext) {
      for (const ch of this.channelStates) this.stopChannel(ch); // hard stop buffers so they don't ring
    }
  }

  stop(): void {
    this.pause();
    this.currentPatternIdx = 0;
    this.currentRow = 0;
    this.currentTick = 0;
    if (this.onPositionChange) this.onPositionChange(0, 0);
    if (this.onChannelActivity) this.onChannelActivity(new Array(this.module?.channels || 4).fill(false));
  }
  
  private stopChannel(ch: ChannelState, time?: number): void {
      if (ch.source) {
          try { ch.source.stop(time || 0); } catch(e) {}
          ch.source.disconnect();
          ch.source = null;
      }
      if (ch.gain) {
          ch.gain.disconnect();
          ch.gain = null;
      }
      if (ch.panNode) {
          ch.panNode.disconnect();
          ch.panNode = null;
      }
  }

  private scheduler(): void {
    if (!this.isPlaying || !this.audioContext || !this.module) return;

    while (this.nextTickTime < this.audioContext.currentTime + this.lookAhead) {
      this.scheduleTick();
    }
    this.schedulerTimer = window.setTimeout(() => this.scheduler(), this.scheduleInterval);
  }

  private getTickDuration(): number {
    return 2.5 / this.bpm; // Each tick is exact fraction of a minute
  }

  private scheduleTick(): void {
    if (!this.audioContext || !this.module) return;
    
    // Check sequence boundaries just in case
    if (this.currentPatternIdx >= this.module.sequence.length) return;
    const patternIdx = this.module.sequence[this.currentPatternIdx];
    const pattern = this.module.patterns[patternIdx];
    if (!pattern) return;
    const row = pattern.rows[this.currentRow];

    let patternBreak = false;
    let patternJump = -1;
    let nextRow = -1;

    const tickDur = this.getTickDuration();
    const time = this.nextTickTime;

    const activeChannels: boolean[] = new Array(this.module.channels).fill(false);

    for (let c = 0; c < this.module.channels; c++) {
      const chState = this.channelStates[c];
      const cell = row[c] || { note: null, period: null, instrument: 0, volume: null, effect: 0, effectParam: 0 };

      if (this.currentTick === 0) {
        // --- ROW START ---
        chState.effect = cell.effect;
        chState.effectParam = cell.effectParam;
        
        let shouldTrigger = false;
        let tonePorta = (chState.effect === 3) || (chState.effect === 5); // 0x05 is Vol Slide + Tone Porta
        
        // Instrument assignment
        if (cell.instrument > 0 && cell.instrument <= this.module.instruments.length) {
          chState.instrument = cell.instrument;
          const inst = this.module.instruments[cell.instrument - 1];
          if (inst) chState.baseVolume = inst.volumeFadeout !== undefined ? 64 : 64; // default
        }

        // Note parsing
        if (cell.note !== null) {
          if (cell.note === 97) {
             // KeyOff
             chState.volume = 0; // immediate silence
             this.stopChannel(chState, time); // cut note
          } else {
             // We have a new valid note
             if (tonePorta) {
                 // Set Target Period ONLY
                 chState.targetPeriod = this.calculatePeriod(cell.note, cell.instrument, chState);
             } else {
                 chState.note = cell.note;
                 chState.period = cell.period || this.calculatePeriod(cell.note, cell.instrument, chState);
                 chState.volume = chState.baseVolume;
                 chState.vibratoPhase = 0;
                 // Set sample map accurately!
                 this.assignSample(chState);
                 shouldTrigger = true;
             }
          }
        }
        
        // Volume Col / Standard Volume Command (0x0C)
        if (cell.volume !== null && cell.volume <= 64) {
            chState.volume = cell.volume;
        } else if (chState.effect === 0x0c) {
            chState.volume = Math.min(chState.effectParam, 64);
        }

        // Parse global tick-based fx memory mapping
        this.parseEffectTick0(chState, chState.effect, chState.effectParam);
        
        // Handle pattern navigation
        if (chState.effect === 0x0B) { patternJump = chState.effectParam; patternBreak = true; nextRow = 0; }
        if (chState.effect === 0x0D) { patternBreak = true; nextRow = (chState.effectParam >> 4) * 10 + (chState.effectParam & 0x0F); }
        if (chState.effect === 0x0F) {
            if (chState.effectParam > 0 && chState.effectParam <= 32) this.speed = chState.effectParam;
            else if (chState.effectParam > 32) this.bpm = chState.effectParam;
        }

        if (shouldTrigger && chState.sample && chState.period > 0) {
            this.triggerNote(chState, time, tickDur * this.speed);
        }

      } else {
        // --- CONTINUOUS TICK EVALUATION (Tick 1+) ---
        this.parseEffectContinuous(chState, chState.effect, chState.effectParam);
      }
      
      // Compute final exact frequency and automate Web Audio nodes for THIS tick timeframe
      if (chState.source && chState.gain && chState.sample) {
          let tickFreq = this.calculateFrequency(chState.period, chState.sample);
          
          if (chState.arpeggioNotes.length > 0) {
              let arpNote = chState.arpeggioNotes[this.currentTick % 3];
              if (arpNote > 0) tickFreq *= Math.pow(2, arpNote / 12);
          }
          
          if (chState.vibratoDepth > 0) {
             const vibratoMod = Math.sin(chState.vibratoPhase * Math.PI * 2) * (chState.vibratoDepth / 64) * 0.05;
             tickFreq *= (1 + vibratoMod);
             chState.vibratoPhase += chState.vibratoSpeed / 256;
          }
          
          const maxClamp = chState.sample.c5speed || 8363;
          let playbackRate = tickFreq / this.audioContext.sampleRate;
          playbackRate = Math.max(0.01, Math.min(playbackRate, 10)); // Safety clamp
          
          chState.source.playbackRate.setValueAtTime(playbackRate, time);
          
          let finalVol = (chState.volume / 64) * (chState.sample.volume / 64) * this.volume;
          chState.gain.gain.setValueAtTime(finalVol, time);
          
          activeChannels[c] = finalVol > 0.01;
      }
    }

    if (this.currentTick === 0 && this.onChannelActivity) this.onChannelActivity(activeChannels);
    if (this.currentTick === 0 && this.onPositionChange) this.onPositionChange(patternIdx, this.currentRow);

    this.nextTickTime += tickDur;
    this.currentTick++;
    if (this.currentTick >= this.speed) {
        this.currentTick = 0;
        this.currentRow++;
        
        if (patternBreak || this.currentRow >= (pattern.rows.length || this.module.rowsPerPattern)) {
            this.currentRow = nextRow >= 0 ? nextRow : 0;
            this.currentPatternIdx = patternJump >= 0 ? patternJump : this.currentPatternIdx + 1;
            if (this.currentPatternIdx >= this.module.sequence.length) {
                if (this.isLooping) this.currentPatternIdx = 0;
                else this.stop();
            }
        }
    }
  }

  private assignSample(chState: ChannelState): void {
      if (!this.module || !chState.instrument) return;
      const inst = this.module.instruments[chState.instrument - 1];
      if (!inst) return;
      
      let sampleIndex = 0;
      if (chState.note && chState.note > 0 && chState.note <= 96) {
          if (inst.sampleMap && inst.sampleMap.length >= chState.note) {
              sampleIndex = inst.sampleMap[chState.note - 1];
          }
      }
      chState.sample = inst.samples[sampleIndex] || inst.samples[0] || null;
      if (chState.sample) {
          chState.baseVolume = chState.sample.volume;
          chState.panning = chState.sample.panning;
      }
  }
  
  private calculatePeriod(note: number, instrument: number, chState: ChannelState): number {
      if (!this.module) return 0;
      
      // We must pick the correct sample internally first to know its finetune/basenote
      const inst = this.module.instruments[instrument - 1] || this.module.instruments[chState.instrument - 1];
      if (!inst || inst.samples.length === 0) return 0;
      let sIdx = 0;
      if (note > 0 && note <= 96 && inst.sampleMap && inst.sampleMap.length >= note) sIdx = inst.sampleMap[note - 1];
      const sample = inst.samples[sIdx] || inst.samples[0];
      
      if (this.module.type === 'IT') {
          // IT handles raw periods based on notes for calculation purposes, or just linear dummy if we want 
          return note; // Store exactly note 1-120 as "period" equivalent to simplify IT sliding math
      }
      if (this.module.linearFrequencies) {
          const actualNote = (note - 1) + (sample.baseNote || 0);
          return 10 * 12 * 16 * 4 - (actualNote * 16 * 4) - (sample.finetune / 2);
      }
      if (note <= 36) return AMIGA_PERIOD_TABLE[note - 1];
      return 0;
  }
  
  private calculateFrequency(period: number, sample: Sample): number {
      if (!this.module) return 0;
      if (period <= 0) return 0;
      if (this.module.type === 'IT') {
         // period holds relative raw Note 1-120
         const actualNote = period - 1; 
         return (sample.c5speed || 8363) * Math.pow(2, (actualNote - 60) / 12);
      }
      if (this.module.linearFrequencies) return periodToFrequencyLinear(period);
      return periodToFrequencyAmiga(period, sample.finetune);
  }

  private parseEffectTick0(chState: ChannelState, effect: number, param: number): void {
      chState.arpeggioNotes = [];
      if (effect === 0x09) chState.sampleOffset = param * 256;
      else if (effect === 0x04) {
          if (param & 0x0F) chState.vibratoDepth = param & 0x0F;
          if (param & 0xF0) chState.vibratoSpeed = (param >> 4) * 2;
      } else if (effect === 0x00 && param > 0) {
          chState.arpeggioNotes = [0, (param >> 4) & 0x0f, param & 0x0f];
      } else if (effect === 0x01 || effect === 0x02) {
          if (param > 0) chState.slideSpeed = param;
      } else if (effect === 0x0A) { // Volume slide
          if (param > 0) chState.volSlideSpeed = param;
      } else if (effect === 0x03) {
          if (param > 0) chState.slideSpeed = param;
      }
  }

  private parseEffectContinuous(chState: ChannelState, effect: number, param: number): void {
      if (effect === 0x01) { // Porta Up (Decrease Period = Increase Hz)
          chState.period = Math.max(1, chState.period - chState.slideSpeed * 4); // x4 multiplier common in FT2
      } else if (effect === 0x02) { // Porta Down
          chState.period += chState.slideSpeed * 4;
      } else if (effect === 0x03 || effect === 0x05) { // Tone Portamento
          if (chState.period < chState.targetPeriod) {
              chState.period += chState.slideSpeed * 4;
              if (chState.period > chState.targetPeriod) chState.period = chState.targetPeriod;
          } else if (chState.period > chState.targetPeriod) {
              chState.period -= chState.slideSpeed * 4;
              if (chState.period < chState.targetPeriod) chState.period = chState.targetPeriod;
          }
      }
      
      // Volume Slides
      if (effect === 0x0A || effect === 0x05 || effect === 0x06) {
          let spd = chState.volSlideSpeed;
          if ((spd >> 4) > 0 && (spd & 0x0F) === 0) chState.volume += (spd >> 4);
          else if ((spd >> 4) === 0 && (spd & 0x0F) > 0) chState.volume -= (spd & 0x0F);
          chState.volume = Math.max(0, Math.min(64, chState.volume));
      }
  }

  private triggerNote(chState: ChannelState, time: number, maxRowDur: number): void {
      if (!this.audioContext || !this.masterGain || !chState.sample) return;
      this.stopChannel(chState, time); // Pre-cleanup overlapping
      
      const buffer = this.audioContext.createBuffer(1, chState.sample.data.length, this.audioContext.sampleRate);
      buffer.getChannelData(0).set(chState.sample.data);

      chState.source = this.audioContext.createBufferSource();
      chState.source.buffer = buffer;

      if (chState.sample.loopLength > 2) {
        chState.source.loop = true;
        chState.source.loopStart = chState.sample.loopStart / this.audioContext.sampleRate;
        chState.source.loopEnd = (chState.sample.loopStart + chState.sample.loopLength) / this.audioContext.sampleRate;
      }
      
      let tickFreq = this.calculateFrequency(chState.period, chState.sample);
      let playbackRate = tickFreq / this.audioContext.sampleRate;
      chState.source.playbackRate.setValueAtTime(Math.max(0.01, Math.min(playbackRate, 10)), time);

      const startOffset = chState.sampleOffset / this.audioContext.sampleRate;
      if (startOffset > 0 && startOffset < buffer.duration) chState.source.start(time, startOffset);
      else chState.source.start(time);

      chState.panNode = this.audioContext.createStereoPanner();
      chState.panNode.pan.value = Math.max(-1, Math.min(1, (chState.panning - 128) / 128));

      chState.gain = this.audioContext.createGain();
      
      // Set initial volume exactly
      let finalVol = (chState.volume / 64) * (chState.sample.volume / 64) * this.volume;
      chState.gain.gain.setValueAtTime(finalVol, time);

      chState.source.connect(chState.panNode);
      chState.panNode.connect(chState.gain);
      chState.gain.connect(this.masterGain);
      
      // We do NOT stop the source automatically unless it's an un-looped sample hitting end naturally,
      // or a KeyOff command, or a new note overlapping.
  }

  getAnalyser(): AnalyserNode | null { return this.analyser; }
  getModule(): ModuleFile | null { return this.module; }
  getIsPlaying(): boolean { return this.isPlaying; }
  getCurrentPosition(): { pattern: number; row: number } { return { pattern: this.currentPatternIdx, row: this.currentRow }; }
  getTotalRows(): number { return this.module ? this.module.sequence.length * this.module.rowsPerPattern : 0; }
  getSpeed(): number { return this.speed; }

  cleanup(): void {
    this.stop();
    if (this.masterGain) this.masterGain.disconnect();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}
