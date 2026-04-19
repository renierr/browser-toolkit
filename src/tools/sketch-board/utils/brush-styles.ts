import type { Point } from '../types.ts';

/**
 * Hand-drawn brush style utilities.
 */

// Simple seeded random generator for stability
class SeededRandom {
  private state: number;
  constructor(seed: number) {
    this.state = seed || 1;
  }
  next(): number {
    this.state = (this.state * 16807) % 2147483647;
    return (this.state - 1) / 2147483646;
  }
}

function getDistance(p1: Point, p2: Point): number {
  return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
}

/**
 * Subdivides a segment into smaller parts and jitters them.
 */
function getShakyPoints(p1: Point, p2: Point, jitterAmount: number, rng: SeededRandom): Point[] {
  const dist = getDistance(p1, p2);
  const segments = Math.max(2, Math.floor(dist / 16)); // Slightly larger segments for smoother look
  const points: Point[] = [p1];

  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const x = p1.x + (p2.x - p1.x) * t;
    const y = p1.y + (p2.y - p1.y) * t;
    points.push({
      x: x + (rng.next() - 0.5) * jitterAmount,
      y: y + (rng.next() - 0.5) * jitterAmount,
    });
  }

  points.push(p2);
  return points;
}

// Cache type for Path2D objects to avoid re-calculation
export type PathCache = Map<string, Path2D[]>;
const CACHE_SIZE_LIMIT = 500;

let sharedPathCache: PathCache | null = null;

/**
 * Sets the shared cache for paths.
 * This should be called from the tool's init() to manage lifetime.
 */
export function setPathCache(cache: PathCache | null): void {
  sharedPathCache = cache;
}

function getCacheKey(points: Point[], width: number, closed: boolean, suffix = ''): string {
  if (points.length === 0) return '';
  const first = points[0];
  const last = points[points.length - 1];
  return `${width}-${closed}-${points.length}-${first.x},${first.y}-${last.x},${last.y}${suffix}`;
}

/**
 * Draws a standard path but uses Path2D caching to optimize complex freehand drawings.
 */
export function drawCachedPath(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  closed = false
): void {
  if (points.length < 2) return;

  const width = ctx.lineWidth;
  const cacheKey = getCacheKey(points, width, closed, '-normal');
  let paths = sharedPathCache?.get(cacheKey);

  if (!paths) {
    if (sharedPathCache && sharedPathCache.size > CACHE_SIZE_LIMIT) {
      sharedPathCache.clear();
    }

    const path = new Path2D();
    path.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      path.lineTo(points[i].x, points[i].y);
    }
    if (closed) path.closePath();

    paths = [path];
    if (sharedPathCache) {
      sharedPathCache.set(cacheKey, paths);
    }
  }

  for (const path of paths) {
    ctx.stroke(path);
  }
}

/**
 * Draws a shaky path by creating a variable-width outline and filling it.
 * This simulates true "thick and thin" line variation with smooth transitions.
 */
export function drawShakyPath(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  closed = false,
  fillColor?: string
): void {
  if (points.length < 2) return;

  // 1. Simplify points to avoid over-density (especially when drawing slowly)
  const simplified: Point[] = [points[0]];
  const minSqDist = 4 * 4; // 4px minimum distance
  for (let i = 1; i < points.length; i++) {
    const p1 = simplified[simplified.length - 1];
    const p2 = points[i];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    if (dx * dx + dy * dy >= minSqDist || i === points.length - 1) {
      simplified.push(p2);
    }
  }

  if (simplified.length < 2) return;

  const baseWidth = ctx.lineWidth;
  const jitterAmount = Math.max(1.0, 0.5 + baseWidth * 0.08);
  const cacheKey = getCacheKey(simplified, baseWidth, closed, '-shaky-outline');

  let shakyPaths = sharedPathCache?.get(cacheKey);

  if (!shakyPaths) {
    if (sharedPathCache && sharedPathCache.size > CACHE_SIZE_LIMIT) {
      sharedPathCache.clear();
    }

    const seed = Math.floor(simplified[0].x + simplified[0].y + simplified.length + baseWidth);
    const rng = new SeededRandom(seed);
    const passes = 2;
    shakyPaths = [];

    for (let p = 0; p < passes; p++) {
      const path = new Path2D();

      const pJitter = jitterAmount * (1 + p * 0.3);
      let centerPoints: Point[] = [];
      for (let i = 0; i < simplified.length - 1; i++) {
        const shaky = getShakyPoints(simplified[i], simplified[i + 1], pJitter, rng);
        if (i === 0) centerPoints.push(...shaky);
        else centerPoints.push(...shaky.slice(1));
      }
      if (closed) {
        const shaky = getShakyPoints(
          simplified[simplified.length - 1],
          simplified[0],
          pJitter,
          rng
        );
        centerPoints.push(...shaky.slice(1));
      }

      const leftPoints: Point[] = [];
      const rightPoints: Point[] = [];

      let widthMod = 0.8 + rng.next() * 0.4;

      for (let i = 0; i < centerPoints.length; i++) {
        const pPrev =
          centerPoints[i - 1] || (closed ? centerPoints[centerPoints.length - 1] : centerPoints[0]);
        const pCurr = centerPoints[i];
        const pNext = centerPoints[i + 1] || (closed ? centerPoints[0] : centerPoints[i]);

        // Calculate average normal to prevent sharp "arrow" corners
        const d1x = pCurr.x - pPrev.x;
        const d1y = pCurr.y - pPrev.y;
        const d2x = pNext.x - pCurr.x;
        const d2y = pNext.y - pCurr.y;

        const len1 = Math.sqrt(d1x * d1x + d1y * d1y) || 1;
        const len2 = Math.sqrt(d2x * d2x + d2y * d2y) || 1;

        // Normals
        const n1x = -d1y / len1;
        const n1y = d1x / len1;
        const n2x = -d2y / len2;
        const n2y = d2x / len2;

        // Average normal
        let nx = (n1x + n2x) / 2;
        let ny = (n1y + n2y) / 2;
        const nLen = Math.sqrt(nx * nx + ny * ny) || 1;
        nx /= nLen;
        ny /= nLen;

        widthMod += (rng.next() - 0.5) * 0.12;
        widthMod = Math.max(0.65, Math.min(1.1, widthMod));

        // Prevent too much thinning at points that were originally vertices
        const isVertex = i === 0 || i === centerPoints.length - 1;
        const finalWidth = isVertex ? baseWidth * 0.9 : baseWidth * widthMod;

        const halfW = finalWidth / 2;
        leftPoints.push({ x: pCurr.x + nx * halfW, y: pCurr.y + ny * halfW });
        rightPoints.push({ x: pCurr.x - nx * halfW, y: pCurr.y - ny * halfW });
      }

      if (leftPoints.length > 0) {
        path.moveTo(leftPoints[0].x, leftPoints[0].y);
        for (let i = 1; i < leftPoints.length - 1; i++) {
          const xc = (leftPoints[i].x + leftPoints[i + 1].x) / 2;
          const yc = (leftPoints[i].y + leftPoints[i + 1].y) / 2;
          path.quadraticCurveTo(leftPoints[i].x, leftPoints[i].y, xc, yc);
        }
        path.lineTo(leftPoints[leftPoints.length - 1].x, leftPoints[leftPoints.length - 1].y);
        path.lineTo(rightPoints[rightPoints.length - 1].x, rightPoints[rightPoints.length - 1].y);
        for (let i = rightPoints.length - 2; i > 0; i--) {
          const xc = (rightPoints[i].x + rightPoints[i - 1].x) / 2;
          const yc = (rightPoints[i].y + rightPoints[i - 1].y) / 2;
          path.quadraticCurveTo(rightPoints[i].x, rightPoints[i].y, xc, yc);
        }
        path.lineTo(rightPoints[0].x, rightPoints[0].y);
        path.closePath();
      }

      shakyPaths.push(path);
    }

    if (sharedPathCache) {
      sharedPathCache.set(cacheKey, shakyPaths);
    }
  }

  // Draw fill color
  if (fillColor && fillColor !== 'transparent') {
    ctx.save();
    ctx.fillStyle = fillColor;
    ctx.beginPath();
    ctx.moveTo(simplified[0].x, simplified[0].y);
    for (let i = 1; i < simplified.length; i++) {
      ctx.lineTo(simplified[i].x, simplified[i].y);
    }
    if (closed) ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.fillStyle = ctx.strokeStyle;
  const originalAlpha = ctx.globalAlpha;
  for (let i = 0; i < shakyPaths.length; i++) {
    if (i > 0) ctx.globalAlpha = originalAlpha * 0.5;
    ctx.fill(shakyPaths[i]);
  }
  ctx.restore();
}

/**
 * Draws a shaky rectangle.
 */
export function drawShakyRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fillColor?: string
): void {
  const points: Point[] = [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
  drawShakyPath(ctx, points, true, fillColor);
}

/**
 * Draws a shaky ellipse by approximating it with a jittered polyline.
 */
export function drawShakyEllipse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  fillColor?: string
): void {
  const points: Point[] = [];
  const segments = Math.max(12, Math.floor(Math.max(rx, ry) / 5)); // Responsive segments
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push({
      x: cx + Math.cos(angle) * rx,
      y: cy + Math.sin(angle) * ry,
    });
  }
  drawShakyPath(ctx, points, true, fillColor);
}
