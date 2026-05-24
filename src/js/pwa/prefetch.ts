/**
 * Background prefetching utility to cache large ONNX models and runtime WASM files.
 * Runs on idle to avoid blocking the main UI thread.
 */

const STATIC_MODELS: string[] = [
  'lib/models/silueta.onnx?v=1.0.0',
  'lib/models/u2netp-q.onnx?v=1.0.0',
  'lib/models/line-drawings.onnx?v=1.0.0',
  'lib/models/RealESRGAN_x2plus.onnx?v=1.0.0',
  'lib/models/RealESRGAN_x4plus.onnx?v=1.0.0',
  'lib/models/rrdbx2.onnx?v=1.0.0',
  'lib/models/rrdbx4.onnx?v=1.0.0',
  'lib/models/swin2sr.onnx?v=1.0.0',
  'lib/models/iat_lol_v2.onnx?v=1.0.0',
  'lib/models/iat_exposure.emb.onnx?v=1.0.0',
  'lib/models/ocr/det.onnx?v=1.0.0',
  'lib/models/ocr/rec.onnx?v=1.0.0',
];

const ONNX_RUNTIME_FILES: string[] = [
  'onnx/ort-wasm-simd-threaded.jsep.wasm',
  'onnx/ort-wasm-simd.wasm',
  'onnx/ort-wasm-threaded.wasm',
  'onnx/ort-wasm.wasm',
  'onnx/ort-wasm-simd-threaded.mjs',
  'onnx/ort-wasm-simd.mjs',
  'onnx/ort-wasm-threaded.mjs',
  'onnx/ort-wasm.mjs',
];

export function startBackgroundPrefetch(): void {
  if (!('serviceWorker' in navigator)) return;

  // Avoid running on metered or slow connections if Network Information API is available
  const conn = (navigator as unknown as { connection?: { saveData?: boolean; type?: string } })
    .connection;
  if (conn && (conn.saveData || /cellular|2g|3g/.test(conn.type || ''))) {
    console.log('[Prefetch] Slow/metered connection detected. Skipping background prefetch.');
    return;
  }

  const assets = [...ONNX_RUNTIME_FILES, ...STATIC_MODELS].map(
    (path) => new URL(path, document.baseURI).href
  );

  const runPrefetch = async (): Promise<void> => {
    console.log('[Prefetch] Starting background prefetch of heavy assets...');
    for (const url of assets) {
      try {
        // Fetch each asset sequentially to avoid network congestion
        await fetch(url, { priority: 'low' } as RequestInit & {
          priority?: 'low' | 'high' | 'auto';
        });
      } catch (err) {
        console.warn('[Prefetch] Failed to prefetch asset:', url, err);
      }
    }
    console.log('[Prefetch] Background prefetch completed.');
  };

  const schedule = (): void => {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => {
        runPrefetch();
      });
    } else {
      setTimeout(runPrefetch, 5000);
    }
  };

  if (document.readyState === 'complete') {
    schedule();
  } else {
    window.addEventListener('load', schedule, { once: true });
  }
}
