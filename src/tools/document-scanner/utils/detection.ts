import type { Point } from './perspective';

let grayscaleBuffer: Uint8Array | null = null;
let blurBuffer: Uint8Array | null = null;
let workBuffer: Uint8Array | null = null;
let processingCanvas: HTMLCanvasElement | null = null;
let history: Point[][] = [];
const HISTORY_SIZE = 5;

function ensureBuffers(size: number) {
  if (!grayscaleBuffer || grayscaleBuffer.length !== size) {
    grayscaleBuffer = new Uint8Array(size);
    blurBuffer = new Uint8Array(size);
    workBuffer = new Uint8Array(size);
  }
}

export function releaseBuffers() {
  grayscaleBuffer = null;
  blurBuffer = null;
  workBuffer = null;
  processingCanvas = null;
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
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    out[i] = (r * 299 + g * 587 + b * 114) / 1000;
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
  if (range > 20) {
    for (let i = 0; i < size; i++) {
      pixels[i] = ((pixels[i] - min) / range) * 255;
    }
  }
}

function gaussianBlur(pixels: Uint8Array, out: Uint8Array, width: number, height: number): void {
  const kernel = [
    1, 4, 7, 4, 1, 4, 16, 26, 16, 4, 7, 26, 41, 26, 7, 4, 16, 26, 16, 4, 1, 4, 7, 4, 1,
  ];
  const kernelSum = 273;

  for (let y = 2; y < height - 2; y++) {
    const yOffset = y * width;
    for (let x = 2; x < width - 2; x++) {
      let sum = 0;
      for (let ky = -2; ky <= 2; ky++) {
        const kyOffset = (y + ky) * width;
        const kRowOffset = (ky + 2) * 5;
        for (let kx = -2; kx <= 2; kx++) {
          sum += pixels[kyOffset + (x + kx)] * kernel[kRowOffset + (kx + 2)];
        }
      }
      out[yOffset + x] = sum / kernelSum;
    }
  }
}

function applySobel(input: Uint8Array, out: Uint8Array, width: number, height: number): number {
  let maxEdge = 0;
  for (let y = 1; y < height - 1; y++) {
    const yOffset = y * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = yOffset + x;
      const gx =
        input[idx - width + 1] +
        2 * input[idx + 1] +
        input[idx + width + 1] -
        (input[idx - width - 1] + 2 * input[idx - 1] + input[idx + width - 1]);
      const gy =
        input[idx + width - 1] +
        2 * input[idx + width] +
        input[idx + width + 1] -
        (input[idx - width - 1] + 2 * input[idx - width] + input[idx - width + 1]);

      const mag = Math.abs(gx) + Math.abs(gy);
      out[idx] = mag > 255 ? 255 : mag;
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
  // 3. Extract Corners (Extreme Points)
  const thresh = maxEdge * 0.2;
  let tl = { x: sw, y: sh },
    tr = { x: 0, y: sh },
    br = { x: 0, y: 0 },
    bl = { x: sw, y: 0 };
  let minS = Infinity,
    maxS = -Infinity,
    minD = Infinity,
    maxD = -Infinity;
  let found = false;

  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      if (pixels[y * sw + x] > thresh) {
        found = true;
        const s = x + y,
          d = x - y;
        if (s < minS) {
          minS = s;
          tl = { x, y };
        }
        if (s > maxS) {
          maxS = s;
          br = { x, y };
        }
        if (d > maxD) {
          maxD = d;
          tr = { x, y };
        }
        if (d < minD) {
          minD = d;
          bl = { x, y };
        }
      }
    }
  }

  if (!found) return null;
  return [tl, tr, br, bl];
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

function detectDocumentCorners(canvas: HTMLCanvasElement, maxDim = 400): Point[] | null {
  const { width, height, processingWidth, processingHeight, pCtx } = prepareCanvas(canvas, maxDim);
  if (!pCtx) return null;

  const size = processingWidth * processingHeight;
  ensureBuffers(size);

  const imgData = pCtx.getImageData(0, 0, processingWidth, processingHeight);
  toGrayscale(imgData.data, grayscaleBuffer!, size);
  contrastStretch(grayscaleBuffer!, size);
  gaussianBlur(grayscaleBuffer!, blurBuffer!, processingWidth, processingHeight);
  const maxEdge = applySobel(blurBuffer!, workBuffer!, processingWidth, processingHeight);

  // Morphological closing
  dilate(workBuffer!, blurBuffer!, processingWidth, processingHeight);
  erode(blurBuffer!, workBuffer!, processingWidth, processingHeight);

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
  cameraOverlay: HTMLCanvasElement
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
  let detected = detectDocumentCorners(detectionCanvas, 300);
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
