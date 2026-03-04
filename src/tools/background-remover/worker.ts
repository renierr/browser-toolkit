import { loadSession, runInference, createTensor } from '../../js/onnx-utils.ts';
import { decodeImage, imageToTensor, normalizeMask, applyMask } from './image-processing.ts';

const MODEL_INPUT_SIZE = 320;
const MODEL_INPUT_NAME = 'input.1';
const MODEL_OUTPUT_NAME = '1959';

interface ProcessingOptions {
  threshold: number;
  smoothing: number;
}

self.onmessage = async (event: MessageEvent) => {
  const { id, file, modelUrl, options } = event.data;
  const processingOptions: ProcessingOptions = options ?? { threshold: 128, smoothing: 4 };

  let step = 'initialization'; // Initialize step for potential errors before the first specific step
  try {
    self.postMessage({ id, status: 'progress', progress: 5, step: 'Initializing...' });

    step = 'loading model';
    const session = await loadSession({ modelPath: modelUrl });
    self.postMessage({ id, status: 'progress', progress: 30, step: 'Model ready' });

    // Increase cap to 20k for all devices as per user request
    const maxDimension = 20000;

    step = 'decoding image';
    const { data: rgba, width, height } = await decodeImage(file, maxDimension);
    self.postMessage({ id, status: 'progress', progress: 40, step: `Decoded (${width}x${height})` });

    step = 'preparing tensor';
    const tensorData = imageToTensor(rgba, width, height, MODEL_INPUT_SIZE);
    const inputTensor = createTensor(tensorData, [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE]);
    self.postMessage({ id, status: 'progress', progress: 50, step: 'Preparing model input' });

    step = 'inference';
    const results = await runInference(session, { [MODEL_INPUT_NAME]: inputTensor });
    self.postMessage({ id, status: 'progress', progress: 80, step: 'AI processing complete' });

    step = 'post-processing';
    const rawMask = results[MODEL_OUTPUT_NAME].data as Float32Array;
    const mask = normalizeMask(rawMask, processingOptions.threshold);

    step = 'applying mask';
    const canvas = applyMask(rgba, width, height, mask, MODEL_INPUT_SIZE, processingOptions.smoothing);

    step = 'encoding result';
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    self.postMessage({ id, status: 'progress', progress: 95, step: 'Encoding transparent PNG' });

    self.postMessage({ id, status: 'success', result: blob, width, height });
  } catch (error) {
    const msg = (error as Error).message;
    console.error(`Worker error during ${step}:`, error);
    self.postMessage({ id, status: 'error', error: `Failed during ${step}: ${msg}` });
  }
};
