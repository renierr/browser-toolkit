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
