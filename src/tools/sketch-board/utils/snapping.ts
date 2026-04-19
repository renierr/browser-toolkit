import type { Point, SketchElement } from '../types.ts';
import { getElementCenter } from './bounds.ts';

const SNAP_THRESHOLD = 20;

export type SnapResult = {
  elementId: string;
  point: Point;
};

/**
 * Finds the best snap target for a point among elements.
 * Snaps to the center of the element if within threshold.
 */
export function getSnapTarget(
  point: Point,
  elements: SketchElement[],
  excludeIds: Set<string>,
  ctx: CanvasRenderingContext2D
): SnapResult | null {
  let bestDist = SNAP_THRESHOLD;
  let bestTarget: SnapResult | null = null;

  for (const el of elements) {
    if (excludeIds.has(el.id)) continue;
    
    // Don't snap to other arrows/lines/double-arrows for now to avoid cycles or complex chains
    // unless we want to support it later.
    if (el.type === 'arrow' || el.type === 'double-arrow' || el.type === 'line') continue;

    const center = getElementCenter(ctx, el);
    const dist = Math.hypot(point.x - center.x, point.y - center.y);

    if (dist < bestDist) {
      bestDist = dist;
      bestTarget = {
        elementId: el.id,
        point: center,
      };
    }
    
    // Also consider corners or edges for snapping? 
    // For now, center is a good starting point for "pointing to it".
  }

  return bestTarget;
}
