import type { DrawTool, ToolOptionId } from './base-tool.ts';
import type { DrawToolContext, Point, SketchElement } from '../types.ts';

export class DoubleArrowTool implements DrawTool {
  readonly mode = 'double-arrow' as const;
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
      type: 'double-arrow',
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

    const headLen = Math.min(len * 0.3, Math.max(ctx.strokeWidth * 3, 10));
    const angle = Math.atan2(dy, dx);
    const spread = Math.PI / 6;

    // Shaft
    const shaftStartX = this.start.x + headLen * Math.cos(angle);
    const shaftStartY = this.start.y + headLen * Math.sin(angle);
    const shaftEndX = this.end.x - headLen * Math.cos(angle);
    const shaftEndY = this.end.y - headLen * Math.sin(angle);

    canvasCtx.beginPath();
    canvasCtx.moveTo(shaftStartX, shaftStartY);
    canvasCtx.lineTo(shaftEndX, shaftEndY);
    canvasCtx.stroke();

    const halfBase = Math.max(ctx.strokeWidth * 1.5, headLen * Math.sin(spread));
    const perpX = -Math.sin(angle);
    const perpY = Math.cos(angle);

    // Head at end
    const baseX_end = this.end.x - headLen * Math.cos(angle);
    const baseY_end = this.end.y - headLen * Math.sin(angle);
    canvasCtx.beginPath();
    canvasCtx.moveTo(this.end.x, this.end.y);
    canvasCtx.lineTo(baseX_end + perpX * halfBase, baseY_end + perpY * halfBase);
    canvasCtx.lineTo(baseX_end - perpX * halfBase, baseY_end - perpY * halfBase);
    canvasCtx.closePath();
    canvasCtx.fillStyle = ctx.color;
    canvasCtx.fill();

    // Head at start
    const baseX_start = this.start.x + headLen * Math.cos(angle);
    const baseY_start = this.start.y + headLen * Math.sin(angle);
    canvasCtx.beginPath();
    canvasCtx.moveTo(this.start.x, this.start.y);
    canvasCtx.lineTo(baseX_start + perpX * halfBase, baseY_start + perpY * halfBase);
    canvasCtx.lineTo(baseX_start - perpX * halfBase, baseY_start - perpY * halfBase);
    canvasCtx.closePath();
    canvasCtx.fill();

    canvasCtx.globalAlpha = 1;
  }

  reset(): void {
    this.start = null;
    this.end = null;
  }
}
