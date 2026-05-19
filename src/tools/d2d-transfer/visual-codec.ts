import { encodeFrame, dataToBits, bitsToData, decodeFrame, HEADER_SIZE } from './protocol';

export const BIT_TIME_MS = 100;
const REPEATS = 2;
const GAP_MS = 200;

export type VisualColor = { r: number; g: number; b: number };

const COLOR_1: VisualColor = { r: 255, g: 255, b: 255 };
const COLOR_0: VisualColor = { r: 0, g: 0, b: 0 };

export class VisualSender {
  private _active = false;
  private overlay: HTMLDivElement | null = null;
  private cancelBtn: HTMLButtonElement | null = null;
  private _totalBits = 0;
  private _durationMs = 0;
  private startTime = 0;
  private rafId: number | null = null;
  private progressCb: ((pct: number) => void) | null = null;
  private _onComplete: (() => void) | null = null;
  private _onCancel: (() => void) | null = null;

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

  onCancelRequest(cb: () => void): void {
    this._onCancel = cb;
  }

  start(data: Uint8Array): void {
    if (this._active) return;
    const frame = encodeFrame(data);
    const bits = dataToBits(frame);
    this._totalBits = bits.length * REPEATS;

    const singlePassMs = bits.length * BIT_TIME_MS;
    const gapMs = GAP_MS;
    this._durationMs = singlePassMs * REPEATS + (REPEATS - 1) * gapMs;

    this.overlay = document.createElement('div');
    Object.assign(this.overlay.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '9998',
      transition: 'background-color 0.02s linear',
    });
    document.body.appendChild(this.overlay);

    this.cancelBtn = document.createElement('button');
    this.cancelBtn.textContent = '✕ Cancel';
    Object.assign(this.cancelBtn.style, {
      position: 'fixed',
      top: '12px',
      right: '12px',
      zIndex: '9999',
      padding: '6px 14px',
      background: 'rgba(0,0,0,0.6)',
      color: '#fff',
      border: '1px solid rgba(255,255,255,0.3)',
      borderRadius: '6px',
      cursor: 'pointer',
      fontSize: '13px',
      fontWeight: '600',
    });
    this.cancelBtn.addEventListener('click', () => {
      if (this._onCancel) this._onCancel();
    });
    document.body.appendChild(this.cancelBtn);

    this._active = true;
    this.startTime = performance.now();

    if (this.progressCb) this.progressCb(0);

    const render = () => {
      if (!this._active) return;
      const elapsed = performance.now() - this.startTime;
      let remaining = elapsed;
      let found = false;

      for (let r = 0; r < REPEATS; r++) {
        if (r > 0) remaining -= gapMs;
        if (remaining < 0) break;
        if (remaining < singlePassMs) {
          const bitIdx = Math.floor(remaining / BIT_TIME_MS);
          if (bitIdx < bits.length) {
            const bit = bits[bitIdx];
            const c = bit === 1 ? COLOR_1 : COLOR_0;
            if (this.overlay) {
              this.overlay.style.backgroundColor = `rgb(${c.r},${c.g},${c.b})`;
            }
            const pct = (r * bits.length + bitIdx + 1) / this._totalBits;
            if (this.progressCb) this.progressCb(pct);
            found = true;
          }
          break;
        }
        remaining -= singlePassMs;
      }

      if (!found) {
        if (this.overlay) this.overlay.style.backgroundColor = 'transparent';
        this._active = false;
        this.cleanupOverlay();
        if (this._onComplete) this._onComplete();
        return;
      }

      this.rafId = requestAnimationFrame(render);
    };

    this.rafId = requestAnimationFrame(render);
  }

  stop(): void {
    this._active = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.cleanupOverlay();
  }

  private cleanupOverlay(): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
    if (this.cancelBtn) {
      this.cancelBtn.remove();
      this.cancelBtn = null;
    }
  }
}

export class VisualReceiver {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private _active = false;
  private intervalId: number | null = null;
  private _onData: ((data: Uint8Array) => void) | null = null;
  private _onStatus: ((status: string) => void) | null = null;
  private _onSignalLevel: ((level: number) => void) | null = null;
  private bitBuffer: number[] = [];
  private brightnessHistory: number[] = [];
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

  setVideoElement(video: HTMLVideoElement): void {
    this.video = video;
  }

  async start(): Promise<void> {
    if (this._active || !this.video) return;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 320 },
          height: { ideal: 240 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      });
      this.video.srcObject = this.stream;
      await this.video.play();

      this.canvas = document.createElement('canvas');
      this.canvas.width = 320;
      this.canvas.height = 240;
      this.ctx = this.canvas.getContext('2d');

      this._active = true;
      this.bitBuffer = [];
      this.brightnessHistory = [];
      this.silentCount = 0;
      this.receivedFrames = 0;

      if (this._onStatus) this._onStatus('watching');

      this.intervalId = window.setInterval(() => this.tick(), BIT_TIME_MS);
    } catch (err) {
      console.error('[VisualReceiver] Failed:', err);
      if (this._onStatus) this._onStatus('error: camera access denied');
    }
  }

  stop(): void {
    this._active = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.canvas = null;
    this.ctx = null;
  }

  private tick(): void {
    if (!this._active || !this.video || !this.ctx || !this.canvas) return;
    if (this.video.readyState < 2) return;

    this.ctx.drawImage(this.video, 0, 0, 320, 240);
    const imageData = this.ctx.getImageData(0, 0, 320, 240);
    const pixels = imageData.data;

    let totalBrightness = 0;
    let sampleCount = 0;
    for (let y = 60; y < 180; y += 4) {
      for (let x = 80; x < 240; x += 4) {
        const idx = (y * 320 + x) * 4;
        const brightness = (pixels[idx] + pixels[idx + 1] + pixels[idx + 2]) / 3;
        totalBrightness += brightness;
        sampleCount++;
      }
    }
    const avgBrightness = totalBrightness / sampleCount;
    const brightnessNorm = avgBrightness / 255;

    if (this._onSignalLevel) this._onSignalLevel(brightnessNorm);

    this.brightnessHistory.push(avgBrightness);
    if (this.brightnessHistory.length > 20) this.brightnessHistory.shift();

    const minB = Math.min(...this.brightnessHistory);
    const maxB = Math.max(...this.brightnessHistory);
    const range = maxB - minB;

    if (range < 20) {
      this.silentCount++;
      if (this.silentCount > 10 && this.receivedFrames > 0) {
        if (this._onStatus) this._onStatus('idle');
        this.bitBuffer = [];
        this.receivedFrames = 0;
      }
      return;
    }
    this.silentCount = 0;

    const threshold = minB + range * 0.4;
    const bit = avgBrightness > threshold ? 1 : 0;
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
      const payloadLenBytes = bitsToLenVisual(lenBits);
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

function bitsToLenVisual(bits: number[]): number {
  let val = 0;
  for (let i = 0; i < bits.length; i++) {
    val = (val << 1) | (bits[i] || 0);
  }
  return val;
}
