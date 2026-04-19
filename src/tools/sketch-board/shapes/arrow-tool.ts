import { applyPreviewStyle } from '../utils/drawing-shared.ts';
import { drawShakyPath } from '../utils/brush-styles.ts';
import type { DrawTool, ToolOptionId } from './base-tool.ts';
import type { BrushStyle, DrawToolContext, Point, SketchElement } from '../types.ts';

export class ArrowTool implements DrawTool {
  readonly mode = 'arrow' as const;
  readonly streamsLive = false;
  readonly toolOptions: ReadonlySet<ToolOptionId> = new Set(['color', 'brush']);

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
      brushStyle: ctx.brushStyle,
      start: { ...this.start },
      end: { ...point },
    };
  }

  drawPreview(canvasCtx: CanvasRenderingContext2D, ctx: DrawToolContext): void {
    if (!this.start || !this.end) return;
    applyPreviewStyle(canvasCtx, ctx.color, ctx.strokeWidth);
    ArrowTool.draw(canvasCtx, this.start, this.end, ctx.brushStyle);
    canvasCtx.globalAlpha = 1;
  }

  static draw(ctx: CanvasRenderingContext2D, start: Point, end: Point, brushStyle?: BrushStyle): void {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;

    if (brushStyle === 'shaky') {
      const headLen = 15;
      const angle = Math.atan2(dy, dx);
      const points = [
        start,
        end,
        { x: end.x - headLen * Math.cos(angle - Math.PI / 6), y: end.y - headLen * Math.sin(angle - Math.PI / 6) },
        end,
        { x: end.x - headLen * Math.cos(angle + Math.PI / 6), y: end.y - headLen * Math.sin(angle + Math.PI / 6) }
      ];
      drawShakyPath(ctx, points, false);
      return;
    }

    const strokeW = ctx.lineWidth;
    const headLen = Math.min(len * 0.3, Math.max(strokeW * 3, 10));
    const angle = Math.atan2(dy, dx);
    const spread = Math.PI / 6;

    // Shaft — stop at the base of the arrowhead
    const shaftEndX = end.x - headLen * Math.cos(angle);
    const shaftEndY = end.y - headLen * Math.sin(angle);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(shaftEndX, shaftEndY);
    ctx.stroke();

    // Arrowhead — width scales with stroke
    const halfBase = Math.max(strokeW * 1.5, headLen * Math.sin(spread));
    const baseX = end.x - headLen * Math.cos(angle);
    const baseY = end.y - headLen * Math.sin(angle);
    const perpX = -Math.sin(angle);
    const perpY = Math.cos(angle);

    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(baseX + perpX * halfBase, baseY + perpY * halfBase);
    ctx.lineTo(baseX - perpX * halfBase, baseY - perpY * halfBase);
    ctx.closePath();
    ctx.fillStyle = ctx.strokeStyle as string;
    ctx.fill();
  }

  reset(): void {
    this.start = null;
    this.end = null;
  }
}
