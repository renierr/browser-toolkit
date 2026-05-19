import { encodeFrame, decodeFrame, HEADER_SIZE, dataToBits, bitsToData } from './protocol';

export const BIT_TIME_MS = 200;
const BEACON_BITS = 32;
const GAP_MS = 500;
const REPEATS = 3;
const END_TIMEOUT_MS = 1500;

export class VisualSender {
  private _active = false;
  private overlay: HTMLDivElement | null = null;
  private cancelBtn: HTMLButtonElement | null = null;
  private rafId: number | null = null;
  private startTime = 0;
  private progressCb: ((pct: number) => void) | null = null;
  private _onCancel: (() => void) | null = null;
  private _onComplete: (() => void) | null = null;

  get active(): boolean {
    return this._active;
  }

  onProgress(cb: (pct: number) => void): void {
    this.progressCb = cb;
  }
  onCancelRequest(cb: () => void): void {
    this._onCancel = cb;
  }
  onComplete(cb: () => void): void {
    this._onComplete = cb;
  }

  start(data: Uint8Array): void {
    if (this._active) return;
    const frame = encodeFrame(data);
    const bits = dataToBits(frame);

    this.overlay = document.createElement('div');
    Object.assign(this.overlay.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '9998',
      transition: 'background-color 0.02s linear',
    });
    document.body.appendChild(this.overlay);

    this.cancelBtn = document.createElement('button');
    this.cancelBtn.textContent = '\u2715 Cancel';
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
    this.cancelBtn.onclick = () => {
      if (this._onCancel) this._onCancel();
    };
    document.body.appendChild(this.cancelBtn);

    this._active = true;
    this.startTime = performance.now();
    if (this.progressCb) this.progressCb(0);

    const beaconMs = BEACON_BITS * BIT_TIME_MS;
    const frameMs = bits.length * BIT_TIME_MS;
    const loopMs = beaconMs + frameMs + GAP_MS;
    const totalMs = loopMs * REPEATS;

    const render = () => {
      if (!this._active) return;
      const elapsed = performance.now() - this.startTime;

      if (elapsed >= totalMs) {
        this.stop();
        if (this._onComplete) this._onComplete();
        return;
      }

      const t = elapsed % loopMs;
      let remaining = t;
      let showing = false;

      if (remaining < beaconMs) {
        const idx = Math.floor(remaining / BIT_TIME_MS);
        if (idx < BEACON_BITS) {
          const c = idx % 2 === 0 ? '#000' : '#fff';
          if (this.overlay) this.overlay.style.backgroundColor = c;
          showing = true;
        }
      }
      remaining -= beaconMs;

      if (!showing && remaining >= 0 && remaining < frameMs) {
        const idx = Math.floor(remaining / BIT_TIME_MS);
        if (idx < bits.length) {
          const c = bits[idx] === 1 ? '#fff' : '#000';
          if (this.overlay) this.overlay.style.backgroundColor = c;
          showing = true;
        }
      }

      if (!showing && this.overlay) {
        this.overlay.style.backgroundColor = 'transparent';
      }

      if (this.progressCb) this.progressCb(Math.min(1, elapsed / (totalMs * 0.8)));

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
  private rafId: number | null = null;
  private _onData: ((data: Uint8Array) => void) | null = null;
  private _onSignal: ((detected: boolean, level: number) => void) | null = null;
  private bitBuffer: number[] = [];
  private lastSampleTime = 0;
  private brightnessBaseline = 128;
  private _gotFrame = false;
  private _frameData: Uint8Array | null = null;
  private _silentStart: number | null = null;

  get active(): boolean {
    return this._active;
  }

  onData(cb: (data: Uint8Array) => void): void {
    this._onData = cb;
  }
  onSignal(cb: (detected: boolean, level: number) => void): void {
    this._onSignal = cb;
  }

  setVideoElement(vid: HTMLVideoElement): void {
    this.video = vid;
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
      this.canvas.width = 160;
      this.canvas.height = 120;
      this.ctx = this.canvas.getContext('2d');

      this._active = true;
      this.bitBuffer = [];
      this.lastSampleTime = performance.now();
      this.brightnessBaseline = 128;
      this._gotFrame = false;
      this._frameData = null;
      this._silentStart = null;

      const loop = () => {
        if (!this._active) return;
        this.processFrame();
        this.rafId = requestAnimationFrame(loop);
      };
      this.rafId = requestAnimationFrame(loop);
    } catch (err) {
      console.error('[VisualRx]', err);
      if (this._onSignal) this._onSignal(false, 0);
    }
  }

  stop(): void {
    this._active = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
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
    this._gotFrame = false;
    this._frameData = null;
    this._silentStart = null;
  }

  private processFrame(): void {
    if (!this.video || !this.ctx || !this.canvas) return;
    if (this.video.readyState < 2) return;

    const now = performance.now();
    const dt = now - this.lastSampleTime;
    if (dt < BIT_TIME_MS) return;
    this.lastSampleTime = now - (dt - BIT_TIME_MS);

    this.ctx.drawImage(this.video, 0, 0, 160, 120);
    const id = this.ctx.getImageData(40, 30, 80, 60);
    const p = id.data;
    let sum = 0;
    for (let i = 0; i < p.length; i += 4) sum += (p[i] + p[i + 1] + p[i + 2]) / 3;
    const brightness = sum / (p.length / 4);

    this.brightnessBaseline += (brightness - this.brightnessBaseline) * 0.01;

    const delta = brightness - this.brightnessBaseline;
    const absDelta = Math.abs(delta);
    const hasSignal = absDelta > 15;
    const level = Math.min(1, absDelta / 80);

    if (this._onSignal) this._onSignal(hasSignal, level);

    if (this._gotFrame) {
      if (!hasSignal) {
        if (this._silentStart === null) this._silentStart = performance.now();
        else if (performance.now() - this._silentStart > END_TIMEOUT_MS) {
          const data = this._frameData!;
          this._gotFrame = false;
          this._frameData = null;
          this._silentStart = null;
          if (this._onData) this._onData(data);
        }
      } else {
        this._silentStart = null;
      }
      return;
    }

    if (absDelta < 15) return;

    const bit = delta > 0 ? 1 : 0;
    this.bitBuffer.push(bit);
    if (this.bitBuffer.length > 8000) this.bitBuffer.splice(0, 2000);

    this.tryDecode();
  }

  private tryDecode(): void {
    const preambleLen = 32;
    const syncLen = 16;
    const lenLen = 16;

    for (let start = 0; start < this.bitBuffer.length - 200; start++) {
      let altScore = 0;
      for (let i = 0; i < preambleLen - 1; i++) {
        if (this.bitBuffer[start + i] !== this.bitBuffer[start + i + 1]) altScore++;
      }
      if (altScore / (preambleLen - 1) < 0.7) continue;

      const syncStart = start + preambleLen;
      if (syncStart + syncLen + lenLen > this.bitBuffer.length) continue;

      const expected = [0, 0, 1, 1, 1, 1, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0];
      let syncScore = 0;
      for (let i = 0; i < syncLen; i++) {
        if (syncStart + i < this.bitBuffer.length && this.bitBuffer[syncStart + i] === expected[i])
          syncScore++;
      }
      if (syncScore / syncLen < 0.75) continue;

      const lenBits = this.bitBuffer.slice(syncStart + syncLen, syncStart + syncLen + lenLen);
      const payloadLen = bitsToVal(lenBits);
      if (payloadLen === 0 || payloadLen > 64000) continue;

      const total = preambleLen + syncLen + lenLen + payloadLen * 8 + 16;
      if (start + total > this.bitBuffer.length) continue;

      const pb = this.bitBuffer.slice(
        syncStart + syncLen + lenLen,
        syncStart + syncLen + lenLen + payloadLen * 8
      );
      const cb = this.bitBuffer.slice(syncStart + syncLen + lenLen + payloadLen * 8, start + total);
      const payload = bitsToData(pb);
      const fb = new Uint8Array(HEADER_SIZE - 2 + payloadLen + 2);
      fb[0] = 0x3c;
      fb[1] = 0x5a;
      fb[2] = (payloadLen >> 8) & 0xff;
      fb[3] = payloadLen & 0xff;
      fb.set(payload, 4);
      const cv = bitsToData(cb);
      fb[4 + payloadLen] = cv[0] || 0;
      fb[5 + payloadLen] = cv[1] || 0;

      const d = decodeFrame(fb);
      if (d) {
        this.bitBuffer = [];
        this._gotFrame = true;
        this._frameData = d.payload;
        this._silentStart = null;
        if (this._onSignal) this._onSignal(true, 1);
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
