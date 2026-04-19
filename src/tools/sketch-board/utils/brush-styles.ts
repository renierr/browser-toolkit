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
  const segments = Math.max(2, Math.floor(dist / 10));
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
export type ShakyCache = Map<string, Path2D[]>;
const CACHE_SIZE_LIMIT = 500;

let sharedCache: ShakyCache | null = null;

/**
 * Sets the shared cache for shaky paths. 
 * This should be called from the tool's init() to manage lifetime.
 */
export function setShakyCache(cache: ShakyCache | null): void {
  sharedCache = cache;
}

function getCacheKey(points: Point[], width: number, closed: boolean): string {
  // For performance, we only use a few points and properties for the key
  if (points.length === 0) return '';
  const first = points[0];
  const last = points[points.length - 1];
  return `${width}-${closed}-${points.length}-${first.x},${first.y}-${last.x},${last.y}`;
}

/**
 * Draws a shaky path by jittering segments and drawing multiple passes.
 */
export function drawShakyPath(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  closed = false,
  fillColor?: string
): void {
  if (points.length < 2) return;

  const width = ctx.lineWidth;
  const jitterAmount = Math.max(1, width * 0.5);
  const cacheKey = getCacheKey(points, width, closed);
  
  let shakyPaths = sharedCache?.get(cacheKey);

  if (!shakyPaths) {
    // Clear cache if it gets too large
    if (sharedCache && sharedCache.size > CACHE_SIZE_LIMIT) {
      sharedCache.clear();
    }

    // Use a stable seed based on the coordinates to ensure the path is consistent
    const seed = Math.floor(points[0].x + points[0].y + points.length + width);
    const rng = new SeededRandom(seed);
    const passes = 2;
    shakyPaths = [];

    for (let p = 0; p < passes; p++) {
      const path = new Path2D();
      path.moveTo(
        points[0].x + (rng.next() - 0.5) * jitterAmount, 
        points[0].y + (rng.next() - 0.5) * jitterAmount
      );

      for (let i = 0; i < points.length - 1; i++) {
        const shaky = getShakyPoints(points[i], points[i + 1], jitterAmount, rng);
        for (let j = 1; j < shaky.length; j++) {
          path.lineTo(shaky[j].x, shaky[j].y);
        }
      }

      if (closed) {
        const shaky = getShakyPoints(points[points.length - 1], points[0], jitterAmount, rng);
        for (let j = 1; j < shaky.length; j++) {
          path.lineTo(shaky[j].x, shaky[j].y);
        }
        path.closePath();
      }
      shakyPaths.push(path);
    }
    
    if (sharedCache) {
      sharedCache.set(cacheKey, shakyPaths);
    }
  }

  // Fill first if needed
  if (fillColor && fillColor !== 'transparent') {
    ctx.save();
    ctx.fillStyle = fillColor;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    if (closed) ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Draw shaky passes
  for (const path of shakyPaths) {
    ctx.stroke(path);
  }
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
