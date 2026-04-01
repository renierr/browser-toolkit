import { loadSession, runInference, createTensor } from '@js/onnx-utils.ts';
import {
  decodeImage,
  imageToTensor,
  normalizeMask,
  applyMask,
  guidedFilter,
  resizeMask,
} from './image-processing.ts';

interface ProcessingOptions {
  threshold: number;
  smoothing: number;
  contrast: number;
  useGuidedFilter: boolean;
  modelId: string;
  forceWasm: boolean;
}

interface ModelConfig {
  id: string;
  name: string;
  url: string;
  inputSize: number;
  mean: [number, number, number];
  std: [number, number, number];
}

const rgbaCache = new Map<
  string,
  {
    rgba: Uint8ClampedArray;
    width: number;
    height: number;
    downscaledRgba?: Uint8ClampedArray;
  }
>();

self.onmessage = async (event: MessageEvent) => {
  const { id, action, file, options, rawMask: cachedRawMask, modelConfig } = event.data;

  if (action === 'evict') {
    rgbaCache.delete(id);
    return;
  }

  const processingOptions: ProcessingOptions = options ?? {
    threshold: 128,
    smoothing: 4,
    contrast: 1.0,
    useGuidedFilter: false,
    modelId: 'silueta',
    forceWasm: false,
  };
  const config: ModelConfig = modelConfig;
  const modelInputSize = config.inputSize;

  let step = 'initialization';
  try {
    let rgba: Uint8ClampedArray | undefined;
    let width: number | undefined;
    let height: number | undefined;
    let rawMask: Float32Array | undefined = cachedRawMask;

    const cached = rgbaCache.get(id);
    if (cached) {
      rgba = cached.rgba;
      width = cached.width;
      height = cached.height;
    }

    if (action === 'reprocess' && rawMask) {
      step = 're-processing';
      self.postMessage({ id, status: 'progress', progress: 10, step: 'Adjusting' });

      if (!rgba && file) {
        step = 'decoding image';
        const decoded = await decodeImage(file);
        rgba = decoded.data;
        width = decoded.width;
        height = decoded.height;
        rgbaCache.set(id, { rgba, width, height });
      }
    } else {
      self.postMessage({ id, status: 'progress', progress: 5, step: 'Decoding Image' });

      step = 'decoding image';
      if (!rgba) {
        const decoded = await decodeImage(file);
        rgba = decoded.data;
        width = decoded.width;
        height = decoded.height;
        rgbaCache.set(id, { rgba, width, height });
      }
      self.postMessage({
        id,
        status: 'progress',
        progress: 40,
        step: `Decoded [${width}x${height}] - loading model`,
      });

      step = 'loading model';
      const execProviders = processingOptions.forceWasm ? ['wasm'] : ['webgpu', 'wasm'];
      const session = await loadSession({
        modelPath: config.url,
        executionProviders: execProviders,
      });
      self.postMessage({
        id,
        status: 'progress',
        progress: 40,
        step: 'Model ready - preparing tensors',
      });

      step = 'preparing tensor';
      const tensorData = imageToTensor(
        rgba,
        width!,
        height!,
        modelInputSize,
        config.mean,
        config.std
      );
      const inputTensor = createTensor(tensorData, [1, 3, modelInputSize, modelInputSize]);
      self.postMessage({ id, status: 'progress', progress: 50, step: 'running inference' });

      step = 'inference';
      const inputName = session.inputNames[0];
      const outputName = session.outputNames[0];
      const results = await runInference(session, { [inputName]: inputTensor });
      rawMask = results[outputName].data as Float32Array;
      self.postMessage({
        id,
        status: 'progress',
        progress: 80,
        step: 'AI complete - post-processing',
      });
    }

    step = 'post-processing';
    let mask = normalizeMask(rawMask!, processingOptions.threshold, processingOptions.contrast);
    mask = resizeMask(mask, modelInputSize, modelInputSize, width!, height!);

    if (processingOptions.useGuidedFilter && rgba) {
      step = 'refining edges';
      const cached = rgbaCache.get(id);
      const gf = guidedFilter(rgba, mask, width!, height!, 4, 0.01, cached?.downscaledRgba);
      mask = gf.mask;
      if (cached && gf.downscaledRgba) {
        cached.downscaledRgba = gf.downscaledRgba;
      }
    }

    step = 'applying mask';
    const canvas = applyMask(
      rgba!,
      width!,
      height!,
      mask,
      width!,
      height!,
      processingOptions.smoothing
    );

    step = 'encoding result';
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    canvas.width = 0;
    canvas.height = 0;

    self.postMessage({ id, status: 'progress', progress: 95, step: 'Encoding PNG' });
    self.postMessage({
      id,
      status: 'success',
      result: blob,
      width,
      height,
      rawMask: action === 'reprocess' ? undefined : rawMask,
    });
  } catch (error) {
    const msg = (error as Error).message;
    console.error(`Worker error during ${step}:`, error);
    self.postMessage({ id, status: 'error', error: `Failed during ${step}: ${msg}` });
  }
};
