import * as ort from 'onnxruntime-web';
import { withTimeout } from './utils';

// ---------------------------------------------------------------------------
// ONNX Runtime – WASM configuration
// ---------------------------------------------------------------------------
// onnxruntime-web dynamically loads an Emscripten glue module (.mjs) and its
// matching WASM binary at runtime. The filenames are hardcoded strings that
// Vite cannot statically analyse, so Vite won't emit or hash them.
//
// A custom Vite plugin (onnxStaticPlugin in vite.config.ts) copies the two
// required files from node_modules into dist/onnx/ at build time and serves
// them at /onnx/ during dev. Nothing extra is committed to git — bump the
// onnxruntime-web dependency version and rebuild; the plugin picks up the new
// files automatically.
//
// Which variant is used?
// The default `import 'onnxruntime-web'` resolves to the JSEP build
// (WebGPU/WebGL execution-provider support). At build time the variant is
// baked in as `ort-wasm-simd-threaded.jsep.{mjs,wasm}` — the other variants
// (.jspi, .asyncify, plain .mjs) are dead code and never loaded.
//
// Threading: when the page is crossOriginIsolated (COOP + COEP headers),
// SharedArrayBuffer is available so we allow multi-threading. Otherwise we
// force a single thread. Setting wasmPaths as a string prefix works for both
// cases — the runtime appends the hardcoded filename to the prefix.
//
// Cache busting: the files in dist/onnx/ have stable names (no hash). PWA
// workbox precaches them with a content-based revision hash, so an upgrade
// of onnxruntime-web triggers a cache update automatically.
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
    `ONNX session creation timed out after ${timeout / 1000}s – the WASM runtime may have failed to load. ` +
    `Check the browser console for CORS or network errors.`,
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

