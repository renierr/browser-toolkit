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
 * Normalizes ImageData (RGBA, 0-255) to a Float32Array (RGB) in NCHW format.
 * Applies range mapping and mean/std normalization.
 */
function imageDataToTensor(imgData: ImageData, config: any): Float32Array {
  const { width, height, data } = imgData;
  const numPixels = width * height;
  const floatData = new Float32Array(numPixels * 3);

  const mean = config.mean || [0, 0, 0];
  const std = config.std || [1, 1, 1];
  const [min, max] = config.normalizeRange || [0, 1];
  const rangeWidth = max - min;

  for (let i = 0; i < numPixels; i++) {
    const rgbaIdx = i * 4;
    for (let c = 0; c < 3; c++) {
      const pix = data[rgbaIdx + c] / 255.0;
      const val = (pix * rangeWidth + min - mean[c]) / std[c];
      floatData[c * numPixels + i] = val;
    }
  }

  return floatData;
}

/**
 * Denormalizes tensor data back into an ImageData object.
 * Reverses normalization and range mapping.
 */
function tensorToImageData(tensorData: Float32Array, width: number, height: number, config: any): ImageData {
  const numPixels = width * height;
  const rgbaData = new Uint8ClampedArray(numPixels * 4);
  const channels = Math.floor(tensorData.length / numPixels);

  const mean = config.mean || [0, 0, 0];
  const std = config.std || [1, 1, 1];
  const [min, max] = config.normalizeRange || [0, 1];
  const rangeWidth = max - min;

  for (let i = 0; i < numPixels; i++) {
    const rgbaIdx = i * 4;

    for (let c = 0; c < 3; c++) {
      let val;
      if (channels === 1) {
        val = tensorData[i];
      } else {
        val = tensorData[c * numPixels + i];
      }

      // Reverse: pix = (((val * std) + mean - min) / rangeWidth) * 255.0
      // For grayscale, we use mean[0] and std[0] if provided, else defaults
      const m = mean[c] !== undefined ? mean[c] : mean[0];
      const s = std[c] !== undefined ? std[c] : std[0];
      
      const afterRange = (val * s) + m;
      const normalized = (afterRange - min) / rangeWidth;
      const pix = normalized * 255.0;
      
      rgbaData[rgbaIdx + c] = Math.max(0, Math.min(255, Math.round(pix)));
    }
    rgbaData[rgbaIdx + 3] = 255; // Alpha
  }

  return new ImageData(rgbaData, width, height);
}

/**
 * Pads an ImageData to the next multiple of the given base.
 */
function padImageData(imgData: ImageData, multiple: number): ImageData {
  if (multiple <= 1) return imgData;
  const newWidth = Math.ceil(imgData.width / multiple) * multiple;
  const newHeight = Math.ceil(imgData.height / multiple) * multiple;

  if (newWidth === imgData.width && newHeight === imgData.height) return imgData;

  const canvas = new OffscreenCanvas(newWidth, newHeight);
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(imgData, 0, 0);

  // Extend edge pixels (simple padding) or keep as-is (transparent/black)
  // Most models prefer mirrored or edge padding, but black/transparent often works.
  return ctx.getImageData(0, 0, newWidth, newHeight);
}

async function processImage(id: string, blob: Blob, options: ProcessingOptions) {
  try {
    reportProgress(id, 'Decoding Image...', 5);

    // 1. Decode Image to ImageData
    const imgData = await blobToImageData(blob);
    const originalWidth = imgData.width;
    const originalHeight = imgData.height;

    reportProgress(id, 'Preparing Model Input...', 10);
    const padMultiple = options.modelConfig.padToMultipleOf || 1;
    const paddedImgData = padImageData(imgData, padMultiple);
    const { width, height } = paddedImgData;

    reportProgress(id, 'Loading AI Model...', 15);

    // 2. Load the Session
    const config: OnnxModelConfig = {
      modelPath: options.modelConfig.url,
      executionProviders: options.forceWasm ? ['wasm'] : undefined,
    };
    const session = await loadSession(config);

    reportProgress(id, 'Preparing Tensors...', 30);

    // 3. Preprocess Input
    const rgbData = imageDataToTensor(paddedImgData, options.modelConfig);

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
    let outImgData = tensorToImageData(outFloatData, outW, outH, options.modelConfig);
    outputTensor.dispose();

    // 6. Crop back to original scale (if padded)
    const upscaleFactor = outW / width;
    const targetW = originalWidth * upscaleFactor;
    const targetH = originalHeight * upscaleFactor;

    const offscreen = new OffscreenCanvas(targetW, targetH);
    const ctx = offscreen.getContext('2d')!;

    if (outW !== targetW || outH !== targetH) {
      // Draw the output image data onto a temp canvas then crop
      const tempCanvas = new OffscreenCanvas(outW, outH);
      tempCanvas.getContext('2d')!.putImageData(outImgData, 0, 0);
      ctx.drawImage(tempCanvas, 0, 0);
    } else {
      ctx.putImageData(outImgData, 0, 0);
    }

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
