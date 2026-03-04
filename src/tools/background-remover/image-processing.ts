const MODEL_INPUT_SIZE = 320;

/**
 * Decodes an image blob into raw RGBA pixel data using OffscreenCanvas.
 */
export async function decodeImage(blob: Blob): Promise<{
  data: Uint8ClampedArray;
  width: number;
  height: number;
}> {
  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const imageData = ctx.getImageData(0, 0, width, height);
  return { data: imageData.data, width, height };
}

/**
 * Converts RGBA image data into a normalized CHW float32 tensor
 * resized to the model's expected input dimensions.
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
    chw[i] = resized[base] / 255;                     // R
    chw[pixelCount + i] = resized[base + 1] / 255;    // G
    chw[2 * pixelCount + i] = resized[base + 2] / 255; // B
  }

  return chw;
}

/**
 * Normalizes the raw model output mask to [0..255] range.
 * u2net outputs sigmoid values already in ~[0,1], but we min-max normalize
 * to improve contrast on edge cases.
 * When threshold > 0, applies a binary threshold to sharpen the mask.
 */
export function normalizeMask(raw: Float32Array, threshold: number = 128): Uint8Array {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] < min) min = raw[i];
    if (raw[i] > max) max = raw[i];
  }

  const range = max - min || 1;
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    const normalized = Math.round(((raw[i] - min) / range) * 255);
    // Apply threshold: values above threshold become 255, below become 0
    // Threshold of 128 is the default (moderate), 0 means no thresholding (soft mask)
    if (threshold > 0 && threshold < 255) {
      out[i] = normalized >= threshold ? 255 : 0;
    } else {
      out[i] = normalized;
    }
  }
  return out;
}

/**
 * Applies the alpha mask (model output resolution) to the original image,
 * producing a transparent-background PNG blob.
 * When smoothing > 0, a box blur is applied to the mask to soften edges.
 */
export function applyMask(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  mask: Uint8Array,
  maskSize: number = MODEL_INPUT_SIZE,
  smoothing: number = 0,
): OffscreenCanvas {
  let upscaledMask = resizeGrayscale(mask, maskSize, maskSize, width, height);

  // Apply box blur for edge smoothing
  if (smoothing > 0) {
    upscaledMask = boxBlurGrayscale(upscaledMask, width, height, smoothing);
  }

  const output = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < width * height; i++) {
    const base = i * 4;
    output[base] = rgba[base];
    output[base + 1] = rgba[base + 1];
    output[base + 2] = rgba[base + 2];
    output[base + 3] = upscaledMask[i];
  }

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(new ImageData(output, width, height), 0, 0);
  return canvas;
}

/**
 * Box blur for single-channel (grayscale) data.
 * Applies a simple averaging filter with the given radius.
 */
function boxBlurGrayscale(
  src: Uint8Array,
  width: number,
  height: number,
  radius: number,
): Uint8Array {
  const dst = new Uint8Array(src.length);

  // Horizontal pass
  const temp = new Uint8Array(src.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      for (let k = -radius; k <= radius; k++) {
        const nx = x + k;
        if (nx >= 0 && nx < width) {
          sum += src[y * width + nx];
          count++;
        }
      }
      temp[y * width + x] = Math.round(sum / count);
    }
  }

  // Vertical pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      for (let k = -radius; k <= radius; k++) {
        const ny = y + k;
        if (ny >= 0 && ny < height) {
          sum += temp[ny * width + x];
          count++;
        }
      }
      dst[y * width + x] = Math.round(sum / count);
    }
  }

  return dst;
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
  const canvas = new OffscreenCanvas(dstW, dstH);
  const ctx = canvas.getContext('2d')!;

  const srcCanvas = new OffscreenCanvas(srcW, srcH);
  const srcCtx = srcCanvas.getContext('2d')!;
  srcCtx.putImageData(new ImageData(Uint8ClampedArray.from(src), srcW, srcH), 0, 0);

  ctx.drawImage(srcCanvas, 0, 0, dstW, dstH);
  return ctx.getImageData(0, 0, dstW, dstH).data;
}

/**
 * Bilinear resize for single-channel (grayscale) data.
 */
function resizeGrayscale(
  src: Uint8Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Uint8Array {
  const dst = new Uint8Array(dstW * dstH);
  const xRatio = srcW / dstW;
  const yRatio = srcH / dstH;

  for (let y = 0; y < dstH; y++) {
    const srcY = y * yRatio;
    const y0 = Math.floor(srcY);
    const y1 = Math.min(y0 + 1, srcH - 1);
    const fy = srcY - y0;

    for (let x = 0; x < dstW; x++) {
      const srcX = x * xRatio;
      const x0 = Math.floor(srcX);
      const x1 = Math.min(x0 + 1, srcW - 1);
      const fx = srcX - x0;

      const tl = src[y0 * srcW + x0];
      const tr = src[y0 * srcW + x1];
      const bl = src[y1 * srcW + x0];
      const br = src[y1 * srcW + x1];

      const top = tl + (tr - tl) * fx;
      const bottom = bl + (br - bl) * fx;
      dst[y * dstW + x] = Math.round(top + (bottom - top) * fy);
    }
  }
  return dst;
}

