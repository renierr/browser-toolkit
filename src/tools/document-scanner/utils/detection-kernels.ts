/**
 * Pure image-processing kernels for document detection.
 */

export interface SimplePoint {
  x: number;
  y: number;
}

interface Line {
  rho: number;
  theta: number;
  score: number;
}

// --- Reusable Buffers ---

let grayscaleBuffer: Uint8Array | null = null;
let blurBuffer: Uint8Array | null = null;
let workBuffer: Uint8Array | null = null;
let tempBuffer: Uint8Array | null = null;

export function ensureBuffers(size: number) {
  if (!grayscaleBuffer || grayscaleBuffer.length !== size) {
    grayscaleBuffer = new Uint8Array(size);
    blurBuffer = new Uint8Array(size);
    workBuffer = new Uint8Array(size);
    tempBuffer = new Uint8Array(size);
  }
}

export function freeBuffers() {
  grayscaleBuffer = null;
  blurBuffer = null;
  workBuffer = null;
  tempBuffer = null;
}

// --- Image Processing Kernels ---

export function toGrayscale(data: Uint8ClampedArray, out: Uint8Array, size: number) {
  for (let i = 0; i < size; i++) {
    const i4 = i << 2;
    out[i] = (data[i4] * 299 + data[i4 + 1] * 587 + data[i4 + 2] * 114) / 1000;
  }
}

export function contrastStretch(pixels: Uint8Array, size: number) {
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

export function gaussianBlur(pixels: Uint8Array, out: Uint8Array, width: number, height: number): void {
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

export function applySobel(input: Uint8Array, out: Uint8Array, width: number, height: number): number {
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

export function dilate(input: Uint8Array, out: Uint8Array, width: number, height: number) {
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

export function erode(input: Uint8Array, out: Uint8Array, width: number, height: number) {
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

export function isValidDocument(points: SimplePoint[]): boolean {
  const [tl, tr, br, bl] = points;
  const area = Math.abs(
    (tl.x * (tr.y - bl.y) + tr.x * (br.y - tl.y) + br.x * (bl.y - tr.y) + bl.x * (tl.y - br.y)) / 2
  );
  if (area < 0.05) return false; // 5% of total image area

  const cross = (a: SimplePoint, b: SimplePoint, c: SimplePoint) =>
    (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
  const cp = [cross(tl, tr, br), cross(tr, br, bl), cross(br, bl, tl), cross(bl, tl, tr)];
  return cp.every((v) => v > 0) || cp.every((v) => v < 0);
}

// --- Hough Line Transform ---

function houghLineTransform(
  pixels: Uint8Array,
  width: number,
  height: number,
  maxEdge: number
): SimplePoint[] | null {
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
  const stride = 2;
  for (let y = 0; y < height; y += stride) {
    const offset = y * width;
    for (let x = 0; x < width; x += stride) {
      if (pixels[offset + x] > thresh) {
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

  lines.sort((a, b) => b.score - a.score);
  const topLines = lines.slice(0, 30);

  return findBestQuad(topLines);
}

function findBestQuad(lines: Line[]): SimplePoint[] | null {
  const horizontal: Line[] = [];
  const vertical: Line[] = [];

  for (const l of lines) {
    const deg = (l.theta * 180) / Math.PI;
    if (deg > 45 && deg < 135) {
      horizontal.push(l);
    } else {
      vertical.push(l);
    }
  }

  if (horizontal.length < 2 || vertical.length < 2) return null;

  horizontal.sort((a, b) => a.rho - b.rho);
  const top = horizontal[0];
  const bottom = horizontal[horizontal.length - 1];

  vertical.sort((a, b) => a.rho - b.rho);
  const left = vertical[0];
  const right = vertical[vertical.length - 1];

  const tl = intersect(top, left);
  const tr = intersect(top, right);
  const br = intersect(bottom, right);
  const bl = intersect(bottom, left);

  if (!tl || !tr || !br || !bl) return null;

  return [tl, tr, br, bl];
}

function intersect(l1: Line, l2: Line): SimplePoint | null {
  const det = Math.cos(l1.theta) * Math.sin(l2.theta) - Math.sin(l1.theta) * Math.cos(l2.theta);
  if (Math.abs(det) < 0.01) return null;
  return {
    x: (Math.sin(l2.theta) * l1.rho - Math.sin(l1.theta) * l2.rho) / det,
    y: (Math.cos(l1.theta) * l2.rho - Math.cos(l2.theta) * l1.rho) / det,
  };
}

// --- Smoothing ---

const HISTORY_SIZE = 5;
let history: SimplePoint[][] = [];

export function smoothCorners(newCorners: SimplePoint[] | null): SimplePoint[] | null {
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

export function resetHistory() {
  history = [];
}

// --- Debug output ---

export interface DebugBuffers {
  grayscale: Uint8Array;
  blur: Uint8Array;
  edges: Uint8Array;
  morph: Uint8Array;
  width: number;
  height: number;
}

export interface DetectionResult {
  corners: SimplePoint[] | null;
  debug?: DebugBuffers;
}

// --- Main Detection Pipeline ---

/**
 * Runs the full detection pipeline on raw RGBA pixel data.
 * Pure computation, no DOM access. Safe for Web Workers.
 *
 * When `debug` is true, intermediate buffer snapshots are returned
 * so the caller can render them to debug canvases.
 */
export function detectDocumentCorners(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  debug = false
): DetectionResult {
  const size = width * height;
  ensureBuffers(size);

  toGrayscale(pixels, grayscaleBuffer!, size);
  contrastStretch(grayscaleBuffer!, size);

  let debugData: DebugBuffers | undefined;
  if (debug) {
    // Snapshot after grayscale + contrast stretch (before blur)
    debugData = {
      grayscale: new Uint8Array(grayscaleBuffer!),
      blur: new Uint8Array(size),
      edges: new Uint8Array(size),
      morph: new Uint8Array(size),
      width,
      height,
    };
  }

  gaussianBlur(grayscaleBuffer!, blurBuffer!, width, height);
  if (debugData) debugData.blur = new Uint8Array(blurBuffer!);

  const maxEdge = applySobel(blurBuffer!, workBuffer!, width, height);
  if (debugData) debugData.edges = new Uint8Array(workBuffer!);

  // Morphological closing with multiple passes for stronger connectivity
  dilate(workBuffer!, blurBuffer!, width, height);
  dilate(blurBuffer!, workBuffer!, width, height);
  dilate(workBuffer!, blurBuffer!, width, height);
  erode(blurBuffer!, workBuffer!, width, height);
  erode(workBuffer!, blurBuffer!, width, height);
  erode(blurBuffer!, workBuffer!, width, height);
  if (debugData) debugData.morph = new Uint8Array(workBuffer!);

  const corners = houghLineTransform(workBuffer!, width, height, maxEdge);
  if (!corners) return { corners: null, debug: debugData };

  const normalizedCorners = corners.map((p) => ({
    x: p.x / width,
    y: p.y / height,
  }));

  const valid = isValidDocument(normalizedCorners) ? normalizedCorners : null;
  return { corners: valid, debug: debugData };
}

