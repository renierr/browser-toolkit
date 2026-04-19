import type { Point, SketchElement } from '../types.ts';
import { getElementBounds, getElementCenter } from './bounds.ts';

const SNAP_THRESHOLD = 20;

export type SnapResult = {
  elementId: string;
  point: Point;
  offsetX: number;
  offsetY: number;
};

/**
 * Finds the best snap target for a point among elements.
 * Checks multiple snap points per element.
 */
export function getSnapTarget(
  point: Point,
  elements: SketchElement[],
  excludeIds: Set<Set<string> | string>,
  ctx: CanvasRenderingContext2D
): SnapResult | null {
  const excludeSet = new Set<string>();
  for (const item of excludeIds) {
    if (typeof item === 'string') excludeSet.add(item);
    else item.forEach((id) => excludeSet.add(id));
  }

  let bestDist = SNAP_THRESHOLD;
  let bestTarget: SnapResult | null = null;

  for (const el of elements) {
    if (excludeSet.has(el.id)) continue;

    const snapPoints = getElementSnapPoints(ctx, el);
    const center = getElementCenter(ctx, el);
    const rad = el.rotation || 0;

    for (const p of snapPoints) {
      const dist = Math.hypot(point.x - p.x, point.y - p.y);

      if (dist < bestDist) {
        bestDist = dist;

        // Calculate offset in local space (unrotated)
        const dx = p.x - center.x;
        const dy = p.y - center.y;
        const offsetX = dx * Math.cos(-rad) - dy * Math.sin(-rad);
        const offsetY = dx * Math.sin(-rad) + dy * Math.cos(-rad);

        bestTarget = {
          elementId: el.id,
          point: p,
          offsetX,
          offsetY,
        };
      }
    }
  }

  return bestTarget;
}

export function getElementSnapPoints(ctx: CanvasRenderingContext2D, el: SketchElement): Point[] {
  const center = getElementCenter(ctx, el);
  const bounds = getElementBounds(ctx, el, true); // unrotated
  const points: Point[] = [center];

  if (el.type === 'rect' || el.type === 'image' || el.type === 'text') {
    points.push({ x: bounds.x, y: bounds.y });
    points.push({ x: bounds.x + bounds.w, y: bounds.y });
    points.push({ x: bounds.x + bounds.w, y: bounds.y + bounds.h });
    points.push({ x: bounds.x, y: bounds.y + bounds.h });
    points.push({ x: bounds.x + bounds.w / 2, y: bounds.y });
    points.push({ x: bounds.x + bounds.w, y: bounds.y + bounds.h / 2 });
    points.push({ x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h });
    points.push({ x: bounds.x, y: bounds.y + bounds.h / 2 });
  } else if (el.type === 'triangle') {
    points.push({ x: bounds.x + bounds.w / 2, y: bounds.y });
    points.push({ x: bounds.x, y: bounds.y + bounds.h });
    points.push({ x: bounds.x + bounds.w, y: bounds.y + bounds.h });
    points.push({ x: bounds.x + bounds.w / 4, y: bounds.y + bounds.h / 2 });
    points.push({ x: bounds.x + (3 * bounds.w) / 4, y: bounds.y + bounds.h / 2 });
  } else if (el.type === 'diamond') {
    points.push({ x: bounds.x + bounds.w / 2, y: bounds.y });
    points.push({ x: bounds.x + bounds.w, y: bounds.y + bounds.h / 2 });
    points.push({ x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h });
    points.push({ x: bounds.x, y: bounds.y + bounds.h / 2 });
  } else if (el.type === 'hexagon') {
    const quarterW = bounds.w / 4;
    points.push({ x: bounds.x + quarterW, y: bounds.y });
    points.push({ x: bounds.x + 3 * quarterW, y: bounds.y });
    points.push({ x: bounds.x + bounds.w, y: bounds.y + bounds.h / 2 });
    points.push({ x: bounds.x + 3 * quarterW, y: bounds.y + bounds.h });
    points.push({ x: bounds.x + quarterW, y: bounds.y + bounds.h });
    points.push({ x: bounds.x, y: bounds.y + bounds.h / 2 });
  } else if (el.type === 'ellipse') {
    points.push({ x: bounds.x + bounds.w / 2, y: bounds.y });
    points.push({ x: bounds.x + bounds.w, y: bounds.y + bounds.h / 2 });
    points.push({ x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h });
    points.push({ x: bounds.x, y: bounds.y + bounds.h / 2 });
  } else if (el.type === 'freehand') {
    // Snap to start, end, and some points in between
    if (el.points.length > 0) {
      points.push(el.points[0]);
      points.push(el.points[el.points.length - 1]);
      for (let i = 10; i < el.points.length - 1; i += 20) {
        points.push(el.points[i]);
      }
    }
  } else if (el.type === 'speech-bubble') {
    // Bubble part (top 80%)
    const bubbleH = bounds.h * 0.8;
    points.push({ x: bounds.x, y: bounds.y });
    points.push({ x: bounds.x + bounds.w, y: bounds.y });
    points.push({ x: bounds.x + bounds.w, y: bounds.y + bubbleH });
    points.push({ x: bounds.x, y: bounds.y + bubbleH });
    // Midpoints
    points.push({ x: bounds.x + bounds.w / 2, y: bounds.y });
    points.push({ x: bounds.x + bounds.w, y: bounds.y + bubbleH / 2 });
    points.push({ x: bounds.x + bounds.w / 2, y: bounds.y + bubbleH });
    points.push({ x: bounds.x, y: bounds.y + bubbleH / 2 });
    // Tail tip (roughly 15% from left, at full height)
    points.push({ x: bounds.x + bounds.w * 0.15, y: bounds.y + bounds.h });
  } else if (el.type === 'arrow' || el.type === 'double-arrow' || el.type === 'line') {
    // Snap to start, end, and midpoint
    points.push(el.start);
    points.push(el.end);
    points.push({ x: (el.start.x + el.end.x) / 2, y: (el.start.y + el.end.y) / 2 });
  }

  // Apply rotation to points
  const rad = el.rotation || 0;
  if (rad === 0) return points;

  return points.map((p) => {
    if (p === center) return p;
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    return {
      x: center.x + dx * Math.cos(rad) - dy * Math.sin(rad),
      y: center.y + dx * Math.sin(rad) + dy * Math.cos(rad),
    };
  });
}

/**
 * Calculates world position of a snap offset relative to an element.
 */
export function applySnapOffset(
  ctx: CanvasRenderingContext2D,
  el: SketchElement,
  offsetX: number,
  offsetY: number
): Point {
  const center = getElementCenter(ctx, el);
  const rad = el.rotation || 0;
  return {
    x: center.x + offsetX * Math.cos(rad) - offsetY * Math.sin(rad),
    y: center.y + offsetX * Math.sin(rad) + offsetY * Math.cos(rad),
  };
}
