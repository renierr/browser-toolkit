import type { Point } from '../types.ts';

type ImageGetter = (imageData: string) => HTMLImageElement;
let imageGetter: ImageGetter | null = null;

export function setImageGetter(fn: ImageGetter): void {
  imageGetter = fn;
}

export function getImageGetter(): ImageGetter | null {
  return imageGetter;
}

export function normalizeRect(
  start: Point,
  end: Point
): { x: number; y: number; w: number; h: number } {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    w: Math.abs(end.x - start.x),
    h: Math.abs(end.y - start.y),
  };
}

export function applyStrokeStyle(
  ctx: CanvasRenderingContext2D,
  color: string,
  width: number
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
}

export function applyPreviewStyle(
  ctx: CanvasRenderingContext2D,
  color: string,
  width: number
): void {
  applyStrokeStyle(ctx, color, width);
  ctx.globalAlpha = 0.8;
}

/**
 * Calculates distance from point p to line segment ab.
 */
export function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.sqrt((p.x - a.x) * (p.x - a.x) + (p.y - a.y) * (p.y - a.y));
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const px = a.x + t * dx;
  const py = a.y + t * dy;
  return Math.sqrt((p.x - px) * (p.x - px) + (p.y - py) * (p.y - py));
}

/**
 * Generates points for a rounded corner arc.
 */
export function getArcPoints(
  r: number,
  cx: number,
  cy: number,
  startAngle: number,
  endAngle: number
): Point[] {
  const pts: Point[] = [];
  const steps = 3;
  for (let i = 0; i <= steps; i++) {
    const a = startAngle + (endAngle - startAngle) * (i / steps);
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}
