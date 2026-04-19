import { applyPreviewStyle } from '../utils/drawing-shared.ts';
import type { DrawTool, ToolOptionId } from './base-tool.ts';
import type { DrawToolContext, Point, SketchElement, TextElement } from '../types.ts';

export class TextTool implements DrawTool {
  readonly mode = 'text' as const;
  readonly streamsLive = false;
  readonly toolOptions: ReadonlySet<ToolOptionId> = new Set(['color', 'font']);

  private position: Point | null = null;

  onPointerDown(point: Point, _ctx: DrawToolContext): void {
    this.position = point;
  }

  onPointerMove(_point: Point, _ctx: DrawToolContext): void {
    // Text placement usually doesn't need move feedback
  }

  onPointerUp(_point: Point, _ctx: DrawToolContext): SketchElement | null {
    // For text, we usually need a modal/input before we can create the element
    return null;
  }

  commit(text: string, ctx: DrawToolContext): SketchElement | null {
    if (!this.position || !text.trim()) return null;

    return {
      id: crypto.randomUUID(),
      type: 'text',
      color: ctx.color,
      width: ctx.strokeWidth,
      text: text,
      position: { ...this.position },
      fontSize: ctx.fontSize,
      fontFamily: ctx.fontFamily,
      fontWeight: 'normal',
      fontStyle: 'normal',
    };
  }

  private text = '';

  setText(text: string): void {
    this.text = text;
  }

  drawPreview(canvasCtx: CanvasRenderingContext2D, ctx: DrawToolContext): void {
    if (!this.position) return;
    applyPreviewStyle(canvasCtx, ctx.color, ctx.strokeWidth);

    if (this.text) {
      canvasCtx.font = `${ctx.fontStyle} ${ctx.fontWeight} ${ctx.fontSize}px ${ctx.fontFamily}`;
      canvasCtx.fillStyle = ctx.color;
      canvasCtx.textBaseline = 'top';

      const lines = this.text.split('\n');
      const lineHeight = ctx.fontSize * 1.2;
      for (let i = 0; i < lines.length; i++) {
        canvasCtx.fillText(lines[i], this.position.x, this.position.y + i * lineHeight);
      }
    } else {
      // Draw cursor or placeholder – simple crosshair
      canvasCtx.beginPath();
      canvasCtx.moveTo(this.position.x - 10, this.position.y);
      canvasCtx.lineTo(this.position.x + 10, this.position.y);
      canvasCtx.moveTo(this.position.x, this.position.y - 10);
      canvasCtx.lineTo(this.position.x, this.position.y + 10);
      canvasCtx.stroke();
    }

    canvasCtx.globalAlpha = 1;
  }

  static draw(ctx: CanvasRenderingContext2D, el: TextElement): void {
    ctx.font = `${el.fontStyle} ${el.fontWeight} ${el.fontSize}px ${el.fontFamily}`;
    ctx.fillStyle = el.color;
    ctx.textBaseline = 'top';

    const lines = el.text.split('\n');
    const lineHeight = el.fontSize * 1.2;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], el.position.x, el.position.y + i * lineHeight);
    }
  }

  reset(): void {
    this.position = null;
    this.text = '';
  }
}
