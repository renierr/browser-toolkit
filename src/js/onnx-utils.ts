import * as ort from 'onnxruntime-web';
import { withTimeout } from './utils';

// ---------------------------------------------------------------------------
// ONNX Runtime – configuration
// ---------------------------------------------------------------------------
// onnxruntime-web dynamically loads an Emscripten glue module (.mjs) and its
// matching WASM binary at runtime.
//
// A custom Vite plugin (onnxStaticPlugin in vite.config.ts) copies the
// required files from node_modules into dist/onnx/ at build time and serves
// them at /onnx/ during dev.
//
// Threading: when the page is crossOriginIsolated (COOP + COEP headers),
// SharedArrayBuffer is available so we allow multi-threading. Otherwise we
// force a single thread.
// ---------------------------------------------------------------------------

const ONNX_SESSION_TIMEOUT_MS = 30_000;

// In a Worker `document` is undefined. During dev the worker URL is the raw
// source path (e.g. /src/tools/…/worker.ts) so a relative "../onnx/" would
// resolve to the wrong place — we need the origin-root path that the dev
// middleware serves. In production workers live in assets/ and the ONNX files
// in onnx/, so "../onnx/" relative to the worker is correct.
const onnxWasmBase =
  typeof document !== 'undefined'
    ? new URL('./onnx/', document.baseURI).href
    : import.meta.env.DEV
      ? new URL('/onnx/', self.location.href).href
      : new URL('../onnx/', self.location.href).href;

// String prefix — the runtime appends e.g. "ort-wasm-simd-threaded.jsep.wasm".
ort.env.wasm.wasmPaths = onnxWasmBase;

// Suppress noisy C++ log about "Unknown CPU vendor" inside WASM — harmless.
ort.env.logLevel = 'error';

// Let ort's own init abort if the WASM fails to compile.
ort.env.wasm.initTimeout = ONNX_SESSION_TIMEOUT_MS;

if (typeof self !== 'undefined' && self.crossOriginIsolated) {
  ort.env.wasm.numThreads = Math.min(navigator.hardwareConcurrency ?? 1, 4);
} else {
  ort.env.wasm.numThreads = 1;
}

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

const sessionCache = new Map<string, ort.InferenceSession>();

/**
 * Detect WebGPU support. In a Worker `navigator.gpu` is only available when
 * the browser ships WebGPU *and* the page is served over a secure context.
 * We also call `requestAdapter()` — if no adapter is returned the hardware
 * doesn't actually expose a usable GPU.
 */
let webgpuSupported: boolean | undefined;
async function isWebGpuAvailable(): Promise<boolean> {
  if (webgpuSupported !== undefined) return webgpuSupported;
  try {
    if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
      webgpuSupported = false;
    } else {
      const adapter = await (navigator as unknown as { gpu: { requestAdapter(): Promise<unknown | null> } }).gpu.requestAdapter();
      webgpuSupported = adapter != null;
    }
  } catch {
    webgpuSupported = false;
  }
  return webgpuSupported;
}

/**
 * Return the default execution-provider list: prefer WebGPU when available,
 * always include WASM as the final fallback so every model can run.
 */
async function defaultProviders(): Promise<ort.InferenceSession.ExecutionProviderConfig[]> {
  return (await isWebGpuAvailable()) ? ['webgpu', 'wasm'] : ['wasm'];
}

export interface OnnxModelConfig {
  modelPath: string;
  executionProviders?: ort.InferenceSession.ExecutionProviderConfig[];
  /** Timeout in ms for session creation. Defaults to ONNX_SESSION_TIMEOUT_MS. */
  timeoutMs?: number;
}

/**
 * Load (or return a cached) ONNX inference session.
 *
 * By default the session is created with WebGPU (when the browser/hardware
 * supports it) and WASM as a fallback. If session creation with the
 * preferred providers fails, it automatically retries with pure WASM.
 *
 * The same fallback happens at inference time: if `session.run()` throws
 * (e.g. because the WebGPU kernel for a particular op like ceil-mode
 * MaxPool is not yet implemented), the session is transparently recreated
 * with WASM and the inference is retried.
 */
export async function loadSession(config: OnnxModelConfig): Promise<ort.InferenceSession> {
  const cached = sessionCache.get(config.modelPath);
  if (cached) return cached;

  const timeout = config.timeoutMs ?? ONNX_SESSION_TIMEOUT_MS;
  const providers = config.executionProviders ?? await defaultProviders();

  const session = await createSessionWithFallback(config.modelPath, providers, timeout);
  console.info('[onnx-utils] Session created with providers:', providers.join(', '));
  sessionCache.set(config.modelPath, session);
  return session;
}

/**
 * Try to create an InferenceSession with the given providers. If creation
 * fails *and* there is a non-WASM provider in the list, fall back to pure
 * WASM so the model still works.
 */
async function createSessionWithFallback(
  modelPath: string,
  providers: ort.InferenceSession.ExecutionProviderConfig[],
  timeout: number,
): Promise<ort.InferenceSession> {
  const canFallback = providers.some(
    (p) => (typeof p === 'string' ? p : p.name) !== 'wasm',
  );

  try {
    return await withTimeout(
      ort.InferenceSession.create(modelPath, { executionProviders: providers }),
      timeout,
      `ONNX session creation timed out after ${timeout / 1000}s – the WASM runtime may have failed to load. ` +
      `Check the browser console for CORS or network errors.`,
    );
  } catch (err) {
    if (!canFallback) throw err;

    const names = providers.map((p) => (typeof p === 'string' ? p : p.name)).join(', ');
    console.warn(
      `[onnx-utils] Session creation failed with providers [${names}]. Falling back to WASM. Original error:`,
      err,
    );

    return withTimeout(
      ort.InferenceSession.create(modelPath, { executionProviders: ['wasm'] }),
      timeout,
      `ONNX WASM-fallback session creation timed out after ${timeout / 1000}s.`,
    );
  }
}

/**
 * Run inference on the given session.
 *
 * If the run fails (e.g. because a WebGPU kernel doesn't support an op like
 * ceil-mode MaxPool), the session is automatically recreated with the WASM
 * backend and the inference is retried so the caller always gets a result.
 */
export async function runInference(
  session: ort.InferenceSession,
  inputs: Record<string, ort.Tensor>,
  onProgress?: (p: number) => void
): Promise<ort.InferenceSession.OnnxValueMapType> {
  if (onProgress) onProgress(10);
  try {
    const result = await session.run(inputs);
    if (onProgress) onProgress(90);
    return result;
  } catch (err) {
    // Find the model path for this session so we can rebuild it.
    const modelPath = findModelPathForSession(session);
    if (!modelPath) throw err; // Can't recover without the model path.

    console.warn(
      '[onnx-utils] Inference failed. Recreating session with WASM fallback. Original error:',
      err,
    );

    // Remove the broken session from the cache. We intentionally do NOT call
    // session.release() here — the WebGPU backend may still have in-flight
    // command buffers referencing GPU resources owned by the session.
    sessionCache.delete(modelPath);

    const fallbackSession = await withTimeout(
      ort.InferenceSession.create(modelPath, { executionProviders: ['wasm'] }),
      ONNX_SESSION_TIMEOUT_MS,
      'ONNX WASM-fallback session creation timed out.',
    );

    sessionCache.set(modelPath, fallbackSession);
    return fallbackSession.run(inputs);
  }
}

/** Reverse-lookup the model path for a cached session. */
function findModelPathForSession(session: ort.InferenceSession): string | undefined {
  for (const [path, cached] of sessionCache.entries()) {
    if (cached === session) return path;
  }
  return undefined;
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

