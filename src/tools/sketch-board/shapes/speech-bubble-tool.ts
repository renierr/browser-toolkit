import { normalizeRect, applyPreviewStyle } from '../utils/drawing-shared.ts';
import type { DrawTool, ToolOptionId } from './base-tool.ts';
import type { DrawToolContext, Point, SketchElement } from '../types.ts';

export class SpeechBubbleTool implements DrawTool {
  readonly mode = 'speech-bubble' as const;
  readonly streamsLive = false;
  readonly toolOptions: ReadonlySet<ToolOptionId> = new Set(['color', 'fill']);

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
      width: ctx.strokeWidth,
      start: { ...this.start },
      end: { ...point },
      filled: ctx.filled,
    };
  }

  drawPreview(canvasCtx: CanvasRenderingContext2D, ctx: DrawToolContext): void {
    if (!this.start || !this.end) return;
    applyPreviewStyle(canvasCtx, ctx.color, ctx.strokeWidth);
    SpeechBubbleTool.draw(canvasCtx, this.start, this.end, ctx.filled);
    canvasCtx.globalAlpha = 1;
  }

  static draw(ctx: CanvasRenderingContext2D, start: Point, end: Point, filled?: boolean): void {
    const rect = normalizeRect(start, end);
    if (rect.w < 1 || rect.h < 1) return;
    const { x, y, w, h } = rect;
    const r = Math.min(w, h) * 0.15;
    const tailSide = Math.min(w, h) * 0.2;

    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    // Tail at bottom-left
    ctx.lineTo(x + r + tailSide * 1.5, y + h);
    ctx.lineTo(x + r * 0.5, y + h + tailSide);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();

    if (filled) {
      ctx.fillStyle = ctx.strokeStyle as string;
      ctx.fill();
    } else {
      ctx.stroke();
    }
  }

  reset(): void {
    this.start = null;
    this.end = null;
  }
}
