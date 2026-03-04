import * as ort from 'onnxruntime-web';

// Force single-threaded WASM execution.
//
// When serving with COOP/COEP headers the page becomes crossOriginIsolated,
// SharedArrayBuffer becomes available, and onnxruntime-web auto-enables
// multi-threading (up to 4 threads). The threaded path requires loading an
// additional .mjs worker module (ort-wasm-simd-threaded.jsep.mjs) which
// Vite does NOT include in the build output. This causes the session to
// hang silently — especially on Android — because the worker fetch fails
// without surfacing an error.
//
// Setting numThreads = 1 avoids the threaded code path entirely and lets
// Vite's built-in WASM resolution (import.meta.url with hashed filenames)
// work correctly. Do NOT set ort.env.wasm.wasmPaths — Vite already rewrites
// the WASM URL to the hashed asset at build time.
ort.env.wasm.numThreads = 1;
const ONNX_SESSION_TIMEOUT_MS = 30_000;
// Allow ort's own init to abort if the WASM fails to compile.
ort.env.wasm.initTimeout = ONNX_SESSION_TIMEOUT_MS;

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

const sessionCache = new Map<string, ort.InferenceSession>();

export interface OnnxModelConfig {
  modelPath: string;
  executionProviders?: ort.InferenceSession.ExecutionProviderConfig[];
  /** Timeout in ms for session creation. Defaults to ONNX_SESSION_TIMEOUT_MS. */
  timeoutMs?: number;
}

/**
 * Load (or return a cached) ONNX inference session.
 * Wraps the call with a timeout so the worker never hangs indefinitely —
 * if something goes wrong (missing WASM, CORS issue, etc.) the caller gets
 * a clear error instead of an endless spinner.
 */
export async function loadSession(config: OnnxModelConfig): Promise<ort.InferenceSession> {
  const cached = sessionCache.get(config.modelPath);
  if (cached) return cached;

  const timeout = config.timeoutMs ?? ONNX_SESSION_TIMEOUT_MS;

  const session = await withTimeout(
    ort.InferenceSession.create(config.modelPath, {
      executionProviders: config.executionProviders ?? ['wasm'],
    }),
    timeout,
    `ONNX session creation timed out after ${timeout}ms — the WASM runtime may have failed to load.`,
  );

  sessionCache.set(config.modelPath, session);
  return session;
}

export async function runInference(
  session: ort.InferenceSession,
  feeds: Record<string, ort.Tensor>,
): Promise<ort.InferenceSession.OnnxValueMapType> {
  return session.run(feeds);
}

export function releaseSession(modelPath: string): void {
  const session = sessionCache.get(modelPath);
  if (session) {
    session.release();
    sessionCache.delete(modelPath);
  }
}

export function createTensor(
  data: Float32Array,
  dims: readonly number[],
): ort.Tensor {
  return new ort.Tensor('float32', data, dims);
}

export { ort };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err)   => { clearTimeout(timer); reject(err); },
    );
  });
}
