import QRCode from 'qrcode';
import { readBarcodes, prepareZXingModule } from 'zxing-wasm/reader';
import zxingWasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

export const BIT_TIME_MS = 220; // 4.5 Hz rotation speed, highly reliable for most cameras
const CHUNK_SIZE = 100; // ~100 bytes yields small, high-density, low-complexity version 3/4 QR codes
const REPEATS = 4; // Broadcast 4 full cycles for absolute robustness

// Initialize ZXing WASM module overrides
prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) => {
      if (path.endsWith('.wasm')) {
        return zxingWasmUrl;
      }
      return prefix + path;
    },
  },
});

export class VisualSender {
  private _active = false;
  private overlay: HTMLDivElement | null = null;
  private cancelBtn: HTMLButtonElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private loopId: ReturnType<typeof setTimeout> | null = null;
  private progressCb: ((pct: number) => void) | null = null;
  private _onCancel: (() => void) | null = null;
  private _onComplete: (() => void) | null = null;

  // Pre-rendered frames for lag-free visual cycling
  private preRenderedCanvases: HTMLCanvasElement[] = [];

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

  async start(data: Uint8Array): Promise<void> {
    if (this._active) return;

    // Segment payload into base64 chunks
    const chunks: string[] = [];
    const total = Math.ceil(data.length / CHUNK_SIZE);
    for (let i = 0; i < total; i++) {
      const slice = data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const base64 = btoa(String.fromCharCode(...slice));
      chunks.push(`D2D:${total}:${i}:${base64}`);
    }

    // Pre-render QR code canvases to ensure buttery-smooth timing
    this.preRenderedCanvases = [];
    for (let i = 0; i < chunks.length; i++) {
      const c = document.createElement('canvas');
      await QRCode.toCanvas(c, chunks[i], {
        width: 280,
        margin: 2,
        color: {
          dark: '#0f172a', // deep slate
          light: '#ffffff',
        },
      });
      this.preRenderedCanvases.push(c);
    }

    // Create the visual transmission overlay modal
    this.overlay = document.createElement('div');
    Object.assign(this.overlay.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '9998',
      background: 'rgba(15, 23, 42, 0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    });

    const card = document.createElement('div');
    card.className = 'card bg-base-100 shadow-2xl max-w-sm w-full mx-4 border border-base-300';
    Object.assign(card.style, {
      padding: '24px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '16px',
    });

    const title = document.createElement('h3');
    title.className = 'text-lg font-bold text-base-content';
    title.textContent = 'Visual Transmission';

    const canvasContainer = document.createElement('div');
    Object.assign(canvasContainer.style, {
      width: '280px',
      height: '280px',
      background: '#fff',
      borderRadius: '12px',
      overflow: 'hidden',
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    });

    this.canvas = document.createElement('canvas');
    this.canvas.width = 280;
    this.canvas.height = 280;
    canvasContainer.appendChild(this.canvas);

    const statusPill = document.createElement('div');
    statusPill.className = 'badge badge-primary badge-outline py-2 px-3 font-semibold text-xs';
    statusPill.textContent = `Preparing loops...`;

    const progressEl = document.createElement('progress');
    progressEl.className = 'progress progress-primary w-full';
    progressEl.max = 100;
    progressEl.value = 0;

    card.appendChild(title);
    card.appendChild(canvasContainer);
    card.appendChild(statusPill);
    card.appendChild(progressEl);
    this.overlay.appendChild(card);
    document.body.appendChild(this.overlay);

    // Create Cancel button
    this.cancelBtn = document.createElement('button');
    this.cancelBtn.textContent = '✕ Close';
    this.cancelBtn.className = 'btn btn-sm btn-circle btn-ghost text-white';
    Object.assign(this.cancelBtn.style, {
      position: 'fixed',
      top: '16px',
      right: '16px',
      zIndex: '9999',
    });
    this.cancelBtn.onclick = () => {
      if (this._onCancel) this._onCancel();
    };
    document.body.appendChild(this.cancelBtn);

    this._active = true;
    const startTime = performance.now();
    const loopMs = chunks.length * BIT_TIME_MS;
    const totalMs = loopMs * REPEATS;

    const ctx = this.canvas.getContext('2d');

    const tick = () => {
      if (!this._active) return;

      const elapsed = performance.now() - startTime;
      if (elapsed >= totalMs) {
        this.stop();
        if (this._onComplete) this._onComplete();
        return;
      }

      // Determine active chunk index
      const chunkIdx = Math.floor((elapsed % loopMs) / BIT_TIME_MS);
      const preCanvas = this.preRenderedCanvases[chunkIdx];
      if (preCanvas && ctx) {
        ctx.clearRect(0, 0, 280, 280);
        ctx.drawImage(preCanvas, 0, 0);
      }

      const activeLoop = Math.floor(elapsed / loopMs) + 1;
      statusPill.textContent = `Loop ${activeLoop}/${REPEATS} • Chunk ${chunkIdx + 1}/${chunks.length}`;

      const pct = Math.min(1, elapsed / totalMs);
      progressEl.value = Math.round(pct * 100);
      if (this.progressCb) this.progressCb(pct);

      const targetNextTime = startTime + (Math.floor(elapsed / BIT_TIME_MS) + 1) * BIT_TIME_MS;
      this.loopId = setTimeout(tick, Math.max(0, targetNextTime - performance.now()));
    };

    tick();
  }

  stop(): void {
    this._active = false;
    if (this.loopId !== null) {
      clearTimeout(this.loopId);
      this.loopId = null;
    }
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
    if (this.cancelBtn) {
      this.cancelBtn.remove();
      this.cancelBtn = null;
    }
    this.preRenderedCanvases = [];
  }
}

export class VisualReceiver {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private _active = false;
  private scanTimerId: ReturnType<typeof setTimeout> | null = null;
  private _onData: ((data: Uint8Array) => void) | null = null;
  private _onSignal: ((detected: boolean, level: number) => void) | null = null;

  // Track received chunks: chunkIndex -> payload
  private receivedChunks = new Map<number, Uint8Array>();
  private nativeDetector: any = null;
  private floatingPill: HTMLDivElement | null = null;

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
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });
      this.video.srcObject = this.stream;
      await this.video.play();

      this.canvas = document.createElement('canvas');
      this.canvas.width = 320;
      this.canvas.height = 240;
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

      // Initialize hardware-accelerated BarcodeDetector if natively supported
      if ('BarcodeDetector' in window) {
        try {
          // @ts-ignore
          this.nativeDetector = new BarcodeDetector({ formats: ['qr_code'] });
        } catch {}
      }

      this._active = true;
      this.receivedChunks.clear();

      // Inject visual status pill into camera viewport container
      const container = document.getElementById('camera-container');
      if (container) {
        this.floatingPill = document.createElement('div');
        this.floatingPill.className =
          'bg-black/60 backdrop-blur rounded-full px-4 py-1.5 absolute bottom-4 text-xs text-white font-medium flex items-center gap-2 border border-white/10 shadow-lg';
        this.floatingPill.textContent = 'Align QR code in camera view';
        container.appendChild(this.floatingPill);
      }

      // Fast frame processing scan loop (every 100 ms)
      this.scanTimerId = setTimeout(() => this.scanFrame(), 100);
    } catch (err) {
      console.error('[VisualRx] Start failed', err);
      if (this._onSignal) this._onSignal(false, 0);
    }
  }

  stop(): void {
    this._active = false;
    if (this.scanTimerId !== null) {
      clearTimeout(this.scanTimerId);
      this.scanTimerId = null;
    }
    if (this.floatingPill) {
      this.floatingPill.remove();
      this.floatingPill = null;
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

  private async scanFrame(): Promise<void> {
    if (!this._active || !this.video || !this.ctx || !this.canvas) return;

    if (this.video.readyState >= 2) {
      this.ctx.drawImage(this.video, 0, 0, 320, 240);
      const imgData = this.ctx.getImageData(0, 0, 320, 240);

      let textResult: string | null = null;

      // 1. Try Native BarcodeDetector (fast, hardware accelerated)
      if (this.nativeDetector) {
        try {
          const results = await this.nativeDetector.detect(this.canvas);
          if (results && results.length > 0) {
            textResult = results[0].rawValue;
          }
        } catch {}
      }

      // 2. Fall back to high-fidelity ZXing WASM
      if (!textResult) {
        try {
          const wasmResults = await readBarcodes(imgData, {
            tryHarder: true,
            maxNumberOfSymbols: 1,
          });
          if (wasmResults && wasmResults.length > 0) {
            textResult = wasmResults[0].text;
          }
        } catch {}
      }

      if (textResult && textResult.startsWith('D2D:')) {
        this.processQRResult(textResult);
      }
    }

    if (this._active) {
      this.scanTimerId = setTimeout(() => this.scanFrame(), 80);
    }
  }

  private processQRResult(qrString: string): void {
    try {
      const parts = qrString.split(':');
      const numChunks = parseInt(parts[1]);
      const chunkIdx = parseInt(parts[2]);
      const base64 = parts[3];

      if (isNaN(numChunks) || isNaN(chunkIdx) || !base64) return;

      if (!this.receivedChunks.has(chunkIdx)) {
        // Decode base64 to binary payload
        const rawBin = atob(base64);
        const bytes = new Uint8Array(rawBin.length);
        for (let i = 0; i < rawBin.length; i++) {
          bytes[i] = rawBin.charCodeAt(i);
        }

        this.receivedChunks.set(chunkIdx, bytes);

        // Update progress UI
        const pct = this.receivedChunks.size / numChunks;
        if (this._onSignal) this._onSignal(true, pct);

        if (this.floatingPill) {
          this.floatingPill.className =
            'bg-primary/90 text-primary-content backdrop-blur rounded-full px-4 py-1.5 absolute bottom-4 text-xs font-semibold flex items-center gap-2 border border-white/10 shadow-lg';
          this.floatingPill.textContent = `Receiving: ${this.receivedChunks.size}/${numChunks} Chunks`;
        }

        // Check if all chunks received
        if (this.receivedChunks.size === numChunks) {
          this.assembleAndDeliver(numChunks);
        }
      }
    } catch (err) {
      console.warn('[VisualRx] QR parse error', err);
    }
  }

  private assembleAndDeliver(numChunks: number): void {
    // Stop scanning and camera immediately
    const callback = this._onData;
    this.stop();

    // Reconstruct continuous payload
    let totalLen = 0;
    for (let i = 0; i < numChunks; i++) {
      totalLen += this.receivedChunks.get(i)!.length;
    }

    const payload = new Uint8Array(totalLen);
    let offset = 0;
    for (let i = 0; i < numChunks; i++) {
      const chunk = this.receivedChunks.get(i)!;
      payload.set(chunk, offset);
      offset += chunk.length;
    }

    if (callback) {
      callback(payload);
    }
  }
}
