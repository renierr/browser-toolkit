/**
 * Dedicated Web Worker for QR / barcode scanning.
 *
 * Tries the native BarcodeDetector API first (hardware-accelerated, fast).
 * If that fails or isn't available, falls back to the robust zxing-wasm
 * C++ engine with the `tryHarder` option enabled.
 */
import { readBarcodes, prepareZXingModule } from 'zxing-wasm/reader';
import zxingWasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import type { WorkerInMessage, WorkerOutMessage } from './worker-protocol';

// ── Initialization ───────────────────────────────────────────────────────

// noinspection JSUnusedGlobalSymbols
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

let nativeDetector: any = null;
let oc: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;

function ensureCanvas(w: number, h: number) {
  if (!oc || oc.width !== w || oc.height !== h) {
    oc = new OffscreenCanvas(w, h);
    ctx = oc.getContext('2d')!;
  }
  if (oc.width < w || oc.height < h) {
    oc.width = Math.max(oc.width, w);
    oc.height = Math.max(oc.height, h);
    ctx = oc.getContext('2d')!;
  }
}

// Initialize native detector
(async () => {
  try {
    if ('BarcodeDetector' in self) {
      // @ts-ignore
      const formats = await BarcodeDetector.getSupportedFormats();
      if (formats.length > 0) {
        // @ts-ignore
        nativeDetector = new BarcodeDetector({ formats });
      }
    }
  } catch (e) {
    console.warn('Native BarcodeDetector initialization failed in worker:', e);
  }
})();

// ── Grayscale conversion ───────────────────────────────────────────────

/** Convert RGBA → grayscale Uint8Array (1 byte per pixel). */
function toGrayscale(rgba: Uint8ClampedArray, len: number): Uint8Array {
  const gray = new Uint8Array(len / 4);
  for (let i = 0, j = 0; i < len; i += 4, j++) {
    gray[j] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
  }
  return gray;
}

/** Write grayscale buffer back into an RGBA buffer for jsQR. */
function grayToRGBA(gray: Uint8Array, w: number, h: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0, j = 0; i < gray.length; i++, j += 4) {
    rgba[j] = rgba[j + 1] = rgba[j + 2] = gray[i];
    rgba[j + 3] = 255;
  }
  return rgba;
}

// ── Sharpen (3×3 unsharp-mask) ─────────────────────────────────────────

/**
 * Sharpens a grayscale image using a 3×3 Laplacian-based unsharp mask.
 * strength controls how aggressively edges are boosted (1.0–2.0 typical).
 */
function sharpen(src: Uint8Array, w: number, h: number, strength: number = 1.5): Uint8Array {
  const dst = new Uint8Array(src.length);
  // Copy border pixels unchanged
  for (let x = 0; x < w; x++) {
    dst[x] = src[x];
    dst[(h - 1) * w + x] = src[(h - 1) * w + x];
  }
  for (let y = 0; y < h; y++) {
    dst[y * w] = src[y * w];
    dst[y * w + w - 1] = src[y * w + w - 1];
  }

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      // 3×3 Laplacian
      const laplacian =
        -src[idx - w - 1] -
        src[idx - w] -
        src[idx - w + 1] -
        src[idx - 1] +
        8 * src[idx] -
        src[idx + 1] -
        src[idx + w - 1] -
        src[idx + w] -
        src[idx + w + 1];
      const v = src[idx] + strength * (laplacian / 8);
      dst[idx] = v < 0 ? 0 : v > 255 ? 255 : v | 0;
    }
  }
  return dst;
}

// ── Contrast stretch ───────────────────────────────────────────────────

/** Stretch grayscale to full 0-255 range (helps low-contrast cameras). */
function contrastStretch(src: Uint8Array): Uint8Array {
  let min = 255,
    max = 0;
  for (let i = 0; i < src.length; i++) {
    if (src[i] < min) min = src[i];
    if (src[i] > max) max = src[i];
  }
  if (max - min < 30) return src; // already low range, don't stretch noise
  const range = max - min || 1;
  const dst = new Uint8Array(src.length);
  for (let i = 0; i < src.length; i++) {
    dst[i] = (((src[i] - min) / range) * 255) | 0;
  }
  return dst;
}

// ── Decoding wrappers ──────────────────────────────────────────────────

interface ScanResult {
  data: string;
  format: string;
  provider: 'native' | 'wasm';
}

async function tryDetect(
  source: ImageBitmap,
): Promise<ScanResult | null> {
  // 1. Try native first (fastest)
  if (nativeDetector) {
    try {
      // @ts-ignore
      const barcodes = await nativeDetector.detect(source as any);
      if (barcodes && barcodes.length > 0) {
        return { data: barcodes[0].rawValue, format: barcodes[0].format, provider: 'native' };
      }
    } catch (e) {
      // ignore native errors and fall back to wasm
    }
  }

  // 2. WASM fallback: ensure we have ImageData
  try {
    ensureCanvas(source.width, source.height);
    ctx!.clearRect(0, 0, source.width, source.height);
    ctx!.drawImage(source as ImageBitmap, 0, 0);
    const imageData = ctx!.getImageData(0, 0, source.width, source.height);

    const results = await readBarcodes(imageData, {
      tryHarder: true,
      maxNumberOfSymbols: 1,
    });
    if (results && results.length > 0) {
      return {
        data: results[0].text,
        format: results[0].format,
        provider: 'wasm',
      };
    }
  } catch (e) {
    // ignore
  }

  return null;
}

// ── Scan strategies ────────────────────────────────────────────────────

/**
 * We now rely primarily on zxing-wasm's robust internal `tryHarder` option
 * instead of manually destroying image data via blur/thresholds.
 */
async function scanWithStrategies(
  source: ImageBitmap
): Promise<{ result: ScanResult | null }> {
  // 1. Try raw source
  let d = await tryDetect(source);
  if (d) return { result: d };

  // 2. Prepare ImageData for heavier strategies
  ensureCanvas(source.width, source.height);
  ctx!.clearRect(0, 0, source.width, source.height);
  ctx!.drawImage(source as ImageBitmap, 0, 0);
  const imageData = ctx!.getImageData(0, 0, source.width, source.height);

  const w = imageData.width;
  const h = imageData.height;
  const rgba = imageData.data;
  const gray = toGrayscale(rgba, rgba.length);
  const stretched = contrastStretch(gray);
  const sharp = sharpen(stretched, w, h, 1.5);
  const sharpRgba = grayToRGBA(sharp, w, h);
  const sharpImageData = new (ImageData as any)(sharpRgba, w, h);

  d = await tryDetect(sharpImageData);
  if (d) return { result: d };

  return { result: null };
}

async function scanImage(source: ImageBitmap): Promise<{ result: ScanResult | null }> {
  return scanWithStrategies(source);
}

// ── Message handler ────────────────────────────────────────────────────

self.addEventListener('message', (event: MessageEvent<WorkerInMessage | any>) => {
  const msg = event.data;

  switch (msg.type) {
    case 'scan-image': {
      scanImage(msg.bitmap).then(({ result: res }) => {
        const result: WorkerOutMessage = {
          type: 'scan-result',
          id: msg.id,
          data: res?.data ?? null,
          format: res?.format ?? 'qr_code',
          provider: res?.provider,
        };
        self.postMessage(result);
      });
      break;
    }
    default: {
      // Unknown message type: ignore
      break;
    }
  }
});
