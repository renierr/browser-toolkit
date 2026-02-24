/**
 * Dedicated Web Worker for QR / barcode scanning.
 *
 * Tries the native BarcodeDetector API first (hardware-accelerated, fast).
 * If that fails or isn't available, falls back to the robust zxing-wasm
 * C++ engine with the `tryHarder` option enabled, which excels at finding
 * codes in low-light, blurry, and high-noise environments without the need
 * for manual destructive preprocessing like blurring or adaptive thresholding.
 */
import { readBarcodes, prepareZXingModule } from 'zxing-wasm/reader';
import zxingWasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import type { WorkerInMessage, WorkerOutMessage, DebugImage } from './worker-protocol';

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
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  tryHarder: boolean = false
): Promise<ScanResult | null> {
  // 1. Try native first (fastest)
  if (nativeDetector) {
    try {
      // @ts-ignore
      const imageData = new ImageData(rgba, w, h);
      // @ts-ignore
      const barcodes = await nativeDetector.detect(imageData);
      if (barcodes.length > 0) {
        return { data: barcodes[0].rawValue, format: barcodes[0].format, provider: 'native' };
      }
    } catch (e) {
      // ignore
    }
  }

  // 2. Try WASM fallback with zxing-wasm directly
  try {
    const imageData = new ImageData(new Uint8ClampedArray(rgba), w, h);
    const results = await readBarcodes(imageData, {
      tryHarder,
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
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  debug: boolean = false
): Promise<{ result: ScanResult | null; debugImages: DebugImage[] }> {
  const debugImages: DebugImage[] = [];

  const addDebug = (name: string, rgbaBuf: Uint8ClampedArray) => {
    if (!debug) return;
    debugImages.push({
      name,
      data: new Uint8ClampedArray(rgbaBuf).buffer,
      width: w,
      height: h,
    });
  };

  // 1. Raw image — fast pass (tryHarder: false)
  addDebug('Raw (Fast)', rgba);
  let d = await tryDetect(rgba, w, h, false);
  if (d) return { result: d, debugImages };

  // 2. Raw image — deep scan (tryHarder: true)
  // This uses zxing's internal advanced binarizers (Hybrid/Global)
  // which are much smarter than our manual thresholds.
  d = await tryDetect(rgba, w, h, true);
  if (d) return { result: d, debugImages };

  //if (!full) return { result: null, debugImages };

  // 3. Fallback: Sharpened image + tryHarder
  // Sometimes phone lenses are just too soft, sharpening can still help.
  const gray = toGrayscale(rgba, rgba.length);
  const stretched = contrastStretch(gray);
  const sharp = sharpen(stretched, w, h, 1.5);
  const sharpRgba = grayToRGBA(sharp, w, h);

  addDebug('Sharpened Grayscale', sharpRgba);
  d = await tryDetect(sharpRgba, w, h, true);
  if (d) return { result: d, debugImages };

  return { result: null, debugImages };
}

// ── Frame scanning (live camera) ───────────────────────────────────────

async function scanFrame(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  debug: boolean = false
): Promise<{ result: ScanResult | null; debugImages: DebugImage[] }> {
  // Fast path: 3 strategies on the received frame
  return scanWithStrategies(pixels, width, height, debug);
}

// ── Image scanning (upload / paste) — multi-scale ──────────────────────

async function scanImageMultiScale(
  srcPixels: Uint8ClampedArray,
  srcWidth: number,
  srcHeight: number,
  targetSizes: number[],
  debug: boolean = false
): Promise<{ result: ScanResult | null; debugImages: DebugImage[] }> {
  const hasOffscreen = typeof OffscreenCanvas !== 'undefined';
  let lastDebugImages: DebugImage[] = [];

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
    const { result, debugImages } = await scanWithStrategies(rgba, w, h, debug);
    lastDebugImages = debugImages;
    if (result) return { result, debugImages };

    if (!hasOffscreen && scale !== 1) break;
  }

  return { result: null, debugImages: lastDebugImages };
}

// ── Message handler ────────────────────────────────────────────────────

self.addEventListener('message', (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data;

  switch (msg.type) {
    case 'scan-frame': {
      const pixels = new Uint8ClampedArray(msg.pixels);
      scanFrame(pixels, msg.width, msg.height, msg.debug).then(({ result: res, debugImages }) => {
        const result: WorkerOutMessage = {
          type: 'scan-result',
          id: msg.id,
          data: res?.data ?? null,
          format: res?.format ?? 'qr_code',
          provider: res?.provider,
          debugImages,
        };
        (self as unknown as Worker).postMessage(
          result,
          debugImages.map((img) => img.data)
        );
      });
      break;
    }

    case 'scan-image': {
      const pixels = new Uint8ClampedArray(msg.pixels);
      scanImageMultiScale(pixels, msg.width, msg.height, msg.targetSizes, msg.debug).then(
        ({ result: res, debugImages }) => {
          const result: WorkerOutMessage = {
            type: 'scan-result',
            id: msg.id,
            data: res?.data ?? null,
            format: res?.format ?? 'qr_code',
            provider: res?.provider,
            debugImages,
          };
          (self as unknown as Worker).postMessage(
            result,
            debugImages.map((img) => img.data)
          );
        }
      );
      break;
    }
  }
});
