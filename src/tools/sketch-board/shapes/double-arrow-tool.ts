import { applyPreviewStyle } from '../utils/drawing-shared.ts';
import { drawShakyPath } from '../utils/brush-styles.ts';
import { drawNaturalPath } from '../utils/natural-brush.ts';
import type { DrawTool, ToolOptionId } from './base-tool.ts';
import type {
  BrushStyle,
  DoubleArrowElement,
  DrawParams,
  DrawToolContext,
  Point,
  SketchElement,
  SnapInfo,
} from '../types.ts';
import { getSnapTarget } from '../utils/snapping.ts';

export class DoubleArrowTool implements DrawTool<DoubleArrowElement> {
  readonly mode = 'double-arrow' as const;
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
      type: 'double-arrow',
      color: ctx.color,
      width: ctx.strokeWidth,
      brushStyle: ctx.brushStyle,
      start: { ...this.start },
      end: { ...this.end },
      startSnap: this.startSnap ? { ...this.startSnap } : undefined,
      endSnap: this.endSnap ? { ...this.endSnap } : undefined,
    };
  }

  draw(params: DrawParams<DoubleArrowElement>): void {
    const { canvasCtx, element, isInteracting } = params;
    DoubleArrowTool.draw({
      ctx: canvasCtx,
      start: element.start,
      end: element.end,
      brushStyle: element.brushStyle,
      isInteracting,
    });
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
    this.draw({
      canvasCtx,
      element: {
        id: 'preview',
        type: 'double-arrow',
        color: ctx.color,
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
    brushStyle?: BrushStyle;
    isInteracting?: boolean;
  }): void {
    let { ctx, start, end, brushStyle, isInteracting } = params;
    if (isInteracting) brushStyle = 'normal';
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;

    const hLen = 15;
    const ang = Math.atan2(dy, dx);
    const ptsStart = [
      {
        x: start.x + hLen * Math.cos(ang - Math.PI / 6),
        y: start.y + hLen * Math.sin(ang - Math.PI / 6),
      },
      start,
      {
        x: start.x + hLen * Math.cos(ang + Math.PI / 6),
        y: start.y + hLen * Math.sin(ang + Math.PI / 6),
      },
    ];
    const ptsLine = [start, end];
    const ptsEnd = [
      {
        x: end.x - hLen * Math.cos(ang - Math.PI / 6),
        y: end.y - hLen * Math.sin(ang - Math.PI / 6),
      },
      end,
      {
        x: end.x - hLen * Math.cos(ang + Math.PI / 6),
        y: end.y - hLen * Math.sin(ang + Math.PI / 6),
      },
    ];

    if (brushStyle === 'shaky') {
      drawShakyPath(ctx, ptsStart, false);
      drawShakyPath(ctx, ptsLine, false);
      drawShakyPath(ctx, ptsEnd, false);
      return;
    }

    if (brushStyle === 'natural') {
      drawNaturalPath(ctx, ptsStart, ctx.lineWidth, ctx.strokeStyle as string);
      drawNaturalPath(ctx, ptsLine, ctx.lineWidth, ctx.strokeStyle as string);
      drawNaturalPath(ctx, ptsEnd, ctx.lineWidth, ctx.strokeStyle as string);
      return;
    }

    const strokeW = ctx.lineWidth;
    const strokeHeadLen = Math.min(len * 0.3, Math.max(strokeW * 3, 10));
    const strokeAngle = Math.atan2(dy, dx);
    const spread = Math.PI / 6;

    // Shaft — stop at the base of both arrowheads
    const shaftStartX = start.x + strokeHeadLen * Math.cos(strokeAngle);
    const shaftStartY = start.y + strokeHeadLen * Math.sin(strokeAngle);
    const shaftEndX = end.x - strokeHeadLen * Math.cos(strokeAngle);
    const shaftEndY = end.y - strokeHeadLen * Math.sin(strokeAngle);

    ctx.beginPath();
    ctx.moveTo(shaftStartX, shaftStartY);
    ctx.lineTo(shaftEndX, shaftEndY);
    ctx.stroke();

    const halfBase = Math.max(strokeW * 1.5, strokeHeadLen * Math.sin(spread));
    const perpX = -Math.sin(strokeAngle);
    const perpY = Math.cos(strokeAngle);

    // Head at end
    const baseX_end = end.x - strokeHeadLen * Math.cos(strokeAngle);
    const baseY_end = end.y - strokeHeadLen * Math.sin(strokeAngle);
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(baseX_end + perpX * halfBase, baseY_end + perpY * halfBase);
    ctx.lineTo(baseX_end - perpX * halfBase, baseY_end - perpY * halfBase);
    ctx.closePath();
    ctx.fillStyle = ctx.strokeStyle as string;
    ctx.fill();

    // Head at start
    const baseX_start = start.x + strokeHeadLen * Math.cos(strokeAngle);
    const baseY_start = start.y + strokeHeadLen * Math.sin(strokeAngle);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(baseX_start + perpX * halfBase, baseY_start + perpY * halfBase);
    ctx.lineTo(baseX_start - perpX * halfBase, baseY_start - perpY * halfBase);
    ctx.closePath();
    ctx.fill();
  }

  reset(): void {
    this.start = null;
    this.end = null;
    this.startSnap = null;
    this.endSnap = null;
  }
}
