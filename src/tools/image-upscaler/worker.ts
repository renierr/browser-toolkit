import {
  type OnnxModelConfig,
  loadSession,
  runInference,
  createTensor,
} from '../../js/onnx-utils';
import { blobToImageData } from '../../js/image-utils';

// Send updates to the main thread
function reportProgress(id: string, status: string, progress: number) {
  postMessage({ type: 'PROGRESS', payload: { id, status, progress } });
}

function reportResult(id: string, blob: Blob) {
  postMessage({ type: 'RESULT', payload: { id, blob } });
}

function reportError(id: string, error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  postMessage({ type: 'ERROR', payload: { id, error: msg } });
}

/**
 * Normalizes ImageData (RGBA, 0-255) to a Float32Array (RGB, 0-1) in NCHW format
 * (Batch, Channels, Height, Width).
 */
function imageDataToTensor(imgData: ImageData): Float32Array {
  const { width, height, data } = imgData;
  const numPixels = width * height;
  const floatData = new Float32Array(numPixels * 3); // 3 channels (RGB)

  for (let i = 0; i < numPixels; i++) {
    const rgbaIdx = i * 4;
    // R
    floatData[i] = data[rgbaIdx] / 255.0;
    // G
    floatData[numPixels + i] = data[rgbaIdx + 1] / 255.0;
    // B
    floatData[numPixels * 2 + i] = data[rgbaIdx + 2] / 255.0;
  }

  return floatData;
}

/**
 * Denormalizes tensor data (RGB, 0-1 in NCHW) back into an ImageData object (RGBA, 0-255 in HWC).
 */
function tensorToImageData(
  tensorData: Float32Array,
  width: number,
  height: number
): ImageData {
  const numPixels = width * height;
  const rgbaData = new Uint8ClampedArray(numPixels * 4);

  for (let i = 0; i < numPixels; i++) {
    const rgbaIdx = i * 4;

    // R
    let r = tensorData[i] * 255;
    // G
    let g = tensorData[numPixels + i] * 255;
    // B
    let b = tensorData[numPixels * 2 + i] * 255;

    // Clamp values just in case
    rgbaData[rgbaIdx] = Math.max(0, Math.min(255, Math.round(r)));
    rgbaData[rgbaIdx + 1] = Math.max(0, Math.min(255, Math.round(g)));
    rgbaData[rgbaIdx + 2] = Math.max(0, Math.min(255, Math.round(b)));
    rgbaData[rgbaIdx + 3] = 255; // Alpha fully opaque
  }

  return new ImageData(rgbaData, width, height);
}

async function processImage(id: string, blob: Blob, modelName: string) {
  try {
    reportProgress(id, 'Decoding Image...', 5);

    // 1. Decode Image to ImageData
    // Real-ESRGAN can be memory hungry, but we will let the user attempt
    // full resolution inference.
    const imgData = await blobToImageData(blob);
    const { width, height } = imgData;

    reportProgress(id, 'Loading AI Model...', 15);

    // 2. Load the Session
    const modelUrl = `/lib/models/${modelName}.onnx`;
    const config: OnnxModelConfig = {
      modelPath: modelUrl,
    };
    const session = await loadSession(config);

    reportProgress(id, 'Preparing Tensors...', 30);

    // 3. Preprocess Input
    const rgbData = imageDataToTensor(imgData);

    // float32[batch_size, 3, height, width] per netron dump
    const inputTensor = createTensor(rgbData, [1, 3, height, width]);
    const feeds = { input: inputTensor };

    reportProgress(id, 'Upscaling Image (this may take a while)...', 40);

    // 4. Run Inference
    const results = await runInference(session, feeds, (p) => {
      // Inference itself might not provide granular progress via onnxruntime-web natively,
      // but we interpolate 40 to 90
      reportProgress(id, 'Running Neural Network...', 40 + (p * 0.5));
    });
    inputTensor.dispose();

    reportProgress(id, 'Post-processing Output...', 95);

    // 5. Postprocess Output
    const outputTensor = results.output; // name 'output' per netron dump
    const [_, __, outH, outW] = outputTensor.dims;

    const outFloatData = outputTensor.data as Float32Array;
    const outImgData = tensorToImageData(outFloatData, outW as number, outH as number);
    outputTensor.dispose();

    // 6. Convert final ImageData to Blob
    const offscreen = new OffscreenCanvas(outW as number, outH as number);
    const ctx = offscreen.getContext('2d')!;
    ctx.putImageData(outImgData, 0, 0);
    const outBlob = await offscreen.convertToBlob({ type: 'image/png' });

    reportResult(id, outBlob);
  } catch (error) {
    reportError(id, error);
  }
}

// ── Event Listener ────────────────────────────────────────────────────────
self.onmessage = (e: MessageEvent) => {
  const { type, payload } = e.data;
  if (type === 'PROCESS' && payload.blob && payload.id && payload.model) {
    processImage(payload.id, payload.blob, payload.model).catch((err) => reportError(payload.id, err));
  }
};
