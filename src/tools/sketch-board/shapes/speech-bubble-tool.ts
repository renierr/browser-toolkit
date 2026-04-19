import { normalizeRect, applyPreviewStyle } from '../utils/drawing-shared.ts';
import { drawShakyPath } from '../utils/brush-styles.ts';
import type { DrawTool, ToolOptionId } from './base-tool.ts';
import type { BrushStyle, DrawToolContext, Point, SketchElement } from '../types.ts';

export class SpeechBubbleTool implements DrawTool {
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

  drawPreview(canvasCtx: CanvasRenderingContext2D, ctx: DrawToolContext): void {
    if (!this.start || !this.end) return;
    applyPreviewStyle(canvasCtx, ctx.color, ctx.strokeWidth);
    SpeechBubbleTool.draw(
      canvasCtx,
      this.start,
      this.end,
      ctx.fillColor ?? undefined,
      ctx.brushStyle
    );
    canvasCtx.globalAlpha = 1;
  }

  static draw(
    ctx: CanvasRenderingContext2D,
    start: Point,
    end: Point,
    fillColor?: string,
    brushStyle?: BrushStyle
  ): void {
    const rect = normalizeRect(start, end);
    if (rect.w < 1 || rect.h < 1) return;

    if (brushStyle === 'shaky') {
      const tailX = rect.x + rect.w * 0.2;
      const tailY = rect.y + rect.h;
      const points = [
        { x: rect.x, y: rect.y },
        { x: rect.x + rect.w, y: rect.y },
        { x: rect.x + rect.w, y: rect.y + rect.h * 0.8 },
        { x: rect.x + rect.w * 0.4, y: rect.y + rect.h * 0.8 },
        { x: tailX, y: tailY },
        { x: rect.x + rect.w * 0.2, y: rect.y + rect.h * 0.8 },
        { x: rect.x, y: rect.y + rect.h * 0.8 },
      ];
      drawShakyPath(ctx, points, true, fillColor);
      return;
    }

    const r = Math.min(rect.w, rect.h) * 0.2;
    const x = rect.x;
    const y = rect.y;
    const w = rect.w;
    const h = rect.h;

    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r * 2);
    ctx.quadraticCurveTo(x + w, y + h - r, x + w - r, y + h - r);
    ctx.lineTo(x + w * 0.3, y + h - r);
    ctx.lineTo(x + w * 0.15, y + h);
    ctx.lineTo(x + w * 0.15, y + h - r);
    ctx.lineTo(x + r, y + h - r);
    ctx.quadraticCurveTo(x, y + h - r, x, y + h - r * 2);
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
