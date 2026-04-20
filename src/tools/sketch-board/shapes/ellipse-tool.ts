import { normalizeRect, applyPreviewStyle } from '../utils/drawing-shared.ts';
import { drawShakyEllipse } from '../utils/brush-styles.ts';
import { drawNaturalPath } from '../utils/natural-brush.ts';
import type { DrawTool, ToolOptionId } from './base-tool.ts';
import type {
  BrushStyle,
  DrawParams,
  DrawToolContext,
  EllipseElement,
  Point,
  SketchElement,
} from '../types.ts';

export class EllipseTool implements DrawTool<EllipseElement> {
  readonly mode = 'ellipse' as const;
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
      type: 'ellipse',
      color: ctx.color,
      fillColor: ctx.fillColor ?? undefined,
      width: ctx.strokeWidth,
      brushStyle: ctx.brushStyle,
      start: { ...this.start },
      end: { ...point },
    };
  }

  draw(params: DrawParams<EllipseElement>): void {
    const { canvasCtx, element, isInteracting } = params;
    EllipseTool.draw({
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
        type: 'ellipse',
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

    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const rx = rect.w / 2;
    const ry = rect.h / 2;

    if (brushStyle === 'shaky') {
      drawShakyEllipse(ctx, cx, cy, rx, ry, fillColor);
      return;
    }

    if (brushStyle === 'natural') {
      const pts: Point[] = [];
      const segments = 32;
      for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        pts.push({
          x: cx + rx * Math.cos(theta),
          y: cy + ry * Math.sin(theta),
        });
      }
      if (fillColor && fillColor !== 'transparent') {
        ctx.save();
        ctx.fillStyle = fillColor;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      drawNaturalPath(ctx, pts, ctx.lineWidth, ctx.strokeStyle as string);
      return;
    }

    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);

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
