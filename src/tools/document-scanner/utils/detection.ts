import type { Point } from './perspective';

interface Line {
  rho: number;
  theta: number;
  score: number;
}

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

  return { processingWidth, processingHeight, pCtx };
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

export function isValidDocument(points: Point[]): boolean {
  const [tl, tr, br, bl] = points;
  const area = Math.abs(
    (tl.x * (tr.y - bl.y) + tr.x * (br.y - tl.y) + br.x * (bl.y - tr.y) + bl.x * (tl.y - br.y)) / 2
  );
  if (area < 0.05) return false; // 5% of total image area

  const cross = (a: Point, b: Point, c: Point) =>
    (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
  const cp = [cross(tl, tr, br), cross(tr, br, bl), cross(br, bl, tl), cross(bl, tl, tr)];
  return cp.every((v) => v > 0) || cp.every((v) => v < 0);
}

export function isStable(
  oldPts: Point[] | null,
  newPts: Point[] | null,
  threshold = 0.02
): boolean {
  if (!oldPts || !newPts) return false;
  const dist =
    oldPts.reduce((acc, p, i) => acc + Math.hypot(p.x - newPts[i].x, p.y - newPts[i].y), 0) / 4;
  return dist < threshold;
}

// --- Hough Line Transform ---

function houghLineTransform(
  pixels: Uint8Array,
  width: number,
  height: number,
  maxEdge: number
): Point[] | null {
  const rhoRes = 1;
  const thetaRes = Math.PI / 180;
  const maxRho = Math.hypot(width, height);
  const numThetas = Math.floor(Math.PI / thetaRes);
  const numRhos = Math.floor(maxRho / rhoRes) * 2 + 1;
  const accumulator = new Int32Array(numThetas * numRhos);

  // Precompute cos/sin
  const cosTable = new Float32Array(numThetas);
  const sinTable = new Float32Array(numThetas);
  for (let t = 0; t < numThetas; t++) {
    const theta = t * thetaRes;
    cosTable[t] = Math.cos(theta);
    sinTable[t] = Math.sin(theta);
  }

  // Thresholding
  let sum = 0,
    count = 0;
  for (let i = 0; i < pixels.length; i++) {
    if (pixels[i] > 0) {
      sum += pixels[i];
      count++;
    }
  }
  const avgEdge = count > 0 ? sum / count : 0;
  const thresh = Math.max(40, Math.min(avgEdge * 1.2, maxEdge * 0.4));

  // Fill accumulator
  const stride = 2; // Process every 2nd pixel for performance
  for (let y = 0; y < height; y += stride) {
    const offset = y * width;
    for (let x = 0; x < width; x += stride) {
      if (pixels[offset + x] > thresh) {
        // Vote for horizontal-ish and vertical-ish separately to speed up
        for (let t = 0; t < numThetas; t++) {
          const rho = x * cosTable[t] + y * sinTable[t];
          const rhoIdx = Math.floor(rho / rhoRes) + Math.floor(maxRho / rhoRes);
          accumulator[t * numRhos + rhoIdx]++;
        }
      }
    }
  }

  // Find local maxima (lines)
  const lines: Line[] = [];
  const minVotes = Math.min(width, height) * 0.2;

  for (let t = 0; t < numThetas; t++) {
    for (let r = 0; r < numRhos; r++) {
      const idx = t * numRhos + r;
      const val = accumulator[idx];
      if (val > minVotes) {
        // Simple non-maximum suppression
        let isMax = true;
        for (let dt = -1; dt <= 1; dt++) {
          for (let dr = -1; dr <= 1; dr++) {
            if (dt === 0 && dr === 0) continue;
            const nt = (t + dt + numThetas) % numThetas;
            const nr = r + dr;
            if (nr >= 0 && nr < numRhos) {
              if (accumulator[nt * numRhos + nr] > val) {
                isMax = false;
                break;
              }
            }
          }
          if (!isMax) break;
        }

        if (isMax) {
          lines.push({
            rho: (r - Math.floor(maxRho / rhoRes)) * rhoRes,
            theta: t * thetaRes,
            score: val,
          });
        }
      }
    }
  }

  if (lines.length < 4) return null;

  // Sort by score
  lines.sort((a, b) => b.score - a.score);

  // Take only the top 30 lines to speed up quad search
  const topLines = lines.slice(0, 30);

  // Filter and pick the 4 best lines forming a quad
  return findBestQuad(topLines);
}

function findBestQuad(lines: Line[]): Point[] | null {
  // Group into horizontal and vertical lines
  const horizontal: Line[] = [];
  const vertical: Line[] = [];

  for (const l of lines) {
    const deg = (l.theta * 180) / Math.PI;
    // Horizontal: near 0 or 180 deg (rho = x cos theta + y sin theta)
    // Theta ~ 0 or 180 means vertical edge (normal is horizontal)
    // Theta ~ 90 means horizontal edge (normal is vertical)
    if (deg > 45 && deg < 135) {
      horizontal.push(l);
    } else {
      vertical.push(l);
    }
  }

  if (horizontal.length < 2 || vertical.length < 2) return null;

  // Find two horizontal lines furthest apart
  horizontal.sort((a, b) => a.rho - b.rho);
  const top = horizontal[0];
  const bottom = horizontal[horizontal.length - 1];

  // Find two vertical lines furthest apart
  vertical.sort((a, b) => a.rho - b.rho);
  const left = vertical[0];
  const right = vertical[vertical.length - 1];

  // Intersections
  const tl = intersect(top, left);
  const tr = intersect(top, right);
  const br = intersect(bottom, right);
  const bl = intersect(bottom, left);

  if (!tl || !tr || !br || !bl) return null;

  return [tl, tr, br, bl];
}

function intersect(l1: Line, l2: Line): Point | null {
  const det = Math.cos(l1.theta) * Math.sin(l2.theta) - Math.sin(l1.theta) * Math.cos(l2.theta);
  if (Math.abs(det) < 0.01) return null;
  return {
    x: (Math.sin(l2.theta) * l1.rho - Math.sin(l1.theta) * l2.rho) / det,
    y: (Math.cos(l1.theta) * l2.rho - Math.cos(l2.theta) * l1.rho) / det,
  };
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
  const { processingWidth, processingHeight, pCtx } = prepareCanvas(canvas, maxDim);
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
  dilate(workBuffer!, blurBuffer!, processingWidth, processingHeight);
  erode(blurBuffer!, workBuffer!, processingWidth, processingHeight);
  erode(workBuffer!, blurBuffer!, processingWidth, processingHeight);
  erode(blurBuffer!, workBuffer!, processingWidth, processingHeight);
  if (debug) drawToDebugCanvas(workBuffer!, processingWidth, processingHeight, 'debug-morph');

  const corners = houghLineTransform(workBuffer!, processingWidth, processingHeight, maxEdge);
  if (!corners) return null;

  const normalizedCorners = corners.map((p) => ({
    x: p.x / processingWidth,
    y: p.y / processingHeight,
  }));

  return isValidDocument(normalizedCorners) ? normalizedCorners : null;
}

export function detectCornersOnImage(
  img: HTMLImageElement | HTMLCanvasElement,
  maxDim = 800
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
      x: p.x * img.width,
      y: p.y * img.height,
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

  // detected is already normalized (0-1) from detectDocumentCorners
  const lastDetectedCorners = detected;

  const vAspect = vWidth / vHeight;
  const cAspect = cWidth / cHeight;

  const upscaled =
    detected?.map((p) => {
      const nx = p.x;
      const ny = p.y;
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
