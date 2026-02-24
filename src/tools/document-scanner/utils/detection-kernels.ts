/**
 * Pure image-processing kernels for document detection.
 * No DOM, no Worker/SW APIs — can be imported from anywhere.
 *
 * Detection strategy:
 *   1. Grayscale → adaptive threshold → Canny-style edges
 *   2. Contour tracing on edge map
 *   3. Douglas-Peucker polygon approximation → keep quadrilaterals
 *   4. Score quads by area, convexity, aspect ratio
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

export function ensureBuffers(size: number) {
  if (!grayscaleBuffer || grayscaleBuffer.length !== size) {
    grayscaleBuffer = new Uint8Array(size);
    blurBuffer = new Uint8Array(size);
    workBuffer = new Uint8Array(size);
    tempBuffer = new Uint8Array(size);
    edgeDirBuffer = new Uint8Array(size);
  }
}

export function freeBuffers() {
  grayscaleBuffer = null;
  blurBuffer = null;
  workBuffer = null;
  tempBuffer = null;
  edgeDirBuffer = null;
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
 * Much stronger noise reduction than the old 3-tap blur.
 */
export function gaussianBlur5x5(pixels: Uint8Array, out: Uint8Array, width: number, height: number): void {
  const temp = tempBuffer!;

  // Horizontal pass: [1,4,6,4,1]/16
  for (let y = 0; y < height; y++) {
    const o = y * width;
    for (let x = 2; x < width - 2; x++) {
      const idx = o + x;
      temp[idx] = (
        pixels[idx - 2] + 4 * pixels[idx - 1] + 6 * pixels[idx] + 4 * pixels[idx + 1] + pixels[idx + 2]
      ) >> 4;
    }
    // Handle edges
    temp[o] = pixels[o];
    temp[o + 1] = pixels[o + 1];
    temp[o + width - 2] = pixels[o + width - 2];
    temp[o + width - 1] = pixels[o + width - 1];
  }

  // Vertical pass: [1,4,6,4,1]/16
  const w2 = width * 2;
  for (let y = 2; y < height - 2; y++) {
    const o = y * width;
    for (let x = 0; x < width; x++) {
      const idx = o + x;
      out[idx] = (
        temp[idx - w2] + 4 * temp[idx - width] + 6 * temp[idx] + 4 * temp[idx + width] + temp[idx + w2]
      ) >> 4;
    }
  }
  // Handle top/bottom edges
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < width; x++) out[y * width + x] = temp[y * width + x];
  }
  for (let y = height - 2; y < height; y++) {
    for (let x = 0; x < width; x++) out[y * width + x] = temp[y * width + x];
  }
}

/**
 * Sobel edge detection that also stores gradient direction (quantized to 4 directions).
 * Returns max edge magnitude.
 */
export function applySobelWithDirection(
  input: Uint8Array,
  magOut: Uint8Array,
  dirOut: Uint8Array,
  width: number,
  height: number
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

      // Quantize gradient direction to 0(→), 1(↗), 2(↑), 3(↖)
      // Uses |gx| vs |gy| comparison instead of atan2 (much faster).
      // tan(22.5°) ≈ 0.414, tan(67.5°) ≈ 2.414
      // If |gy| < 0.414*|gx| → horizontal (0)
      // If |gy| > 2.414*|gx| → vertical (2)
      // Else diagonal → sign determines 1 vs 3
      const agx = Math.abs(gx);
      const agy = Math.abs(gy);
      // Multiply instead of divide: agy < 0.414*agx ↔ agy*1000 < 414*agx
      if (agy * 1000 < 414 * agx) {
        dirOut[idx] = 0; // horizontal
      } else if (agy * 1000 > 2414 * agx) {
        dirOut[idx] = 2; // vertical
      } else {
        // Diagonal: same-sign = ↗(1), opposite-sign = ↖(3)
        dirOut[idx] = ((gx > 0) === (gy > 0)) ? 1 : 3;
      }
    }
  }
  return maxEdge;
}

/**
 * Non-Maximum Suppression: thin edges to 1-pixel width.
 * Only keeps pixels that are local maxima along the gradient direction.
 */
function nonMaxSuppression(
  mag: Uint8Array,
  dir: Uint8Array,
  out: Uint8Array,
  width: number,
  height: number
) {
  out.fill(0);
  // Direction offsets: 0(→), 1(↗), 2(↑), 3(↖)
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

/**
 * Hysteresis thresholding: strong edges (>high) are kept, weak edges (>low)
 * are kept only if connected to a strong edge.
 * Uses stack-based flood fill for O(n) performance.
 */
function hysteresisThreshold(
  nms: Uint8Array,
  out: Uint8Array,
  width: number,
  _height: number,
  low: number,
  high: number
) {
  out.fill(0);
  const STRONG = 255;

  // Collect strong edge pixels as seeds
  const stack: number[] = [];
  for (let i = 0; i < nms.length; i++) {
    if (nms[i] >= high) {
      out[i] = STRONG;
      stack.push(i);
    }
  }

  // Flood fill: propagate from strong edges to connected weak edges
  const neighborOffsets = [
    -width - 1, -width, -width + 1,
    -1, 1,
    width - 1, width, width + 1,
  ];

  while (stack.length > 0) {
    const idx = stack.pop()!;
    for (const offset of neighborOffsets) {
      const nIdx = idx + offset;
      if (nIdx >= 0 && nIdx < nms.length && out[nIdx] === 0 && nms[nIdx] >= low) {
        out[nIdx] = STRONG;
        stack.push(nIdx);
      }
    }
  }
}

/**
 * Dilate edges slightly to close small gaps before contour tracing.
 */
export function dilate(input: Uint8Array, out: Uint8Array, width: number, height: number) {
  for (let y = 1; y < height - 1; y++) {
    const o = y * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = o + x;
      out[idx] = Math.max(
        input[idx],
        input[idx - width], input[idx + width],
        input[idx - 1], input[idx + 1]
      );
    }
  }
}

// --- Contour Tracing ---

/**
 * Simple Moore neighborhood contour tracing.
 * Finds external contours on a binary (0/255) edge image.
 */
function findContours(
  edge: Uint8Array,
  width: number,
  height: number,
  minLength: number
): SimplePoint[][] {
  // Work on a copy so we can mark visited pixels
  const visited = new Uint8Array(edge.length);
  const contours: SimplePoint[][] = [];

  // 8-connected neighbor offsets (clockwise from right)
  const dx = [1, 1, 0, -1, -1, -1, 0, 1];
  const dy = [0, 1, 1, 1, 0, -1, -1, -1];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      if (edge[idx] === 0 || visited[idx]) continue;

      // Start a new contour
      const contour: SimplePoint[] = [];
      let cx = x, cy = y;
      let dir = 0; // start looking right

      const startX = x, startY = y;
      let steps = 0;
      const maxSteps = width * height; // safety limit

      do {
        contour.push({ x: cx, y: cy });
        visited[cy * width + cx] = 1;

        // Look for next edge pixel in Moore neighborhood
        // Start from (dir + 5) % 8 to prefer continuing along the contour
        let found = false;
        const startDir = (dir + 5) % 8;
        for (let i = 0; i < 8; i++) {
          const d = (startDir + i) % 8;
          const nx = cx + dx[d];
          const ny = cy + dy[d];
          if (nx >= 0 && nx < width && ny >= 0 && ny < height && edge[ny * width + nx] > 0) {
            cx = nx;
            cy = ny;
            dir = d;
            found = true;
            break;
          }
        }

        if (!found) break;
        steps++;
      } while ((cx !== startX || cy !== startY) && steps < maxSteps);

      if (contour.length >= minLength) {
        contours.push(contour);
      }
    }
  }

  return contours;
}

// --- Polygon Approximation ---

/**
 * Douglas-Peucker algorithm using index ranges to avoid allocations.
 * Collects the indices of kept points into `result`.
 */
function douglasPeuckerIndices(
  points: SimplePoint[],
  start: number,
  end: number,
  epsilon: number,
  result: number[]
) {
  if (end - start < 2) return;

  const first = points[start];
  const last = points[end];
  const dlx = last.x - first.x;
  const dly = last.y - first.y;
  const lineLenSq = dlx * dlx + dly * dly;

  let maxDist = 0;
  let maxIdx = start;

  for (let i = start + 1; i < end; i++) {
    const px = points[i].x - first.x;
    const py = points[i].y - first.y;
    let dist: number;
    if (lineLenSq === 0) {
      dist = Math.sqrt(px * px + py * py);
    } else {
      const t = (px * dlx + py * dly) / lineLenSq;
      const tc = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = px - tc * dlx;
      const dy = py - tc * dly;
      dist = Math.sqrt(dx * dx + dy * dy);
    }
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    douglasPeuckerIndices(points, start, maxIdx, epsilon, result);
    result.push(maxIdx);
    douglasPeuckerIndices(points, maxIdx, end, epsilon, result);
  }
}

/**
 * Approximate a contour (accessed via offset for zero-alloc rotation)
 * as a polygon using Douglas-Peucker. Returns 4-point quad or null.
 */
function approximateQuadFromOffset(
  contour: SimplePoint[],
  offset: number,
  epsilon: number,
  tempRotated: SimplePoint[]
): SimplePoint[] | null {
  const len = contour.length;

  // Build a rotated view into tempRotated (reuse array)
  for (let i = 0; i < len; i++) {
    tempRotated[i] = contour[(i + offset) % len];
  }

  // Collect simplified point indices
  const indices: number[] = [0];
  douglasPeuckerIndices(tempRotated, 0, len - 1, epsilon, indices);
  indices.push(len - 1);

  // We want exactly 4 or 5 vertices for a quadrilateral
  if (indices.length === 4 || indices.length === 5) {
    const count = Math.min(indices.length, 4);
    const result: SimplePoint[] = [];
    for (let i = 0; i < count; i++) {
      result.push(tempRotated[indices[i]]);
    }
    return result;
  }

  return null;
}

// --- Quad Scoring & Validation ---

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
    cross(pts[0], pts[1], pts[2]),
    cross(pts[1], pts[2], pts[3]),
    cross(pts[2], pts[3], pts[0]),
    cross(pts[3], pts[0], pts[1]),
  ];
  return cp.every((v) => v > 0) || cp.every((v) => v < 0);
}

/**
 * Order 4 points as: top-left, top-right, bottom-right, bottom-left.
 */
function orderCorners(pts: SimplePoint[]): SimplePoint[] {
  // Sort by y, then by x
  const sorted = [...pts].sort((a, b) => a.y - b.y || a.x - b.x);
  const top = sorted.slice(0, 2).sort((a, b) => a.x - b.x);
  const bottom = sorted.slice(2, 4).sort((a, b) => a.x - b.x);
  return [top[0], top[1], bottom[1], bottom[0]]; // TL, TR, BR, BL
}

/**
 * Score a quad candidate. Higher = better document candidate.
 */
function scoreQuad(pts: SimplePoint[], imageArea: number): number {
  const area = quadArea(pts);
  const areaRatio = area / imageArea;

  // Reject too small or too large
  if (areaRatio < 0.05 || areaRatio > 0.95) return -1;

  // Must be convex
  if (!isConvex(pts)) return -1;

  // Side lengths
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

  const minSide = Math.min(...sides);
  const maxSide = Math.max(...sides);

  // Reject very elongated shapes (aspect > 5:1)
  if (minSide < 1 || maxSide / minSide > 5) return -1;

  // Compute interior angles — documents should have angles close to 90°
  let angleScore = 0;
  for (let i = 0; i < 4; i++) {
    const prev = pts[(i + 3) % 4];
    const curr = pts[i];
    const next = pts[(i + 1) % 4];
    const v1x = prev.x - curr.x, v1y = prev.y - curr.y;
    const v2x = next.x - curr.x, v2y = next.y - curr.y;
    const len1 = Math.sqrt(v1x * v1x + v1y * v1y);
    const len2 = Math.sqrt(v2x * v2x + v2y * v2y);
    if (len1 < 1 || len2 < 1) return -1;
    const cosAngle = (v1x * v2x + v1y * v2y) / (len1 * len2);
    const angle = Math.acos(Math.max(-1, Math.min(1, cosAngle))) * (180 / Math.PI);
    // Ideal angle is 90°, penalize deviation
    angleScore += 1 - Math.min(Math.abs(angle - 90) / 45, 1);
  }
  angleScore /= 4; // 0 to 1

  // Prefer larger area (documents usually fill a significant portion)
  const areaScore = Math.min(areaRatio / 0.3, 1); // max at 30%+ of image

  // Opposite sides should be roughly parallel and similar length
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
    // Allow up to 3 consecutive misses before wiping history (grace period)
    if (missCount > 3) {
      history = [];
    }
    // If we have history, return last known good position
    if (history.length > 0) {
      return [0, 1, 2, 3].map((i) => ({
        x: history.reduce((sum, h) => sum + h[i].x, 0) / history.length,
        y: history.reduce((sum, h) => sum + h[i].y, 0) / history.length,
      }));
    }
    return null;
  }

  missCount = 0;
  history.push(newCorners);
  if (history.length > HISTORY_SIZE) history.shift();

  return [0, 1, 2, 3].map((i) => ({
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
  dilate: number;
  contours: number;
  quadSearch: number;
  total: number;
  contourCount: number;
  bestScore: number;
  resolution: string;
}

export interface DetectionResult {
  corners: SimplePoint[] | null;
  debug?: DebugBuffers;
  timing?: PerformanceTiming;
}

// --- Main Detection Pipeline ---

/**
 * Runs the full detection pipeline on raw RGBA pixel data.
 * Pure computation, no DOM access. Safe for Web Workers.
 *
 * Strategy:
 *   1. Grayscale → 5×5 Gaussian blur → Canny edge detection
 *   2. Light dilation to close small gaps
 *   3. Contour tracing → Douglas-Peucker polygon approximation
 *   4. Filter for quadrilaterals, score and pick the best
 */
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
      blur: new Uint8Array(size),
      edges: new Uint8Array(size),
      morph: new Uint8Array(size),
      width,
      height,
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
  const highThresh = Math.max(30, maxEdge * 0.15);
  const lowThresh = highThresh * 0.4;
  hysteresisThreshold(tempBuffer!, workBuffer!, width, height, lowThresh, highThresh);
  if (debug) { t.hysteresis = performance.now() - t0; t0 = performance.now(); }

  // 6. Light dilation to close small gaps
  dilate(workBuffer!, tempBuffer!, width, height);
  workBuffer!.set(tempBuffer!);
  if (debug) { t.dilate = performance.now() - t0; t0 = performance.now(); }
  if (debugData) debugData.morph = new Uint8Array(workBuffer!);

  // 7. Contour tracing
  const minContourLength = Math.min(width, height) * 0.4;
  const contours = findContours(workBuffer!, width, height, minContourLength);
  if (debug) { t.contours = performance.now() - t0; t0 = performance.now(); }

  // 8. Find best quad from contours
  const imageArea = width * height;
  let bestScore = -1;
  let bestCorners: SimplePoint[] | null = null;

  // Reusable buffer for rotated contour views
  let tempRotated: SimplePoint[] = [];

  for (const contour of contours) {
    // Early exit: bounding box area check to skip tiny/huge contours
    let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
    for (let i = 0; i < contour.length; i++) {
      const p = contour[i];
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const bboxArea = (maxX - minX) * (maxY - minY);
    if (bboxArea < imageArea * 0.04 || bboxArea > imageArea * 0.98) continue;

    // Compute perimeter once for this contour
    let perimeter = 0;
    for (let i = 0; i < contour.length; i++) {
      const next = contour[(i + 1) % contour.length];
      const dx = contour[i].x - next.x;
      const dy = contour[i].y - next.y;
      perimeter += Math.sqrt(dx * dx + dy * dy);
    }

    // Ensure temp buffer is big enough
    if (tempRotated.length < contour.length) {
      tempRotated = new Array(contour.length);
    }

    // Try multiple start-point rotations and epsilon values
    const rotations = [0, contour.length >> 2, contour.length >> 1];

    for (const rot of rotations) {
      for (const epsFrac of [0.02, 0.03, 0.04, 0.05]) {
        const epsilon = perimeter * epsFrac;
        const quad = approximateQuadFromOffset(contour, rot, epsilon, tempRotated);
        if (!quad) continue;

        const ordered = orderCorners(quad);
        const score = scoreQuad(ordered, imageArea);

        if (score > bestScore) {
          bestScore = score;
          bestCorners = ordered;
        }
      }
    }
  }

  if (debug) { t.quadSearch = performance.now() - t0; }

  const timing: PerformanceTiming | undefined = debug ? {
    grayscale: t.grayscale,
    blur: t.blur,
    sobel: t.sobel,
    nms: t.nms,
    hysteresis: t.hysteresis,
    dilate: t.dilate,
    contours: t.contours,
    quadSearch: t.quadSearch,
    total: t.grayscale + t.blur + t.sobel + t.nms + t.hysteresis + t.dilate + t.contours + t.quadSearch,
    contourCount: contours.length,
    bestScore,
    resolution: `${width}×${height}`,
  } : undefined;

  if (!bestCorners || bestScore < 0.3) {
    return { corners: null, debug: debugData, timing };
  }

  // Normalize to 0-1
  const normalizedCorners = bestCorners.map((p) => ({
    x: p.x / width,
    y: p.y / height,
  }));

  return { corners: normalizedCorners, debug: debugData, timing };
}

