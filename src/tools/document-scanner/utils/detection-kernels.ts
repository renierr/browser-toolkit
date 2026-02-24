/**
 * Pure image-processing kernels for document detection.
 * No DOM, no Worker/SW APIs — can be imported from anywhere.
 *
 * Detection strategy (dual approach for robustness):
 *   1. Grayscale → 5×5 Gaussian blur → Canny-style edges
 *   2. Strategy A: Morphological closing → contour tracing → polygon approx
 *   3. Strategy B: Hough line transform → best quad from line intersections
 *   4. Best scored quad from either strategy wins
 *   5. Temporal smoothing with graceful miss handling
 */

export interface SimplePoint {
  x: number;
  y: number;
}

// --- Reusable Buffers ---

let grayscaleBuffer: Uint8Array | null = null;
let blurBuffer: Uint8Array | null = null;
let workBuffer: Uint8Array | null = null;
let tempBuffer: Uint8Array | null = null;
let edgeDirBuffer: Uint8Array | null = null;
let morphBuffer: Uint8Array | null = null;

export function ensureBuffers(size: number) {
  if (!grayscaleBuffer || grayscaleBuffer.length !== size) {
    grayscaleBuffer = new Uint8Array(size);
    blurBuffer = new Uint8Array(size);
    workBuffer = new Uint8Array(size);
    tempBuffer = new Uint8Array(size);
    edgeDirBuffer = new Uint8Array(size);
    morphBuffer = new Uint8Array(size);
  }
}

export function freeBuffers() {
  grayscaleBuffer = null;
  blurBuffer = null;
  workBuffer = null;
  tempBuffer = null;
  edgeDirBuffer = null;
  morphBuffer = null;
}

// --- Image Processing Kernels ---

export function toGrayscale(data: Uint8ClampedArray, out: Uint8Array, size: number) {
  for (let i = 0; i < size; i++) {
    const i4 = i << 2;
    out[i] = (data[i4] * 299 + data[i4 + 1] * 587 + data[i4 + 2] * 114) / 1000;
  }
}

/**
 * 5×5 Gaussian blur (σ ≈ 1.0), two-pass separable: [1,4,6,4,1]/16
 */
export function gaussianBlur5x5(pixels: Uint8Array, out: Uint8Array, width: number, height: number): void {
  const temp = tempBuffer!;

  for (let y = 0; y < height; y++) {
    const o = y * width;
    for (let x = 2; x < width - 2; x++) {
      const idx = o + x;
      temp[idx] = (pixels[idx - 2] + 4 * pixels[idx - 1] + 6 * pixels[idx] + 4 * pixels[idx + 1] + pixels[idx + 2]) >> 4;
    }
    temp[o] = pixels[o];
    temp[o + 1] = pixels[o + 1];
    temp[o + width - 2] = pixels[o + width - 2];
    temp[o + width - 1] = pixels[o + width - 1];
  }

  const w2 = width * 2;
  for (let y = 2; y < height - 2; y++) {
    const o = y * width;
    for (let x = 0; x < width; x++) {
      const idx = o + x;
      out[idx] = (temp[idx - w2] + 4 * temp[idx - width] + 6 * temp[idx] + 4 * temp[idx + width] + temp[idx + w2]) >> 4;
    }
  }
  for (let y = 0; y < 2; y++)
    for (let x = 0; x < width; x++) out[y * width + x] = temp[y * width + x];
  for (let y = height - 2; y < height; y++)
    for (let x = 0; x < width; x++) out[y * width + x] = temp[y * width + x];
}

/**
 * Sobel edge detection with gradient direction (quantized to 4 directions).
 */
export function applySobelWithDirection(
  input: Uint8Array, magOut: Uint8Array, dirOut: Uint8Array,
  width: number, height: number
): number {
  let maxEdge = 0;
  for (let y = 1; y < height - 1; y++) {
    const yOff = y * width;
    const prev = yOff - width;
    const next = yOff + width;
    for (let x = 1; x < width - 1; x++) {
      const gx =
        input[prev + x + 1] + 2 * input[yOff + x + 1] + input[next + x + 1] -
        (input[prev + x - 1] + 2 * input[yOff + x - 1] + input[next + x - 1]);
      const gy =
        input[next + x - 1] + 2 * input[next + x] + input[next + x + 1] -
        (input[prev + x - 1] + 2 * input[prev + x] + input[prev + x + 1]);

      const mag = Math.abs(gx) + Math.abs(gy);
      const idx = yOff + x;
      magOut[idx] = mag > 255 ? 255 : mag;
      if (mag > maxEdge) maxEdge = mag;

      const agx = Math.abs(gx);
      const agy = Math.abs(gy);
      if (agy * 1000 < 414 * agx) dirOut[idx] = 0;
      else if (agy * 1000 > 2414 * agx) dirOut[idx] = 2;
      else dirOut[idx] = ((gx > 0) === (gy > 0)) ? 1 : 3;
    }
  }
  return maxEdge;
}

function nonMaxSuppression(
  mag: Uint8Array, dir: Uint8Array, out: Uint8Array,
  width: number, height: number
) {
  out.fill(0);
  const dx = [1, 1, 0, -1];
  const dy = [0, -1, -1, -1];
  for (let y = 1; y < height - 1; y++) {
    const o = y * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = o + x;
      const m = mag[idx];
      if (m === 0) continue;
      const d = dir[idx];
      const n1 = mag[(y + dy[d]) * width + (x + dx[d])];
      const n2 = mag[(y - dy[d]) * width + (x - dx[d])];
      out[idx] = (m >= n1 && m >= n2) ? m : 0;
    }
  }
}

function hysteresisThreshold(
  nms: Uint8Array, out: Uint8Array, width: number,
  low: number, high: number
) {
  out.fill(0);
  const stack: number[] = [];
  for (let i = 0; i < nms.length; i++) {
    if (nms[i] >= high) { out[i] = 255; stack.push(i); }
  }
  const offsets = [-width - 1, -width, -width + 1, -1, 1, width - 1, width, width + 1];
  while (stack.length > 0) {
    const idx = stack.pop()!;
    for (const offset of offsets) {
      const nIdx = idx + offset;
      if (nIdx >= 0 && nIdx < nms.length && out[nIdx] === 0 && nms[nIdx] >= low) {
        out[nIdx] = 255;
        stack.push(nIdx);
      }
    }
  }
}

function dilate(input: Uint8Array, out: Uint8Array, width: number, height: number) {
  for (let y = 1; y < height - 1; y++) {
    const o = y * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = o + x;
      out[idx] = Math.max(input[idx], input[idx - width], input[idx + width], input[idx - 1], input[idx + 1]);
    }
  }
}

function erode(input: Uint8Array, out: Uint8Array, width: number, height: number) {
  for (let y = 1; y < height - 1; y++) {
    const o = y * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = o + x;
      out[idx] = Math.min(input[idx], input[idx - width], input[idx + width], input[idx - 1], input[idx + 1]);
    }
  }
}

// ==========================================================================
// Strategy A: Contour-based detection
// ==========================================================================

function findContours(
  edge: Uint8Array, width: number, height: number, minLength: number
): SimplePoint[][] {
  const visited = new Uint8Array(edge.length);
  const contours: SimplePoint[][] = [];
  const dx8 = [1, 1, 0, -1, -1, -1, 0, 1];
  const dy8 = [0, 1, 1, 1, 0, -1, -1, -1];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      if (edge[idx] === 0 || visited[idx]) continue;

      const contour: SimplePoint[] = [];
      let cx = x, cy = y, dir = 0;
      const startX = x, startY = y;
      let steps = 0;
      const maxSteps = width * height;

      do {
        contour.push({ x: cx, y: cy });
        visited[cy * width + cx] = 1;
        let found = false;
        const startDir = (dir + 5) % 8;
        for (let i = 0; i < 8; i++) {
          const d = (startDir + i) % 8;
          const nx = cx + dx8[d], ny = cy + dy8[d];
          if (nx >= 0 && nx < width && ny >= 0 && ny < height && edge[ny * width + nx] > 0) {
            cx = nx; cy = ny; dir = d; found = true; break;
          }
        }
        if (!found) break;
        steps++;
      } while ((cx !== startX || cy !== startY) && steps < maxSteps);

      if (contour.length >= minLength) contours.push(contour);
    }
  }
  return contours;
}

function douglasPeuckerIndices(
  points: SimplePoint[], start: number, end: number, epsilon: number, result: number[]
) {
  if (end - start < 2) return;
  const first = points[start], last = points[end];
  const dlx = last.x - first.x, dly = last.y - first.y;
  const lineLenSq = dlx * dlx + dly * dly;
  let maxDist = 0, maxIdx = start;

  for (let i = start + 1; i < end; i++) {
    const px = points[i].x - first.x, py = points[i].y - first.y;
    let dist: number;
    if (lineLenSq === 0) {
      dist = Math.sqrt(px * px + py * py);
    } else {
      const t = (px * dlx + py * dly) / lineLenSq;
      const tc = t < 0 ? 0 : t > 1 ? 1 : t;
      const ddx = px - tc * dlx, ddy = py - tc * dly;
      dist = Math.sqrt(ddx * ddx + ddy * ddy);
    }
    if (dist > maxDist) { maxDist = dist; maxIdx = i; }
  }
  if (maxDist > epsilon) {
    douglasPeuckerIndices(points, start, maxIdx, epsilon, result);
    result.push(maxIdx);
    douglasPeuckerIndices(points, maxIdx, end, epsilon, result);
  }
}

function approximateQuadFromOffset(
  contour: SimplePoint[], offset: number, epsilon: number, tempRotated: SimplePoint[]
): SimplePoint[] | null {
  const len = contour.length;
  for (let i = 0; i < len; i++) tempRotated[i] = contour[(i + offset) % len];

  const indices: number[] = [0];
  douglasPeuckerIndices(tempRotated, 0, len - 1, epsilon, indices);
  indices.push(len - 1);

  if (indices.length >= 4 && indices.length <= 5) {
    const result: SimplePoint[] = [];
    for (let i = 0; i < Math.min(indices.length, 4); i++) result.push(tempRotated[indices[i]]);
    return result;
  }
  return null;
}

function findBestQuadFromContours(
  contours: SimplePoint[][], imageArea: number
): { corners: SimplePoint[] | null; score: number } {
  let bestScore = -1;
  let bestCorners: SimplePoint[] | null = null;
  let tempRotated: SimplePoint[] = [];

  for (const contour of contours) {
    let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
    for (const p of contour) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const bboxArea = (maxX - minX) * (maxY - minY);
    if (bboxArea < imageArea * 0.04 || bboxArea > imageArea * 0.98) continue;

    let perimeter = 0;
    for (let i = 0; i < contour.length; i++) {
      const next = contour[(i + 1) % contour.length];
      const ddx = contour[i].x - next.x, ddy = contour[i].y - next.y;
      perimeter += Math.sqrt(ddx * ddx + ddy * ddy);
    }

    if (tempRotated.length < contour.length) tempRotated = new Array(contour.length);

    const rotations = [0, contour.length >> 2, contour.length >> 1, (contour.length * 3) >> 2];
    for (const rot of rotations) {
      for (const epsFrac of [0.015, 0.02, 0.03, 0.04, 0.05]) {
        const quad = approximateQuadFromOffset(contour, rot, perimeter * epsFrac, tempRotated);
        if (!quad) continue;
        const ordered = orderCorners(quad);
        const score = scoreQuad(ordered, imageArea);
        if (score > bestScore) { bestScore = score; bestCorners = ordered; }
      }
    }
  }
  return { corners: bestCorners, score: bestScore };
}

// ==========================================================================
// Strategy B: Hough line detection
// ==========================================================================

interface HoughLine { rho: number; theta: number; score: number; }

function houghLines(
  edge: Uint8Array, width: number, height: number
): HoughLine[] {
  const thetaRes = Math.PI / 180;
  const numThetas = 180;
  const maxRho = Math.sqrt(width * width + height * height);
  const numRhos = Math.ceil(maxRho) * 2 + 1;
  const rhoOffset = Math.ceil(maxRho);
  const accumulator = new Int32Array(numThetas * numRhos);

  const cosTable = new Float32Array(numThetas);
  const sinTable = new Float32Array(numThetas);
  for (let t = 0; t < numThetas; t++) {
    cosTable[t] = Math.cos(t * thetaRes);
    sinTable[t] = Math.sin(t * thetaRes);
  }

  // Vote
  for (let y = 0; y < height; y += 2) {
    const o = y * width;
    for (let x = 0; x < width; x += 2) {
      if (edge[o + x] === 0) continue;
      for (let t = 0; t < numThetas; t++) {
        const rho = Math.round(x * cosTable[t] + y * sinTable[t]) + rhoOffset;
        accumulator[t * numRhos + rho]++;
      }
    }
  }

  // Extract peaks with non-max suppression in 5×5 neighborhood
  const minVotes = Math.min(width, height) * 0.15;
  const lines: HoughLine[] = [];
  const nmsRadius = 3;

  for (let t = 0; t < numThetas; t++) {
    for (let r = 0; r < numRhos; r++) {
      const val = accumulator[t * numRhos + r];
      if (val < minVotes) continue;

      let isMax = true;
      for (let dt = -nmsRadius; dt <= nmsRadius && isMax; dt++) {
        for (let dr = -nmsRadius; dr <= nmsRadius; dr++) {
          if (dt === 0 && dr === 0) continue;
          const nt = (t + dt + numThetas) % numThetas;
          const nr = r + dr;
          if (nr >= 0 && nr < numRhos && accumulator[nt * numRhos + nr] > val) {
            isMax = false; break;
          }
        }
      }
      if (isMax) {
        lines.push({ rho: r - rhoOffset, theta: t * thetaRes, score: val });
      }
    }
  }

  lines.sort((a, b) => b.score - a.score);
  return lines.slice(0, 40);
}

function lineIntersect(l1: HoughLine, l2: HoughLine): SimplePoint | null {
  const det = Math.cos(l1.theta) * Math.sin(l2.theta) - Math.sin(l1.theta) * Math.cos(l2.theta);
  if (Math.abs(det) < 0.01) return null;
  return {
    x: (Math.sin(l2.theta) * l1.rho - Math.sin(l1.theta) * l2.rho) / det,
    y: (Math.cos(l1.theta) * l2.rho - Math.cos(l2.theta) * l1.rho) / det,
  };
}

/**
 * Given Hough lines, classify into horizontal/vertical groups,
 * then try all valid pairs of (horizontal, horizontal, vertical, vertical)
 * to form quads. Score each and return the best.
 */
function findBestQuadFromLines(
  lines: HoughLine[], width: number, height: number
): { corners: SimplePoint[] | null; score: number } {
  const imageArea = width * height;
  const horizontal: HoughLine[] = [];
  const vertical: HoughLine[] = [];

  for (const l of lines) {
    const deg = (l.theta * 180) / Math.PI;
    if (deg > 30 && deg < 150) horizontal.push(l);
    else vertical.push(l);
  }

  if (horizontal.length < 2 || vertical.length < 2) return { corners: null, score: -1 };

  // Merge similar lines (within rho tolerance)
  const mergeLines = (arr: HoughLine[], rhoTol: number): HoughLine[] => {
    const merged: HoughLine[] = [];
    const used = new Uint8Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      if (used[i]) continue;
      let bestLine = arr[i];
      for (let j = i + 1; j < arr.length; j++) {
        if (used[j]) continue;
        if (Math.abs(arr[i].rho - arr[j].rho) < rhoTol && Math.abs(arr[i].theta - arr[j].theta) < 0.15) {
          used[j] = 1;
          if (arr[j].score > bestLine.score) bestLine = arr[j];
        }
      }
      merged.push(bestLine);
    }
    return merged;
  };

  const minDim = Math.min(width, height);
  const hMerged = mergeLines(horizontal, minDim * 0.08);
  const vMerged = mergeLines(vertical, minDim * 0.08);

  if (hMerged.length < 2 || vMerged.length < 2) return { corners: null, score: -1 };

  let bestScore = -1;
  let bestCorners: SimplePoint[] | null = null;

  // Try pairs of horizontal lines × pairs of vertical lines
  const maxH = Math.min(hMerged.length, 6);
  const maxV = Math.min(vMerged.length, 6);

  for (let hi = 0; hi < maxH; hi++) {
    for (let hj = hi + 1; hj < maxH; hj++) {
      for (let vi = 0; vi < maxV; vi++) {
        for (let vj = vi + 1; vj < maxV; vj++) {
          const tl = lineIntersect(hMerged[hi], vMerged[vi]);
          const tr = lineIntersect(hMerged[hi], vMerged[vj]);
          const br = lineIntersect(hMerged[hj], vMerged[vj]);
          const bl = lineIntersect(hMerged[hj], vMerged[vi]);
          if (!tl || !tr || !br || !bl) continue;

          // Check all corners are within image bounds (with margin)
          const m = minDim * 0.1;
          const allInBounds = [tl, tr, br, bl].every(
            p => p.x >= -m && p.x <= width + m && p.y >= -m && p.y <= height + m
          );
          if (!allInBounds) continue;

          const ordered = orderCorners([tl, tr, br, bl]);
          const score = scoreQuad(ordered, imageArea);
          if (score > bestScore) { bestScore = score; bestCorners = ordered; }
        }
      }
    }
  }

  return { corners: bestCorners, score: bestScore };
}

// ==========================================================================
// Quad Scoring & Utilities
// ==========================================================================

function quadArea(pts: SimplePoint[]): number {
  const [a, b, c, d] = pts;
  return Math.abs(
    (a.x * (b.y - d.y) + b.x * (c.y - a.y) + c.x * (d.y - b.y) + d.x * (a.y - c.y)) / 2
  );
}

function isConvex(pts: SimplePoint[]): boolean {
  const cross = (a: SimplePoint, b: SimplePoint, c: SimplePoint) =>
    (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
  const cp = [
    cross(pts[0], pts[1], pts[2]), cross(pts[1], pts[2], pts[3]),
    cross(pts[2], pts[3], pts[0]), cross(pts[3], pts[0], pts[1]),
  ];
  return cp.every(v => v > 0) || cp.every(v => v < 0);
}

function orderCorners(pts: SimplePoint[]): SimplePoint[] {
  // Center-based ordering: compute centroid, then angle from center
  const cx = (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4;
  const cy = (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4;
  const withAngle = pts.map(p => ({ ...p, angle: Math.atan2(p.y - cy, p.x - cx) }));
  withAngle.sort((a, b) => a.angle - b.angle);
  // Now sorted CCW from right. Reorder to TL, TR, BR, BL.
  // Find top-left: the point in the top-left quadrant (smallest x+y sum)
  let tlIdx = 0;
  let minSum = Infinity;
  for (let i = 0; i < 4; i++) {
    const s = withAngle[i].x + withAngle[i].y;
    if (s < minSum) { minSum = s; tlIdx = i; }
  }
  const result: SimplePoint[] = [];
  for (let i = 0; i < 4; i++) {
    const p = withAngle[(tlIdx + i) % 4];
    result.push({ x: p.x, y: p.y });
  }
  // Should be TL, BL, BR, TR (CCW) — we want TL, TR, BR, BL (CW)
  return [result[0], result[3], result[2], result[1]];
}

function scoreQuad(pts: SimplePoint[], imageArea: number): number {
  const area = quadArea(pts);
  const areaRatio = area / imageArea;
  if (areaRatio < 0.05 || areaRatio > 0.95) return -1;
  if (!isConvex(pts)) return -1;

  const d01x = pts[1].x - pts[0].x, d01y = pts[1].y - pts[0].y;
  const d12x = pts[2].x - pts[1].x, d12y = pts[2].y - pts[1].y;
  const d23x = pts[3].x - pts[2].x, d23y = pts[3].y - pts[2].y;
  const d30x = pts[0].x - pts[3].x, d30y = pts[0].y - pts[3].y;
  const sides = [
    Math.sqrt(d01x * d01x + d01y * d01y),
    Math.sqrt(d12x * d12x + d12y * d12y),
    Math.sqrt(d23x * d23x + d23y * d23y),
    Math.sqrt(d30x * d30x + d30y * d30y),
  ];

  const minSide = Math.min(sides[0], sides[1], sides[2], sides[3]);
  const maxSide = Math.max(sides[0], sides[1], sides[2], sides[3]);
  if (minSide < 1 || maxSide / minSide > 5) return -1;

  let angleScore = 0;
  for (let i = 0; i < 4; i++) {
    const prev = pts[(i + 3) % 4], curr = pts[i], next = pts[(i + 1) % 4];
    const v1x = prev.x - curr.x, v1y = prev.y - curr.y;
    const v2x = next.x - curr.x, v2y = next.y - curr.y;
    const len1 = Math.sqrt(v1x * v1x + v1y * v1y);
    const len2 = Math.sqrt(v2x * v2x + v2y * v2y);
    if (len1 < 1 || len2 < 1) return -1;
    const cosAngle = (v1x * v2x + v1y * v2y) / (len1 * len2);
    const angle = Math.acos(Math.max(-1, Math.min(1, cosAngle))) * (180 / Math.PI);
    angleScore += 1 - Math.min(Math.abs(angle - 90) / 45, 1);
  }
  angleScore /= 4;

  const areaScore = Math.min(areaRatio / 0.3, 1);
  const topBottom = Math.min(sides[0], sides[2]) / Math.max(sides[0], sides[2]);
  const leftRight = Math.min(sides[1], sides[3]) / Math.max(sides[1], sides[3]);
  const parallelScore = (topBottom + leftRight) / 2;

  return areaScore * 0.3 + angleScore * 0.4 + parallelScore * 0.3;
}

// --- Smoothing ---

const HISTORY_SIZE = 8;
let history: SimplePoint[][] = [];
let missCount = 0;

export function smoothCorners(newCorners: SimplePoint[] | null): SimplePoint[] | null {
  if (!newCorners) {
    missCount++;
    if (missCount > 3) history = [];
    if (history.length > 0) {
      return [0, 1, 2, 3].map(i => ({
        x: history.reduce((sum, h) => sum + h[i].x, 0) / history.length,
        y: history.reduce((sum, h) => sum + h[i].y, 0) / history.length,
      }));
    }
    return null;
  }

  missCount = 0;
  history.push(newCorners);
  if (history.length > HISTORY_SIZE) history.shift();

  return [0, 1, 2, 3].map(i => ({
    x: history.reduce((sum, h) => sum + h[i].x, 0) / history.length,
    y: history.reduce((sum, h) => sum + h[i].y, 0) / history.length,
  }));
}

export function resetHistory() {
  history = [];
  missCount = 0;
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

export interface PerformanceTiming {
  grayscale: number;
  blur: number;
  sobel: number;
  nms: number;
  hysteresis: number;
  morphClose: number;
  contours: number;
  hough: number;
  total: number;
  contourCount: number;
  bestScore: number;
  winner: string;
  resolution: string;
}

export interface DetectionResult {
  corners: SimplePoint[] | null;
  debug?: DebugBuffers;
  timing?: PerformanceTiming;
}

// ==========================================================================
// Main Detection Pipeline
// ==========================================================================

export function detectDocumentCorners(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  debug = false
): DetectionResult {
  const size = width * height;
  ensureBuffers(size);

  const t: Record<string, number> = {};
  let t0 = 0;
  if (debug) t0 = performance.now();

  // 1. Grayscale
  toGrayscale(pixels, grayscaleBuffer!, size);
  if (debug) { t.grayscale = performance.now() - t0; t0 = performance.now(); }

  let debugData: DebugBuffers | undefined;
  if (debug) {
    debugData = {
      grayscale: new Uint8Array(grayscaleBuffer!),
      blur: new Uint8Array(size), edges: new Uint8Array(size), morph: new Uint8Array(size),
      width, height,
    };
  }

  // 2. 5×5 Gaussian blur
  gaussianBlur5x5(grayscaleBuffer!, blurBuffer!, width, height);
  if (debug) { t.blur = performance.now() - t0; t0 = performance.now(); }
  if (debugData) debugData.blur = new Uint8Array(blurBuffer!);

  // 3. Sobel with gradient direction
  const maxEdge = applySobelWithDirection(blurBuffer!, workBuffer!, edgeDirBuffer!, width, height);
  if (debug) { t.sobel = performance.now() - t0; t0 = performance.now(); }
  if (debugData) debugData.edges = new Uint8Array(workBuffer!);

  // 4. Non-maximum suppression (thin edges)
  nonMaxSuppression(workBuffer!, edgeDirBuffer!, tempBuffer!, width, height);
  if (debug) { t.nms = performance.now() - t0; t0 = performance.now(); }

  // 5. Hysteresis thresholding (Canny-style)
  const highThresh = Math.max(25, maxEdge * 0.12);
  const lowThresh = highThresh * 0.4;
  hysteresisThreshold(tempBuffer!, workBuffer!, width, lowThresh, highThresh);
  if (debug) { t.hysteresis = performance.now() - t0; t0 = performance.now(); }

  // Save clean Canny output for Hough (before morphological closing)
  morphBuffer!.set(workBuffer!);

  // 6. Morphological closing (dilate×2 + erode×1) to connect broken edges for contours
  dilate(workBuffer!, tempBuffer!, width, height);
  dilate(tempBuffer!, workBuffer!, width, height);
  erode(workBuffer!, tempBuffer!, width, height);
  workBuffer!.set(tempBuffer!);
  if (debug) { t.morphClose = performance.now() - t0; t0 = performance.now(); }
  if (debugData) debugData.morph = new Uint8Array(workBuffer!);

  // 7. Strategy A: Contour-based detection (on morphologically closed edges)
  const minContourLength = Math.min(width, height) * 0.2; // lowered threshold
  const contours = findContours(workBuffer!, width, height, minContourLength);
  const contourResult = findBestQuadFromContours(contours, width * height);
  if (debug) { t.contours = performance.now() - t0; t0 = performance.now(); }

  // 8. Strategy B: Hough line detection (on clean Canny edges, not morphed)
  const lines = houghLines(morphBuffer!, width, height);
  const houghResult = findBestQuadFromLines(lines, width, height);
  if (debug) { t.hough = performance.now() - t0; }

  // 9. Pick the best result from either strategy
  let bestCorners: SimplePoint[] | null;
  let bestScore: number;
  let winner: string;

  if (contourResult.score >= houghResult.score && contourResult.score >= 0.3) {
    bestCorners = contourResult.corners;
    bestScore = contourResult.score;
    winner = 'contour';
  } else if (houghResult.score >= 0.3) {
    bestCorners = houghResult.corners;
    bestScore = houghResult.score;
    winner = 'hough';
  } else {
    bestCorners = null;
    bestScore = Math.max(contourResult.score, houghResult.score);
    winner = 'none';
  }

  const timing: PerformanceTiming | undefined = debug ? {
    grayscale: t.grayscale, blur: t.blur, sobel: t.sobel, nms: t.nms,
    hysteresis: t.hysteresis, morphClose: t.morphClose, contours: t.contours,
    hough: t.hough,
    total: t.grayscale + t.blur + t.sobel + t.nms + t.hysteresis + t.morphClose + t.contours + t.hough,
    contourCount: contours.length, bestScore, winner,
    resolution: `${width}×${height}`,
  } : undefined;

  if (!bestCorners) {
    return { corners: null, debug: debugData, timing };
  }

  const normalizedCorners = bestCorners.map(p => ({
    x: p.x / width, y: p.y / height,
  }));

  return { corners: normalizedCorners, debug: debugData, timing };
}
