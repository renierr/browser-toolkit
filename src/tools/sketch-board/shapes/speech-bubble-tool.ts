import { normalizeRect } from '../drawing.ts';
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
    const rect = normalizeRect(this.start, this.end);
    if (rect.w < 1 || rect.h < 1) return;

    canvasCtx.strokeStyle = ctx.color;
    canvasCtx.lineWidth = ctx.strokeWidth;
    canvasCtx.lineJoin = 'round';
    canvasCtx.lineCap = 'round';
    canvasCtx.globalAlpha = 0.8;

    const x = rect.x;
    const y = rect.y;
    const w = rect.w;
    const h = rect.h;
    const r = Math.min(w, h) * 0.15;
    const tailSide = Math.min(w, h) * 0.2;

    canvasCtx.beginPath();
    canvasCtx.moveTo(x + r, y);
    canvasCtx.lineTo(x + w - r, y);
    canvasCtx.quadraticCurveTo(x + w, y, x + w, y + r);
    canvasCtx.lineTo(x + w, y + h - r);
    canvasCtx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    
    // Tail at bottom-left
    canvasCtx.lineTo(x + r + tailSide * 1.5, y + h);
    canvasCtx.lineTo(x + r * 0.5, y + h + tailSide);
    canvasCtx.lineTo(x + r, y + h);
    
    canvasCtx.lineTo(x + r, y + h);
    canvasCtx.quadraticCurveTo(x, y + h, x, y + h - r);
    canvasCtx.lineTo(x, y + r);
    canvasCtx.quadraticCurveTo(x, y, x + r, y);
    canvasCtx.closePath();

    if (ctx.filled) {
      canvasCtx.fillStyle = ctx.color;
      canvasCtx.fill();
    } else {
      canvasCtx.stroke();
    }
    canvasCtx.globalAlpha = 1;
  }

  reset(): void {
    this.start = null;
    this.end = null;
  }
}
