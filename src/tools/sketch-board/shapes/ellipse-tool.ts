import { normalizeRect } from '../drawing.ts';
import type { DrawTool, ToolOptionId } from './base-tool.ts';
import type { DrawToolContext, Point, SketchElement } from '../types.ts';

export class EllipseTool implements DrawTool {
  readonly mode = 'ellipse' as const;
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
      type: 'ellipse',
      color: ctx.color,
      width: ctx.strokeWidth,
      start: { ...this.start },
      end: { ...point },
      filled: ctx.filled,
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

    canvasCtx.beginPath();
    canvasCtx.ellipse(
      rect.x + rect.w / 2,
      rect.y + rect.h / 2,
      rect.w / 2,
      rect.h / 2,
      0,
      0,
      Math.PI * 2
    );

    if (ctx.filled) {
      canvasCtx.fillStyle = ctx.color;
      canvasCtx.fill();
    } else {
      canvasCtx.stroke();
    }
    canvasCtx.globalAlpha = 1;
  }

  reset(): void {
    this.start = null;
    this.end = null;
  }
}
