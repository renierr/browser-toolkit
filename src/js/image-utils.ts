// ---------------------------------------------------------------------------
// Shared image utilities
//
// ⚠️  Worker-safety: functions marked [worker-safe] use only OffscreenCanvas /
//     createImageBitmap and may be imported from Web Workers.
//     Functions that require the DOM (HTMLImageElement, document, clipboard)
//     are marked [main-thread].
// ---------------------------------------------------------------------------

// ── Types ──────────────────────────────────────────────────────────────

export type ImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp';

export interface DecodeImageResult {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

// ── [worker-safe] Blob / ImageBitmap → ImageData ───────────────────────

/**
 * Decode a Blob into raw RGBA pixel data via OffscreenCanvas.
 * Works in both main thread and Web Workers.
 *
 * @param blob       Image blob to decode
 * @param maxDimension  If set, downscale so neither side exceeds this value
 */
export async function decodeImageToRgba(
  blob: Blob,
  maxDimension?: number
): Promise<DecodeImageResult> {
  const bitmap = maxDimension
    ? await createBitmapWithLimit(blob, maxDimension)
    : await createImageBitmap(blob);

  const { width, height } = bitmap;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const imageData = ctx.getImageData(0, 0, width, height);
  // Release the canvas memory
  canvas.width = 0;
  canvas.height = 0;
  return { data: imageData.data, width, height };
}

/**
 * Decode a Blob into an ImageData object via OffscreenCanvas.
 * Works in both main thread and Web Workers.
 */
export async function blobToImageData(blob: Blob, maxDimension?: number): Promise<ImageData> {
  const bitmap = maxDimension
    ? await createBitmapWithLimit(blob, maxDimension)
    : await createImageBitmap(blob);

  const { width, height } = bitmap;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const imageData = ctx.getImageData(0, 0, width, height);
  canvas.width = 0;
  canvas.height = 0;
  return imageData;
}

// ── [worker-safe] createImageBitmap helpers ────────────────────────────

/**
 * Create an ImageBitmap from a blob, downscaling if it exceeds maxDim on
 * either axis. Uses high-quality resampling.
 */
export async function createBitmapWithLimit(
  blob: Blob,
  maxDim: number,
  quality: 'low' | 'medium' | 'high' = 'high'
): Promise<ImageBitmap> {
  const probe = await createImageBitmap(blob);
  if (probe.width <= maxDim && probe.height <= maxDim) return probe;

  const { width, height } = probe;
  probe.close();

  const ratio = Math.min(maxDim / width, maxDim / height);
  return createImageBitmap(blob, {
    resizeWidth: Math.max(1, Math.round(width * ratio)),
    resizeHeight: Math.max(1, Math.round(height * ratio)),
    resizeQuality: quality,
  });
}

// ── [worker-safe] Blob format conversion ───────────────────────────────

/**
 * Convert an image Blob to a different format (e.g. WebP → PNG).
 * Returns the original blob unchanged when the target format already matches.
 */
export async function convertBlobFormat(
  blob: Blob,
  format: ImageMimeType,
  quality?: number
): Promise<Blob> {
  // Fast path: already the right type
  if (blob.type === format) return blob;

  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const result = await canvas.convertToBlob({ type: format, quality });
  canvas.width = 0;
  canvas.height = 0;
  return result;
}

/**
 * Ensure a blob is PNG (needed for clipboard operations).
 * No-op when the blob is already PNG.
 */
export async function ensurePngBlob(blob: Blob): Promise<Blob> {
  return convertBlobFormat(blob, 'image/png');
}

// ── [worker-safe] Canvas ↔ Blob helpers ────────────────────────────────

/**
 * Convert an OffscreenCanvas to a Blob.
 */
export function offscreenCanvasToBlob(
  canvas: OffscreenCanvas,
  format: ImageMimeType = 'image/png',
  quality?: number
): Promise<Blob> {
  return canvas.convertToBlob({ type: format, quality });
}

// ── [main-thread] HTMLImageElement helpers ──────────────────────────────

/**
 * Load a Blob (or File) into an HTMLImageElement.
 * Manages the object-URL lifecycle automatically.
 *
 * ⚠️  Uses `Image()` constructor — main thread only.
 */
export function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to decode image blob'));
    };
    img.src = url;
  });
}

/**
 * Convert an HTMLImageElement to a Blob via OffscreenCanvas.
 *
 * ⚠️  Requires HTMLImageElement — main thread only.
 */
export function imageElToBlob(
  img: HTMLImageElement,
  format: ImageMimeType = 'image/png',
  quality?: number
): Promise<Blob> {
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('OffscreenCanvas 2d context unavailable'));

  ctx.drawImage(img, 0, 0, width, height);
  return canvas.convertToBlob({ type: format, quality });
}

// ── [main-thread] Clipboard ────────────────────────────────────────────

/**
 * Copy an image blob to the system clipboard (always as PNG).
 *
 * ⚠️  navigator.clipboard — main thread only.
 */
export async function copyImageBlobToClipboard(blob: Blob): Promise<void> {
  const pngBlob = await ensurePngBlob(blob);
  await navigator.clipboard.write([new ClipboardItem({ [pngBlob.type]: pngBlob })]);
}
