import * as ort from 'onnxruntime-web';

ort.env.wasm.numThreads = Math.min(navigator.hardwareConcurrency ?? 1, 4);

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

