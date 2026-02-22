import type { Point } from './perspective';

let grayscaleBuffer: Uint8Array | null = null;
let blurBuffer: Uint8Array | null = null;
let workBuffer: Uint8Array | null = null;
let tempBuffer: Uint8Array | null = null;
let processingCanvas: HTMLCanvasElement | null = null;
let history: Point[][] = [];
const HISTORY_SIZE = 5;

function ensureBuffers(size: number) {
  if (!grayscaleBuffer || grayscaleBuffer.length !== size) {
    grayscaleBuffer = new Uint8Array(size);
    blurBuffer = new Uint8Array(size);
    workBuffer = new Uint8Array(size);
    tempBuffer = new Uint8Array(size);
  }
}

export function releaseBuffers() {
  grayscaleBuffer = null;
  blurBuffer = null;
  workBuffer = null;
  tempBuffer = null;
  processingCanvas = null;
}

// --- Debug Helpers ---

function drawToDebugCanvas(pixels: Uint8Array, width: number, height: number, canvasId: string) {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
  if (!canvas) return;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const imgData = ctx.createImageData(width, height);
  for (let i = 0; i < pixels.length; i++) {
    const i4 = i << 2;
    const v = pixels[i];
    imgData.data[i4] = v;
    imgData.data[i4 + 1] = v;
    imgData.data[i4 + 2] = v;
    imgData.data[i4 + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
}

function prepareCanvas(canvas: HTMLCanvasElement, maxDim: number) {
  const width = canvas.width;
  const height = canvas.height;
  let processingWidth = width;
  let processingHeight = height;

  if (width > maxDim || height > maxDim) {
    const scale = Math.min(maxDim / width, maxDim / height);
    processingWidth = Math.floor(width * scale);
    processingHeight = Math.floor(height * scale);
  }

  if (!processingCanvas) {
    processingCanvas = document.createElement('canvas');
  }
  if (processingCanvas.width !== processingWidth || processingCanvas.height !== processingHeight) {
    processingCanvas.width = processingWidth;
    processingCanvas.height = processingHeight;
  }

  const pCtx = processingCanvas.getContext('2d', { willReadFrequently: true });
  if (pCtx) {
    pCtx.drawImage(canvas, 0, 0, processingWidth, processingHeight);
  }

  return { width, height, processingWidth, processingHeight, pCtx };
}

// --- Image Processing Kernels ---

function toGrayscale(data: Uint8ClampedArray, out: Uint8Array, size: number) {
  for (let i = 0; i < size; i++) {
    const i4 = i << 2;
    out[i] = (data[i4] * 299 + data[i4 + 1] * 587 + data[i4 + 2] * 114) / 1000;
  }
}

function contrastStretch(pixels: Uint8Array, size: number) {
  let min = 255;
  let max = 0;
  for (let i = 0; i < size; i++) {
    const v = pixels[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min;
  if (range > 40) {
    for (let i = 0; i < size; i++) {
      pixels[i] = ((pixels[i] - min) / range) * 255;
    }
  }
}

function gaussianBlur(pixels: Uint8Array, out: Uint8Array, width: number, height: number): void {
  const kernelSum = 4;
  const temp = tempBuffer!;

  // Horizontal pass
  for (let y = 0; y < height; y++) {
    const yOffset = y * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = yOffset + x;
      temp[idx] = (pixels[idx - 1] + 2 * pixels[idx] + pixels[idx + 1]) / kernelSum;
    }
  }

  // Vertical pass
  for (let y = 1; y < height - 1; y++) {
    const yOffset = y * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = yOffset + x;
      out[idx] = (temp[idx - width] + 2 * temp[idx] + temp[idx + width]) / kernelSum;
    }
  }
}

function applySobel(input: Uint8Array, out: Uint8Array, width: number, height: number): number {
  let maxEdge = 0;
  for (let y = 1; y < height - 1; y++) {
    const yOffset = y * width;
    const prevRow = yOffset - width;
    const nextRow = yOffset + width;
    for (let x = 1; x < width - 1; x++) {
      const gx =
        input[prevRow + x + 1] +
        2 * input[yOffset + x + 1] +
        input[nextRow + x + 1] -
        (input[prevRow + x - 1] + 2 * input[yOffset + x - 1] + input[nextRow + x - 1]);
      const gy =
        input[nextRow + x - 1] +
        2 * input[nextRow + x] +
        input[nextRow + x + 1] -
        (input[prevRow + x - 1] + 2 * input[prevRow + x] + input[prevRow + x + 1]);

      const mag = Math.abs(gx) + Math.abs(gy);
      out[yOffset + x] = mag > 255 ? 255 : mag;
      if (mag > maxEdge) maxEdge = mag;
    }
  }
  return maxEdge;
}

function dilate(input: Uint8Array, out: Uint8Array, width: number, height: number) {
  for (let y = 1; y < height - 1; y++) {
    const yOffset = y * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = yOffset + x;
      out[idx] = Math.max(
        input[idx],
        input[idx - width],
        input[idx + width],
        input[idx - 1],
        input[idx + 1]
      );
    }
  }
}

function erode(input: Uint8Array, out: Uint8Array, width: number, height: number) {
  for (let y = 1; y < height - 1; y++) {
    const yOffset = y * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = yOffset + x;
      out[idx] = Math.min(
        input[idx],
        input[idx - width],
        input[idx + width],
        input[idx - 1],
        input[idx + 1]
      );
    }
  }
}

// --- Heuristics & Validation ---

export function isValidDocument(points: Point[], width: number, height: number): boolean {
  const [tl, tr, br, bl] = points;
  const area = Math.abs(
    (tl.x * (tr.y - bl.y) + tr.x * (br.y - tl.y) + br.x * (bl.y - tr.y) + bl.x * (tl.y - br.y)) / 2
  );
  if (area < width * height * 0.1) return false;

  const cross = (a: Point, b: Point, c: Point) =>
    (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
  const cp = [cross(tl, tr, br), cross(tr, br, bl), cross(br, bl, tl), cross(bl, tl, tr)];
  return cp.every((v) => v > 0) || cp.every((v) => v < 0);
}

export function isStable(oldPts: Point[] | null, newPts: Point[] | null, threshold = 15): boolean {
  if (!oldPts || !newPts) return false;
  const dist =
    oldPts.reduce((acc, p, i) => acc + Math.hypot(p.x - newPts[i].x, p.y - newPts[i].y), 0) / 4;
  return dist < threshold;
}

function extractExtremePoints(
  pixels: Uint8Array,
  sw: number,
  sh: number,
  maxEdge: number
): Point[] | null {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < pixels.length; i++) {
    if (pixels[i] > 0) {
      sum += pixels[i];
      count++;
    }
  }
  const avgEdge = count > 0 ? sum / count : 0;
  const thresh = Math.max(40, Math.min(avgEdge * 0.8, maxEdge * 0.25));

  // We'll store the top N most extreme points for each corner.
  const N = 15;
  const tlPts: { s: number; x: number; y: number }[] = [];
  const brPts: { s: number; x: number; y: number }[] = [];
  const trPts: { d: number; x: number; y: number }[] = [];
  const blPts: { d: number; x: number; y: number }[] = [];

  let found = false;

  for (let y = 4; y < sh - 4; y++) {
    const yOffset = y * sw;
    for (let x = 4; x < sw - 4; x++) {
      const idx = yOffset + x;
      const val = pixels[idx];
      if (val > thresh) {
        let neighbors = 0;
        for (let ny = -1; ny <= 1; ny++) {
          for (let nx = -1; nx <= 1; nx++) {
            if (nx === 0 && ny === 0) continue;
            if (pixels[idx + ny * sw + nx] > thresh) neighbors++;
          }
        }
        if (neighbors < 3) continue;

        found = true;
        const s = x + y;
        const d = x - y;

        // Top-Left (min sum)
        if (tlPts.length < N || s < tlPts[tlPts.length - 1].s) {
          tlPts.push({ s, x, y });
          tlPts.sort((a, b) => a.s - b.s);
          if (tlPts.length > N) tlPts.pop();
        }
        // Bottom-Right (max sum)
        if (brPts.length < N || s > brPts[brPts.length - 1].s) {
          brPts.push({ s, x, y });
          brPts.sort((a, b) => b.s - a.s);
          if (brPts.length > N) brPts.pop();
        }
        // Top-Right (max diff)
        if (trPts.length < N || d > trPts[trPts.length - 1].d) {
          trPts.push({ d, x, y });
          trPts.sort((a, b) => b.d - a.d);
          if (trPts.length > N) trPts.pop();
        }
        // Bottom-Left (min diff)
        if (blPts.length < N || d < blPts[blPts.length - 1].d) {
          blPts.push({ d, x, y });
          blPts.sort((a, b) => a.d - b.d);
          if (blPts.length > N) blPts.pop();
        }
      }
    }
  }

  if (!found || tlPts.length === 0) return null;

  const avg = (pts: { x: number; y: number }[]) => {
    if (pts.length === 0) return { x: 0, y: 0 };
    const best = pts[0];
    const close = pts.filter((p) => Math.hypot(p.x - best.x, p.y - best.y) < 30);
    if (close.length === 0) return best;

    return {
      x: close.reduce((sum, p) => sum + p.x, 0) / close.length,
      y: close.reduce((sum, p) => sum + p.y, 0) / close.length,
    };
  };

  const pts = [avg(tlPts), avg(trPts), avg(brPts), avg(blPts)];
  const unique = new Set(pts.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`));
  if (unique.size < 4) return null;

  return pts;
}

function smoothCorners(newCorners: Point[] | null): Point[] | null {
  if (!newCorners) {
    history = [];
    return null;
  }
  history.push(newCorners);
  if (history.length > HISTORY_SIZE) history.shift();

  return [0, 1, 2, 3].map((i) => ({
    x: history.reduce((sum, h) => sum + h[i].x, 0) / history.length,
    y: history.reduce((sum, h) => sum + h[i].y, 0) / history.length,
  }));
}

// --- Main Detection Function ---

function detectDocumentCorners(
  canvas: HTMLCanvasElement,
  maxDim = 400,
  debug = false
): Point[] | null {
  const { width, height, processingWidth, processingHeight, pCtx } = prepareCanvas(canvas, maxDim);
  if (!pCtx) return null;

  const size = processingWidth * processingHeight;
  ensureBuffers(size);

  const imgData = pCtx.getImageData(0, 0, processingWidth, processingHeight);
  toGrayscale(imgData.data, grayscaleBuffer!, size);
  if (debug)
    drawToDebugCanvas(grayscaleBuffer!, processingWidth, processingHeight, 'debug-grayscale');

  contrastStretch(grayscaleBuffer!, size);
  gaussianBlur(grayscaleBuffer!, blurBuffer!, processingWidth, processingHeight);
  if (debug) drawToDebugCanvas(blurBuffer!, processingWidth, processingHeight, 'debug-blur');

  const maxEdge = applySobel(blurBuffer!, workBuffer!, processingWidth, processingHeight);
  if (debug) drawToDebugCanvas(workBuffer!, processingWidth, processingHeight, 'debug-edges');

  // Morphological closing with multiple passes for stronger connectivity
  dilate(workBuffer!, blurBuffer!, processingWidth, processingHeight);
  dilate(blurBuffer!, workBuffer!, processingWidth, processingHeight);
  erode(workBuffer!, blurBuffer!, processingWidth, processingHeight);
  erode(blurBuffer!, workBuffer!, processingWidth, processingHeight);
  if (debug) drawToDebugCanvas(workBuffer!, processingWidth, processingHeight, 'debug-morph');

  const corners = extractExtremePoints(workBuffer!, processingWidth, processingHeight, maxEdge);
  if (!corners) return null;

  const scaledCorners = corners.map((p) => ({
    x: (p.x / processingWidth) * width,
    y: (p.y / processingHeight) * height,
  }));

  return isValidDocument(scaledCorners, width, height) ? scaledCorners : null;
}

export function detectCornersOnImage(
  img: HTMLImageElement | HTMLCanvasElement,
  maxDim = 1200
): Point[] | null {
  const tempCanvas = document.createElement('canvas');
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  tempCanvas.width = img.width * scale;
  tempCanvas.height = img.height * scale;
  const tCtx = tempCanvas.getContext('2d')!;
  tCtx.drawImage(img, 0, 0, tempCanvas.width, tempCanvas.height);
  const detected = detectDocumentCorners(tempCanvas, maxDim);

  return (
    detected?.map((p) => ({
      x: (p.x / tempCanvas.width) * img.width,
      y: (p.y / tempCanvas.height) * img.height,
    })) || null
  );
}

export function calculateLiveDetection(
  video: HTMLVideoElement,
  detectionCanvas: HTMLCanvasElement,
  dCtx: CanvasRenderingContext2D,
  cameraOverlay: HTMLCanvasElement,
  debug = false
) {
  const vWidth = video.videoWidth;
  const vHeight = video.videoHeight;
  const cWidth = video.clientWidth;
  const cHeight = video.clientHeight;

  if (!vWidth || !vHeight || !cWidth || !cHeight) return null;

  const scale = Math.min(1, 300 / Math.max(vWidth, vHeight));
  const dWidth = Math.floor(vWidth * scale);
  const dHeight = Math.floor(vHeight * scale);

  if (detectionCanvas.width !== dWidth || detectionCanvas.height !== dHeight) {
    detectionCanvas.width = dWidth;
    detectionCanvas.height = dHeight;
  }

  dCtx.drawImage(video, 0, 0, vWidth, vHeight, 0, 0, dWidth, dHeight);
  let detected = detectDocumentCorners(detectionCanvas, 300, debug);
  detected = smoothCorners(detected);

  let lastDetectedCorners: Point[] | null = null;
  if (detected) {
    lastDetectedCorners = detected.map((p) => ({
      x: (p.x / dWidth) * vWidth,
      y: (p.y / dHeight) * vHeight,
    }));
  }

  const vAspect = vWidth / vHeight;
  const cAspect = cWidth / cHeight;

  const upscaled =
    detected?.map((p) => {
      const nx = p.x / dWidth;
      const ny = p.y / dHeight;
      if (vAspect > cAspect) {
        const visibleWidthAtVideoScale = vHeight * cAspect;
        const cropX = (vWidth - visibleWidthAtVideoScale) / 2;
        const vx = nx * vWidth;
        return {
          x: ((vx - cropX) / visibleWidthAtVideoScale) * cWidth,
          y: ny * cHeight,
        };
      } else {
        const visibleHeightAtVideoScale = vWidth / cAspect;
        const cropY = (vHeight - visibleHeightAtVideoScale) / 2;
        const vy = ny * vHeight;
        return {
          x: nx * cWidth,
          y: ((vy - cropY) / visibleHeightAtVideoScale) * cHeight,
        };
      }
    }) || null;

  if (cameraOverlay.width !== cWidth || cameraOverlay.height !== cHeight) {
    cameraOverlay.width = cWidth;
    cameraOverlay.height = cHeight;
  }

  return { lastDetectedCorners, upscaled };
}
