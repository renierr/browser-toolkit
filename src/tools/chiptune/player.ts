import {
  type ModuleFile,
  type Sample,
  type Note,
  type Pattern,
  AMIGA_PERIOD_TABLE,
  periodToFrequency,
} from './types';

interface ChannelState {
  instrument: number;
  note: string | null;
  octave: number | null;
  period: number;
  volume: number;
  effect: number;
  effectParam: number;
  slidePitch: number;
  vibratoPhase: number;
  vibratoSpeed: number;
  vibratoDepth: number;
  arpeggioNotes: number[];
  arpeggioIndex: number;
  sampleOffset: number;
  portamentoTarget: number;
}

export class ChiptunePlayer {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private module: ModuleFile | null = null;
  private isPlaying = false;
  private currentPatternIdx = 0;
  private currentRow = 0;
  private nextNoteTime = 0;
  private schedulerTimer: number | null = null;
  private readonly lookAhead = 0.1;
  private scheduleInterval = 25;
  private channelStates: ChannelState[] = [];
  private lastInstrument: number[] = [];
  private isLooping = true;
  private speed = 6;
  private volume = 0.7;
  private consecutiveEmptyRows = 0;

  public onPositionChange: ((pattern: number, row: number) => void) | null = null;
  public onChannelActivity: ((activeChannels: boolean[]) => void) | null = null;

  constructor() {
    this.initAudio();
  }

  private initAudio(): void {
    try {
      this.audioContext = new AudioContext();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.audioContext.destination);

      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.masterGain.connect(this.analyser);
    } catch (e) {
      console.error('[Chiptune] Failed to init audio:', e);
    }
  }

  loadModule(mod: ModuleFile): void {
    this.module = mod;
    this.speed = mod.defaultSpeed;
    this.lastInstrument = new Array(mod.channels).fill(0);
    this.channelStates = [];

    for (let i = 0; i < mod.channels; i++) {
      this.channelStates.push({
        instrument: 0,
        note: null,
        octave: null,
        period: 0,
        volume: 64,
        effect: 0,
        effectParam: 0,
        slidePitch: 0,
        vibratoPhase: 0,
        vibratoSpeed: 0,
        vibratoDepth: 0,
        arpeggioNotes: [],
        arpeggioIndex: 0,
        sampleOffset: 0,
        portamentoTarget: 0,
      });
    }
  }

  setLooping(loop: boolean): void {
    this.isLooping = loop;
  }

  setSpeed(spd: number): void {
    this.speed = Math.max(1, Math.min(32, spd));
  }

  setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain) this.masterGain.gain.value = this.volume;
  }

  play(): void {
    if (!this.audioContext || !this.module) return;
    if (this.audioContext.state === 'suspended') this.audioContext.resume();

    this.isPlaying = true;
    this.currentPatternIdx = 0;
    this.currentRow = 0;
    this.consecutiveEmptyRows = 0;
    this.nextNoteTime = this.audioContext.currentTime;

    for (const ch of this.channelStates) {
      ch.period = 0;
      ch.slidePitch = 0;
      ch.vibratoPhase = 0;
      ch.vibratoSpeed = 0;
      ch.vibratoDepth = 0;
      ch.arpeggioNotes = [];
      ch.arpeggioIndex = 0;
      ch.sampleOffset = 0;
      ch.portamentoTarget = 0;
    }

    this.scheduler();
  }

  pause(): void {
    this.isPlaying = false;
    if (this.schedulerTimer !== null) {
      clearTimeout(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  stop(): void {
    this.isPlaying = false;
    if (this.schedulerTimer !== null) {
      clearTimeout(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    this.currentPatternIdx = 0;
    this.currentRow = 0;
    if (this.onPositionChange) this.onPositionChange(0, 0);
    if (this.onChannelActivity)
      this.onChannelActivity(new Array(this.module?.channels || 4).fill(false));
  }

  private scheduler(): void {
    if (!this.isPlaying || !this.audioContext || !this.module) return;

    while (this.nextNoteTime < this.audioContext.currentTime + this.lookAhead) {
      this.scheduleNote();
    }

    this.schedulerTimer = window.setTimeout(() => this.scheduler(), this.scheduleInterval);
  }

  private scheduleNote(): void {
    if (!this.audioContext || !this.module) return;

    const patternIdx = this.module.sequence[this.currentPatternIdx];
    const pattern = this.module.patterns[patternIdx];
    if (!pattern) return;

    const row = pattern.rows[this.currentRow];
    const activeChannels: boolean[] = [];

    for (let ch = 0; ch < row.length; ch++) {
      const cell = row[ch];
      const isActive = this.playCell(ch, cell, this.nextNoteTime);
      activeChannels.push(isActive);
    }

    for (let ch = row.length; ch < this.module.channels; ch++) activeChannels.push(false);

    if (this.onChannelActivity) this.onChannelActivity(activeChannels);

    const rowDuration = this.speed / 50;
    this.nextNoteTime += rowDuration;

    if (this.onPositionChange) this.onPositionChange(patternIdx, this.currentRow);

    const rowHasNotes = this.rowHasNotes(pattern, this.currentRow);
    if (!rowHasNotes) {
      this.consecutiveEmptyRows++;
      if (this.consecutiveEmptyRows >= 3) {
        const hasMore = this.hasNotesFromRow(pattern, this.currentRow + 1);
        if (!hasMore) {
          this.consecutiveEmptyRows = 0;
          this.nextPattern();
        }
      }
    } else {
      this.consecutiveEmptyRows = 0;
    }

    this.currentRow++;
    if (this.currentRow >= this.module.rowsPerPattern) {
      this.currentRow = 0;
      this.consecutiveEmptyRows = 0;
      this.nextPattern();
    }
  }

  private nextPattern(): void {
    if (!this.module) return;
    this.currentPatternIdx++;
    if (this.currentPatternIdx >= this.module.sequence.length) {
      if (this.isLooping) {
        this.currentPatternIdx = 0;
      } else {
        this.stop();
      }
    }
  }

  private rowHasNotes(pattern: Pattern, row: number): boolean {
    if (row >= pattern.rows.length) return false;
    for (const cell of pattern.rows[row]) {
      if (cell.note !== null && cell.octave !== null) return true;
    }
    return false;
  }

  private hasNotesFromRow(pattern: Pattern, startRow: number): boolean {
    for (let r = startRow; r < pattern.rows.length; r++) {
      for (const cell of pattern.rows[r]) {
        if (cell.note !== null && cell.octave !== null) return true;
      }
    }
    return false;
  }

  private playCell(channel: number, cell: Note, time: number): boolean {
    if (!this.audioContext || !this.module) return false;

    const chState = this.channelStates[channel];
    if (!chState) return false;

    if (cell.effect === 0x09) chState.sampleOffset = cell.effectParam * 256;
    if (cell.instrument > 0) {
      this.lastInstrument[channel] = cell.instrument;
      chState.instrument = cell.instrument;
    }
    if (cell.note !== null && cell.octave !== null) {
      chState.note = cell.note;
      chState.octave = cell.octave;
      chState.slidePitch = 0;
      chState.arpeggioNotes = [];
      chState.arpeggioIndex = 0;
      chState.sampleOffset = 0;
    }
    if (cell.period > 0) chState.period = cell.period;

    if (cell.effect === 0x0c) chState.volume = Math.min(cell.effectParam, 64);
    else if (cell.effect === 0x0a) {
      const volSlide = cell.effectParam;
      chState.volume = Math.min(
        Math.max(chState.volume + (volSlide >> 4) * 16 - (volSlide & 0x0f) * 16, 0),
        64
      );
    }

    if (cell.effect === 0x01) chState.slidePitch = cell.effectParam * 1.5;
    else if (cell.effect === 0x02) chState.slidePitch = -cell.effectParam * 1.5;
    else if (cell.effect === 0x03) chState.portamentoTarget = cell.effectParam;
    else if (cell.effect === 0x04) {
      chState.vibratoDepth = cell.effectParam & 0x0f;
      chState.vibratoSpeed = (cell.effectParam >> 4) * 2 || 2;
    } else if (cell.effect === 0x00 && cell.effectParam > 0) {
      const arp = cell.effectParam;
      const note1 = (arp >> 4) & 0x0f;
      const note2 = arp & 0x0f;
      if (note1 > 0 || note2 > 0) {
        chState.arpeggioNotes = [0, note1, note2];
        chState.arpeggioIndex = 0;
      }
    } else if (cell.effect === 0x0f) {
      if (cell.effectParam > 0 && cell.effectParam <= 32) this.speed = cell.effectParam;
    }

    if (cell.effect === 0x0b) {
      this.currentPatternIdx = cell.effectParam;
      this.currentRow = 0;
      this.consecutiveEmptyRows = 0;
    } else if (cell.effect === 0x0d) {
      this.currentRow = (cell.effectParam >> 4) * 10 + (cell.effectParam & 0x0f) - 1;
    }

    const hasNoteInCell = cell.note !== null && cell.octave !== null;
    const hasNoteInState = chState.note !== null && chState.octave !== null;
    if (!hasNoteInCell && !hasNoteInState) return false;

    let instrumentId = cell.instrument || this.lastInstrument[channel];
    if (!instrumentId || instrumentId >= this.module.samples.length) return false;

    const sample = this.module.samples[instrumentId];
    if (!sample || sample.data.length === 0) return false;

    const finetune = sample.finetune;
    let freq: number;

    if (chState.period > 0) freq = periodToFrequency(chState.period, finetune);
    else {
      const note = cell.note || chState.note;
      const octave = cell.octave || chState.octave;
      if (!note || octave === null) return false;
      const noteIndex = AMIGA_PERIOD_TABLE.findIndex((p) => p.note === note && p.octave === octave);
      freq =
        noteIndex >= 0 ? periodToFrequency(AMIGA_PERIOD_TABLE[noteIndex].period, finetune) : 440;
    }

    if (freq <= 0) return false;

    const rowDuration = this.speed / 50;

    if (chState.arpeggioNotes.length > 0) {
      const arpNote = chState.arpeggioNotes[chState.arpeggioIndex % 3];
      if (arpNote > 0) freq *= Math.pow(2, arpNote / 12);
      chState.arpeggioIndex++;
    }

    if (chState.slidePitch !== 0) freq += chState.slidePitch;

    const vibratoMod =
      1 + Math.sin(chState.vibratoPhase * Math.PI * 2) * (chState.vibratoDepth / 64);
    freq *= vibratoMod;

    if (chState.vibratoSpeed > 0 && chState.vibratoDepth > 0) {
      chState.vibratoPhase += chState.vibratoSpeed / 256;
      if (chState.vibratoPhase > 1) chState.vibratoPhase -= 1;
    }

    this.playSample(
      sample,
      freq,
      time,
      chState.volume,
      rowDuration,
      finetune,
      chState.sampleOffset
    );
    return true;
  }

  private playSample(
    sample: Sample,
    freq: number,
    time: number,
    volume: number,
    rowDuration: number,
    finetune: number = 0,
    sampleOffset: number = 0
  ): void {
    if (!this.audioContext || !this.masterGain) return;

    const buffer = this.audioContext.createBuffer(
      1,
      sample.data.length,
      this.audioContext.sampleRate
    );
    const channelData = buffer.getChannelData(0);
    channelData.set(sample.data);

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;

    if (sample.loopLength > 2) {
      source.loop = true;
      source.loopStart = sample.loopStart / this.audioContext.sampleRate;
      source.loopEnd = (sample.loopStart + sample.loopLength) / this.audioContext.sampleRate;
    }

    const baseFreq = 8363;
    let playbackRate = freq / baseFreq;
    playbackRate *= Math.pow(2, finetune / 4096);
    source.playbackRate.value = playbackRate;

    const startOffset = sampleOffset / 256;
    if (startOffset > 0 && startOffset < sample.data.length / this.audioContext.sampleRate) {
      source.start(time, startOffset);
    } else {
      source.start(time);
    }

    const gain = this.audioContext.createGain();
    const vol = (volume / 64) * (sample.volume / 64);
    const effectiveVol = Math.min(vol, 1);

    const noteDuration = rowDuration * 0.85;
    gain.gain.setValueAtTime(effectiveVol, time);
    gain.gain.setValueAtTime(effectiveVol * 0.9, time + noteDuration);
    gain.gain.exponentialRampToValueAtTime(0.01, time + noteDuration + 0.1);

    source.connect(gain);
    gain.connect(this.masterGain);
    source.stop(time + noteDuration + 0.15);
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
  getCurrentPosition(): { pattern: number; row: number } {
    return { pattern: this.currentPatternIdx, row: this.currentRow };
  }
  getTotalRows(): number {
    const mod = this.module;
    if (!mod) return 0;
    return mod.sequence.length * mod.rowsPerPattern;
  }
  getSpeed(): number {
    return this.speed;
  }

  cleanup(): void {
    this.stop();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}
