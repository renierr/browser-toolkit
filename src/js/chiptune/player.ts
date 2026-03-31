import type { ModuleFile, Sample, Envelope } from './types';
import { periodToFrequencyAmiga, periodToFrequencyLinear, AMIGA_PERIOD_TABLE } from './types';
import { serializeModuleForWorklet } from './types';
import workletUrl from './worklet?worker&url';

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
  vibratoWaveform: number;

  tremoloPhase: number;
  tremoloSpeed: number;
  tremoloDepth: number;
  tremoloWaveform: number;

  slideSpeed: number;
  volSlideSpeed: number;

  fineSlideSpeed: number;

  glissando: boolean;
  glissandoNote: number;

  arpeggioNotes: number[];
  sampleOffset: number;
  baseVolume: number;

  retrigCounter: number;
  noteDelayCounter: number;

  loopStartRow: number;
  loopCount: number;

  envTick: number;
  volumeEnvTick: number;
  panningEnvTick: number;
  volumeEnvValue: number;
  panningEnvValue: number;
  keyOn: boolean;
  fadeoutSpeed: number;

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
  private wasStopped = true;

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

  private patternLoopRow = -1;
  private patternLoopCount = 0;
  private patternLoopPosition = -1;

  private useWorklet = false;
  private workletNode: AudioWorkletNode | null = null;

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
      const pan = i % 4 === 1 || i % 4 === 2 ? 200 : 56;
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
        vibratoWaveform: 0,
        tremoloPhase: 0,
        tremoloSpeed: 0,
        tremoloDepth: 0,
        tremoloWaveform: 0,
        slideSpeed: 0,
        volSlideSpeed: 0,
        fineSlideSpeed: 0,
        glissando: false,
        glissandoNote: 0,
        arpeggioNotes: [],
        sampleOffset: 0,
        baseVolume: 64,
        retrigCounter: 0,
        noteDelayCounter: 0,
        loopStartRow: -1,
        loopCount: 0,
        envTick: 0,
        volumeEnvTick: 0,
        panningEnvTick: 0,
        volumeEnvValue: 64,
        panningEnvValue: 128,
        keyOn: false,
        fadeoutSpeed: 0,
        sample: null,
        source: null,
        gain: null,
        panNode: null,
      });
    }
  }

  async initWorklet(): Promise<boolean> {
    if (!this.audioContext) return false;

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    try {
      if (!this.audioContext.audioWorklet) {
        throw new Error('AudioWorklet API not supported in this browser context (HTTPS required)');
      }

      await this.audioContext.audioWorklet.addModule(workletUrl);

      try {
        this.workletNode = new AudioWorkletNode(this.audioContext, 'chiptune-worklet', {
          outputChannelCount: [2],
        });
      } catch (nodeError) {
        console.warn('[ChiptunePlayer] Stereo worklet node failed, retrying in mono:', nodeError);
        this.workletNode = new AudioWorkletNode(this.audioContext, 'chiptune-worklet');
      }

      this.workletNode.port.onmessage = (e) => {
        if (e.data.type === 'row') {
          this.currentPatternIdx = e.data.position;
          this.currentRow = e.data.rowIndex;
          if (this.onPositionChange) {
            this.onPositionChange(e.data.position, e.data.rowIndex);
          }
          if (this.onChannelActivity) {
            this.onChannelActivity(e.data.activeChannels);
          }
        } else if (e.data.type === 'bpm') {
          this.bpm = e.data.bpm;
        } else if (e.data.type === 'speed') {
          this.speed = e.data.speed;
        } else if (e.data.type === 'stop') {
          this.isPlaying = false;
        }
      };
      this.workletNode.connect(this.masterGain!);
      this.useWorklet = true;
      return true;
    } catch (e) {
      console.error('[ChiptunePlayer] Failed to init worklet:', e);
      console.error(`[ChiptunePlayer] Worklet URL attempted: ${workletUrl}`);
      if (e instanceof Error && e.name === 'AbortError') {
        console.error(
          '[ChiptunePlayer] Network or MIME type error. Ensure the worklet script is being served correctly by Vite.'
        );
      }
      return false;
    }
  }

  async setUseWorklet(enabled: boolean): Promise<boolean> {
    const wasPlaying = this.isPlaying;
    if (wasPlaying) this.pause();

    if (enabled) {
      if (!this.workletNode) {
        const success = await this.initWorklet();
        if (!success) {
          this.useWorklet = false;
          if (wasPlaying) await this.play();
          return false;
        }
      }
      this.useWorklet = true;
    } else {
      this.useWorklet = false;
    }

    if (wasPlaying) await this.play();
    return true;
  }

  setLooping(loop: boolean): void {
    this.isLooping = loop;
  }
  setSpeed(spd: number): void {
    this.speed = Math.max(1, Math.min(32, spd));
  }
  setBpm(bpm: number): void {
    this.bpm = Math.max(32, Math.min(255, bpm));
  }
  setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.audioContext) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.audioContext.currentTime, 0.05);
    }
    this.sendToWorklet('setVolume', { volume: this.volume });
  }
  private sendToWorklet(type: string, data: any = {}) {
    if (this.useWorklet && this.workletNode) {
      this.workletNode.port.postMessage({ type, ...data });
    }
  }

  async play(): Promise<void> {
    if (!this.audioContext || !this.module) return;
    if (this.isPlaying) return;

    if (this.audioContext.state === 'suspended') await this.audioContext.resume();

    if (this.useWorklet && this.workletNode && this.module) {
      if (!this.wasStopped && (this.currentPatternIdx > 0 || this.currentRow > 0)) {
        this.sendToWorklet('resume');
      } else {
        const workletMod = serializeModuleForWorklet(this.module);
        this.sendToWorklet('play', {
          mod: workletMod,
          sampleRate: this.audioContext.sampleRate,
        });
      }
      this.isPlaying = true;
      this.wasStopped = false;
      return;
    }

    this.isPlaying = true;
    this.wasStopped = true;
    this.playBuffer();
  }

  playBuffer(): void {
    if (!this.audioContext || !this.module) return;
    if (this.audioContext.state === 'suspended') this.audioContext.resume();

    this.isPlaying = true;

    if (this.wasStopped) {
      this.currentPatternIdx = 0;
      this.currentRow = 0;
      this.currentTick = 0;
      this.patternLoopRow = -1;
      this.patternLoopCount = 0;
      this.patternLoopPosition = -1;
      for (const ch of this.channelStates) {
        this.stopChannel(ch);
        ch.period = 0;
        ch.targetPeriod = 0;
        ch.vibratoPhase = 0;
        ch.arpeggioNotes = [];
      }
      this.wasStopped = false;
    }

    this.nextTickTime = this.audioContext.currentTime + 0.05;
    this.scheduler();
  }

  pause(): void {
    if (this.useWorklet && this.workletNode) {
      this.isPlaying = false;
      this.sendToWorklet('stop');
      return;
    }

    this.isPlaying = false;
    if (this.schedulerTimer !== null) {
      clearTimeout(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    if (this.audioContext) {
      for (const ch of this.channelStates) this.stopChannel(ch);
    }
  }

  stop(): void {
    if (this.useWorklet && this.workletNode) {
      this.pause();
      this.currentPatternIdx = 0;
      this.currentRow = 0;
      this.currentTick = 0;
      this.wasStopped = true;
      if (this.onPositionChange) this.onPositionChange(0, 0);
      if (this.onChannelActivity)
        this.onChannelActivity(new Array(this.module?.channels || 4).fill(false));
      return;
    }

    this.pause();
    this.currentPatternIdx = 0;
    this.currentRow = 0;
    this.currentTick = 0;
    this.patternLoopRow = -1;
    this.patternLoopCount = 0;
    this.patternLoopPosition = -1;
    this.wasStopped = true;
    if (this.onPositionChange) this.onPositionChange(0, 0);
    if (this.onChannelActivity)
      this.onChannelActivity(new Array(this.module?.channels || 4).fill(false));
  }

  private stopChannel(ch: ChannelState, time?: number): void {
    if (ch.source) {
      try {
        ch.source.stop(time || 0);
      } catch (e) { }
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

    let iterations = 0;
    while (this.nextTickTime < this.audioContext.currentTime + this.lookAhead) {
      this.scheduleTick();
      iterations++;
      if (iterations > 100) {
        console.warn('[ChiptunePlayer] Scheduler infinite loop prevented.');
        this.nextTickTime = this.audioContext.currentTime + this.lookAhead + 0.1;
        break;
      }
    }
    this.schedulerTimer = window.setTimeout(() => this.scheduler(), this.scheduleInterval);
  }

  private getTickDuration(): number {
    if (!this.bpm || this.bpm <= 0) this.bpm = 125;
    const dur = 2.5 / this.bpm; // Each tick is exact fraction of a minute
    return isNaN(dur) || dur <= 0 ? 0.02 : dur; // Safeback
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
      const cell = row[c] || {
        note: null,
        period: null,
        instrument: 0,
        volume: null,
        effect: 0,
        effectParam: 0,
      };

      if (this.currentTick === 0) {
        // --- ROW START ---
        chState.effect = cell.effect;
        chState.effectParam = cell.effectParam;

        let shouldTrigger = false;
        let tonePorta = chState.effect === 3 || chState.effect === 5; // 0x05 is Vol Slide + Tone Porta

        // Instrument assignment
        if (cell.instrument > 0 && cell.instrument <= this.module.instruments.length) {
          chState.instrument = cell.instrument;
          const inst = this.module.instruments[cell.instrument - 1];
          if (inst && inst.samples.length > 0) {
            chState.baseVolume = inst.samples[0].volume;
          }
        }

        // Note parsing
        if (cell.note !== null) {
          if (cell.note === 97) {
            // KeyOff - for XM/IT, start fadeout instead of immediate cut
            if (this.module && (this.module.type === 'XM' || this.module.type === 'IT')) {
              chState.keyOn = false;
            } else {
              chState.volume = 0;
              this.stopChannel(chState, time);
            }
          } else {
            // We have a new valid note
            if (tonePorta) {
              // Set Target Period ONLY
              chState.targetPeriod = this.calculatePeriod(cell.note, cell.instrument, chState);
            } else {
              chState.note = cell.note;
              chState.period =
                cell.period || this.calculatePeriod(cell.note, cell.instrument, chState);
              chState.volume = chState.baseVolume;
              chState.vibratoPhase = 0;
              chState.volumeEnvTick = 0;
              chState.volumeEnvValue = 0;
              chState.keyOn = true;
              this.assignSample(chState);

              // Apply instrument vibrato (XM)
              if (this.module?.type === 'XM' && chState.sample) {
                if (chState.sample.vibratoDepth) chState.vibratoDepth = chState.sample.vibratoDepth;
                if (chState.sample.vibratoRate) chState.vibratoSpeed = chState.sample.vibratoRate;
              }

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

        // Volume column effects (XM)
        if (cell.volumeColumn !== null) {
          const vc = cell.volumeColumn;
          // 0x60-0x6f: Volume slide down
          if (vc >= 0x60 && vc <= 0x6f) {
            chState.volume = Math.max(chState.volume - (vc & 0x0f), 0);
          }
          // 0x70-0x7f: Volume slide up
          else if (vc >= 0x70 && vc <= 0x7f) {
            chState.volume = Math.min(chState.volume + (vc & 0x0f), 64);
          }
          // 0x80-0x8f: Fine volume slide down
          else if (vc >= 0x80 && vc <= 0x8f) {
            if (this.currentTick === 0) chState.volume = Math.max(chState.volume - (vc & 0x0f), 0);
          }
          // 0x90-0x9f: Fine volume slide up
          else if (vc >= 0x90 && vc <= 0x9f) {
            if (this.currentTick === 0) chState.volume = Math.min(chState.volume + (vc & 0x0f), 64);
          }
          // 0xa0-0xaf: Set vibrato speed
          else if (vc >= 0xa0 && vc <= 0xaf) {
            chState.vibratoSpeed = (vc & 0x0f) * 2;
          }
          // 0xb0-0xbf: Vibrato
          else if (vc >= 0xb0 && vc <= 0xbf) {
            if (vc & 0x0f) chState.vibratoDepth = vc & 0x0f;
          }
          // 0xc0-0xcf: Set panning
          else if (vc >= 0xc0 && vc <= 0xcf) {
            chState.panning = (vc & 0x0f) * 16 + 8;
          }
          // 0xd0-0xdf: Panning slide left
          else if (vc >= 0xd0 && vc <= 0xdf) {
            chState.panning = Math.max(chState.panning - (vc & 0x0f) * 4, 0);
          }
          // 0xe0-0xef: Panning slide right
          else if (vc >= 0xe0 && vc <= 0xef) {
            chState.panning = Math.min(chState.panning + (vc & 0x0f) * 4, 255);
          }
          // 0xf0-0xff: Tone portamento
          else if (vc >= 0xf0 && vc <= 0xff) {
            // Already handled by effect 3/5
          }
        }

        // Handle ED note delay (tick > 0 means delay)
        if (chState.effect === 0x0e && ((chState.effectParam >> 4) & 0x0f) === 0xd) {
          const delay = chState.effectParam & 0x0f;
          if (delay > 0 && this.currentTick !== delay) {
            shouldTrigger = false;
          }
        }

        // Handle E9 retrig
        if (chState.effect === 0x0e && ((chState.effectParam >> 4) & 0x0f) === 0x9) {
          const retrigSpeed = chState.effectParam & 0x0f;
          if (retrigSpeed > 0 && this.currentTick > 0 && this.currentTick % retrigSpeed === 0) {
            chState.volumeEnvTick = 0;
            chState.keyOn = true;
            shouldTrigger = true;
          }
        }

        // Parse global tick-based fx memory mapping
        this.parseEffectTick0(chState, chState.effect, chState.effectParam);

        // Handle pattern navigation
        if (chState.effect === 0x0b) {
          patternJump = chState.effectParam;
          patternBreak = true;
          nextRow = 0;
        }
        if (chState.effect === 0x0d) {
          patternBreak = true;
          nextRow = (chState.effectParam >> 4) * 10 + (chState.effectParam & 0x0f);
        }
        if (chState.effect === 0x0f) {
          if (chState.effectParam > 0 && chState.effectParam <= 32)
            this.speed = chState.effectParam;
          else if (chState.effectParam > 32) this.bpm = chState.effectParam;
        }

        if (shouldTrigger && chState.sample && chState.period > 0) {
          this.triggerNote(chState, time);
        }
      } else {
        // --- CONTINUOUS TICK EVALUATION (Tick 1+) ---
        this.parseEffectContinuous(chState, chState.effect);
      }

      // Update envelopes for XM/IT
      if (
        chState.instrument > 0 &&
        this.module &&
        this.module.instruments[chState.instrument - 1]
      ) {
        const inst = this.module.instruments[chState.instrument - 1];
        this.updateEnvelope(chState, inst);
      }

      // Compute final exact frequency and automate Web Audio nodes for THIS tick timeframe
      if (chState.source && chState.gain && chState.sample) {
        let tickFreq = this.calculateFrequency(chState.period, chState.sample);

        if (chState.arpeggioNotes.length > 0) {
          let arpNote = chState.arpeggioNotes[this.currentTick % 3];
          if (arpNote > 0) tickFreq *= Math.pow(2, arpNote / 12);
        }

        if (chState.vibratoDepth > 0) {
          let vibratoMod = 0;
          const wf = chState.vibratoWaveform;
          if (wf === 0 || wf === 3) {
            vibratoMod = Math.sin(chState.vibratoPhase * Math.PI * 2);
          } else if (wf === 1) {
            vibratoMod = ((chState.vibratoPhase * 64) % 1) * 2 - 1;
          } else if (wf === 2) {
            vibratoMod = vibratoMod >= 0 ? 1 : -1;
          }
          vibratoMod *= (chState.vibratoDepth / 64) * 0.05;
          tickFreq *= 1 + vibratoMod;
          chState.vibratoPhase += chState.vibratoSpeed / 256;
        }

        let playbackRate = tickFreq / this.audioContext.sampleRate;
        playbackRate = Math.max(0.01, Math.min(playbackRate, 10));

        chState.source.playbackRate.setValueAtTime(playbackRate, time);

        let finalVol = (chState.volume / 64) * (chState.sample.volume / 64) * this.volume;

        // Apply volume envelope for XM/IT
        if (this.module && (this.module.type === 'XM' || this.module.type === 'IT')) {
          finalVol *= chState.volumeEnvValue / 64;
        }

        // Tremolo
        if (chState.tremoloDepth > 0) {
          let tremoloMod = 0;
          const wf = chState.tremoloWaveform;
          if (wf === 0 || wf === 3) {
            tremoloMod = Math.sin(chState.tremoloPhase * Math.PI * 2);
          } else if (wf === 1) {
            tremoloMod = ((chState.tremoloPhase * 64) % 1) * 2 - 1;
          } else if (wf === 2) {
            tremoloMod = tremoloMod >= 0 ? 1 : -1;
          }
          tremoloMod = 1 + tremoloMod * (chState.tremoloDepth / 64);
          finalVol *= tremoloMod;
          chState.tremoloPhase += chState.tremoloSpeed / 256;
        }

        finalVol = Math.max(0, Math.min(finalVol, 1));
        chState.gain.gain.setValueAtTime(finalVol, time);

        // Apply panning envelope for XM/IT
        if (
          chState.panNode &&
          this.module &&
          (this.module.type === 'XM' || this.module.type === 'IT')
        ) {
          const panValue = chState.panningEnvValue;
          chState.panNode.pan.value = Math.max(-1, Math.min(1, (panValue - 128) / 128));
        }

        activeChannels[c] = finalVol > 0.01;
      }
    }

    if (this.currentTick === 0 && this.onChannelActivity) this.onChannelActivity(activeChannels);
    if (this.currentTick === 0 && this.onPositionChange)
      this.onPositionChange(patternIdx, this.currentRow);

    this.nextTickTime += tickDur;
    this.currentTick++;
    if (this.currentTick >= this.speed) {
      this.currentTick = 0;
      this.currentRow++;

      if (patternBreak || this.currentRow >= (pattern.rows.length || this.module.rowsPerPattern)) {
        this.currentRow = nextRow >= 0 ? nextRow : 0;
        const wasAtEnd = this.currentPatternIdx >= this.module.sequence.length - 1 && !patternJump;
        this.currentPatternIdx = patternJump >= 0 ? patternJump : this.currentPatternIdx + 1;

        if (this.patternLoopRow >= 0 && this.patternLoopCount > 0) {
          this.currentRow = this.patternLoopRow;
          this.currentPatternIdx =
            this.patternLoopPosition >= 0 ? this.patternLoopPosition : this.currentPatternIdx;
          this.patternLoopCount--;
        } else if (
          this.patternLoopRow >= 0 &&
          this.patternLoopCount === 0 &&
          this.patternLoopPosition >= 0
        ) {
          this.currentRow = this.patternLoopRow;
          this.currentPatternIdx = this.patternLoopPosition;
        }

        if (this.currentPatternIdx >= this.module.sequence.length) {
          if (this.isLooping) {
            for (const ch of this.channelStates) {
              ch.period = 0;
              ch.targetPeriod = 0;
              ch.keyOn = false;
              ch.vibratoPhase = 0;
              ch.tremoloPhase = 0;
              ch.volumeEnvValue = 0;
            }
            const restartPos = this.module?.restartPosition || 0;
            this.currentRow = restartPos;
            this.currentPatternIdx = 0;
          } else {
            this.stop();
          }
        } else if (wasAtEnd && this.isLooping) {
          for (const ch of this.channelStates) {
            ch.period = 0;
            ch.targetPeriod = 0;
            ch.keyOn = false;
          }
        }
      }
    }
  }

  private assignSample(chState: ChannelState): void {
    if (!this.module || !chState.instrument) return;
    const inst = this.module.instruments[chState.instrument - 1];
    if (!inst || inst.samples.length === 0) return;

    // For MOD: always use sample 0 (instruments don't have sample mapping)
    // For XM/IT: use sampleMap if available
    let sampleIndex = 0;
    if (this.module.type !== 'MOD' && chState.note && chState.note > 0 && chState.note <= 96) {
      if (inst.sampleMap && chState.note <= inst.sampleMap.length) {
        sampleIndex = inst.sampleMap[chState.note - 1];
      }
    }
    if (sampleIndex < 0 || sampleIndex >= inst.samples.length) {
      sampleIndex = 0;
    }
    chState.sample = inst.samples[sampleIndex] || null;
    if (chState.sample) {
      chState.baseVolume = chState.sample.volume;
      chState.panning = chState.sample.panning;
    }
  }

  private calculatePeriod(note: number, instrument: number, chState: ChannelState): number {
    if (!this.module) return 0;

    // We must pick the correct sample internally first to know its finetune/basenote
    const inst =
      this.module.instruments[instrument - 1] || this.module.instruments[chState.instrument - 1];
    if (!inst || inst.samples.length === 0) return 0;
    let sIdx = 0;
    if (note > 0 && note <= 96 && inst.sampleMap && inst.sampleMap.length >= note)
      sIdx = inst.sampleMap[note - 1];
    const sample = inst.samples[sIdx] || inst.samples[0];

    if (this.module.type === 'IT') {
      // IT handles raw periods based on notes for calculation purposes, or just linear dummy if we want
      return note; // Store exactly note 1-120 as "period" equivalent to simplify IT sliding math
    }
    if (this.module.linearFrequencies) {
      const actualNote = note - 1 + (sample.baseNote || 0);
      return 10 * 12 * 16 * 4 - actualNote * 16 * 4 - sample.finetune / 2;
    }

    let tableNote = note - 1;
    let octaves = 0;
    while (tableNote >= AMIGA_PERIOD_TABLE.length) {
      tableNote -= 12;
      octaves++;
    }
    while (tableNote < 0) {
      tableNote += 12;
      octaves--;
    }

    let p = AMIGA_PERIOD_TABLE[tableNote];
    if (octaves > 0) p = p / Math.pow(2, octaves);
    else if (octaves < 0) p = p * Math.pow(2, -octaves);

    return p;
  }

  private calculateEnvelopeValue(env: Envelope | undefined, tick: number): number {
    if (!env || !env.points || env.points.length === 0) return 64;

    const points = env.points;
    const numPoints = points.length;

    if (tick <= 0) return points[0].value;

    let currentTick = 0;
    for (let i = 0; i < numPoints - 1; i++) {
      const nextTick = points[i + 1].tick;
      if (tick <= nextTick) {
        const t = (tick - currentTick) / (nextTick - currentTick);
        return points[i].value + (points[i + 1].value - points[i].value) * t;
      }
      currentTick = nextTick;
    }

    const lastPoint = points[numPoints - 1];
    return lastPoint.value;
  }

  private updateEnvelope(
    chState: ChannelState,
    inst: { volumeEnv?: Envelope; panningEnv?: Envelope; volumeFadeout: number }
  ): void {
    if (!this.module) return;
    if (this.module.type !== 'XM' && this.module.type !== 'IT') return;

    const volEnv = inst.volumeEnv;
    const panEnv = inst.panningEnv;

    if (chState.keyOn) {
      if (volEnv) {
        const envType = volEnv.type || 0;
        const loopEnabled = (envType & 4) !== 0;
        const loopStart = volEnv.loopStart || 0;
        const loopEnd = volEnv.loopEnd || (volEnv.points?.length || 1) - 1;

        chState.volumeEnvTick++;

        if (loopEnabled && chState.volumeEnvTick >= volEnv.points[loopEnd].tick) {
          chState.volumeEnvTick = volEnv.points[loopStart].tick;
        }

        chState.volumeEnvValue = this.calculateEnvelopeValue(volEnv, chState.volumeEnvTick);
      } else {
        chState.volumeEnvValue = 64;
      }

      if (panEnv) {
        chState.panningEnvTick++;
        chState.panningEnvValue = this.calculateEnvelopeValue(panEnv, chState.panningEnvTick);
      } else {
        chState.panningEnvValue = chState.sample?.panning || 128;
      }
    } else {
      if (inst.volumeFadeout > 0) {
        const fadeRate = inst.volumeFadeout / (8192 / 5);
        chState.volumeEnvValue = Math.max(0, chState.volumeEnvValue - fadeRate);
      } else {
        chState.volumeEnvValue = 0;
      }
    }
  }

  private calculateFrequency(period: number, sample: Sample): number {
    if (!this.module) return 0;
    if (period <= 0) return 0;
    if (this.module.type === 'IT') {
      const actualNote = period - 1;
      return (sample.c5speed || 8363) * Math.pow(2, (actualNote - 60) / 12);
    }
    if (this.module.linearFrequencies) return periodToFrequencyLinear(period);
    return periodToFrequencyAmiga(period, sample.finetune, this.module.clock);
  }

  private parseEffectTick0(chState: ChannelState, effect: number, param: number): void {
    chState.arpeggioNotes = [];

    // Effect 0: Arpeggio
    if (effect === 0x00 && param > 0) {
      chState.arpeggioNotes = [0, (param >> 4) & 0x0f, param & 0x0f];
    }
    // Effect 1: Porta Up
    else if (effect === 0x01) {
      if (param > 0) chState.slideSpeed = param;
    }
    // Effect 2: Porta Down
    else if (effect === 0x02) {
      if (param > 0) chState.slideSpeed = param;
    }
    // Effect 3: Porta to Note
    else if (effect === 0x03) {
      if (param > 0) chState.slideSpeed = param;
    }
    // Effect 4: Vibrato
    else if (effect === 0x04) {
      if (param & 0x0f) chState.vibratoDepth = param & 0x0f;
      if (param & 0xf0) chState.vibratoSpeed = (param >> 4) * 2;
    }
    // Effect 5: Porta + Volume Slide
    else if (effect === 0x05) {
      if (param > 0) chState.slideSpeed = param;
      if (param > 0) chState.volSlideSpeed = param;
    }
    // Effect 6: Vibrato + Volume Slide
    else if (effect === 0x06) {
      if (param > 0) chState.volSlideSpeed = param;
    }
    // Effect 7: Tremolo
    else if (effect === 0x07) {
      if (param & 0x0f) chState.tremoloDepth = param & 0x0f;
      if (param & 0xf0) chState.tremoloSpeed = (param >> 4) * 2;
    }
    // Effect 8: Set Panning
    else if (effect === 0x08) {
      chState.panning = param;
    }
    // Effect 9: Sample Offset
    else if (effect === 0x09) {
      chState.sampleOffset = param * 256;
    }
    // Effect A: Volume Slide
    else if (effect === 0x0a) {
      if (param > 0) chState.volSlideSpeed = param;
    }
    // Effect B: Position Jump
    // Effect C: Set Volume
    else if (effect === 0x0c) {
      chState.volume = Math.min(param, 64);
    }
    // Effect D: Pattern Break
    // Effect E: Extended effects
    else if (effect === 0x0e) {
      const eSub = (param >> 4) & 0x0f;
      const eParam = param & 0x0f;
      // E1: Fine Porta Up
      if (eSub === 0x1) {
        if (eParam > 0) chState.fineSlideSpeed = eParam;
      }
      // E2: Fine Porta Down
      else if (eSub === 0x2) {
        if (eParam > 0) chState.fineSlideSpeed = eParam;
      }
      // E3: Set Glissando Control
      else if (eSub === 0x3) {
        chState.glissando = (eParam & 0x0f) !== 0;
      }
      // E4: Set Vibrato Waveform
      else if (eSub === 0x4) {
        chState.vibratoWaveform = eParam & 3;
      }
      // E7: Set Tremolo Waveform
      else if (eSub === 0x7) {
        chState.tremoloWaveform = eParam & 3;
      }
      // E9: Retrig Note
      else if (eSub === 0x9) {
        chState.retrigCounter = 0;
      }
      // EA: Fine Volume Slide Up
      else if (eSub === 0xa) {
        if (eParam > 0) chState.volume = Math.min(chState.volume + eParam, 64);
      }
      // EB: Fine Volume Slide Down
      else if (eSub === 0xb) {
        if (eParam > 0) chState.volume = Math.max(chState.volume - eParam, 0);
      }
      // EC: Note Cut
      else if (eSub === 0xc) {
        if (eParam === 0) chState.volume = 0;
      }
      // ED: Note Delay
      else if (eSub === 0xd) {
        chState.noteDelayCounter = eParam;
      }
      // EE: Pattern Delay
      else if (eSub === 0xe) {
        // Handled in scheduler
      }
      // E5: Loop Note (set loop start)
      else if (eSub === 0x5) {
        chState.loopStartRow = this.currentRow;
      }
      // E6: Pattern Loop
      else if (eSub === 0x6) {
        if (eParam === 0) {
          this.patternLoopRow = chState.loopStartRow >= 0 ? chState.loopStartRow : 0;
          this.patternLoopCount = 0;
          this.patternLoopPosition = this.currentPatternIdx;
        } else if (this.patternLoopRow >= 0) {
          this.patternLoopCount = eParam;
        }
      }
    }
    // Effect F: Set Speed
  }

  private parseEffectContinuous(chState: ChannelState, effect: number): void {
    // Effect 1: Porta Up
    if (effect === 0x01) {
      chState.period = Math.max(1, chState.period - chState.slideSpeed * 4);
    }
    // Effect 2: Porta Down
    else if (effect === 0x02) {
      chState.period += chState.slideSpeed * 4;
    }
    // Effect 3/5: Tone Portamento
    else if (effect === 0x03 || effect === 0x05) {
      if (chState.period < chState.targetPeriod) {
        chState.period += chState.slideSpeed * 4;
        if (chState.period > chState.targetPeriod) chState.period = chState.targetPeriod;
      } else if (chState.period > chState.targetPeriod) {
        chState.period -= chState.slideSpeed * 4;
        if (chState.period < chState.targetPeriod) chState.period = chState.targetPeriod;
      }
      // Glissando: snap to nearest table note
      if (
        chState.glissando &&
        this.module &&
        this.module.type !== 'IT' &&
        !this.module.linearFrequencies
      ) {
        let closestDist = Infinity;
        let closestPeriod = chState.period;
        for (const p of AMIGA_PERIOD_TABLE) {
          const dist = Math.abs(p - chState.period);
          if (dist < closestDist) {
            closestDist = dist;
            closestPeriod = p;
          }
        }
        chState.period = closestPeriod;
      }
    }
    // Effect 4: Vibrato (handled in frequency calculation)
    // Effect 6: Vibrato + Volume Slide
    // Effect 7: Tremolo
    else if (effect === 0x07) {
      // Handled in volume calculation
    }
    // Effect A: Volume Slide
    else if (effect === 0x0a || effect === 0x05 || effect === 0x06) {
      let spd = chState.volSlideSpeed;
      if (spd >> 4 > 0 && (spd & 0x0f) === 0) chState.volume += spd >> 4;
      else if (spd >> 4 === 0 && (spd & 0x0f) > 0) chState.volume -= spd & 0x0f;
      chState.volume = Math.max(0, Math.min(64, chState.volume));
    }
    // Effect E: Extended
    else if (effect === 0x0e) {
      const eSub = (chState.effectParam >> 4) & 0x0f;
      const eParam = chState.effectParam & 0x0f;
      // E1: Fine Porta Up
      if (eSub === 0x1) {
        chState.period = Math.max(1, chState.period - chState.fineSlideSpeed * 4);
      }
      // E2: Fine Porta Down
      else if (eSub === 0x2) {
        chState.period += chState.fineSlideSpeed * 4;
      }
      // EC: Note Cut
      else if (eSub === 0xc) {
        if (this.currentTick === eParam) chState.volume = 0;
      }
      // ED: Note Delay
      else if (eSub === 0xd) {
        // Handled in scheduler
      }
    }
  }

  private triggerNote(chState: ChannelState, time: number): void {
    if (
      !this.audioContext ||
      !this.masterGain ||
      !chState.sample ||
      chState.sample.data.length === 0
    )
      return;
    this.stopChannel(chState, time); // Pre-cleanup overlapping

    const buffer = this.audioContext.createBuffer(
      1,
      chState.sample.data.length,
      this.audioContext.sampleRate
    );
    buffer.getChannelData(0).set(chState.sample.data);

    chState.source = this.audioContext.createBufferSource();
    chState.source.buffer = buffer;

    if (chState.sample.loopLength > 2) {
      chState.source.loop = true;
      chState.source.loopStart = chState.sample.loopStart / this.audioContext.sampleRate;
      chState.source.loopEnd =
        (chState.sample.loopStart + chState.sample.loopLength) / this.audioContext.sampleRate;
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

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }
  getModule(): ModuleFile | null {
    return this.module;
  }
  getIsPlaying(): boolean {
    return this.isPlaying;
  }
  getIsWorkletEnabled(): boolean {
    return this.useWorklet;
  }
  getCurrentPosition(): { pattern: number; row: number } {
    return { pattern: this.currentPatternIdx, row: this.currentRow };
  }
  getTotalRows(): number {
    return this.module ? this.module.sequence.length * this.module.rowsPerPattern : 0;
  }
  getDuration(): number {
    if (!this.module) return 0;
    const totalRows = this.getTotalRows();
    const bpm = this.module.defaultBpm || 125;
    const speed = this.module.defaultSpeed || 6;
    const tickDuration = 2.5 / bpm;
    const rowDuration = tickDuration * speed;
    return totalRows * rowDuration;
  }
  getCurrentTime(): number {
    if (!this.module) return 0;
    const totalRowsPerPattern = this.module.rowsPerPattern;
    const rowsPlayed = this.currentPatternIdx * totalRowsPerPattern + this.currentRow;
    const bpm = this.module.defaultBpm || 125;
    const speed = this.speed || 6;
    const tickDuration = 2.5 / bpm;
    const rowDuration = tickDuration * speed;
    return rowsPlayed * rowDuration + this.currentTick * tickDuration;
  }
  getSpeed(): number {
    return this.speed;
  }

  seek(pattern: number, row: number): void {
    if (!this.module) return;
    this.currentPatternIdx = Math.max(0, Math.min(pattern, this.module.sequence.length - 1));
    this.currentRow = Math.max(0, Math.min(row, this.module.rowsPerPattern - 1));
    this.currentTick = 0;
    this.patternLoopRow = -1;
    this.patternLoopCount = 0;
    this.patternLoopPosition = -1;
    for (const ch of this.channelStates) {
      this.stopChannel(ch);
      ch.period = 0;
      ch.targetPeriod = 0;
      ch.volume = 0;
      ch.keyOn = false;
    }
    this.sendToWorklet('seek', {
      position: this.currentPatternIdx,
      rowIndex: this.currentRow
    });
    if (this.onPositionChange) this.onPositionChange(this.currentPatternIdx, this.currentRow);
  }

  cleanup(): void {
    this.stop();
    if (this.masterGain) this.masterGain.disconnect();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}
