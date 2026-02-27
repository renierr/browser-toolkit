export function sourceToCanvas(
  source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement
): HTMLCanvasElement {
  if (source instanceof HTMLCanvasElement) return source;
  const canvas = document.createElement('canvas');
  if (source instanceof HTMLVideoElement) {
    canvas.width = source.videoWidth;
    canvas.height = source.videoHeight;
  } else {
    canvas.width = source.width;
    canvas.height = source.height;
  }
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(source, 0, 0);
  return canvas;
}

/**
 * Convert an HTMLImageElement to a PNG Blob for lossless storage.
 * This is only used as a fallback when no original Blob is available
 * (both file upload and camera capture pass their original blobs directly).
 */
export function imageToBlob(img: HTMLImageElement): Promise<Blob> {
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;

  const oc = new OffscreenCanvas(width, height);
  const ctx = oc.getContext('2d');
  if (ctx) {
    ctx.drawImage(img, 0, 0, width, height);
    return oc.convertToBlob({ type: 'image/png' });
  }
  return Promise.reject(new Error('imageToBlob: OffscreenCanvas not supported'));
}

/** Decode a Blob back into an HTMLImageElement. */
export function imageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('imageFromBlob: failed to decode'));
    };
    img.src = url;
  });
}

/**
 * Rotates a canvas by 90, 180, or 270 degrees and returns a new canvas.
 */
export function rotateCanvas(source: HTMLCanvasElement, degrees: number): HTMLCanvasElement {
  if (degrees === 0) return source;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  // Normalize degrees to 0, 90, 180, 270
  let normalizedDegrees = ((degrees % 360) + 360) % 360;

  if (normalizedDegrees === 90 || normalizedDegrees === 270) {
    canvas.width = source.height;
    canvas.height = source.width;
  } else {
    canvas.width = source.width;
    canvas.height = source.height;
  }

  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((normalizedDegrees * Math.PI) / 180);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);

  return canvas;
}
