import { normalizeRect, applyPreviewStyle } from '../utils/drawing-shared.ts';
import { drawShakyPath } from '../utils/brush-styles.ts';
import { drawNaturalPath } from '../utils/natural-brush.ts';
import type { DrawTool, ToolOptionId } from './base-tool.ts';
import type {
  BrushStyle,
  DrawParams,
  DrawToolContext,
  HexagonElement,
  Point,
  SketchElement,
} from '../types.ts';

export class HexagonTool implements DrawTool<HexagonElement> {
  readonly mode = 'hexagon' as const;
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
      type: 'hexagon',
      color: ctx.color,
      fillColor: ctx.fillColor ?? undefined,
      width: ctx.strokeWidth,
      brushStyle: ctx.brushStyle,
      start: { ...this.start },
      end: { ...point },
    };
  }

  draw(params: DrawParams<HexagonElement>): void {
    const { canvasCtx, element, isInteracting } = params;
    HexagonTool.draw({
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
        type: 'hexagon',
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

    const x = rect.x;
    const y = rect.y;
    const w = rect.w;
    const h = rect.h;

    const pts = [
      { x: x + w * 0.25, y: y },
      { x: x + w * 0.75, y: y },
      { x: x + w, y: y + h * 0.5 },
      { x: x + w * 0.75, y: y + h },
      { x: x + w * 0.25, y: y + h },
      { x: x, y: y + h * 0.5 },
    ];

    if (brushStyle === 'shaky') {
      drawShakyPath(ctx, pts, true, fillColor);
      return;
    }

    if (brushStyle === 'natural') {
      if (fillColor && fillColor !== 'transparent') {
        ctx.save();
        ctx.fillStyle = fillColor;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      drawNaturalPath(ctx, [...pts, pts[0]], ctx.lineWidth, ctx.strokeStyle as string);
      return;
    }

    ctx.beginPath();
    ctx.moveTo(x + w * 0.25, y);
    ctx.lineTo(x + w * 0.75, y);
    ctx.lineTo(x + w, y + h * 0.5);
    ctx.lineTo(x + w * 0.75, y + h);
    ctx.lineTo(x + w * 0.25, y + h);
    ctx.lineTo(x, y + h * 0.5);
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
