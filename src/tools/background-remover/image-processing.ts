const MODEL_INPUT_SIZE = 320;

/**
 * Decodes an image blob into raw RGBA pixel data using OffscreenCanvas.
 * On mobile/memory-constrained environments, resizing here saves significant memory.
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

    // Close old bitmap and create resized one
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
 * Uses native Canvas composite operations and filters for maximum performance.
 */
export function applyMask(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  mask: Uint8Array,
  maskSize: number = MODEL_INPUT_SIZE,
  smoothing: number = 0,
): OffscreenCanvas {
  // 1. Create a small mask canvas and put the mask pixels in it
  // We use the alpha channel for the mask values
  const smallMaskCanvas = new OffscreenCanvas(maskSize, maskSize);
  const smallMaskCtx = smallMaskCanvas.getContext('2d')!;
  const maskImageData = smallMaskCtx.createImageData(maskSize, maskSize);

  // Fill alpha channel with mask values, RGB stays 0
  for (let i = 0; i < mask.length; i++) {
    maskImageData.data[i * 4 + 3] = mask[i];
  }
  smallMaskCtx.putImageData(maskImageData, 0, 0);

  // 2. Create the final canvas and draw the original image
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;

  // Use a temporary copy if rgba might be a SharedArrayBuffer to avoid ImageData errors
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);

  // 3. Clip the image using the mask
  // 'destination-in' keeps existing pixels ONLY where the source is opaque
  ctx.globalCompositeOperation = 'destination-in';

  // Apply native blur filter for smoothing if requested
  if (smoothing > 0) {
    ctx.filter = `blur(${smoothing}px)`;
  }

  // Draw the mask canvas scaled up to the original size
  ctx.drawImage(smallMaskCanvas, 0, 0, width, height);

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
  // If already at target size, just return
  if (srcW === dstW && srcH === dstH) return src;

  const canvas = new OffscreenCanvas(dstW, dstH);
  const ctx = canvas.getContext('2d')!;

  const srcCanvas = new OffscreenCanvas(srcW, srcH);
  const srcCtx = srcCanvas.getContext('2d')!;
  srcCtx.putImageData(new ImageData(new Uint8ClampedArray(src), srcW, srcH), 0, 0);

  ctx.drawImage(srcCanvas, 0, 0, dstW, dstH);
  return ctx.getImageData(0, 0, dstW, dstH).data;
}

// (resizeGrayscale was removed as it is no longer used)

