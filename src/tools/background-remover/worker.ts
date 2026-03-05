import { loadSession, runInference, createTensor } from '../../js/onnx-utils.ts';
import { decodeImage, imageToTensor, normalizeMask, applyMask, guidedFilter, resizeMask } from './image-processing.ts';

const MODEL_INPUT_SIZE = 320;
const MODEL_INPUT_NAME = 'input.1';
const MODEL_OUTPUT_NAME = '1959';

interface ProcessingOptions {
  threshold: number;
  smoothing: number;
  contrast: number;
  useGuidedFilter: boolean;
}

const rgbaCache = new Map<string, {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  downscaledRgba?: Uint8ClampedArray;
}>();

self.onmessage = async (event: MessageEvent) => {
  const { id, action, file, modelUrl, options, rawMask: cachedRawMask } = event.data;

  if (action === 'evict') {
    rgbaCache.delete(id);
    return;
  }

  const processingOptions: ProcessingOptions = options ?? { threshold: 128, smoothing: 4, contrast: 1.0, useGuidedFilter: false };

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
      self.postMessage({ id, status: 'progress', progress: 10, step: 'Adjusting...' });

      if (!rgba && file) {
        step = 'decoding image';
        const decoded = await decodeImage(file);
        rgba = decoded.data;
        width = decoded.width;
        height = decoded.height;
        rgbaCache.set(id, { rgba, width, height });
      }
    } else {
      self.postMessage({ id, status: 'progress', progress: 5, step: 'Initializing...' });

      if (!modelUrl) throw new Error('Model URL is required for full processing');

      step = 'decoding image';
      if (!rgba) {
        const decoded = await decodeImage(file);
        rgba = decoded.data;
        width = decoded.width;
        height = decoded.height;
        rgbaCache.set(id, { rgba, width, height });
      }
      self.postMessage({ id, status: 'progress', progress: 40, step: `Decoded (${width}x${height})` });

      step = 'loading model';
      const session = await loadSession({ modelPath: modelUrl });
      self.postMessage({ id, status: 'progress', progress: 40, step: 'Model ready' });

      step = 'preparing tensor';
      const tensorData = imageToTensor(rgba, width!, height!, MODEL_INPUT_SIZE);
      const inputTensor = createTensor(tensorData, [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE]);
      self.postMessage({ id, status: 'progress', progress: 50, step: 'Preparing model input' });

      step = 'inference';
      const results = await runInference(session, { [MODEL_INPUT_NAME]: inputTensor });
      rawMask = results[MODEL_OUTPUT_NAME].data as Float32Array;
      self.postMessage({ id, status: 'progress', progress: 80, step: 'AI processing complete' });
    }

    step = 'post-processing';
    let mask = normalizeMask(rawMask!, processingOptions.threshold, processingOptions.contrast);
    mask = resizeMask(mask, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE, width!, height!);

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
    const canvas = applyMask(rgba!, width!, height!, mask, width!, height!, processingOptions.smoothing);

    step = 'encoding result';
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    canvas.width = 0;
    canvas.height = 0;

    self.postMessage({ id, status: 'progress', progress: 95, step: 'Encoding PNG' });
    self.postMessage({
      id, status: 'success', result: blob, width, height,
      rawMask: action === 'reprocess' ? undefined : rawMask,
    });
  } catch (error) {
    const msg = (error as Error).message;
    console.error(`Worker error during ${step}:`, error);
    self.postMessage({ id, status: 'error', error: `Failed during ${step}: ${msg}` });
  }
};
