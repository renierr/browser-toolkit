import {
  normalizeRect,
  applyPreviewStyle,
  distToSegment,
  getArcPoints,
} from '../utils/drawing-shared.ts';
import { drawShakyPath } from '../utils/brush-styles.ts';
import { drawNaturalPath } from '../utils/natural-brush.ts';
import type { DrawTool, ToolOptionId } from './base-tool.ts';
import type {
  BrushStyle,
  DrawParams,
  DrawToolContext,
  Point,
  SketchElement,
  SpeechBubbleElement,
} from '../types.ts';

type StaticDrawParams = {
  ctx: CanvasRenderingContext2D;
  start: Point;
  end: Point;
  fillColor?: string;
  brushStyle?: BrushStyle;
  tailTip?: Point;
  isInteracting?: boolean;
};

export class SpeechBubbleTool implements DrawTool<SpeechBubbleElement> {
  readonly mode = 'speech-bubble' as const;
  readonly streamsLive = false;
  readonly toolOptions: ReadonlySet<ToolOptionId> = new Set(['color', 'fill', 'brush', 'width']);

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

  static draw(params: StaticDrawParams): void {
    const { ctx, start, end, fillColor, tailTip, isInteracting } = params;
    let bStyle = params.brushStyle;
    if (isInteracting) bStyle = 'normal';
    const rect = normalizeRect(start, end);
    if (rect.w < 1 || rect.h < 1) return;

    const { x, y, w, h } = rect;
    const r = Math.min(w, h) * 0.2;
    const tip = tailTip ?? { x: x + w * 0.15, y: y + h + 20 };

    // Distance to side segments
    const d1 = distToSegment(tip, { x: x + r, y: y }, { x: x + w - r, y: y });
    const d2 = distToSegment(tip, { x: x + r, y: y + h }, { x: x + w - r, y: y + h });
    const d3 = distToSegment(tip, { x: x, y: y + r }, { x: x, y: y + h - r });
    const d4 = distToSegment(tip, { x: x + w, y: y + r }, { x: x + w, y: y + h - r });

    const minDist = Math.min(d1, d2, d3, d4);
    let side: 'top' | 'bottom' | 'left' | 'right' = 'bottom';
    if (minDist === d1) side = 'top';
    else if (minDist === d2) side = 'bottom';
    else if (minDist === d3) side = 'left';
    else if (minDist === d4) side = 'right';

    // Dynamic gap width
    const baseGap = Math.min(w, h) * 0.1 || 12;
    const outX = Math.max(0, x - tip.x, tip.x - (x + w));
    const outY = Math.max(0, y - tip.y, tip.y - (y + h));
    let gapHalfWidth = Math.min(Math.min(w, h) * 0.3, baseGap + (outX + outY) * 0.1);

    const sideLen = side === 'top' || side === 'bottom' ? w : h;
    const avail = Math.max(0, sideLen - 2 * r);
    gapHalfWidth = Math.min(gapHalfWidth, (avail / 2) * 0.8);

    let pL: Point, pR: Point;
    if (side === 'top' || side === 'bottom') {
      const cy = side === 'top' ? y : y + h;
      const centerX = Math.max(x + r + gapHalfWidth, Math.min(x + w - r - gapHalfWidth, tip.x));
      pL = { x: centerX - gapHalfWidth, y: cy };
      pR = { x: centerX + gapHalfWidth, y: cy };
    } else {
      const cx = side === 'left' ? x : x + w;
      const centerY = Math.max(y + r + gapHalfWidth, Math.min(y + h - r - gapHalfWidth, tip.y));
      pL = { x: cx, y: centerY + gapHalfWidth };
      pR = { x: cx, y: centerY - gapHalfWidth };
    }

    const pts: Point[] = [];
    pts.push({ x: x + r, y: y });
    if (side === 'top') pts.push(pL, tip, pR);
    pts.push({ x: x + w - r, y: y });
    pts.push(...getArcPoints(r, x + w - r, y + r, -Math.PI / 2, 0));
    if (side === 'right') pts.push(pR, tip, pL);
    pts.push({ x: x + w, y: y + h - r });
    pts.push(...getArcPoints(r, x + w - r, y + h - r, 0, Math.PI / 2));
    if (side === 'bottom') pts.push(pR, tip, pL);
    pts.push({ x: x + r, y: y + h });
    pts.push(...getArcPoints(r, x + r, y + h - r, Math.PI / 2, Math.PI));
    if (side === 'left') pts.push(pL, tip, pR);
    pts.push({ x: x, y: y + r });
    pts.push(...getArcPoints(r, x + r, y + r, Math.PI, 1.5 * Math.PI));

    if (bStyle === 'shaky') {
      drawShakyPath(ctx, pts, true, fillColor);
      return;
    }

    if (bStyle === 'natural') {
      if (fillColor && fillColor !== 'transparent') {
        ctx.save();
        ctx.fillStyle = fillColor;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      drawNaturalPath(ctx, pts, ctx.lineWidth, ctx.strokeStyle as string);
      return;
    }


    ctx.beginPath();
    ctx.moveTo(x + r, y);
    if (side === 'top') {
      ctx.lineTo(pL.x, pL.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.lineTo(pR.x, pR.y);
    }
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    if (side === 'right') {
      ctx.lineTo(pR.x, pR.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.lineTo(pL.x, pL.y);
    }
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    if (side === 'bottom') {
      ctx.lineTo(pR.x, pR.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.lineTo(pL.x, pL.y);
    }
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    if (side === 'left') {
      ctx.lineTo(pL.x, pL.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.lineTo(pR.x, pR.y);
    }
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
