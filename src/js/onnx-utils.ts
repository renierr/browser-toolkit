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


const sessionCache = new Map<string, ort.InferenceSession>();

export interface OnnxModelConfig {
  modelPath: string;
  executionProviders?: ort.InferenceSession.ExecutionProviderConfig[];
}

export async function loadSession(config: OnnxModelConfig): Promise<ort.InferenceSession> {
  const cached = sessionCache.get(config.modelPath);
  if (cached) return cached;

  const session = await ort.InferenceSession.create(config.modelPath, {
    executionProviders: config.executionProviders ?? ['wasm'],
  });

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

