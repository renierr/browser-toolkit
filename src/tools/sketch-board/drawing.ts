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
  const rotation = el.rotation || 0;
  const bounds = getElementBounds(ctx, el, true); // Get unrotated bounds for center calc
  const centerX = bounds.x + bounds.w / 2;
  const centerY = bounds.y + bounds.h / 2;

  ctx.save();
  if (rotation !== 0) {
    ctx.translate(centerX, centerY);
    ctx.rotate(rotation);
    ctx.translate(-centerX, -centerY);
  }

  applyStrokeStyle(ctx, el.color, el.width);

  if (el.type === 'freehand') {
    FreehandTool.draw(ctx, el.points);
  } else if (el.type === 'line') {
    LineTool.draw(ctx, el.start, el.end);
  } else if (el.type === 'rect') {
    RectTool.draw(ctx, el.start, el.end, el.filled);
  } else if (el.type === 'ellipse') {
    EllipseTool.draw(ctx, el.start, el.end, el.filled);
  } else if (el.type === 'triangle') {
    TriangleTool.draw(ctx, el.start, el.end, el.filled);
  } else if (el.type === 'diamond') {
    DiamondTool.draw(ctx, el.start, el.end, el.filled);
  } else if (el.type === 'hexagon') {
    HexagonTool.draw(ctx, el.start, el.end, el.filled);
  } else if (el.type === 'arrow') {
    ArrowTool.draw(ctx, el.start, el.end);
  } else if (el.type === 'double-arrow') {
    DoubleArrowTool.draw(ctx, el.start, el.end);
  } else if (el.type === 'speech-bubble') {
    SpeechBubbleTool.draw(ctx, el.start, el.end, el.filled);
  } else if (el.type === 'checkmark') {
    CheckmarkTool.draw(ctx, el.start, el.end);
  } else if (el.type === 'text') {
    TextTool.draw(ctx, el);
  } else if (el.type === 'image') {
    ImageTool.draw(ctx, el);
  } else if (el.type === 'group') {
    for (const subEl of el.elements) {
      drawElement(ctx, subEl);
    }
  }

  ctx.restore();
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
  el: SketchElement,
  ignoreRotation = false
): { x: number; y: number; w: number; h: number } {
  let bounds: { x: number; y: number; w: number; h: number };

  if (el.type === 'text') {
    bounds = getTextBounds(ctx, el);
  } else if (el.type === 'image') {
    bounds = getImageBounds(ctx, el);
  } else if (el.type === 'freehand') {
    if (el.points.length === 0) {
      bounds = { x: 0, y: 0, w: 0, h: 0 };
    } else {
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
      bounds = {
        x: minX - el.width / 2,
        y: minY - el.width / 2,
        w: maxX - minX + el.width,
        h: maxY - minY + el.width,
      };
    }
  } else if (el.type === 'group') {
    if (el.elements.length === 0) {
      bounds = { x: 0, y: 0, w: 0, h: 0 };
    } else {
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
      bounds = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
  } else {
    // line, rect, ellipse, triangle, arrow, double-arrow, diamond, hexagon, speech-bubble, checkmark — all have start/end
    const rect = normalizeRect(el.start, el.end);
    bounds = {
      x: rect.x - el.width / 2,
      y: rect.y - el.width / 2,
      w: rect.w + el.width,
      h: rect.h + el.width,
    };
  }

  if (ignoreRotation || !el.rotation) {
    return bounds;
  }

  // Calculate AABB of rotated bounds
  const cx = bounds.x + bounds.w / 2;
  const cy = bounds.y + bounds.h / 2;
  const rad = el.rotation;

  const points = [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.w, y: bounds.y },
    { x: bounds.x + bounds.w, y: bounds.y + bounds.h },
    { x: bounds.x, y: bounds.y + bounds.h },
  ];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of points) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const rx = cx + dx * Math.cos(rad) - dy * Math.sin(rad);
    const ry = cy + dx * Math.sin(rad) + dy * Math.cos(rad);
    minX = Math.min(minX, rx);
    minY = Math.min(minY, ry);
    maxX = Math.max(maxX, rx);
    maxY = Math.max(maxY, ry);
  }

  return {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
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
  const stats = getRecursiveStats(elements);
  return {
    elementCount: stats.totalCount,
    colors: Array.from(stats.colorSet).slice(0, 12),
    lastTool,
    background,
  };
}

/**
 * Recursively traverses elements to count leaf nodes, groups, and collect colors.
 */
export function getRecursiveStats(elements: SketchElement[]): {
  totalCount: number;
  inGroupsCount: number;
  groupCount: number;
  colorSet: Set<string>;
} {
  let totalCount = 0;
  let inGroupsCount = 0;
  let groupCount = 0;
  const colorSet = new Set<string>();

  function process(el: SketchElement, isGrouped: boolean) {
    if (el.type === 'group') {
      groupCount++;
      el.elements.forEach((sub) => process(sub, true));
    } else {
      totalCount++;
      if (isGrouped) inGroupsCount++;
      if (el.color) colorSet.add(el.color);
    }
  }

  elements.forEach((el) => process(el, false));

  return { totalCount, inGroupsCount, groupCount, colorSet };
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
