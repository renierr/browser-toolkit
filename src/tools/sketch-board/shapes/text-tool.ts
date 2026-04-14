import type { DrawTool } from './base-tool.ts';
import type { DrawToolContext, Point, SketchElement } from '../types.ts';

export class TextTool implements DrawTool {
  readonly mode = 'text' as const;
  readonly streamsLive = false;

  private position: Point | null = null;
  private text = '';

  onPointerDown(point: Point, _ctx: DrawToolContext): void {
    this.position = point;
    this.text = '';
  }

  onPointerMove(_point: Point, _ctx: DrawToolContext): void {
    // Text tool does not respond to pointer move
  }

  onPointerUp(_point: Point, _ctx: DrawToolContext): SketchElement | null {
    // Text commit happens via finishTextInput, not pointer up
    return null;
  }

  /** Called by TextEditor when text input is confirmed */
  commit(text: string, ctx: DrawToolContext): SketchElement | null {
    if (!this.position || !text.trim()) return null;
    return {
      id: crypto.randomUUID(),
      type: 'text',
      color: ctx.color,
      width: ctx.fontSize,
      position: { ...this.position },
      text,
      fontFamily: ctx.fontFamily,
      fontSize: ctx.fontSize,
      fontWeight: ctx.fontWeight,
      fontStyle: ctx.fontStyle,
    };
  }

  drawPreview(canvasCtx: CanvasRenderingContext2D, ctx: DrawToolContext): void {
    if (!this.position) return;
    canvasCtx.globalAlpha = 0.8;

    if (this.text) {
      canvasCtx.font = `${ctx.fontStyle} ${ctx.fontWeight} ${ctx.fontSize}px ${ctx.fontFamily}`;
      canvasCtx.fillStyle = ctx.color;
      canvasCtx.textBaseline = 'top';
      canvasCtx.fillText(this.text, this.position.x, this.position.y);
    } else {
      canvasCtx.setLineDash([4, 4]);
      canvasCtx.strokeStyle = ctx.color;
      canvasCtx.lineWidth = 1;
      canvasCtx.strokeRect(this.position.x, this.position.y, 100, ctx.fontSize * 1.2);
      canvasCtx.setLineDash([]);
    }
    canvasCtx.globalAlpha = 1;
  }

  setText(value: string): void {
    this.text = value;
  }

  getPosition(): Point | null {
    return this.position;
  }

  reset(): void {
    this.position = null;
    this.text = '';
  }
}
