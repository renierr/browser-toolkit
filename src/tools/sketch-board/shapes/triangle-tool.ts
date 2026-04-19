import { normalizeRect, applyPreviewStyle } from '../utils/drawing-shared.ts';
import { drawShakyPath } from '../utils/brush-styles.ts';
import type { DrawTool, ToolOptionId } from './base-tool.ts';
import type { BrushStyle, DrawToolContext, Point, SketchElement } from '../types.ts';

export class TriangleTool implements DrawTool {
  readonly mode = 'triangle' as const;
  readonly streamsLive = false;
  readonly toolOptions: ReadonlySet<ToolOptionId> = new Set(['color', 'fill', 'brush']);

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
      fillColor: ctx.fillColor ?? undefined,
      width: ctx.strokeWidth,
      brushStyle: ctx.brushStyle,
      start: { ...this.start },
      end: { ...point },
    };
  }

  drawPreview(canvasCtx: CanvasRenderingContext2D, ctx: DrawToolContext): void {
    if (!this.start || !this.end) return;
    applyPreviewStyle(canvasCtx, ctx.color, ctx.strokeWidth);
    TriangleTool.draw(canvasCtx, this.start, this.end, ctx.fillColor ?? undefined, ctx.brushStyle, true);
    canvasCtx.globalAlpha = 1;
  }

  static draw(
    ctx: CanvasRenderingContext2D,
    start: Point,
    end: Point,
    fillColor?: string,
    brushStyle?: BrushStyle,
    isInteracting?: boolean
  ): void {
    if (isInteracting) brushStyle = 'normal';
    const rect = normalizeRect(start, end);
    if (rect.w < 1 || rect.h < 1) return;

    if (brushStyle === 'shaky') {
      const points = [
        { x: rect.x + rect.w / 2, y: rect.y },
        { x: rect.x + rect.w, y: rect.y + rect.h },
        { x: rect.x, y: rect.y + rect.h },
      ];
      drawShakyPath(ctx, points, true, fillColor);
      return;
    }

    ctx.beginPath();
    ctx.moveTo(rect.x + rect.w / 2, rect.y);
    ctx.lineTo(rect.x + rect.w, rect.y + rect.h);
    ctx.lineTo(rect.x, rect.y + rect.h);
    ctx.closePath();

    if (fillColor && fillColor !== 'transparent') {
      ctx.fillStyle = fillColor;
      ctx.fill();
    }
    ctx.stroke();
  }

  reset(): void {
    this.start = null;
    this.end = null;
  }
}
