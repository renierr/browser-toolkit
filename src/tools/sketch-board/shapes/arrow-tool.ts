import type { DrawTool, ToolOptionId } from './base-tool.ts';
import type { DrawToolContext, Point, SketchElement } from '../types.ts';

export class ArrowTool implements DrawTool {
  readonly mode = 'arrow' as const;
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
      type: 'arrow',
      color: ctx.color,
      width: ctx.strokeWidth,
      start: { ...this.start },
      end: { ...point },
    };
  }

  drawPreview(canvasCtx: CanvasRenderingContext2D, ctx: DrawToolContext): void {
    if (!this.start || !this.end) return;
    const dx = this.end.x - this.start.x;
    const dy = this.end.y - this.start.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;

    canvasCtx.strokeStyle = ctx.color;
    canvasCtx.lineWidth = ctx.strokeWidth;
    canvasCtx.lineJoin = 'round';
    canvasCtx.lineCap = 'round';
    canvasCtx.globalAlpha = 0.8;

    // Shaft
    canvasCtx.beginPath();
    canvasCtx.moveTo(this.start.x, this.start.y);
    canvasCtx.lineTo(this.end.x, this.end.y);
    canvasCtx.stroke();

    // Arrowhead
    const headLen = Math.min(20, len * 0.3);
    const angle = Math.atan2(dy, dx);
    const spread = Math.PI / 6;

    canvasCtx.beginPath();
    canvasCtx.moveTo(this.end.x, this.end.y);
    canvasCtx.lineTo(
      this.end.x - headLen * Math.cos(angle - spread),
      this.end.y - headLen * Math.sin(angle - spread)
    );
    canvasCtx.lineTo(
      this.end.x - headLen * Math.cos(angle + spread),
      this.end.y - headLen * Math.sin(angle + spread)
    );
    canvasCtx.closePath();
    canvasCtx.fillStyle = ctx.color;
    canvasCtx.fill();

    canvasCtx.globalAlpha = 1;
  }

  reset(): void {
    this.start = null;
    this.end = null;
  }
}
