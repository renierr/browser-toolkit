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

// ── Decoding wrappers ──────────────────────────────────────────────────

interface ScanResult {
  data: string;
  format: string;
  provider: 'native' | 'wasm';
}

async function tryDetect(
  source: ImageBitmap | ImageData,
): Promise<{ result: ScanResult | null; imageData?: ImageData | null }> {
  // 1. Try native first (fastest)
  if (nativeDetector) {
    try {
      // BarcodeDetector accepts ImageBitmapSource and ImageData, so pass through.
      // @ts-ignore
      const barcodes = await nativeDetector.detect(source as any);
      if (barcodes && barcodes.length > 0) {
        return { result: { data: barcodes[0].rawValue, format: barcodes[0].format, provider: 'native' } };
      }
    } catch (e) {
      // ignore native errors and fall back to wasm
    }
  }

  // 2. WASM fallback: ensure we have ImageData
  try {
    let imageData: ImageData;

    if (typeof ImageData !== 'undefined' && source instanceof ImageData) {
      imageData = source as ImageData;
    } else {
      // Source must be ImageBitmap here
      const w = (source && source.width) | 0;
      const h = (source && source.height) | 0;
      if (w <= 0 || h <= 0) return { result: null, imageData: null };
      ensureCanvas(w, h);
      ctx!.clearRect(0, 0, w, h);
      ctx!.drawImage(source as ImageBitmap, 0, 0);
      imageData = ctx!.getImageData(0, 0, w, h);
    }

    const results = await readBarcodes(imageData, {
      tryHarder: true,
      maxNumberOfSymbols: 1,
    });
    if (results && results.length > 0) {
      return {
        result: {
          data: results[0].text,
          format: results[0].format,
          provider: 'wasm',
        },
        imageData,
      };
    }
    return { result: null, imageData };
  } catch (e) {
    // ignore
  }

  return { result: null, imageData: null };
}

// ── Scan strategies ────────────────────────────────────────────────────

/**
 * We now rely primarily on zxing-wasm's robust internal `tryHarder` option
 * instead of manually destroying image data via blur/thresholds.
 */
async function scanWithStrategies(
  source: ImageBitmap
): Promise<{ result: ScanResult | null }> {
  // 1. Try raw source and capture ImageData when produced
  const first = await tryDetect(source);
  if (first.result) return { result: first.result };

  // keep this where some own image processing can be done after native and ZXing failed.

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
