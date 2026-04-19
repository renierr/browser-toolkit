import { normalizeRect, applyPreviewStyle } from '../utils/drawing-shared.ts';
import { drawShakyPath } from '../utils/brush-styles.ts';
import type { DrawTool, ToolOptionId } from './base-tool.ts';
import type {
  BrushStyle,
  DrawParams,
  DrawToolContext,
  Point,
  SketchElement,
  SpeechBubbleElement,
} from '../types.ts';

export class SpeechBubbleTool implements DrawTool<SpeechBubbleElement> {
  readonly mode = 'speech-bubble' as const;
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
      type: 'speech-bubble',
      color: ctx.color,
      fillColor: ctx.fillColor ?? undefined,
      width: ctx.strokeWidth,
      brushStyle: ctx.brushStyle,
      start: { ...this.start },
      end: { ...point },
    };
  }

  draw(params: DrawParams<SpeechBubbleElement>): void {
    const { canvasCtx, element, isInteracting } = params;
    SpeechBubbleTool.draw({
      ctx: canvasCtx,
      start: element.start,
      end: element.end,
      fillColor: element.fillColor,
      brushStyle: element.brushStyle,
      tailTip: element.tailTip,
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
        type: 'speech-bubble',
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
    tailTip?: Point;
    isInteracting?: boolean;
  }): void {
    let { ctx, start, end, fillColor, brushStyle, tailTip, isInteracting } = params;
    if (isInteracting) brushStyle = 'normal';
    const rect = normalizeRect(start, end);
    if (rect.w < 1 || rect.h < 1) return;

    // Compute bubble body height (leave room for default tail)
    const bodyBottom = rect.y + rect.h * 0.8;
    const r = Math.min(rect.w, rect.h * 0.8) * 0.2;

    // Tail tip: use provided position or default
    const tip = tailTip ?? { x: rect.x + rect.w * 0.15, y: rect.y + rect.h };

    // Compute where the tail exits the body bottom edge
    // The tail root straddles around the X that is closest to the tip on the body bottom
    const rootCenterX = Math.max(rect.x + r, Math.min(rect.x + rect.w - r, tip.x));
    // The gap gets wider as the tail tip moves further from the body
    const outX = Math.max(0, rect.x - tip.x, tip.x - (rect.x + rect.w));
    const outY = Math.max(0, tip.y - bodyBottom);

    const baseTailWidth = Math.min(rect.w * 0.1, 12);
    const tailHalfWidth = Math.min(rect.w * 0.3, baseTailWidth + outY * 0.1 + outX * 0.7);
    const rootLeftX = Math.max(rect.x + r, rootCenterX - tailHalfWidth);
    const rootRightX = Math.min(rect.x + rect.w - r, rootCenterX + tailHalfWidth);

    if (brushStyle === 'shaky') {
      const points = [
        { x: rect.x, y: rect.y },
        { x: rect.x + rect.w, y: rect.y },
        { x: rect.x + rect.w, y: bodyBottom },
        { x: rootRightX, y: bodyBottom },
        tip,
        { x: rootLeftX, y: bodyBottom },
        { x: rect.x, y: bodyBottom },
      ];
      drawShakyPath(ctx, points, true, fillColor);
      return;
    }

    const x = rect.x;
    const y = rect.y;
    const w = rect.w;

    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, bodyBottom - r);
    ctx.quadraticCurveTo(x + w, bodyBottom, x + w - r, bodyBottom);
    ctx.lineTo(rootRightX, bodyBottom);
    ctx.lineTo(tip.x, tip.y);
    ctx.lineTo(rootLeftX, bodyBottom);
    ctx.lineTo(x + r, bodyBottom);
    ctx.quadraticCurveTo(x, bodyBottom, x, bodyBottom - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
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
