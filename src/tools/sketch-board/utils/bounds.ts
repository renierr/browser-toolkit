import type { SketchElement, Point, TextElement, ImageElement } from '../types.ts';
import { normalizeRect } from './drawing-shared.ts';

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
    bounds = getImageBounds(el);
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

export function getTextBounds(
  ctx: CanvasRenderingContext2D,
  el: TextElement
): { x: number; y: number; w: number; h: number } {
  ctx.font = `${el.fontStyle} ${el.fontWeight} ${el.fontSize}px ${el.fontFamily}`;
  const lines = el.text.split('\n');
  const lineHeight = el.fontSize * 1.2;
  let maxW = 0;
  for (const line of lines) {
    const metrics = ctx.measureText(line);
    maxW = Math.max(maxW, metrics.width);
  }
  const h = (lines.length - 1) * lineHeight + el.fontSize;
  return {
    x: el.position.x,
    y: el.position.y,
    w: maxW,
    h: h,
  };
}

function getImageBounds(el: ImageElement): { x: number; y: number; w: number; h: number } {
  return {
    x: el.position.x,
    y: el.position.y,
    w: el.imageWidth,
    h: el.imageHeight,
  };
}

export function getElementCenter(ctx: CanvasRenderingContext2D, el: SketchElement): Point {
  const bounds = getElementBounds(ctx, el, true);
  return {
    x: bounds.x + bounds.w / 2,
    y: bounds.y + bounds.h / 2,
  };
}
