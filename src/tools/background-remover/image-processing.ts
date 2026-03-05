const MODEL_INPUT_SIZE = 320;
const GUIDED_FILTER_MAX_DIM = 1024;

export async function decodeImage(blob: Blob, maxDimension?: number): Promise<{
  data: Uint8ClampedArray;
  width: number;
  height: number;
}> {
  let bitmap: ImageBitmap;
  try {
    bitmap = maxDimension
      ? await createBitmapWithLimit(blob, maxDimension)
      : await createImageBitmap(blob);
  } catch (firstErr) {
    console.warn('[decodeImage] Decode failed, retrying at 2048 px', firstErr);
    bitmap = await createBitmapDownscaled(blob, 2048);
  }

  const { width, height } = bitmap;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const imageData = ctx.getImageData(0, 0, width, height);
  canvas.width = 0;
  canvas.height = 0;
  return { data: imageData.data, width, height };
}

async function createBitmapWithLimit(blob: Blob, maxDim: number): Promise<ImageBitmap> {
  const probe = await createImageBitmap(blob);
  if (probe.width <= maxDim && probe.height <= maxDim) return probe;

  const { width, height } = probe;
  probe.close();

  const ratio = Math.min(maxDim / width, maxDim / height);
  return createImageBitmap(blob, {
    resizeWidth: Math.max(1, Math.round(width * ratio)),
    resizeHeight: Math.max(1, Math.round(height * ratio)),
    resizeQuality: 'high',
  });
}

async function createBitmapDownscaled(blob: Blob, maxDim: number): Promise<ImageBitmap> {
  try {
    return await createBitmapWithLimit(blob, maxDim);
  } catch {
    return createImageBitmap(blob, {
      resizeWidth: maxDim,
      resizeHeight: maxDim,
      resizeQuality: 'medium',
    });
  }
}

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

function boxFilter(data: Float32Array, width: number, height: number, radius: number, out?: Float32Array, scratch?: Float32Array): Float32Array {
  const output = out ?? new Float32Array(data.length);
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

  // Vertical pass
  const temp = scratch ?? new Float32Array(data.length);
  temp.set(output);
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

export interface GuidedFilterResult {
  mask: Uint8Array;
  downscaledRgba?: Uint8ClampedArray;
}

export function guidedFilter(
  sourceRgba: Uint8ClampedArray,
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number = 4,
  eps: number = 0.01,
  cachedDownscaledRgba?: Uint8ClampedArray,
): GuidedFilterResult {
  if (width <= GUIDED_FILTER_MAX_DIM && height <= GUIDED_FILTER_MAX_DIM) {
    return { mask: guidedFilterCore(sourceRgba, mask, width, height, radius, eps) };
  }

  const ratio = Math.min(GUIDED_FILTER_MAX_DIM / width, GUIDED_FILTER_MAX_DIM / height);
  const workW = Math.max(1, Math.round(width * ratio));
  const workH = Math.max(1, Math.round(height * ratio));

  const workRgba = cachedDownscaledRgba ?? resizeRGBA(sourceRgba, width, height, workW, workH);
  const workMask = resizeMask(mask, width, height, workW, workH);
  const scaledRadius = Math.max(1, Math.round(radius * ratio));

  const result = guidedFilterCore(workRgba, workMask, workW, workH, scaledRadius, eps);
  return {
    mask: resizeMask(result, workW, workH, width, height),
    downscaledRgba: workRgba,
  };
}


function guidedFilterCore(
  sourceRgba: Uint8ClampedArray,
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number,
  eps: number,
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

  const buf1 = new Float32Array(size);
  const buf2 = new Float32Array(size);
  const buf3 = new Float32Array(size);
  const buf4 = new Float32Array(size);
  const bfScratch = new Float32Array(size);

  for (let i = 0; i < size; i++) {
    buf1[i] = I[i] * p[i];
    buf2[i] = I[i] * I[i];
  }
  boxFilter(buf1, width, height, radius, buf3, bfScratch);
  boxFilter(buf2, width, height, radius, buf4, bfScratch);

  for (let i = 0; i < size; i++) {
    const var_I = buf4[i] - mean_I[i] * mean_I[i];
    const cov_Ip = buf3[i] - mean_I[i] * mean_p[i];
    buf1[i] = cov_Ip / (var_I + eps);
    buf2[i] = mean_p[i] - buf1[i] * mean_I[i];
  }

  boxFilter(buf1, width, height, radius, buf3, bfScratch);
  boxFilter(buf2, width, height, radius, buf4, bfScratch);

  const result = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    const q = buf3[i] * I[i] + buf4[i];
    result[i] = Math.max(0, Math.min(255, Math.round(q * 255)));
  }

  return result;
}

export function resizeMask(
  mask: Uint8Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Uint8Array {
  if (srcW === dstW && srcH === dstH) return mask;

  const srcCanvas = new OffscreenCanvas(srcW, srcH);
  const srcCtx = srcCanvas.getContext('2d')!;
  const srcData = srcCtx.createImageData(srcW, srcH);
  for (let i = 0; i < mask.length; i++) {
    srcData.data[i * 4 + 3] = mask[i];
  }
  srcCtx.putImageData(srcData, 0, 0);

  const canvas = new OffscreenCanvas(dstW, dstH);
  const ctx = canvas.getContext('2d', { alpha: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(srcCanvas, 0, 0, dstW, dstH);
  srcCanvas.width = 0;
  srcCanvas.height = 0;

  const dstData = ctx.getImageData(0, 0, dstW, dstH);
  const result = new Uint8Array(dstW * dstH);
  for (let i = 0; i < result.length; i++) {
    result[i] = dstData.data[i * 4 + 3];
  }
  canvas.width = 0;
  canvas.height = 0;

  return result;
}

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
  ctx.putImageData(new ImageData(rgba as unknown as Uint8ClampedArray<ArrayBuffer>, width, height), 0, 0);

  ctx.globalCompositeOperation = 'destination-in';
  if (smoothing > 0) {
    ctx.filter = `blur(${smoothing}px)`;
  }
  ctx.drawImage(maskCanvas, 0, 0, width, height);
  maskCanvas.width = 0;
  maskCanvas.height = 0;

  return canvas;
}

function resizeRGBA(
  src: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Uint8ClampedArray {
  if (srcW === dstW && srcH === dstH) return src;

  const srcCanvas = new OffscreenCanvas(srcW, srcH);
  const srcCtx = srcCanvas.getContext('2d')!;
  srcCtx.putImageData(new ImageData(src as unknown as Uint8ClampedArray<ArrayBuffer>, srcW, srcH), 0, 0);

  const canvas = new OffscreenCanvas(dstW, dstH);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(srcCanvas, 0, 0, dstW, dstH);
  srcCanvas.width = 0;
  srcCanvas.height = 0;

  const result = ctx.getImageData(0, 0, dstW, dstH).data;
  canvas.width = 0;
  canvas.height = 0;

  return result;
}
