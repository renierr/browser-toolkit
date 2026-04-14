import { normalizeRect } from '../drawing.ts';
import type { DrawTool } from './base-tool.ts';
import type { DrawMode, DrawToolContext, Point, SketchElement } from '../types.ts';

export class RectTool implements DrawTool {
  readonly mode: DrawMode;
  readonly streamsLive = false;
  private readonly filled: boolean;

  private start: Point | null = null;
  private end: Point | null = null;

  constructor(filled: boolean) {
    this.filled = filled;
    this.mode = filled ? 'rect-filled' : 'rect';
  }

  onPointerDown(point: Point, _ctx: DrawToolContext): void {
    this.start = point;
    this.end = point;
  }

  onPointerMove(point: Point, _ctx: DrawToolContext): void {
    this.end = point;
  }

  onPointerUp(point: Point, ctx: DrawToolContext): SketchElement | null {
    this.end = point;
    if (!this.start) return null;
    const dx = Math.abs(point.x - this.start.x);
    const dy = Math.abs(point.y - this.start.y);
    if (dx < 1 && dy < 1) return null;

    return {
      id: crypto.randomUUID(),
      type: 'rect',
      color: ctx.color,
      width: ctx.strokeWidth,
      start: { ...this.start },
      end: { ...point },
      filled: this.filled,
    };
  }

  drawPreview(canvasCtx: CanvasRenderingContext2D, ctx: DrawToolContext): void {
    if (!this.start || !this.end) return;
    const rect = normalizeRect(this.start, this.end);
    if (rect.w < 1 || rect.h < 1) return;

    canvasCtx.strokeStyle = ctx.color;
    canvasCtx.lineWidth = ctx.strokeWidth;
    canvasCtx.lineJoin = 'round';
    canvasCtx.lineCap = 'round';
    canvasCtx.globalAlpha = 0.8;

    if (this.filled) {
      canvasCtx.fillStyle = ctx.color;
      canvasCtx.fillRect(rect.x, rect.y, rect.w, rect.h);
    } else {
      canvasCtx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    }
    canvasCtx.globalAlpha = 1;
  }

  reset(): void {
    this.start = null;
    this.end = null;
  }
}
