import type { Point } from '../types.ts';

/**
 * Natural brush simulation logic.
 * Uses Catmull-Rom splines for smoothing and distance-based velocity simulation for variable width.
 */

export const getCatmullRomControlPoints = (p0: Point, p1: Point, p2: Point, p3: Point) => {
  return {
    c1x: p1.x + (p2.x - p0.x) / 6,
    c1y: p1.y + (p2.y - p0.y) / 6,
    c2x: p2.x - (p3.x - p1.x) / 6,
    c2y: p2.y - (p3.y - p1.y) / 6,
  };
};

/**
 * Simulates width based on "velocity" (distance between points).
 * Faster movement = thinner line.
 */
export function computeSimulatedWidth(
  p1: Point,
  p2: Point,
  baseWidth: number,
  prevWidth: number
): number {
  const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);

  // Velocity simulation: scale distance to a reasonable 0-1 range
  // 0px = static, 30px+ = very fast
  const velocity = Math.min(1, dist / 25);

  // Natural feels: faster is thinner
  // use exponential decay for thickness
  const velocityFactor = Math.exp(-velocity * 1.5);

  // Sensitivity settings
  const minWidthFactor = 0.4;
  const maxWidthFactor = 1.2;
  const velocityInfluence = 0.8;

  const targetWidth = baseWidth * (1 - velocityInfluence + velocityFactor * velocityInfluence);
  const clampedWidth = Math.max(
    baseWidth * minWidthFactor,
    Math.min(baseWidth * maxWidthFactor, targetWidth)
  );

  // Smoothing: 25% new width, 75% old width
  return prevWidth * 0.75 + clampedWidth * 0.25;
}

/**
 * Adds points along straight segments to "sharpen" the Catmull-Rom splines.
 * This ensures the spline follows the straight lines closely and only curves at the corners.
 */
export function sharpenPath(points: Point[], strength: number = 0.95): Point[] {
  if (points.length < 2) return points;
  const result: Point[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];

    result.push(p1);

    // Add anchor points near the start and end of the segment
    result.push({
      x: p1.x + (p2.x - p1.x) * (1 - strength),
      y: p1.y + (p2.y - p1.y) * (1 - strength),
    });
    result.push({
      x: p1.x + (p2.x - p1.x) * strength,
      y: p1.y + (p2.y - p1.y) * strength,
    });
  }

  result.push(points[points.length - 1]);
  return result;
}

/**
 * Draws a path using Catmull-Rom splines and simulated variable width.
 */
export function drawNaturalPath(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  baseWidth: number,
  color: string
): void {
  if (points.length < 2) return;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;

  if (points.length === 2) {
    ctx.lineWidth = baseWidth;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(points[1].x, points[1].y);
    ctx.stroke();
    return;
  }

  let prevWidth = baseWidth;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const { c1x, c1y, c2x, c2y } = getCatmullRomControlPoints(p0, p1, p2, p3);

    // Simulate width for this segment
    const w = computeSimulatedWidth(p1, p2, baseWidth, prevWidth);
    prevWidth = w;

    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.bezierCurveTo(c1x, c1y, c2x, c2y, p2.x, p2.y);
    ctx.stroke();
  }
}
