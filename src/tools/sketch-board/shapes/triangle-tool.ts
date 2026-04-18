import { normalizeRect, applyPreviewStyle } from '../utils/drawing-shared.ts';
import type { DrawTool, ToolOptionId } from './base-tool.ts';
import type { DrawToolContext, Point, SketchElement } from '../types.ts';

export class TriangleTool implements DrawTool {
  readonly mode = 'triangle' as const;
  readonly streamsLive = false;
  readonly toolOptions: ReadonlySet<ToolOptionId> = new Set(['color', 'fill']);

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
      type: 'triangle',
      color: ctx.color,
      width: ctx.strokeWidth,
      start: { ...this.start },
      end: { ...point },
      filled: ctx.filled,
    };
  }

  drawPreview(canvasCtx: CanvasRenderingContext2D, ctx: DrawToolContext): void {
    if (!this.start || !this.end) return;
    applyPreviewStyle(canvasCtx, ctx.color, ctx.strokeWidth);
    TriangleTool.draw(canvasCtx, this.start, this.end, ctx.filled);
    canvasCtx.globalAlpha = 1;
  }

  static draw(ctx: CanvasRenderingContext2D, start: Point, end: Point, filled?: boolean): void {
    const rect = normalizeRect(start, end);
    if (rect.w < 1 || rect.h < 1) return;
    const topX = rect.x + rect.w / 2;
    const topY = rect.y;
    const bottomLeftX = rect.x;
    const bottomLeftY = rect.y + rect.h;
    const bottomRightX = rect.x + rect.w;
    const bottomRightY = rect.y + rect.h;

    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.lineTo(bottomRightX, bottomRightY);
    ctx.lineTo(bottomLeftX, bottomLeftY);
    ctx.closePath();

    if (filled) {
      ctx.fillStyle = ctx.strokeStyle as string;
      ctx.fill();
    } else {
      ctx.stroke();
    }
  }

  reset(): void {
    this.start = null;
    this.end = null;
  }
}
