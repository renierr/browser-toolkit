import { normalizeRect } from '../drawing.ts';
import type { DrawTool, ToolOptionId } from './base-tool.ts';
import type { DrawToolContext, Point, SketchElement } from '../types.ts';

export class HexagonTool implements DrawTool {
  readonly mode = 'hexagon' as const;
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
      type: 'hexagon',
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

    const w = rect.w;
    const h = rect.h;
    const x = rect.x;
    const y = rect.y;

    canvasCtx.beginPath();
    canvasCtx.moveTo(x + w * 0.25, y);
    canvasCtx.lineTo(x + w * 0.75, y);
    canvasCtx.lineTo(x + w, y + h * 0.5);
    canvasCtx.lineTo(x + w * 0.75, y + h);
    canvasCtx.lineTo(x + w * 0.25, y + h);
    canvasCtx.lineTo(x, y + h * 0.5);
    canvasCtx.closePath();

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
