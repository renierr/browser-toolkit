import { loadSession, runInference, createTensor } from '../../js/onnx-utils.ts';
import { decodeImage, imageToTensor, normalizeMask, applyMask } from './image-processing.ts';

const MODEL_INPUT_SIZE = 320;
const MODEL_INPUT_NAME = 'input.1';
const MODEL_OUTPUT_NAME = '1959';

const MODEL_URL = `${import.meta.env.BASE_URL ?? './'}lib/models/u2netp-q.onnx`;

self.onmessage = async (event: MessageEvent) => {
  const { id, file } = event.data;

  try {
    self.postMessage({ id, status: 'progress', progress: 5 });

    const session = await loadSession({ modelPath: MODEL_URL });
    self.postMessage({ id, status: 'progress', progress: 30 });

    const { data: rgba, width, height } = await decodeImage(file);
    self.postMessage({ id, status: 'progress', progress: 40 });

    const tensorData = imageToTensor(rgba, width, height, MODEL_INPUT_SIZE);
    const inputTensor = createTensor(tensorData, [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE]);
    self.postMessage({ id, status: 'progress', progress: 50 });

    const results = await runInference(session, { [MODEL_INPUT_NAME]: inputTensor });
    self.postMessage({ id, status: 'progress', progress: 80 });

    const rawMask = results[MODEL_OUTPUT_NAME].data as Float32Array;
    const mask = normalizeMask(rawMask);

    const canvas = applyMask(rgba, width, height, mask, MODEL_INPUT_SIZE);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    self.postMessage({ id, status: 'progress', progress: 95 });

    self.postMessage({ id, status: 'success', result: blob });
  } catch (error) {
    console.error('Worker error:', error);
    self.postMessage({ id, status: 'error', error: (error as Error).message });
  }
};
