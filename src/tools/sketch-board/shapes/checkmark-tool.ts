import { normalizeRect, applyPreviewStyle } from '../utils/drawing-shared.ts';
import type { DrawTool, ToolOptionId } from './base-tool.ts';
import type { DrawToolContext, Point, SketchElement } from '../types.ts';

export class CheckmarkTool implements DrawTool {
  readonly mode = 'checkmark' as const;
  readonly streamsLive = false;
  readonly toolOptions: ReadonlySet<ToolOptionId> = new Set(['color']);

  private start: Point | null = null;
  private end: Point | null = null;

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
      type: 'checkmark',
      color: ctx.color,
      width: ctx.strokeWidth,
      start: { ...this.start },
      end: { ...point },
    };
  }

  drawPreview(canvasCtx: CanvasRenderingContext2D, ctx: DrawToolContext): void {
    if (!this.start || !this.end) return;
    applyPreviewStyle(canvasCtx, ctx.color, ctx.strokeWidth);
    CheckmarkTool.draw(canvasCtx, this.start, this.end);
    canvasCtx.globalAlpha = 1;
  }

  static draw(ctx: CanvasRenderingContext2D, start: Point, end: Point): void {
    const rect = normalizeRect(start, end);
    if (rect.w < 1 || rect.h < 1) return;
    const { x, y, w, h } = rect;

    ctx.beginPath();
    ctx.moveTo(x + w * 0.1, y + h * 0.55);
    ctx.lineTo(x + w * 0.35, y + h * 0.95);
    ctx.lineTo(x + w * 0.9, y + h * 0.1);
    ctx.stroke();
  }

  reset(): void {
    this.start = null;
    this.end = null;
  }
}
