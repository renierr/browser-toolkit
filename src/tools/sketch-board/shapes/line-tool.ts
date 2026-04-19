import { applyPreviewStyle } from '../utils/drawing-shared.ts';
import { drawShakyPath } from '../utils/brush-styles.ts';
import type { DrawTool, ToolOptionId } from './base-tool.ts';
import type { BrushStyle, DrawToolContext, Point, SketchElement, SnapInfo } from '../types.ts';
import { getSnapTarget } from '../utils/snapping.ts';

export class LineTool implements DrawTool {
  readonly mode = 'line' as const;
  readonly streamsLive = false;
  readonly toolOptions: ReadonlySet<ToolOptionId> = new Set(['color', 'brush']);

  private start: Point | null = null;
  private end: Point | null = null;
  private startSnap: SnapInfo | null = null;
  private endSnap: SnapInfo | null = null;
  private lastCtx: CanvasRenderingContext2D | null = null;

  onPointerDown(point: Point, ctx: DrawToolContext): void {
    const snap = getSnapTarget(
      point,
      ctx.elements,
      new Set(),
      (this.lastCtx as any) || document.createElement('canvas').getContext('2d')
    );
    if (snap) {
      this.start = snap.point;
      this.startSnap = { elementId: snap.elementId, offsetX: snap.offsetX, offsetY: snap.offsetY };
    } else {
      this.start = point;
      this.startSnap = null;
    }
    this.end = this.start;
    this.endSnap = null;
  }

  onPointerMove(point: Point, ctx: DrawToolContext): void {
    const snap = getSnapTarget(
      point,
      ctx.elements,
      new Set(),
      (this.lastCtx as any) || document.createElement('canvas').getContext('2d')
    );
    if (snap) {
      this.end = snap.point;
      this.endSnap = { elementId: snap.elementId, offsetX: snap.offsetX, offsetY: snap.offsetY };
    } else {
      this.end = point;
      this.endSnap = null;
    }
  }

  onPointerUp(_point: Point, ctx: DrawToolContext): SketchElement | null {
    if (!this.start || !this.end) return null;
    const dx = Math.abs(this.end.x - this.start.x);
    const dy = Math.abs(this.end.y - this.start.y);
    if (dx < 1 && dy < 1) return null;

    return {
      id: crypto.randomUUID(),
      type: 'line',
      color: ctx.color,
      width: ctx.strokeWidth,
      brushStyle: ctx.brushStyle,
      start: { ...this.start },
      end: { ...this.end },
      startSnap: this.startSnap ? { ...this.startSnap } : undefined,
      endSnap: this.endSnap ? { ...this.endSnap } : undefined,
    };
  }

  drawPreview(canvasCtx: CanvasRenderingContext2D, ctx: DrawToolContext): void {
    this.lastCtx = canvasCtx;
    if (!this.start || !this.end) return;

    // Draw snap indicators
    if (this.startSnap || this.endSnap) {
      canvasCtx.save();
      canvasCtx.strokeStyle = '#2563eb';
      canvasCtx.lineWidth = 2 / ctx.viewport.scale;
      canvasCtx.setLineDash([4, 4]);
      if (this.startSnap) {
        canvasCtx.beginPath();
        canvasCtx.arc(this.start.x, this.start.y, 10 / ctx.viewport.scale, 0, Math.PI * 2);
        canvasCtx.stroke();
      }
      if (this.endSnap) {
        canvasCtx.beginPath();
        canvasCtx.arc(this.end.x, this.end.y, 10 / ctx.viewport.scale, 0, Math.PI * 2);
        canvasCtx.stroke();
      }
      canvasCtx.restore();
    }

    applyPreviewStyle(canvasCtx, ctx.color, ctx.strokeWidth);
    LineTool.draw(canvasCtx, this.start!, this.end!, ctx.brushStyle, true);
    canvasCtx.globalAlpha = 1;
  }

  static draw(
    ctx: CanvasRenderingContext2D,
    start: Point,
    end: Point,
    brushStyle?: BrushStyle,
    isInteracting?: boolean
  ): void {
    if (isInteracting) brushStyle = 'normal';
    if (brushStyle === 'shaky') {
      drawShakyPath(ctx, [start, end], false);
      return;
    }

    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }

  reset(): void {
    this.start = null;
    this.end = null;
    this.startSnap = null;
    this.endSnap = null;
  }
}
