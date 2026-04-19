import { normalizeRect, applyPreviewStyle } from '../utils/drawing-shared.ts';
import { drawShakyPath } from '../utils/brush-styles.ts';
import type { DrawTool, ToolOptionId } from './base-tool.ts';
import type {
  BrushStyle,
  DrawParams,
  DrawToolContext,
  Point,
  SketchElement,
  SpeechBubbleElement,
} from '../types.ts';

export class SpeechBubbleTool implements DrawTool<SpeechBubbleElement> {
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

  static draw(params: {
    ctx: CanvasRenderingContext2D;
    start: Point;
    end: Point;
    fillColor?: string;
    brushStyle?: BrushStyle;
    tailTip?: Point;
    isInteracting?: boolean;
  }): void {
    let { ctx, start, end, fillColor, brushStyle, tailTip, isInteracting } = params;
    if (isInteracting) brushStyle = 'normal';
    const rect = normalizeRect(start, end);
    if (rect.w < 1 || rect.h < 1) return;

    const { x, y, w, h } = rect;
    const r = Math.min(w, h) * 0.2;

    // Tail tip: use provided position or default
    const tip = tailTip ?? { x: x + w * 0.15, y: y + h + 20 };

    // Determine the closest side
    const distTop = Math.abs(tip.y - y);
    const distBottom = Math.abs(tip.y - (y + h));
    const distLeft = Math.abs(tip.x - x);
    const distRight = Math.abs(tip.x - (x + w));

    const minDist = Math.min(distTop, distBottom, distLeft, distRight);
    let side: 'top' | 'bottom' | 'left' | 'right' = 'bottom';
    if (minDist === distTop) side = 'top';
    else if (minDist === distBottom) side = 'bottom';
    else if (minDist === distLeft) side = 'left';
    else if (minDist === distRight) side = 'right';

    // Tail width logic
    const baseTailWidth = Math.min(w, h) * 0.1 || 12;
    const outX = Math.max(0, x - tip.x, tip.x - (x + w));
    const outY = Math.max(0, y - tip.y, tip.y - (y + h));
    const tailHalfWidth = Math.min(Math.min(w, h) * 0.3, baseTailWidth + outY * 0.1 + outX * 0.1);

    // Calculate root points on the side
    let rootL: Point, rootR: Point;
    if (side === 'top' || side === 'bottom') {
      const cy = side === 'top' ? y : y + h;
      const rootCenterX = Math.max(x + r + tailHalfWidth, Math.min(x + w - r - tailHalfWidth, tip.x));
      rootL = { x: rootCenterX - tailHalfWidth, y: cy };
      rootR = { x: rootCenterX + tailHalfWidth, y: cy };
    } else {
      const cx = side === 'left' ? x : x + w;
      const rootCenterY = Math.max(y + r + tailHalfWidth, Math.min(y + h - r - tailHalfWidth, tip.y));
      rootL = { x: cx, y: rootCenterY + tailHalfWidth };
      rootR = { x: cx, y: rootCenterY - tailHalfWidth };
    }

    if (brushStyle === 'shaky') {
      const points: Point[] = [];
      points.push({ x: x + r, y: y });
      if (side === 'top') points.push(rootL, tip, rootR);
      points.push({ x: x + w - r, y: y });
      points.push({ x: x + w, y: y + r });
      if (side === 'right') points.push(rootR, tip, rootL);
      points.push({ x: x + w, y: y + h - r });
      points.push({ x: x + w - r, y: y + h });
      if (side === 'bottom') points.push(rootR, tip, rootL);
      points.push({ x: x + r, y: y + h });
      points.push({ x: x, y: y + h - r });
      if (side === 'left') points.push(rootL, tip, rootR);
      points.push({ x: x, y: y + r });

      drawShakyPath(ctx, points, true, fillColor);
      return;
    }

    ctx.beginPath();
    // Top side
    ctx.moveTo(x + r, y);
    if (side === 'top') {
      ctx.lineTo(rootL.x, rootL.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.lineTo(rootR.x, rootR.y);
    }
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);

    // Right side
    if (side === 'right') {
      ctx.lineTo(rootR.x, rootR.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.lineTo(rootL.x, rootL.y);
    }
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);

    // Bottom side
    if (side === 'bottom') {
      ctx.lineTo(rootR.x, rootR.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.lineTo(rootL.x, rootL.y);
    }
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);

    // Left side
    if (side === 'left') {
      ctx.lineTo(rootL.x, rootL.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.lineTo(rootR.x, rootR.y);
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
