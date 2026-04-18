import { applyPreviewStyle } from '../utils/drawing-shared.ts';
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
    applyPreviewStyle(canvasCtx, ctx.color, ctx.strokeWidth);
    DoubleArrowTool.draw(canvasCtx, this.start, this.end);
    canvasCtx.globalAlpha = 1;
  }

  static draw(ctx: CanvasRenderingContext2D, start: Point, end: Point): void {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;

    const strokeW = ctx.lineWidth;
    const headLen = Math.min(len * 0.3, Math.max(strokeW * 3, 10));
    const angle = Math.atan2(dy, dx);
    const spread = Math.PI / 6;

    // Shaft — stop at the base of both arrowheads
    const shaftStartX = start.x + headLen * Math.cos(angle);
    const shaftStartY = start.y + headLen * Math.sin(angle);
    const shaftEndX = end.x - headLen * Math.cos(angle);
    const shaftEndY = end.y - headLen * Math.sin(angle);

    ctx.beginPath();
    ctx.moveTo(shaftStartX, shaftStartY);
    ctx.lineTo(shaftEndX, shaftEndY);
    ctx.stroke();

    const halfBase = Math.max(strokeW * 1.5, headLen * Math.sin(spread));
    const perpX = -Math.sin(angle);
    const perpY = Math.cos(angle);

    // Head at end
    const baseX_end = end.x - headLen * Math.cos(angle);
    const baseY_end = end.y - headLen * Math.sin(angle);
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(baseX_end + perpX * halfBase, baseY_end + perpY * halfBase);
    ctx.lineTo(baseX_end - perpX * halfBase, baseY_end - perpY * halfBase);
    ctx.closePath();
    ctx.fillStyle = ctx.strokeStyle as string;
    ctx.fill();

    // Head at start
    const baseX_start = start.x + headLen * Math.cos(angle);
    const baseY_start = start.y + headLen * Math.sin(angle);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(baseX_start + perpX * halfBase, baseY_start + perpY * halfBase);
    ctx.lineTo(baseX_start - perpX * halfBase, baseY_start - perpY * halfBase);
    ctx.closePath();
    ctx.fill();
  }

  reset(): void {
    this.start = null;
    this.end = null;
  }
}
