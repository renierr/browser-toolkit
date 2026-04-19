import type { Point } from '../types.ts';

/**
 * Hand-drawn brush style utilities.
 */

function jitter(val: number, amount: number): number {
  return val + (Math.random() - 0.5) * amount;
}

function getDistance(p1: Point, p2: Point): number {
  return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
}

/**
 * Subdivides a segment into smaller parts and jitters them.
 */
function getShakyPoints(p1: Point, p2: Point, jitterAmount: number): Point[] {
  const dist = getDistance(p1, p2);
  const segments = Math.max(2, Math.floor(dist / 10)); // One segment every 10px approx
  const points: Point[] = [p1];

  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const x = p1.x + (p2.x - p1.x) * t;
    const y = p1.y + (p2.y - p1.y) * t;
    points.push({
      x: jitter(x, jitterAmount),
      y: jitter(y, jitterAmount),
    });
  }

  points.push(p2);
  return points;
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

  const jitterAmount = Math.max(1, ctx.lineWidth * 0.5);
  
  // Create two versions of the path for a sketchy look
  const passes = 2;
  
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

  for (let p = 0; p < passes; p++) {
    ctx.beginPath();
    ctx.moveTo(jitter(points[0].x, jitterAmount), jitter(points[0].y, jitterAmount));

    for (let i = 0; i < points.length - 1; i++) {
      const pStart = points[i];
      const pEnd = points[i + 1];
      const shaky = getShakyPoints(pStart, pEnd, jitterAmount);
      
      for (let j = 1; j < shaky.length; j++) {
        ctx.lineTo(shaky[j].x, shaky[j].y);
      }
    }

    if (closed) {
      const pStart = points[points.length - 1];
      const pEnd = points[0];
      const shaky = getShakyPoints(pStart, pEnd, jitterAmount);
      for (let j = 1; j < shaky.length; j++) {
        ctx.lineTo(shaky[j].x, shaky[j].y);
      }
      ctx.closePath();
    }
    
    ctx.stroke();
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
  const segments = 32;
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push({
      x: cx + Math.cos(angle) * rx,
      y: cy + Math.sin(angle) * ry,
    });
  }
  drawShakyPath(ctx, points, true, fillColor);
}
