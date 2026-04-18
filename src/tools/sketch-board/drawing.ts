import type {
  DrawingMeta,
  ImageElement,
  Point,
  SketchElement,
  TextElement,
  ToolMode,
} from './types.ts';
import {
  normalizeRect,
  applyStrokeStyle,
  setImageGetter as setSharedImageGetter,
} from './utils/drawing-shared.ts';

import { FreehandTool } from './shapes/freehand-tool.ts';
import { LineTool } from './shapes/line-tool.ts';
import { RectTool } from './shapes/rect-tool.ts';
import { EllipseTool } from './shapes/ellipse-tool.ts';
import { TriangleTool } from './shapes/triangle-tool.ts';
import { DiamondTool } from './shapes/diamond-tool.ts';
import { HexagonTool } from './shapes/hexagon-tool.ts';
import { ArrowTool } from './shapes/arrow-tool.ts';
import { DoubleArrowTool } from './shapes/double-arrow-tool.ts';
import { SpeechBubbleTool } from './shapes/speech-bubble-tool.ts';
import { CheckmarkTool } from './shapes/checkmark-tool.ts';
import { TextTool } from './shapes/text-tool.ts';
import { ImageTool } from './shapes/image-tool.ts';

type ImageGetter = (imageData: string) => HTMLImageElement;

export function setImageGetter(fn: ImageGetter): void {
  setSharedImageGetter(fn);
}

export function drawElement(ctx: CanvasRenderingContext2D, el: SketchElement): void {
  applyStrokeStyle(ctx, el.color, el.width);

  if (el.type === 'freehand') {
    FreehandTool.draw(ctx, el.points);
    return;
  }

  if (el.type === 'line') {
    LineTool.draw(ctx, el.start, el.end);
    return;
  }

  if (el.type === 'rect') {
    RectTool.draw(ctx, el.start, el.end, el.filled);
    return;
  }

  if (el.type === 'ellipse') {
    EllipseTool.draw(ctx, el.start, el.end, el.filled);
    return;
  }

  if (el.type === 'triangle') {
    TriangleTool.draw(ctx, el.start, el.end, el.filled);
    return;
  }

  if (el.type === 'diamond') {
    DiamondTool.draw(ctx, el.start, el.end, el.filled);
    return;
  }

  if (el.type === 'hexagon') {
    HexagonTool.draw(ctx, el.start, el.end, el.filled);
    return;
  }

  if (el.type === 'arrow') {
    ArrowTool.draw(ctx, el.start, el.end);
    return;
  }

  if (el.type === 'double-arrow') {
    DoubleArrowTool.draw(ctx, el.start, el.end);
    return;
  }

  if (el.type === 'speech-bubble') {
    SpeechBubbleTool.draw(ctx, el.start, el.end, el.filled);
    return;
  }

  if (el.type === 'checkmark') {
    CheckmarkTool.draw(ctx, el.start, el.end);
    return;
  }

  if (el.type === 'text') {
    TextTool.draw(ctx, el);
    return;
  }

  if (el.type === 'image') {
    ImageTool.draw(ctx, el);
    return;
  }

  if (el.type === 'group') {
    for (const subEl of el.elements) {
      drawElement(ctx, subEl);
    }
    return;
  }
}

function getImageBounds(
  _ctx: CanvasRenderingContext2D,
  el: ImageElement
): { x: number; y: number; w: number; h: number } {
  return {
    x: el.position.x,
    y: el.position.y,
    w: el.imageWidth,
    h: el.imageHeight,
  };
}

export function getTextBounds(
  ctx: CanvasRenderingContext2D,
  el: TextElement
): { x: number; y: number; w: number; h: number } {
  ctx.font = `${el.fontStyle} ${el.fontWeight} ${el.fontSize}px ${el.fontFamily}`;
  const metrics = ctx.measureText(el.text);
  const h = el.fontSize;
  return {
    x: el.position.x,
    y: el.position.y,
    w: metrics.width,
    h: h,
  };
}

/** Generic bounds for any element type */
export function getElementBounds(
  ctx: CanvasRenderingContext2D,
  el: SketchElement
): { x: number; y: number; w: number; h: number } {
  if (el.type === 'text') {
    return getTextBounds(ctx, el);
  }
  if (el.type === 'image') {
    return getImageBounds(ctx, el);
  }
  if (el.type === 'freehand') {
    if (el.points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of el.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    return {
      x: minX - el.width / 2,
      y: minY - el.width / 2,
      w: maxX - minX + el.width,
      h: maxY - minY + el.width,
    };
  }
  if (el.type === 'group') {
    if (el.elements.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const subEl of el.elements) {
      const b = getElementBounds(ctx, subEl);
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w);
      maxY = Math.max(maxY, b.y + b.h);
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  // line, rect, ellipse, triangle, arrow, double-arrow, diamond, hexagon, speech-bubble, checkmark — all have start/end
  const rect = normalizeRect(el.start, el.end);
  return {
    x: rect.x - el.width / 2,
    y: rect.y - el.width / 2,
    w: rect.w + el.width,
    h: rect.h + el.width,
  };
}

export function drawLiveFreehandSegment(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  color: string,
  width: number
): void {
  applyStrokeStyle(ctx, color, width);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

export function buildMeta(
  elements: SketchElement[],
  lastTool: ToolMode,
  background?: string
): DrawingMeta {
  const colors = Array.from(new Set(elements.map((el) => el.color))).slice(0, 12);
  return {
    elementCount: elements.length,
    colors,
    lastTool,
    background,
  };
}

/** Lazily created context for text measurement (avoids DOM thrash) */
let measureCtx: CanvasRenderingContext2D | null = null;
function getMeasureCtx(): CanvasRenderingContext2D {
  if (!measureCtx) {
    measureCtx = document.createElement('canvas').getContext('2d')!;
  }
  return measureCtx;
}

function computeSceneBounds(elements: SketchElement[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} | null {
  if (elements.length === 0) return null;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const el of elements) {
    if (el.type === 'freehand') {
      for (const p of el.points) {
        minX = Math.min(minX, p.x - el.width);
        minY = Math.min(minY, p.y - el.width);
        maxX = Math.max(maxX, p.x + el.width);
        maxY = Math.max(maxY, p.y + el.width);
      }
      continue;
    }

    if (el.type === 'text') {
      const bounds = getTextBounds(getMeasureCtx(), el);
      minX = Math.min(minX, bounds.x);
      minY = Math.min(minY, bounds.y);
      maxX = Math.max(maxX, bounds.x + bounds.w);
      maxY = Math.max(maxY, bounds.y + bounds.h);
      continue;
    }

    if (el.type === 'image') {
      minX = Math.min(minX, el.position.x);
      minY = Math.min(minY, el.position.y);
      maxX = Math.max(maxX, el.position.x + el.imageWidth);
      maxY = Math.max(maxY, el.position.y + el.imageHeight);
      continue;
    }

    if (el.type === 'group') {
      const b = getElementBounds(getMeasureCtx(), el);
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w);
      maxY = Math.max(maxY, b.y + b.h);
      continue;
    }

    // line, rect, ellipse, triangle, arrow
    const rect = normalizeRect(el.start, el.end);
    minX = Math.min(minX, rect.x - el.width);
    minY = Math.min(minY, rect.y - el.width);
    maxX = Math.max(maxX, rect.x + rect.w + el.width);
    maxY = Math.max(maxY, rect.y + rect.h + el.width);
  }

  return { minX, minY, maxX, maxY };
}

export function getCropBounds(elements: SketchElement[]): {
  x: number;
  y: number;
  w: number;
  h: number;
} | null {
  const bounds = computeSceneBounds(elements);
  if (!bounds) return null;

  const padding = 4;
  return {
    x: Math.floor(bounds.minX - padding),
    y: Math.floor(bounds.minY - padding),
    w: Math.ceil(bounds.maxX - bounds.minX + padding * 2),
    h: Math.ceil(bounds.maxY - bounds.minY + padding * 2),
  };
}

export function makeThumbnail(elements: SketchElement[]): string {
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = 320;
  thumbCanvas.height = 200;
  const ctx = thumbCanvas.getContext('2d');
  if (!ctx) return '';

  const bounds = computeSceneBounds(elements);
  if (!bounds) return thumbCanvas.toDataURL('image/png');

  const pad = 12;
  const contentW = Math.max(1, bounds.maxX - bounds.minX);
  const contentH = Math.max(1, bounds.maxY - bounds.minY);
  const scale = Math.min(
    (thumbCanvas.width - pad * 2) / contentW,
    (thumbCanvas.height - pad * 2) / contentH
  );

  const drawW = contentW * scale;
  const drawH = contentH * scale;
  const offsetX = (thumbCanvas.width - drawW) / 2;
  const offsetY = (thumbCanvas.height - drawH) / 2;

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  ctx.translate(-bounds.minX, -bounds.minY);
  for (const el of elements) drawElement(ctx, el);
  ctx.restore();

  return thumbCanvas.toDataURL('image/png');
}
