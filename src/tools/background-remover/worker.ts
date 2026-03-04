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

self.onmessage = async (event: MessageEvent) => {
  const { id, action, file, modelUrl, options, rawMask: cachedRawMask, rgba: cachedRgba, width: cachedWidth, height: cachedHeight } = event.data;
  const processingOptions: ProcessingOptions = options ?? { threshold: 128, smoothing: 4, contrast: 1.0, useGuidedFilter: false };

  let step = 'initialization';
  try {
    let rgba = cachedRgba;
    let width = cachedWidth;
    let height = cachedHeight;
    let rawMask = cachedRawMask;

    if (action === 'reprocess' && rawMask) {
      step = 're-processing';
      self.postMessage({ id, status: 'progress', progress: 10, step: 'Adjusting parameters...' });

      if (!rgba && file) {
        step = 'decoding image';
        const decoded = await decodeImage(file, 20000);
        rgba = decoded.data;
        width = decoded.width;
        height = decoded.height;
      }
    } else {
      self.postMessage({ id, status: 'progress', progress: 5, step: 'Initializing...' });

      if (!modelUrl) throw new Error('Model URL is required for full processing');

      step = 'loading model';
      const session = await loadSession({ modelPath: modelUrl });
      self.postMessage({ id, status: 'progress', progress: 20, step: 'Model ready' });

      step = 'decoding image';
      const decoded = await decodeImage(file, 20000);
      rgba = decoded.data;
      width = decoded.width;
      height = decoded.height;
      self.postMessage({ id, status: 'progress', progress: 40, step: `Decoded (${width}x${height})` });

      step = 'preparing tensor';
      const tensorData = imageToTensor(rgba, width, height, MODEL_INPUT_SIZE);
      const inputTensor = createTensor(tensorData, [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE]);
      self.postMessage({ id, status: 'progress', progress: 50, step: 'Preparing model input' });

      step = 'inference';
      const results = await runInference(session, { [MODEL_INPUT_NAME]: inputTensor });
      rawMask = results[MODEL_OUTPUT_NAME].data as Float32Array;
      self.postMessage({ id, status: 'progress', progress: 80, step: 'AI processing complete' });
    }

    step = 'post-processing';
    let mask = normalizeMask(rawMask, processingOptions.threshold, processingOptions.contrast);

    // CRITICAL: Upscale mask from 320x320 to full image dimensions
    mask = resizeMask(mask, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE, width!, height!);

    if (processingOptions.useGuidedFilter && rgba) {
      step = 'refining edges';
      mask = guidedFilter(rgba, mask, width!, height!, 4, 0.01);
    }

    step = 'applying mask';
    const canvas = applyMask(rgba, width!, height!, mask, width!, height!, processingOptions.smoothing);

    step = 'encoding result';
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    self.postMessage({ id, status: 'progress', progress: 95, step: 'Encoding transparent PNG' });

    self.postMessage({
      id,
      status: 'success',
      result: blob,
      width,
      height,
      rawMask,
    });
  } catch (error) {
    const msg = (error as Error).message;
    console.error(`Worker error during ${step}:`, error);
    self.postMessage({ id, status: 'error', error: `Failed during ${step}: ${msg}` });
  }
};
