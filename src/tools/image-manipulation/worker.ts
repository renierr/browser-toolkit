import { type OnnxModelConfig, loadSession, runInference, createTensor } from '../../js/onnx-utils';
import { blobToImageData } from '../../js/image-utils';
import type { ProcessingOptions } from './utils.ts';

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
 * Denormalizes tensor data (RGB or Grayscale, 0-1 in NCHW) back into an ImageData object (RGBA, 0-255 in HWC).
 */
function tensorToImageData(tensorData: Float32Array, width: number, height: number): ImageData {
  const numPixels = width * height;
  const rgbaData = new Uint8ClampedArray(numPixels * 4);
  const channels = Math.floor(tensorData.length / numPixels);

  for (let i = 0; i < numPixels; i++) {
    const rgbaIdx = i * 4;

    let r, g, b;
    if (channels === 1) {
      // Grayscale
      r = g = b = tensorData[i] * 255;
    } else {
      // RGB
      r = tensorData[i] * 255;
      g = tensorData[numPixels + i] * 255;
      b = tensorData[numPixels * 2 + i] * 255;
    }

    // Clamp values just in case
    rgbaData[rgbaIdx] = Math.max(0, Math.min(255, Math.round(r)));
    rgbaData[rgbaIdx + 1] = Math.max(0, Math.min(255, Math.round(g)));
    rgbaData[rgbaIdx + 2] = Math.max(0, Math.min(255, Math.round(b)));
    rgbaData[rgbaIdx + 3] = 255; // Alpha fully opaque
  }

  return new ImageData(rgbaData, width, height);
}

async function processImage(id: string, blob: Blob, options: ProcessingOptions) {
  try {
    reportProgress(id, 'Decoding Image...', 5);

    // 1. Decode Image to ImageData
    const imgData = await blobToImageData(blob);
    const { width, height } = imgData;

    reportProgress(id, 'Loading AI Model...', 15);

    // 2. Load the Session
    const config: OnnxModelConfig = {
      modelPath: options.modelConfig.url,
      executionProviders: options.forceWasm ? ['wasm'] : undefined,
    };
    const session = await loadSession(config);

    reportProgress(id, 'Preparing Tensors...', 30);

    // 3. Preprocess Input
    const rgbData = imageDataToTensor(imgData);

    // float32[batch_size, 3, height, width]
    const inputTensor = createTensor(rgbData, [1, 3, height, width]);
    const feeds = { [options.modelConfig.input]: inputTensor };

    reportProgress(id, 'Processing Image (this may take a while)...', 40);

    // 4. Run Inference
    const results = await runInference(session, feeds, (p) => {
      reportProgress(id, 'Running Neural Network...', 40 + p * 0.5);
    });
    inputTensor.dispose();

    reportProgress(id, 'Post-processing Output...', 95);

    // 5. Postprocess Output
    const outputTensor = results[options.modelConfig.output];
    const dims = outputTensor.dims;
    const outH = dims[dims.length - 2] as number;
    const outW = dims[dims.length - 1] as number;

    const outFloatData = outputTensor.data as Float32Array;
    const outImgData = tensorToImageData(outFloatData, outW, outH);
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
  if (type === 'PROCESS' && payload.blob && payload.id && payload.options) {
    processImage(payload.id, payload.blob, payload.options).catch((err) =>
      reportError(payload.id, err)
    );
  }
};
