import { encodeFrame, dataToBits, bitsToData, decodeFrame, HEADER_SIZE } from './protocol';

export const FREQ_SPACE = 18500;
export const FREQ_MARK = 19500;
export const BIT_TIME_MS = 10;
const BIT_TIME_S = BIT_TIME_MS / 1000;
const REPEATS = 3;
const GAP_MS = 50;
const SAMPLE_RATE = 48000;

function binForFreq(freq: number): number {
  return Math.round((freq * 2048) / SAMPLE_RATE);
}

const BIN_MARK = binForFreq(FREQ_MARK);
const BIN_SPACE = binForFreq(FREQ_SPACE);

export class AudioSender {
  private ctx: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private _active = false;
  private _totalBits = 0;
  private _durationMs = 0;
  private startTime = 0;
  private rafId: number | null = null;
  private progressCb: ((pct: number) => void) | null = null;
  private _onComplete: (() => void) | null = null;

  get active(): boolean {
    return this._active;
  }

  get progress(): number {
    return this._durationMs > 0
      ? Math.min(1, (performance.now() - this.startTime) / this._durationMs)
      : 0;
  }

  get totalBytes(): number {
    return this._totalBits / 8;
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
    this._totalBits = bits.length * REPEATS;

    this.ctx = new AudioContext();
    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0.25;
    this.gain.connect(this.ctx.destination);

    const buf = this.generateWaveform(bits, this.ctx.sampleRate);
    this._durationMs = (buf.length / this.ctx.sampleRate) * 1000;

    this.source = this.ctx.createBufferSource();
    this.source.buffer = buf;
    this.source.loop = false;
    this.source.connect(this.gain);
    this.source.start();
    this._active = true;
    this.startTime = performance.now();

    if (this.progressCb) this.progressCb(0);

    this.source.onended = () => {
      if (this._active) {
        this._active = false;
        if (this._onComplete) this._onComplete();
      }
    };

    const tick = () => {
      if (!this._active) return;
      const pct = this.progress;
      if (this.progressCb) this.progressCb(pct);
      if (pct < 1) {
        this.rafId = requestAnimationFrame(tick);
      }
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop(): void {
    this._active = false;
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
    if (this.gain) {
      this.gain.disconnect();
      this.gain = null;
    }
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
  }

  private generateWaveform(bits: number[], sampleRate: number): AudioBuffer {
    const samplesPerBit = Math.ceil(BIT_TIME_S * sampleRate);
    const gapSamples = Math.ceil((GAP_MS / 1000) * sampleRate);
    const passSamples = bits.length * samplesPerBit;
    const totalSamples =
      passSamples * REPEATS + (REPEATS - 1) * gapSamples + Math.ceil(0.02 * sampleRate);

    const buf = new AudioBuffer({ length: totalSamples, sampleRate });
    const ch = buf.getChannelData(0);

    let wi = 0;
    for (let r = 0; r < REPEATS; r++) {
      if (r > 0) {
        for (let g = 0; g < gapSamples; g++) {
          ch[wi++] = 0;
        }
      }
      for (const bit of bits) {
        const freq = bit === 1 ? FREQ_MARK : FREQ_SPACE;
        const rampLen = Math.min(samplesPerBit, Math.ceil(0.001 * sampleRate));
        for (let s = 0; s < samplesPerBit; s++) {
          const t = s / sampleRate;
          const ramp = s < rampLen ? s / rampLen : 1;
          ch[wi++] = Math.sin(2 * Math.PI * freq * t) * 0.8 * ramp;
        }
      }
    }
    return buf;
  }
}

export class AudioReceiver {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private _active = false;
  private intervalId: number | null = null;
  private _onData: ((data: Uint8Array) => void) | null = null;
  private _onStatus: ((status: string) => void) | null = null;
  private _onSignalLevel: ((level: number) => void) | null = null;
  private bitBuffer: number[] = [];
  private silentCount = 0;
  private receivedFrames = 0;

  get active(): boolean {
    return this._active;
  }

  onData(cb: (data: Uint8Array) => void): void {
    this._onData = cb;
  }

  onStatus(cb: (status: string) => void): void {
    this._onStatus = cb;
  }

  onSignalLevel(cb: (level: number) => void): void {
    this._onSignalLevel = cb;
  }

  async start(): Promise<void> {
    if (this._active) return;
    try {
      this.ctx = new AudioContext();
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: { ideal: SAMPLE_RATE },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      const src = this.ctx.createMediaStreamSource(this.stream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0;
      src.connect(this.analyser);

      this._active = true;
      this.bitBuffer = [];
      this.silentCount = 0;
      this.receivedFrames = 0;
      if (this._onStatus) this._onStatus('listening');

      const tickMs = Math.ceil(BIT_TIME_MS / 2);
      this.intervalId = window.setInterval(() => this.tick(), tickMs);
    } catch (err) {
      console.error('[AudioReceiver] Failed to start:', err);
      if (this._onStatus) this._onStatus('error: mic access denied');
    }
  }

  stop(): void {
    this._active = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
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

  private tick(): void {
    if (!this._active || !this.analyser) return;

    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);

    const m = data[BIN_MARK] || 0;
    const s = data[BIN_SPACE] || 0;
    const maxEnergy = Math.max(m, s);
    const threshold = 30;

    if (this._onSignalLevel) this._onSignalLevel(Math.min(1, maxEnergy / 200));

    if (m < threshold && s < threshold) {
      this.silentCount++;
      if (this.silentCount > 20 && this.receivedFrames > 0) {
        if (this._onStatus) this._onStatus('idle');
        this.bitBuffer = [];
        this.receivedFrames = 0;
      }
      return;
    }
    this.silentCount = 0;

    const bit = m > s ? 1 : 0;
    this.bitBuffer.push(bit);

    if (this.bitBuffer.length > 5000) {
      this.bitBuffer.splice(0, 1000);
    }

    this.tryDecode();
  }

  private tryDecode(): void {
    const preambleLen = 32;
    const syncLen = 16;
    const lenLen = 16;

    for (let start = 0; start < this.bitBuffer.length - 100; start++) {
      let altOk = true;
      for (let i = 0; i < preambleLen - 1; i++) {
        if (this.bitBuffer[start + i] === this.bitBuffer[start + i + 1]) {
          altOk = false;
          break;
        }
      }
      if (!altOk) continue;

      const syncStart = start + preambleLen;
      if (syncStart + syncLen + lenLen > this.bitBuffer.length) continue;

      const syncBits = this.bitBuffer.slice(syncStart, syncStart + syncLen);
      const expectedSync = [0, 0, 1, 1, 1, 1, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0];
      let syncMatch = true;
      for (let i = 0; i < syncLen; i++) {
        if (syncBits[i] !== expectedSync[i]) {
          syncMatch = false;
          break;
        }
      }
      if (!syncMatch) continue;

      const lenBits = this.bitBuffer.slice(syncStart + syncLen, syncStart + syncLen + lenLen);
      const payloadLenBytes = bitsToLen(lenBits);
      if (payloadLenBytes === 0 || payloadLenBytes > 64000) continue;

      const totalFrameBits = preambleLen + syncLen + lenLen + payloadLenBytes * 8 + 16;
      if (start + totalFrameBits > this.bitBuffer.length) continue;

      const payloadBits = this.bitBuffer.slice(
        syncStart + syncLen + lenLen,
        syncStart + syncLen + lenLen + payloadLenBytes * 8
      );
      const crcBits = this.bitBuffer.slice(
        syncStart + syncLen + lenLen + payloadLenBytes * 8,
        start + totalFrameBits
      );

      const payload = bitsToData(payloadBits);
      const frameBytes = new Uint8Array(HEADER_SIZE - 2 + payloadLenBytes + 2);
      frameBytes[0] = 0x3c;
      frameBytes[1] = 0x5a;
      frameBytes[2] = (payloadLenBytes >> 8) & 0xff;
      frameBytes[3] = payloadLenBytes & 0xff;
      frameBytes.set(payload, 4);
      const crcVal = bitsToData(crcBits);
      frameBytes[4 + payloadLenBytes] = crcVal[0] || 0;
      frameBytes[5 + payloadLenBytes] = crcVal[1] || 0;

      const decoded = decodeFrame(frameBytes);
      if (decoded) {
        this.receivedFrames++;
        if (this._onData) this._onData(decoded.payload);
        if (this._onStatus) this._onStatus('done');
        this.bitBuffer.splice(0, start + totalFrameBits);
        return;
      }
    }
  }
}

function bitsToLen(bits: number[]): number {
  let val = 0;
  for (let i = 0; i < bits.length; i++) {
    val = (val << 1) | (bits[i] || 0);
  }
  return val;
}
