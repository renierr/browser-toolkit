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

    const strokeW = ctx.strokeWidth;
    const headLen = Math.min(len * 0.3, Math.max(strokeW * 3, 10));
    const angle = Math.atan2(dy, dx);
    const spread = Math.PI / 6;

    // Shaft — stop at base of arrowhead
    const shaftEndX = this.end.x - headLen * Math.cos(angle);
    const shaftEndY = this.end.y - headLen * Math.sin(angle);
    canvasCtx.beginPath();
    canvasCtx.moveTo(this.start.x, this.start.y);
    canvasCtx.lineTo(shaftEndX, shaftEndY);
    canvasCtx.stroke();

    // Arrowhead — width scales with stroke
    const halfBase = Math.max(strokeW * 1.5, headLen * Math.sin(spread));
    const baseX = this.end.x - headLen * Math.cos(angle);
    const baseY = this.end.y - headLen * Math.sin(angle);
    const perpX = -Math.sin(angle);
    const perpY = Math.cos(angle);

    canvasCtx.beginPath();
    canvasCtx.moveTo(this.end.x, this.end.y);
    canvasCtx.lineTo(baseX + perpX * halfBase, baseY + perpY * halfBase);
    canvasCtx.lineTo(baseX - perpX * halfBase, baseY - perpY * halfBase);
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
