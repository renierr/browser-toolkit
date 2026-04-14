import { drawLiveFreehandSegment } from '../drawing.ts';
import type { DrawTool } from './base-tool.ts';
import type { DrawToolContext, Point, SketchElement } from '../types.ts';

export class FreehandTool implements DrawTool {
  readonly mode = 'freehand' as const;
  readonly streamsLive = true;

  private points: Point[] = [];

  onPointerDown(point: Point, _ctx: DrawToolContext): void {
    this.points = [point];
  }

  onPointerMove(point: Point, _ctx: DrawToolContext): void {
    const prev = this.points[this.points.length - 1];
    if (!prev) {
      this.points.push(point);
      return;
    }
    const dx = point.x - prev.x;
    const dy = point.y - prev.y;
    if (dx * dx + dy * dy >= 0.8) {
      this.points.push(point);
    }
  }

  onPointerUp(point: Point, ctx: DrawToolContext): SketchElement | null {
    const prev = this.points[this.points.length - 1];
    if (!prev || prev.x !== point.x || prev.y !== point.y) {
      this.points.push(point);
    }
    if (this.points.length < 2) return null;

    return {
      id: crypto.randomUUID(),
      type: 'freehand',
      color: ctx.color,
      width: ctx.strokeWidth,
      points: this.points.map((p) => ({ ...p })),
    };
  }

  drawPreview(canvasCtx: CanvasRenderingContext2D, ctx: DrawToolContext): void {
    if (this.points.length === 0) return;
    canvasCtx.strokeStyle = ctx.color;
    canvasCtx.lineWidth = ctx.strokeWidth;
    canvasCtx.lineJoin = 'round';
    canvasCtx.lineCap = 'round';
    canvasCtx.globalAlpha = 0.8;
    canvasCtx.beginPath();
    canvasCtx.moveTo(this.points[0].x, this.points[0].y);
    for (let i = 1; i < this.points.length; i++) {
      canvasCtx.lineTo(this.points[i].x, this.points[i].y);
    }
    canvasCtx.stroke();
    canvasCtx.globalAlpha = 1;
  }

  drawSegment(canvasCtx: CanvasRenderingContext2D, ctx: DrawToolContext): void {
    if (this.points.length < 2) return;
    const from = this.points[this.points.length - 2];
    const to = this.points[this.points.length - 1];
    drawLiveFreehandSegment(canvasCtx, from, to, ctx.color, ctx.strokeWidth);
  }

  getPoints(): Point[] {
    return this.points;
  }

  reset(): void {
    this.points = [];
  }
}
