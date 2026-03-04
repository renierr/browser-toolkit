const MODEL_INPUT_SIZE = 320;

/**
 * Decodes an image blob into raw RGBA pixel data using OffscreenCanvas.
 */
export async function decodeImage(blob: Blob, maxDimension?: number): Promise<{
  data: Uint8ClampedArray;
  width: number;
  height: number;
}> {
  let bitmap = await createImageBitmap(blob);

  let { width, height } = bitmap;

  if (maxDimension && (width > maxDimension || height > maxDimension)) {
    const ratio = Math.min(maxDimension / width, maxDimension / height);
    const newWidth = Math.round(width * ratio);
    const newHeight = Math.round(height * ratio);

    const oldBitmap = bitmap;
    bitmap = await createImageBitmap(blob, {
      resizeWidth: newWidth,
      resizeHeight: newHeight,
      resizeQuality: 'high'
    });
    oldBitmap.close();
    width = newWidth;
    height = newHeight;
  }

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const imageData = ctx.getImageData(0, 0, width, height);
  return { data: imageData.data, width, height };
}

/**
 * Converts RGBA image data into a normalized CHW float32 tensor.
 */
export function imageToTensor(
  rgba: Uint8ClampedArray,
  srcWidth: number,
  srcHeight: number,
  size: number = MODEL_INPUT_SIZE,
): Float32Array {
  const resized = resizeRGBA(rgba, srcWidth, srcHeight, size, size);
  const pixelCount = size * size;
  const chw = new Float32Array(3 * pixelCount);

  for (let i = 0; i < pixelCount; i++) {
    const base = i * 4;
    chw[i] = resized[base] / 255;
    chw[pixelCount + i] = resized[base + 1] / 255;
    chw[2 * pixelCount + i] = resized[base + 2] / 255;
  }

  return chw;
}

/**
 * Normalizes the raw model output mask to [0..255] range.
 */
export function normalizeMask(
  raw: Float32Array,
  threshold: number = 128,
  contrast: number = 1.0,
): Uint8Array {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] < min) min = raw[i];
    if (raw[i] > max) max = raw[i];
  }

  const range = max - min || 1;
  const out = new Uint8Array(raw.length);

  for (let i = 0; i < raw.length; i++) {
    let val = (raw[i] - min) / range;

    if (contrast !== 1.0) {
      val = 1 / (1 + Math.exp(-contrast * (val - 0.5) * 10));
    }

    const normalized = Math.round(val * 255);

    if (threshold > 0 && threshold < 255) {
      out[i] = normalized >= threshold ? 255 : 0;
    } else {
      out[i] = normalized;
    }
  }
  return out;
}

/**
 * Simple box filter for Guided Filter.
 */
function boxFilter(data: Float32Array, width: number, height: number, radius: number): Float32Array {
  const output = new Float32Array(data.length);
  const winSize = 2 * radius + 1;

  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let x = -radius; x <= radius; x++) {
      sum += data[y * width + Math.max(0, Math.min(width - 1, x))];
    }
    for (let x = 0; x < width; x++) {
      output[y * width + x] = sum;
      const prev = data[y * width + Math.max(0, x - radius)];
      const next = data[y * width + Math.min(width - 1, x + radius + 1)];
      sum += next - prev;
    }
  }

  const temp = new Float32Array(output);
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) {
      sum += temp[Math.max(0, Math.min(height - 1, y)) * width + x];
    }
    for (let y = 0; y < height; y++) {
      output[y * width + x] = sum / (winSize * winSize);
      const prev = temp[Math.max(0, y - radius) * width + x];
      const next = temp[Math.min(height - 1, y + radius + 1) * width + x];
      sum += next - prev;
    }
  }
  return output;
}

/**
 * Refines a low-resolution mask using the source image as a guide.
 */
export function guidedFilter(
  sourceRgba: Uint8ClampedArray,
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number = 4,
  eps: number = 0.01,
): Uint8Array {
  const size = width * height;

  const I = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    I[i] = (sourceRgba[i * 4] * 0.299 + sourceRgba[i * 4 + 1] * 0.587 + sourceRgba[i * 4 + 2] * 0.114) / 255;
  }

  const p = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    p[i] = mask[i] / 255;
  }

  const mean_I = boxFilter(I, width, height, radius);
  const mean_p = boxFilter(p, width, height, radius);

  const Ip = new Float32Array(size);
  const II = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    Ip[i] = I[i] * p[i];
    II[i] = I[i] * I[i];
  }

  const mean_Ip = boxFilter(Ip, width, height, radius);
  const corr_I = boxFilter(II, width, height, radius);

  const var_I = new Float32Array(size);
  const cov_Ip = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    var_I[i] = corr_I[i] - mean_I[i] * mean_I[i];
    cov_Ip[i] = mean_Ip[i] - mean_I[i] * mean_p[i];
  }

  const a = new Float32Array(size);
  const b = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    a[i] = cov_Ip[i] / (var_I[i] + eps);
    b[i] = mean_p[i] - a[i] * mean_I[i];
  }

  const mean_a = boxFilter(a, width, height, radius);
  const mean_b = boxFilter(b, width, height, radius);

  const result = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    const q = mean_a[i] * I[i] + mean_b[i];
    result[i] = Math.max(0, Math.min(255, Math.round(q * 255)));
  }

  return result;
}

/**
 * Resizes a single-channel mask using OffscreenCanvas.
 */
export function resizeMask(
  mask: Uint8Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Uint8Array {
  if (srcW === dstW && srcH === dstH) return mask;

  const canvas = new OffscreenCanvas(dstW, dstH);
  const ctx = canvas.getContext('2d', { alpha: true })!;

  const srcCanvas = new OffscreenCanvas(srcW, srcH);
  const srcCtx = srcCanvas.getContext('2d')!;
  const srcData = srcCtx.createImageData(srcW, srcH);
  for (let i = 0; i < mask.length; i++) {
    srcData.data[i * 4 + 3] = mask[i];
  }
  srcCtx.putImageData(srcData, 0, 0);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(srcCanvas, 0, 0, dstW, dstH);

  const dstData = ctx.getImageData(0, 0, dstW, dstH);
  const result = new Uint8Array(dstW * dstH);
  for (let i = 0; i < result.length; i++) {
    result[i] = dstData.data[i * 4 + 3];
  }
  return result;
}

/**
 * Applies the alpha mask to the original image.
 */
export function applyMask(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  mask: Uint8Array,
  maskWidth: number,
  maskHeight: number,
  smoothing: number = 0,
): OffscreenCanvas {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { alpha: true })!;

  const maskCanvas = new OffscreenCanvas(maskWidth, maskHeight);
  const maskCtx = maskCanvas.getContext('2d')!;
  const maskData = maskCtx.createImageData(maskWidth, maskHeight);
  for (let i = 0; i < mask.length; i++) {
    maskData.data[i * 4 + 3] = mask[i];
  }
  maskCtx.putImageData(maskData, 0, 0);

  ctx.clearRect(0, 0, width, height);
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);

  ctx.globalCompositeOperation = 'destination-in';
  if (smoothing > 0) {
    ctx.filter = `blur(${smoothing}px)`;
  }
  ctx.drawImage(maskCanvas, 0, 0, width, height);

  return canvas;
}

/**
 * Bilinear resize for RGBA pixel data.
 */
function resizeRGBA(
  src: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Uint8ClampedArray {
  if (srcW === dstW && srcH === dstH) return src;

  const canvas = new OffscreenCanvas(dstW, dstH);
  const ctx = canvas.getContext('2d')!;

  const srcCanvas = new OffscreenCanvas(srcW, srcH);
  const srcCtx = srcCanvas.getContext('2d')!;
  srcCtx.putImageData(new ImageData(new Uint8ClampedArray(src), srcW, srcH), 0, 0);

  ctx.drawImage(srcCanvas, 0, 0, dstW, dstH);
  return ctx.getImageData(0, 0, dstW, dstH).data;
}
