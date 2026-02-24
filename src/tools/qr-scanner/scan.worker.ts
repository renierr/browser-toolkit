/**
 * Dedicated Web Worker for QR / barcode scanning.
 *
 * The main insight: jsQR is decent at decoding *clean* QR images but
 * terrible with noisy / blurry / unevenly-lit camera input. A phone's
 * camera app succeeds because the ISP applies hardware sharpening, HDR,
 * and noise reduction before the decoder ever sees the frame.
 *
 * We replicate that with a multi-strategy preprocessing pipeline:
 *
 *   1. Raw — try unmodified pixels (works for clean images)
 *   2. Sharpen — 3×3 unsharp-mask kernel to counteract camera blur
 *   3. Adaptive threshold — local mean threshold handles uneven lighting
 *   4. Sharpen + adaptive threshold — combined
 *   5. Global Otsu binarization — fallback for uniform lighting
 *
 * For live camera frames we try strategies 1-3 (fast path, ~15-25 ms).
 * For uploaded images we try all 5 at multiple scales.
 *
 * All processing operates on a grayscale buffer to halve memory and
 * computation, then writes back to RGBA for jsQR.
 */
import {
  BarcodeDetector as BarcodeDetectorPonyfill,
  prepareZXingModule,
} from 'barcode-detector/ponyfill';
import zxingWasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import type { WorkerInMessage, WorkerOutMessage } from './worker-protocol';

// ── BarcodeDetector (Native or Polyfill) ───────────────────────────────

let detector: any = null;
let providerName: 'native' | 'wasm' = 'wasm';

// Initialize detector (prefer native, fallback to WASM ponyfill)
(async () => {
  try {
    if ('BarcodeDetector' in self) {
      // @ts-ignore
      const formats = await BarcodeDetector.getSupportedFormats();
      if (formats.length > 0) {
        // @ts-ignore
        detector = new BarcodeDetector({ formats });
        providerName = 'native';
        return;
      }
    }
  } catch (e) {
    console.warn('Native BarcodeDetector initialization failed, falling back to WASM:', e);
  }

  // Fallback to WASM ponyfill
  try {
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

    // @ts-ignore
    const formats = await BarcodeDetectorPonyfill.getSupportedFormats();
    if (formats.length > 0) {
      // @ts-ignore
      detector = new BarcodeDetectorPonyfill({ formats });
      providerName = 'wasm';
    }
  } catch (e) {
    console.error('WASM BarcodeDetector initialization failed:', e);
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

// ── Adaptive threshold (local mean) ────────────────────────────────────

/**
 * Binarize using a local mean threshold. For each pixel, compute the
 * mean of a blockSize×blockSize window and threshold at (mean - C).
 *
 * Uses an integral image for O(1) per-pixel mean computation.
 * This handles shadows, uneven lighting, and glare far better than Otsu.
 */
function adaptiveThreshold(
  src: Uint8Array,
  w: number,
  h: number,
  blockSize: number = 25,
  C: number = 10
): Uint8Array {
  const dst = new Uint8Array(src.length);
  const half = blockSize >> 1;

  // Build integral image (use Float64 to avoid overflow for large images)
  const integral = new Float64Array((w + 1) * (h + 1));
  const iw = w + 1;
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += src[y * w + x];
      integral[(y + 1) * iw + (x + 1)] = rowSum + integral[y * iw + (x + 1)];
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Window bounds (clamped)
      const y1 = y - half < 0 ? 0 : y - half;
      const y2 = y + half >= h ? h - 1 : y + half;
      const x1 = x - half < 0 ? 0 : x - half;
      const x2 = x + half >= w ? w - 1 : x + half;

      const count = (y2 - y1 + 1) * (x2 - x1 + 1);
      const sum =
        integral[(y2 + 1) * iw + (x2 + 1)] -
        integral[y1 * iw + (x2 + 1)] -
        integral[(y2 + 1) * iw + x1] +
        integral[y1 * iw + x1];

      const mean = sum / count;
      dst[y * w + x] = src[y * w + x] > mean - C ? 255 : 0;
    }
  }
  return dst;
}

// ── Global Otsu binarization ───────────────────────────────────────────

function otsuThreshold(src: Uint8Array, w: number, h: number): Uint8Array {
  const histogram = new Uint32Array(256);
  const total = w * h;
  for (let i = 0; i < total; i++) histogram[src[i]]++;

  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * histogram[i];

  let sumBg = 0,
    wBg = 0,
    best = 128,
    bestVar = 0;
  for (let t = 0; t < 256; t++) {
    wBg += histogram[t];
    if (wBg === 0) continue;
    const wFg = total - wBg;
    if (wFg === 0) break;
    sumBg += t * histogram[t];
    const diff = sumBg / wBg - (sumAll - sumBg) / wFg;
    const variance = wBg * wFg * diff * diff;
    if (variance > bestVar) {
      bestVar = variance;
      best = t;
    }
  }

  const dst = new Uint8Array(total);
  for (let i = 0; i < total; i++) dst[i] = src[i] >= best ? 255 : 0;
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
  rgba: Uint8ClampedArray,
  w: number,
  h: number
): Promise<ScanResult | null> {
  if (!detector) return null;
  try {
    // @ts-ignore
    const imageData = new ImageData(rgba, w, h);

    // @ts-ignore
    const barcodes = await detector.detect(imageData);
    if (barcodes.length > 0) {
      return { data: barcodes[0].rawValue, format: barcodes[0].format, provider: providerName };
    }
  } catch (e) {
    // ignore
  }
  return null;
}

// ── Scan strategies ────────────────────────────────────────────────────

/**
 * Run multiple preprocessing strategies on a single resolution.
 * Returns as soon as one succeeds.
 *
 * When `full` is true, runs all 5 strategies. Otherwise runs fast 3 only.
 */
async function scanWithStrategies(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  full: boolean
): Promise<ScanResult | null> {
  // 1. Raw — no processing at all
  // Try native first on raw image (best for simple barcodes)
  let d = await tryDetect(rgba, w, h);
  if (d) return d;

  // Convert to grayscale once, reuse for all strategies
  const gray = toGrayscale(rgba, rgba.length);
  const stretched = contrastStretch(gray);

  // Helper to check a grayscale buffer with both decoders
  const checkGray = async (g: Uint8Array) => {
    const rgbaBuf = grayToRGBA(g, w, h);
    // Try native first on enhanced image
    const d2 = await tryDetect(rgbaBuf, w, h);
    if (d2) return d2;
    return null;
  };

  // 2. Sharpen
  const sharp = sharpen(stretched, w, h, 1.5);
  let res = await checkGray(sharp);
  if (res) return res;

  // 3. Adaptive threshold (handles uneven lighting, shadows, glare)
  //    Compute block size relative to image: ~1/10th of shortest dim, odd, min 11
  const blockBase = Math.max(11, (Math.min(w, h) / 10) | 1);
  const blockSize = blockBase % 2 === 0 ? blockBase + 1 : blockBase;
  const adaptive = adaptiveThreshold(stretched, w, h, blockSize, 10);

  res = await checkGray(adaptive);
  if (res) return res;

  if (!full) return null;

  // 4. Sharpen + adaptive threshold combined
  const sharpAdaptive = adaptiveThreshold(sharp, w, h, blockSize, 8);
  res = await checkGray(sharpAdaptive);
  if (res) return res;

  // 5. Global Otsu binarization (works well for uniform lighting)
  const otsu = otsuThreshold(stretched, w, h);
  res = await checkGray(otsu);
  if (res) return res;

  return null;
}

// ── Frame scanning (live camera) ───────────────────────────────────────

async function scanFrame(
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): Promise<ScanResult | null> {
  // Fast path: 3 strategies on the received frame
  return scanWithStrategies(pixels, width, height, false);
}

// ── Image scanning (upload / paste) — multi-scale ──────────────────────

async function scanImageMultiScale(
  srcPixels: Uint8ClampedArray,
  srcWidth: number,
  srcHeight: number,
  targetSizes: number[]
): Promise<ScanResult | null> {
  const hasOffscreen = typeof OffscreenCanvas !== 'undefined';

  for (const targetSize of targetSizes) {
    const scale = Math.min(1, targetSize / Math.max(srcWidth, srcHeight));
    const w = Math.round(srcWidth * scale);
    const h = Math.round(srcHeight * scale);

    let rgba: Uint8ClampedArray;

    if (scale === 1) {
      rgba = srcPixels;
    } else if (hasOffscreen) {
      const oc = new OffscreenCanvas(srcWidth, srcHeight);
      const ctx = oc.getContext('2d')!;
      ctx.putImageData(new ImageData(new Uint8ClampedArray(srcPixels), srcWidth, srcHeight), 0, 0);

      const oc2 = new OffscreenCanvas(w, h);
      const ctx2 = oc2.getContext('2d')!;
      ctx2.imageSmoothingEnabled = true;
      ctx2.drawImage(oc, 0, 0, w, h);
      rgba = ctx2.getImageData(0, 0, w, h).data;
    } else {
      rgba = srcPixels;
    }

    // Full strategy set for static images (user can wait a bit)
    const result = await scanWithStrategies(rgba, w, h, true);
    if (result) return result;

    if (!hasOffscreen && scale !== 1) break;
  }

  return null;
}

// ── Message handler ────────────────────────────────────────────────────

self.addEventListener('message', (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data;

  switch (msg.type) {
    case 'scan-frame': {
      const pixels = new Uint8ClampedArray(msg.pixels);
      scanFrame(pixels, msg.width, msg.height).then((res) => {
        const result: WorkerOutMessage = {
          type: 'scan-result',
          id: msg.id,
          data: res?.data ?? null,
          format: res?.format ?? 'qr_code',
          provider: res?.provider,
        };
        (self as unknown as Worker).postMessage(result);
      });
      break;
    }

    case 'scan-image': {
      const pixels = new Uint8ClampedArray(msg.pixels);
      scanImageMultiScale(pixels, msg.width, msg.height, msg.targetSizes).then((res) => {
        const result: WorkerOutMessage = {
          type: 'scan-result',
          id: msg.id,
          data: res?.data ?? null,
          format: res?.format ?? 'qr_code',
          provider: res?.provider,
        };
        (self as unknown as Worker).postMessage(result);
      });
      break;
    }
  }
});
