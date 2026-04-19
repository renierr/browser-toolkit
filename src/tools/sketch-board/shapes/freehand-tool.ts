import { applyPreviewStyle } from '../utils/drawing-shared.ts';
import { drawShakyPath } from '../utils/brush-styles.ts';
import type { DrawTool, ToolOptionId } from './base-tool.ts';
import type { BrushStyle, DrawToolContext, Point, SketchElement } from '../types.ts';

export class FreehandTool implements DrawTool {
  readonly mode = 'freehand' as const;
  readonly streamsLive = true;
  readonly toolOptions: ReadonlySet<ToolOptionId> = new Set(['color', 'brush']);

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
      brushStyle: ctx.brushStyle,
      points: this.points.map((p) => ({ ...p })),
    };
  }

  drawPreview(canvasCtx: CanvasRenderingContext2D, ctx: DrawToolContext): void {
    if (this.points.length === 0) return;
    applyPreviewStyle(canvasCtx, ctx.color, ctx.strokeWidth);
    FreehandTool.draw(canvasCtx, this.points, ctx.brushStyle);
    canvasCtx.globalAlpha = 1;
  }

  static draw(ctx: CanvasRenderingContext2D, points: Point[], brushStyle?: BrushStyle): void {
    if (points.length === 0) return;

    if (brushStyle === 'shaky') {
      drawShakyPath(ctx, points, false);
      return;
    }

    if (points.length === 1) {
      const p = points[0];
      const radius = Math.max(0.5, (ctx.lineWidth as number) / 2);
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = ctx.strokeStyle as string;
      ctx.fill();
      return;
    }

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
  }

  drawSegment(canvasCtx: CanvasRenderingContext2D, ctx: DrawToolContext): void {
    if (this.points.length < 2) return;
    const from = this.points[this.points.length - 2];
    const to = this.points[this.points.length - 1];

    // Simple segment drawing for live feedback
    canvasCtx.beginPath();
    canvasCtx.strokeStyle = ctx.color;
    canvasCtx.lineWidth = ctx.strokeWidth;
    canvasCtx.lineJoin = 'round';
    canvasCtx.lineCap = 'round';
    canvasCtx.moveTo(from.x, from.y);
    canvasCtx.lineTo(to.x, to.y);
    canvasCtx.stroke();
  }

  getPoints(): Point[] {
    return this.points;
  }

  reset(): void {
    this.points = [];
  }
}
