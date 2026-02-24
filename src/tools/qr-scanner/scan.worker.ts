/**
 * Dedicated Web Worker for QR code scanning.
 *
 * Offloads jsQR decoding and Otsu's binarization from the main thread
 * so the camera preview stays smooth while scanning.
 */
import jsQR from 'jsqr';
import type { WorkerInMessage, WorkerOutMessage } from './worker-protocol';

// ---------------------------------------------------------------------------
// Image enhancement — Otsu's binarization
// ---------------------------------------------------------------------------

function enhanceImageData(data: Uint8ClampedArray, len: number): void {
  // Pass 1: grayscale + find min/max
  let min = 255,
    max = 0;
  for (let i = 0; i < len; i += 4) {
    const gray = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
    data[i] = data[i + 1] = data[i + 2] = gray;
    if (gray < min) min = gray;
    if (gray > max) max = gray;
  }

  // Pass 2: contrast stretch + histogram
  const range = max - min || 1;
  const histogram = new Uint32Array(256);
  for (let i = 0; i < len; i += 4) {
    const stretched = ((data[i] - min) / range) * 255;
    const val = Math.max(0, Math.min(255, stretched));
    data[i] = data[i + 1] = data[i + 2] = val;
    histogram[Math.round(val)]++;
  }

  // Otsu's threshold
  const totalPixels = len / 4;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * histogram[i];
  let sumBg = 0,
    weightBg = 0,
    bestThreshold = 128,
    bestVariance = 0;
  for (let t = 0; t < 256; t++) {
    weightBg += histogram[t];
    if (weightBg === 0) continue;
    const weightFg = totalPixels - weightBg;
    if (weightFg === 0) break;
    sumBg += t * histogram[t];
    const meanBg = sumBg / weightBg;
    const meanFg = (sumAll - sumBg) / weightFg;
    const variance = weightBg * weightFg * (meanBg - meanFg) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      bestThreshold = t;
    }
  }

  // Binarize
  for (let i = 0; i < len; i += 4) {
    const v = data[i] >= bestThreshold ? 255 : 0;
    data[i] = data[i + 1] = data[i + 2] = v;
  }
}

// ---------------------------------------------------------------------------
// Scanning helpers
// ---------------------------------------------------------------------------

function tryJsQR(data: Uint8ClampedArray, width: number, height: number): string | null {
  const code = jsQR(data, width, height, { inversionAttempts: 'attemptBoth' });
  return code ? code.data : null;
}

/** Scan a single frame — optionally with enhancement. */
function scanFrame(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  useEnhanced: boolean
): string | null {
  if (useEnhanced) {
    // Work on a copy so we don't corrupt the raw pixels for future use
    const copy = new Uint8ClampedArray(pixels);
    enhanceImageData(copy, copy.length);
    return tryJsQR(copy, width, height);
  }
  return tryJsQR(pixels, width, height);
}

/** Scan an image at multiple resolutions (for uploaded/pasted images). */
function scanImageMultiScale(
  srcPixels: Uint8ClampedArray,
  srcWidth: number,
  srcHeight: number,
  targetSizes: number[]
): string | null {
  // We can only resize using an OffscreenCanvas (available in workers).
  const hasOffscreen = typeof OffscreenCanvas !== 'undefined';

  for (const targetSize of targetSizes) {
    const scale = Math.min(1, targetSize / Math.max(srcWidth, srcHeight));
    const w = Math.round(srcWidth * scale);
    const h = Math.round(srcHeight * scale);

    let imageData: Uint8ClampedArray;

    if (scale === 1) {
      imageData = srcPixels;
    } else if (hasOffscreen) {
      // Resize via OffscreenCanvas
      const oc = new OffscreenCanvas(srcWidth, srcHeight);
      const ctx = oc.getContext('2d')!;
      const srcImgData = new ImageData(new Uint8ClampedArray(srcPixels), srcWidth, srcHeight);
      ctx.putImageData(srcImgData, 0, 0);

      const oc2 = new OffscreenCanvas(w, h);
      const ctx2 = oc2.getContext('2d')!;
      ctx2.imageSmoothingEnabled = true;
      ctx2.drawImage(oc, 0, 0, w, h);
      imageData = ctx2.getImageData(0, 0, w, h).data;
    } else {
      // No OffscreenCanvas — just try original size
      imageData = srcPixels;
    }

    // Attempt 1: raw
    const result1 = tryJsQR(imageData, w, h);
    if (result1) return result1;

    // Attempt 2: enhanced
    const copy = new Uint8ClampedArray(imageData);
    enhanceImageData(copy, copy.length);
    const result2 = tryJsQR(copy, w, h);
    if (result2) return result2;

    // If we couldn't resize, no point trying other sizes
    if (!hasOffscreen && scale !== 1) break;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

self.addEventListener('message', (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data;

  switch (msg.type) {
    case 'scan-frame': {
      const pixels = new Uint8ClampedArray(msg.pixels);
      const data = scanFrame(pixels, msg.width, msg.height, msg.useEnhanced);
      const result: WorkerOutMessage = {
        type: 'scan-result',
        id: msg.id,
        data,
        format: 'qr_code',
      };
      (self as unknown as Worker).postMessage(result);
      break;
    }

    case 'scan-image': {
      const pixels = new Uint8ClampedArray(msg.pixels);
      const data = scanImageMultiScale(pixels, msg.width, msg.height, msg.targetSizes);
      const result: WorkerOutMessage = {
        type: 'scan-result',
        id: msg.id,
        data,
        format: 'qr_code',
      };
      (self as unknown as Worker).postMessage(result);
      break;
    }
  }
});
