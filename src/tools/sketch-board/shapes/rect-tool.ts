import { normalizeRect, applyPreviewStyle } from '../utils/drawing-shared.ts';
import { drawShakyRect } from '../utils/brush-styles.ts';
import { drawNaturalPath } from '../utils/natural-brush.ts';
import type { DrawTool, ToolOptionId } from './base-tool.ts';
import type {
  BrushStyle,
  DrawParams,
  DrawToolContext,
  Point,
  RectElement,
  SketchElement,
} from '../types.ts';

export class RectTool implements DrawTool<RectElement> {
  readonly mode = 'rect' as const;
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
      type: 'rect',
      color: ctx.color,
      fillColor: ctx.fillColor ?? undefined,
      width: ctx.strokeWidth,
      brushStyle: ctx.brushStyle,
      start: { ...this.start },
      end: { ...point },
    };
  }

  draw(params: DrawParams<RectElement>): void {
    const { canvasCtx, element, isInteracting } = params;
    RectTool.draw({
      ctx: canvasCtx,
      start: element.start,
      end: element.end,
      fillColor: element.fillColor,
      brushStyle: element.brushStyle,
      isInteracting,
    });
  }

  drawPreview(canvasCtx: CanvasRenderingContext2D, ctx: DrawToolContext): void {
    if (!this.start || !this.end) return;
    applyPreviewStyle(canvasCtx, ctx.color, ctx.strokeWidth);
    this.draw({
      canvasCtx,
      element: {
        id: 'preview',
        type: 'rect',
        color: ctx.color,
        fillColor: ctx.fillColor ?? undefined,
        width: ctx.strokeWidth,
        brushStyle: ctx.brushStyle,
        start: this.start,
        end: this.end,
      },
      isInteracting: true,
    });
    canvasCtx.globalAlpha = 1;
  }

  static draw(params: {
    ctx: CanvasRenderingContext2D;
    start: Point;
    end: Point;
    fillColor?: string;
    brushStyle?: BrushStyle;
    isInteracting?: boolean;
  }): void {
    let { ctx, start, end, fillColor, brushStyle, isInteracting } = params;
    if (isInteracting) brushStyle = 'normal';
    const rect = normalizeRect(start, end);
    if (rect.w < 1 || rect.h < 1) return;

    if (brushStyle === 'shaky') {
      drawShakyRect(ctx, rect.x, rect.y, rect.w, rect.h, fillColor);
      return;
    }

    if (brushStyle === 'natural') {
      const pts = [
        { x: rect.x, y: rect.y },
        { x: rect.x + rect.w, y: rect.y },
        { x: rect.x + rect.w, y: rect.y + rect.h },
        { x: rect.x, y: rect.y + rect.h },
        { x: rect.x, y: rect.y }, // Close
      ];
      if (fillColor && fillColor !== 'transparent') {
        ctx.save();
        ctx.fillStyle = fillColor;
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        ctx.restore();
      }
      drawNaturalPath(ctx, pts, ctx.lineWidth, ctx.strokeStyle as string);
      return;
    }

    if (fillColor && fillColor !== 'transparent') {
      ctx.fillStyle = fillColor;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    }
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  }

  reset(): void {
    this.start = null;
    this.end = null;
  }
}
