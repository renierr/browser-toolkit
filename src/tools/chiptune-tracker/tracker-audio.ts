import type { TrackerState, Instrument, CellData, Pattern } from './tracker-state';
import { noteToFrequency } from './tracker-state';

type Voice = {
  osc: OscillatorNode | null;
  gain: GainNode;
  active: boolean;
  note: number;
  instrument: Instrument | null;
  releaseTime: number;
  sourceNode?: AudioBufferSourceNode | null;
};

interface ChannelState {
  instrument: number;
  note: string | null;
  octave: number | null;
  volume: number;
  effect: number;
  effectParam: number;
  slidePitch: number;
  vibratoPhase: number;
  vibratoSpeed: number;
  vibratoDepth: number;
  arpeggioNotes: number[];
  arpeggioIndex: number;
}

export class TrackerAudio {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private voices: Voice[] = [];
  private state: TrackerState | null = null;
  private isPlaying = false;
  private currentPatternIdx = 0;
  private currentRow = 0;
  private nextNoteTime = 0;
  private schedulerTimer: number | null = null;
  private readonly lookAhead = 0.1;
  private readonly scheduleInterval = 25;
  private onPositionChange: ((pattern: number, row: number) => void) | null = null;
  private onStop: (() => void) | null = null;
  private consecutiveEmptyRows = 0;
  private lastInstrument: number[] = [];
  private channelStates: ChannelState[] = [];

  constructor() {
    this.initAudio();
  }

  private initAudio(): void {
    try {
      this.audioContext = new AudioContext();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = 0.5;
      this.masterGain.connect(this.audioContext.destination);
    } catch (e) {
      console.error('[Tracker] Failed to init audio:', e);
    }
  }

  setState(state: TrackerState): void {
    this.state = state;
    this.lastInstrument = new Array(state.channels).fill(0);
    this.channelStates = [];
    for (let i = 0; i < state.channels; i++) {
      this.channelStates.push({
        instrument: 0,
        note: null,
        octave: null,
        volume: 64,
        effect: 0,
        effectParam: 0,
        slidePitch: 0,
        vibratoPhase: 0,
        vibratoSpeed: 0,
        vibratoDepth: 0,
        arpeggioNotes: [],
        arpeggioIndex: 0,
      });
    }
  }

  setOnPositionChange(cb: (pattern: number, row: number) => void): void {
    this.onPositionChange = cb;
  }

  setOnStop(cb: () => void): void {
    this.onStop = cb;
  }

  play(): void {
    if (!this.audioContext || !this.state) return;
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    this.isPlaying = true;
    this.currentPatternIdx = 0;
    this.currentRow = 0;
    this.consecutiveEmptyRows = 0;
    this.nextNoteTime = this.audioContext.currentTime;
    for (const ch of this.channelStates) {
      ch.slidePitch = 0;
      ch.vibratoPhase = 0;
      ch.vibratoSpeed = 0;
      ch.vibratoDepth = 0;
      ch.arpeggioNotes = [];
      ch.arpeggioIndex = 0;
    }
    this.scheduler();
  }

  stop(): void {
    this.isPlaying = false;
    if (this.schedulerTimer !== null) {
      clearTimeout(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    this.stopAllVoices();
    if (this.onStop) this.onStop();
  }

  pause(): void {
    this.isPlaying = false;
    if (this.schedulerTimer !== null) {
      clearTimeout(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    this.stopAllVoices();
  }

  private scheduler(): void {
    if (!this.isPlaying || !this.audioContext || !this.state) return;

    while (this.nextNoteTime < this.audioContext.currentTime + this.lookAhead) {
      this.scheduleNote();
    }

    this.schedulerTimer = window.setTimeout(() => this.scheduler(), this.scheduleInterval);
  }

  private scheduleNote(): void {
    if (!this.audioContext || !this.state) return;

    const patternIdx = this.state.order[this.currentPatternIdx];
    const pattern = this.state.patterns[patternIdx];
    if (!pattern) return;

    if (this.currentRow === 0 && !this.hasNotes(pattern)) {
      if (this.state.isLooping) {
        this.currentPatternIdx++;
        if (this.currentPatternIdx >= this.state.order.length) {
          this.currentPatternIdx = 0;
        }
        return;
      } else {
        this.stop();
        return;
      }
    }

    const rowHasNotes = this.rowHasNotes(pattern, this.currentRow);

    const row = pattern.rows[this.currentRow];
    for (let ch = 0; ch < row.length; ch++) {
      const cell = row[ch];
      this.playCell(ch, cell, this.nextNoteTime);
    }

    const speed = this.state.speed || 6;
    const rowDuration = (speed * 2) / (this.state.bpm / 60);
    this.nextNoteTime += rowDuration;

    if (this.onPositionChange) {
      const actualPatternIdx = this.state.order[this.currentPatternIdx];
      this.onPositionChange(actualPatternIdx, this.currentRow);
    }

    if (!rowHasNotes) {
      this.consecutiveEmptyRows++;
      if (this.consecutiveEmptyRows >= 3) {
        const hasMoreNotes = this.hasNotesFromRow(pattern, this.currentRow + 1);
        if (!hasMoreNotes) {
          this.consecutiveEmptyRows = 0;
          if (this.state.isLooping) {
            this.currentPatternIdx++;
            if (this.currentPatternIdx >= this.state.order.length) {
              this.currentPatternIdx = 0;
            }
            this.currentRow = 0;
            return;
          } else {
            this.stop();
            return;
          }
        }
      }
    } else {
      this.consecutiveEmptyRows = 0;
    }

    this.currentRow++;
    if (this.currentRow >= this.state.rowsPerPattern) {
      this.currentRow = 0;
      this.consecutiveEmptyRows = 0;
      this.currentPatternIdx++;
      if (this.currentPatternIdx >= this.state.order.length) {
        if (this.state.isLooping) {
          this.currentPatternIdx = 0;
        } else {
          this.stop();
          return;
        }
      }
    }
  }

  private playCell(channel: number, cell: CellData, time: number): void {
    if (!this.audioContext || !this.state) return;

    const chState = this.channelStates[channel];
    if (!chState) return;

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
    }

    if (cell.effect === 0x0c) {
      chState.volume = Math.min(cell.effectParam, 64);
    } else if (cell.effect === 0x0a) {
      const volSlide = cell.effectParam;
      const hi = (volSlide >> 4) & 0x0f;
      const lo = volSlide & 0x0f;
      if (hi > 0) {
        chState.volume = Math.min(chState.volume + hi, 64);
      } else if (lo > 0) {
        chState.volume = Math.max(chState.volume - lo, 0);
      }
    }

    if (cell.effect === 0x01) {
      chState.slidePitch = cell.effectParam * 1.5;
    } else if (cell.effect === 0x02) {
      chState.slidePitch = -cell.effectParam * 1.5;
    } else if (cell.effect === 0x04) {
      chState.vibratoDepth = cell.effectParam & 0x0f;
      chState.vibratoSpeed = (cell.effectParam >> 4) * 2;
    } else if (cell.effect === 0x00 && cell.effectParam > 0) {
      const arp = cell.effectParam;
      const note1 = (arp >> 4) & 0x0f;
      const note2 = arp & 0x0f;
      if (note1 > 0 || note2 > 0) {
        chState.arpeggioNotes = [0, note1, note2];
        chState.arpeggioIndex = 0;
      }
    }

    const hasNoteInCell = cell.note !== null && cell.octave !== null;
    const hasNoteInState = chState.note !== null && chState.octave !== null;
    if (!hasNoteInCell && !hasNoteInState) return;

    let instrumentId = cell.instrument;
    if (instrumentId === 0) {
      instrumentId = this.lastInstrument[channel] || 1;
    }

    const instrument =
      this.state.instruments.find((i) => i.id === instrumentId) ?? this.state.instruments[0];
    if (!instrument) return;

    const note = cell.note ?? chState.note;
    const octave = cell.octave ?? chState.octave;
    let freq = noteToFrequency(note, octave);
    if (freq <= 0) return;

    const finetune = instrument.sampleFinetune ?? 0;
    const finetuneOffset = finetune * 0.5;
    freq += finetuneOffset;

    const modSampleIdx = instrument.sampleIndex ?? instrumentId - 1;
    const hasModSample =
      this.state.modSamples && modSampleIdx >= 0 && this.state.modSamples[modSampleIdx]?.length > 0;

    const speed = this.state.speed || 6;
    const rowDuration = (speed * 2) / (this.state.bpm / 60);

    if (chState.arpeggioNotes.length > 0) {
      const arpNote = chState.arpeggioNotes[chState.arpeggioIndex % 3];
      if (arpNote > 0) {
        freq *= Math.pow(2, arpNote / 12);
      }
    }

    if (chState.slidePitch !== 0) {
      freq += chState.slidePitch;
    }

    const vibratoFreq =
      1 + Math.sin(chState.vibratoPhase * Math.PI * 2) * (chState.vibratoDepth / 64);
    freq *= vibratoFreq;

    if (hasModSample) {
      this.playSample(modSampleIdx, freq, time, chState.volume, instrument, rowDuration);
      return;
    }

    const voice = this.getFreeVoice();
    if (!voice) return;

    voice.active = true;
    voice.note = freq;
    voice.instrument = instrument;

    if (instrument.waveform === 'noise') {
      this.playNoise(voice, time, chState.volume);
    } else {
      this.playTone(voice, freq, time, chState.volume, instrument);
    }
  }

  private playSample(
    sampleIdx: number,
    freq: number,
    time: number,
    volume: number,
    instrument: Instrument,
    rowDuration: number
  ): void {
    if (!this.audioContext || !this.state?.modSamples) return;

    const sampleData = this.state.modSamples[sampleIdx];
    if (!sampleData || sampleData.length === 0) return;

    const voice = this.getFreeVoice();
    if (!voice) return;

    voice.active = true;
    voice.note = freq;

    const buffer = this.audioContext.createBuffer(
      1,
      sampleData.length,
      this.audioContext.sampleRate
    );
    const channelData = buffer.getChannelData(0);
    channelData.set(sampleData);

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;

    const baseFreq = 8363;
    const playbackRate = freq / baseFreq;
    source.playbackRate.value = playbackRate;

    const sampleVol = instrument.sampleVolume ?? 64;
    const vol = (volume / 64) * (sampleVol / 64);
    const effectiveVol = Math.min(vol, 1);

    const noteDuration = rowDuration * 0.9;
    voice.gain.gain.setValueAtTime(effectiveVol, time);
    voice.gain.gain.setValueAtTime(effectiveVol, time + noteDuration);
    voice.gain.gain.exponentialRampToValueAtTime(0.01, time + noteDuration + 0.05);

    source.connect(voice.gain);
    source.start(time);
    source.stop(time + noteDuration + 0.1);

    voice.sourceNode = source;
    voice.releaseTime = time + noteDuration + 0.1;
  }

  private playTone(
    voice: Voice,
    freq: number,
    time: number,
    volume: number | null,
    instrument: Instrument
  ): void {
    if (!this.audioContext || !voice.gain || !this.state) return;

    const osc = this.audioContext.createOscillator();
    const oscType =
      instrument.waveform === 'pulse'
        ? 'square'
        : instrument.waveform === 'noise'
          ? 'sawtooth'
          : instrument.waveform;
    osc.type = oscType as OscillatorType;
    osc.frequency.value = freq;

    if (instrument.waveform === 'pulse' && (this.audioContext as any).createOscillator) {
      const pulseWidth = instrument.duty / 100;
      const realOsc = this.audioContext.createOscillator();
      realOsc.type = 'square';
      realOsc.frequency.value = freq;

      const pwm = this.audioContext.createGain();
      pwm.gain.value = pulseWidth;

      const inv = this.audioContext.createGain();
      inv.gain.value = 1 - pulseWidth * 2;

      osc.disconnect();
      osc.connect(pwm);
      osc.connect(inv);
      pwm.connect(voice.gain.gain);
      inv.connect(voice.gain.gain);
    }

    osc.connect(voice.gain);

    const vol = volume !== null ? volume / 64 : 1;
    const now = time;
    const attack = instrument.attack;
    const decay = instrument.decay;
    const sustain = instrument.sustain * vol;
    const release = instrument.release;

    const speed = this.state.speed || 6;
    const rowDuration = (speed * 2) / (this.state.bpm / 60);
    const noteDuration = rowDuration * 0.9;

    voice.gain.gain.setValueAtTime(0, now);
    voice.gain.gain.linearRampToValueAtTime(vol, now + attack);
    voice.gain.gain.linearRampToValueAtTime(sustain, now + attack + decay);
    voice.gain.gain.setValueAtTime(sustain, now + noteDuration);
    voice.gain.gain.linearRampToValueAtTime(0, now + noteDuration + release);

    osc.start(now);
    osc.stop(now + noteDuration + release + 0.05);

    voice.osc = osc;
    voice.releaseTime = time + noteDuration + release;
  }

  private playNoise(voice: Voice, time: number, volume: number | null): void {
    if (!this.audioContext || !voice.gain) return;

    const bufferSize = this.audioContext.sampleRate * 0.1;
    const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;

    const noiseGain = this.audioContext.createGain();
    const vol = volume !== null ? volume / 64 : 0.5;
    noiseGain.gain.setValueAtTime(vol, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);

    source.connect(noiseGain);
    noiseGain.connect(voice.gain);
    source.start(time);
    source.stop(time + 0.1);
  }

  private getFreeVoice(): Voice | null {
    const now = this.audioContext?.currentTime ?? 0;

    for (const voice of this.voices) {
      if (!voice.active || (voice.releaseTime && now >= voice.releaseTime)) {
        voice.active = true;
        return voice;
      }
    }

    if (this.voices.length < 16) {
      if (!this.masterGain || !this.audioContext) return null;
      const gain = this.audioContext.createGain();
      gain.gain.value = 0;
      gain.connect(this.masterGain);
      const voice: Voice = {
        osc: null,
        gain,
        active: true,
        note: 0,
        instrument: null,
        releaseTime: 0,
      };
      this.voices.push(voice);
      return voice;
    }

    return null;
  }

  private hasNotes(pattern: Pattern): boolean {
    for (const row of pattern.rows) {
      for (const cell of row) {
        if (cell.note !== null && cell.octave !== null) {
          return true;
        }
      }
    }
    return false;
  }

  private hasNotesFromRow(pattern: Pattern, startRow: number): boolean {
    for (let r = startRow; r < pattern.rows.length; r++) {
      for (const cell of pattern.rows[r]) {
        if (cell.note !== null && cell.octave !== null) {
          return true;
        }
      }
    }
    return false;
  }

  private rowHasNotes(pattern: Pattern, row: number): boolean {
    if (row >= pattern.rows.length) return false;
    for (const cell of pattern.rows[row]) {
      if (cell.note !== null && cell.octave !== null) {
        return true;
      }
    }
    return false;
  }

  private stopAllVoices(): void {
    for (const voice of this.voices) {
      if (voice.osc) {
        try {
          voice.osc.stop();
        } catch {}
        voice.osc = null;
      }
      voice.active = false;
    }
  }

  setMasterVolume(vol: number): void {
    if (this.masterGain) {
      this.masterGain.gain.value = vol;
    }
  }

  previewNote(instrument: Instrument, note: string, octave: number): void {
    if (!this.audioContext || !this.state) return;
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    const freq = noteToFrequency(note, octave);
    if (freq <= 0) return;

    const modSampleIdx = instrument.sampleIndex ?? instrument.id - 1;
    const hasModSample =
      this.state.modSamples && modSampleIdx >= 0 && this.state.modSamples[modSampleIdx]?.length > 0;

    if (hasModSample) {
      this.previewSample(modSampleIdx, freq);
      return;
    }

    const osc = this.audioContext.createOscillator();
    const oscType =
      instrument.waveform === 'pulse'
        ? 'square'
        : instrument.waveform === 'noise'
          ? 'sawtooth'
          : instrument.waveform;
    osc.type = oscType as OscillatorType;
    osc.frequency.value = freq;

    const gain = this.audioContext.createGain();
    gain.gain.value = 0.3;

    osc.connect(gain);
    gain.connect(this.masterGain!);

    const now = this.audioContext.currentTime;
    const attack = instrument.attack;
    const decay = instrument.decay;
    const sustain = instrument.sustain * 0.3;
    const release = instrument.release;

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.3, now + attack);
    gain.gain.linearRampToValueAtTime(sustain, now + attack + decay);
    gain.gain.linearRampToValueAtTime(0, now + attack + decay + release);

    osc.start(now);
    osc.stop(now + attack + decay + release + 0.1);
  }

  private previewSample(sampleIdx: number, freq: number): void {
    if (!this.audioContext || !this.state?.modSamples) return;

    const sampleData = this.state.modSamples[sampleIdx];
    if (!sampleData || sampleData.length === 0) return;

    const buffer = this.audioContext.createBuffer(
      1,
      sampleData.length,
      this.audioContext.sampleRate
    );
    const channelData = buffer.getChannelData(0);
    channelData.set(sampleData);

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;

    const baseFreq = 8363;
    source.playbackRate.value = freq / baseFreq;

    const gain = this.audioContext.createGain();
    gain.gain.value = 0.4;

    source.connect(gain);
    gain.connect(this.masterGain!);

    source.start();
    source.stop(0.5);
  }

  cleanup(): void {
    this.stop();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}
