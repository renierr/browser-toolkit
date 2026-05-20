import { encodeFrame, decodeFrame, HEADER_SIZE, dataToBits, bitsToData } from './protocol';

export const BIT_TIME_MS = 20;
const BIT_TIME_S = BIT_TIME_MS / 1000;
const BEACON_BITS = 64;
const GAP_MS = 300;
const REPEATS = 3;

export const FREQ_MIN = 10000;
export const FREQ_MAX = 18000;
export const FREQ_DEFAULT = 12000;
const FREQ_SPACING = 2000;

function goertzel(samples: Float32Array, targetFreq: number, sampleRate: number): number {
  const N = samples.length;
  const k = Math.round((N * targetFreq) / sampleRate);
  if (k <= 0 || k >= N) return 0;
  const omega = (2 * Math.PI * k) / N;
  const coeff = 2 * Math.cos(omega);
  let s1 = 0,
    s2 = 0;
  for (let i = 0; i < N; i++) {
    const s0 = samples[i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return s1 * s1 + s2 * s2 - coeff * s1 * s2;
}

export class AudioSender {
  private ctx: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private _active = false;
  private startTime = 0;
  private rafId: number | null = null;
  private repeatTimer: ReturnType<typeof setTimeout> | null = null;
  private freqSpace = FREQ_DEFAULT;
  private freqMark = FREQ_DEFAULT + FREQ_SPACING;
  private progressCb: ((pct: number) => void) | null = null;
  private _onComplete: (() => void) | null = null;

  get active(): boolean {
    return this._active;
  }

  setFrequency(baseHz: number): void {
    this.freqSpace = Math.max(FREQ_MIN, Math.min(FREQ_MAX, baseHz));
    this.freqMark = this.freqSpace + FREQ_SPACING;
  }

  onProgress(cb: (pct: number) => void): void {
    this.progressCb = cb;
  }
  onComplete(cb: () => void): void {
    this._onComplete = cb;
  }

  async start(data: Uint8Array): Promise<void> {
    if (this._active) return;
    const frame = encodeFrame(data);
    const bits = dataToBits(frame);

    this.ctx = new AudioContext();
    const sr = this.ctx.sampleRate;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.5;
    gain.connect(this.ctx.destination);

    const buf = this.buildLoopBuffer(bits, sr);
    this.source = this.ctx.createBufferSource();
    this.source.buffer = buf;
    this.source.loop = true;
    this.source.connect(gain);
    this.source.start();
    this._active = true;
    this.startTime = performance.now();

    if (this.progressCb) this.progressCb(0);

    const loopMs = (buf.length / sr) * 1000;
    const totalMs = loopMs * REPEATS;

    const tick = () => {
      if (!this._active) return;
      const elapsed = performance.now() - this.startTime;
      const pct = Math.min(1, (elapsed % loopMs) / (loopMs * 0.8));
      if (this.progressCb) this.progressCb(pct);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);

    this.repeatTimer = setTimeout(() => {
      this.stop();
      if (this._onComplete) this._onComplete();
    }, totalMs);
  }

  stop(): void {
    this._active = false;
    if (this.repeatTimer !== null) {
      clearTimeout(this.repeatTimer);
      this.repeatTimer = null;
    }
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.source) {
      try {
        this.source.stop();
      } catch {}
      this.source.disconnect();
      this.source = null;
    }
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
  }

  private buildLoopBuffer(bits: number[], sr: number): AudioBuffer {
    const spb = Math.ceil(BIT_TIME_S * sr);
    const gapSamples = Math.ceil((GAP_MS / 1000) * sr);
    const beaconSamples = BEACON_BITS * spb;
    const frameSamples = bits.length * spb;
    const total = beaconSamples + frameSamples + gapSamples;

    const buf = new AudioBuffer({ length: total, sampleRate: sr });
    const ch = buf.getChannelData(0);
    let wi = 0;

    for (let i = 0; i < BEACON_BITS; i++) {
      const freq = i % 2 === 0 ? this.freqSpace : this.freqMark;
      const rampLen = Math.min(spb, Math.ceil(0.002 * sr));
      for (let s = 0; s < spb; s++) {
        const ramp = s < rampLen ? s / rampLen : 1;
        ch[wi++] = Math.sin(2 * Math.PI * freq * (s / sr)) * 0.7 * ramp;
      }
    }

    for (const bit of bits) {
      const freq = bit === 1 ? this.freqMark : this.freqSpace;
      const rampLen = Math.min(spb, Math.ceil(0.002 * sr));
      for (let s = 0; s < spb; s++) {
        const ramp = s < rampLen ? s / rampLen : 1;
        ch[wi++] = Math.sin(2 * Math.PI * freq * (s / sr)) * 0.7 * ramp;
      }
    }

    for (let g = 0; g < gapSamples; g++) ch[wi++] = 0;
    return buf;
  }
}

export class AudioReceiver {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private _onData: ((data: Uint8Array) => void) | null = null;
  private _onSignal: ((detected: boolean, level: number) => void) | null = null;
  private _active = false;
  private loopId: number | null = null;
  private sampleTimerId: ReturnType<typeof setTimeout> | null = null;
  private bitBuffer: number[] = [];
  private freqSpace = FREQ_DEFAULT;
  private freqMark = FREQ_DEFAULT + FREQ_SPACING;
  private isSynchronized = false;
  private syncStartTime = 0;
  private lastActiveSignalTime = 0;

  get active(): boolean {
    return this._active;
  }

  setFrequency(baseHz: number): void {
    this.freqSpace = Math.max(FREQ_MIN, Math.min(FREQ_MAX, baseHz));
    this.freqMark = this.freqSpace + FREQ_SPACING;
  }

  onData(cb: (data: Uint8Array) => void): void {
    this._onData = cb;
  }
  onSignal(cb: (detected: boolean, level: number) => void): void {
    this._onSignal = cb;
  }

  async start(): Promise<void> {
    if (this._active) return;
    try {
      this.ctx = new AudioContext();
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const src = this.ctx.createMediaStreamSource(this.stream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512; // smaller window size for lower latency and less inter-symbol blur
      this.analyser.smoothingTimeConstant = 0;
      src.connect(this.analyser);

      this._active = true;
      this.bitBuffer = [];
      this.isSynchronized = false;

      // Start the fast detection loop to listen for start of beacon/preamble
      this.startFastPoll();
    } catch (err) {
      console.error('[AudioRx] Start failed', err);
      if (this._onSignal) this._onSignal(false, 0);
    }
  }

  stop(): void {
    this._active = false;
    this.isSynchronized = false;
    if (this.loopId !== null) {
      cancelAnimationFrame(this.loopId);
      this.loopId = null;
    }
    if (this.sampleTimerId !== null) {
      clearTimeout(this.sampleTimerId);
      this.sampleTimerId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
    this.analyser = null;
  }

  private startFastPoll(): void {
    const sr = this.ctx?.sampleRate || 44100;

    const poll = () => {
      if (!this._active || !this.analyser) return;

      const td = new Float32Array(this.analyser.fftSize);
      this.analyser.getFloatTimeDomainData(td);

      const eSpace = goertzel(td, this.freqSpace, sr);
      const eMark = goertzel(td, this.freqMark, sr);
      const maxE = Math.max(eSpace, eMark);
      const hasSignal = maxE > 0.4;
      const level = Math.min(1, maxE / 10);

      if (this._onSignal) this._onSignal(hasSignal, level);

      if (hasSignal && !this.isSynchronized) {
        // Beacon signal start detected! Sync symbol phase
        this.isSynchronized = true;
        this.syncStartTime = performance.now();
        this.bitBuffer = [];
        this.lastActiveSignalTime = this.syncStartTime;

        if (this.loopId !== null) {
          cancelAnimationFrame(this.loopId);
          this.loopId = null;
        }

        // Schedule first bit sample at 50% through the symbol duration
        const firstSampleDelay = BIT_TIME_MS / 2;
        this.sampleTimerId = setTimeout(() => this.sampleTick(0, sr), firstSampleDelay);
        return;
      }

      this.loopId = requestAnimationFrame(poll);
    };

    this.loopId = requestAnimationFrame(poll);
  }

  private sampleTick(symbolIndex: number, sr: number): void {
    if (!this._active || !this.analyser) return;

    const td = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(td);

    const eSpace = goertzel(td, this.freqSpace, sr);
    const eMark = goertzel(td, this.freqMark, sr);
    const maxE = Math.max(eSpace, eMark);
    const hasSignal = maxE > 0.4;
    const level = Math.min(1, maxE / 10);

    if (this._onSignal) this._onSignal(hasSignal, level);

    if (hasSignal) {
      this.lastActiveSignalTime = performance.now();
    } else if (performance.now() - this.lastActiveSignalTime > 1500) {
      // No valid signal for 1.5 seconds. Revert to waiting state.
      this.isSynchronized = false;
      this.bitBuffer = [];
      this.startFastPoll();
      return;
    }

    const bit = eMark > eSpace ? 1 : 0;
    this.bitBuffer.push(bit);

    // Keep buffer bounded
    if (this.bitBuffer.length > 2000) {
      this.bitBuffer.shift();
    }

    this.tryDecode();

    const nextIndex = symbolIndex + 1;
    const targetTime = this.syncStartTime + BIT_TIME_MS / 2 + nextIndex * BIT_TIME_MS;
    const delay = targetTime - performance.now();

    this.sampleTimerId = setTimeout(() => this.sampleTick(nextIndex, sr), Math.max(0, delay));
  }

  private tryDecode(): void {
    const preambleLen = 64;
    const syncLen = 16;
    const lenLen = 16;

    for (
      let start = 0;
      start <= this.bitBuffer.length - (preambleLen + syncLen + lenLen);
      start++
    ) {
      let altScore = 0;
      for (let i = 0; i < preambleLen - 1; i++) {
        if (this.bitBuffer[start + i] !== this.bitBuffer[start + i + 1]) altScore++;
      }
      const altRatio = altScore / (preambleLen - 1);
      if (altRatio < 0.7) continue;

      const syncStart = start + preambleLen;
      const expectedSync = [0, 0, 1, 1, 1, 1, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0];
      let syncScore = 0;
      for (let i = 0; i < syncLen; i++) {
        if (this.bitBuffer[syncStart + i] === expectedSync[i]) syncScore++;
      }
      if (syncScore / syncLen < 0.75) continue;

      const lenBits = this.bitBuffer.slice(syncStart + syncLen, syncStart + syncLen + lenLen);
      const payloadLenBytes = bitsToVal(lenBits);
      if (payloadLenBytes === 0 || payloadLenBytes > 64000) continue;

      const totalBits = preambleLen + syncLen + lenLen + payloadLenBytes * 8 + 16;
      if (start + totalBits > this.bitBuffer.length) continue;

      const payloadBits = this.bitBuffer.slice(
        syncStart + syncLen + lenLen,
        syncStart + syncLen + lenLen + payloadLenBytes * 8
      );
      const crcBits = this.bitBuffer.slice(
        syncStart + syncLen + lenLen + payloadLenBytes * 8,
        start + totalBits
      );

      const payload = bitsToData(payloadBits);
      const frameBytes = new Uint8Array(HEADER_SIZE - 2 + payloadLenBytes + 2);
      frameBytes[0] = 0x3c;
      frameBytes[1] = 0x5a;
      frameBytes[2] = (payloadLenBytes >> 8) & 0xff;
      frameBytes[3] = payloadLenBytes & 0xff;
      frameBytes.set(payload, 4);
      const crcV = bitsToData(crcBits);
      frameBytes[4 + payloadLenBytes] = crcV[0] || 0;
      frameBytes[5 + payloadLenBytes] = crcV[1] || 0;

      const decoded = decodeFrame(frameBytes);
      if (decoded) {
        // Clear buffer and state, stop current sampling, go back to idle fast poll
        this.isSynchronized = false;
        this.bitBuffer = [];
        if (this.sampleTimerId !== null) {
          clearTimeout(this.sampleTimerId);
          this.sampleTimerId = null;
        }

        if (this._onData) {
          this._onData(decoded.payload);
        }

        this.startFastPoll();
        return;
      }
    }
  }
}

function bitsToVal(bits: number[]): number {
  let v = 0;
  for (let i = 0; i < bits.length; i++) v = (v << 1) | (bits[i] || 0);
  return v;
}
