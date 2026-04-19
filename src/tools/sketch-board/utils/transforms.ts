import type { Point, SketchElement } from '../types.ts';
import { applySnapOffset } from './snapping.ts';

type Bounds = { x: number; y: number; w: number; h: number };

export type ScaleParams = {
  el: SketchElement;
  snapshotEl: SketchElement;
  scaleX: number;
  scaleY: number;
  newOrigin: Point;
  oldBounds: Bounds;
};

/** Recursively move an element by dx/dy */
export function moveElement(el: SketchElement, dx: number, dy: number): void {
  if (el.type === 'text' || el.type === 'image') {
    el.position.x += dx;
    el.position.y += dy;
  } else if (el.type === 'freehand') {
    for (const p of el.points) {
      p.x += dx;
      p.y += dy;
    }
  } else if (el.type === 'group') {
    for (const subEl of el.elements) {
      moveElement(subEl, dx, dy);
    }
  } else {
    // line, rect, ellipse, triangle, arrow, etc.
    el.start.x += dx;
    el.start.y += dy;
    el.end.x += dx;
    el.end.y += dy;
  }
}

/** Recursively scale an element relative to original snapshot and bounds */
export function scaleElement(params: ScaleParams): void {
  const { el, snapshotEl, scaleX, scaleY, newOrigin, oldBounds } = params;

  if (el.type === 'freehand' && snapshotEl.type === 'freehand') {
    for (let i = 0; i < el.points.length; i++) {
      const p = el.points[i];
      const sp = snapshotEl.points[i];
      if (!sp) continue;
      p.x = newOrigin.x + (sp.x - oldBounds.x) * scaleX;
      p.y = newOrigin.y + (sp.y - oldBounds.y) * scaleY;
    }
  } else if (el.type === 'group' && snapshotEl.type === 'group') {
    for (let i = 0; i < el.elements.length; i++) {
      scaleElement({
        el: el.elements[i],
        snapshotEl: snapshotEl.elements[i],
        scaleX,
        scaleY,
        newOrigin,
        oldBounds,
      });
    }
  } else if (el.type === 'image' && snapshotEl.type === 'image') {
    el.position.x = newOrigin.x + (snapshotEl.position.x - oldBounds.x) * scaleX;
    el.position.y = newOrigin.y + (snapshotEl.position.y - oldBounds.y) * scaleY;
    el.imageWidth = snapshotEl.imageWidth * scaleX;
    el.imageHeight = snapshotEl.imageHeight * scaleY;
  } else if (el.type === 'text' && snapshotEl.type === 'text') {
    el.position.x = newOrigin.x + (snapshotEl.position.x - oldBounds.x) * scaleX;
    el.position.y = newOrigin.y + (snapshotEl.position.y - oldBounds.y) * scaleY;
    // Font size handled in doResize for single selection
  } else if ('start' in el && 'end' in el && 'start' in snapshotEl && 'end' in snapshotEl) {
    el.start.x = newOrigin.x + (snapshotEl.start.x - oldBounds.x) * scaleX;
    el.start.y = newOrigin.y + (snapshotEl.start.y - oldBounds.y) * scaleY;
    el.end.x = newOrigin.x + (snapshotEl.end.x - oldBounds.x) * scaleX;
    el.end.y = newOrigin.y + (snapshotEl.end.y - oldBounds.y) * scaleY;
  }
}

/** Propagate position changes to elements snapped to moved elements */
export function updateSnappedElements(
  ctx: CanvasRenderingContext2D,
  elements: SketchElement[],
  movedElementIds: Set<string>
): void {
  let changed = true;
  let passes = 0;
  const allMoved = new Set(movedElementIds);

  while (changed && passes < 10) {
    changed = false;
    passes++;
    for (const el of elements) {
      if (el.type === 'arrow' || el.type === 'double-arrow' || el.type === 'line') {
        let elChanged = false;
        if (el.startSnap && allMoved.has(el.startSnap.elementId)) {
          const target = elements.find((e) => e.id === el.startSnap!.elementId);
          if (target) {
            const newPos = applySnapOffset(
              ctx,
              target,
              el.startSnap!.offsetX,
              el.startSnap!.offsetY
            );
            if (Math.abs(newPos.x - el.start.x) > 0.01 || Math.abs(newPos.y - el.start.y) > 0.01) {
              el.start = newPos;
              elChanged = true;
            }
          }
        }
        if (el.endSnap && allMoved.has(el.endSnap.elementId)) {
          const target = elements.find((e) => e.id === el.endSnap!.elementId);
          if (target) {
            const newPos = applySnapOffset(ctx, target, el.endSnap!.offsetX, el.endSnap!.offsetY);
            if (Math.abs(newPos.x - el.end.x) > 0.01 || Math.abs(newPos.y - el.end.y) > 0.01) {
              el.end = newPos;
              elChanged = true;
            }
          }
        }
        if (elChanged && !allMoved.has(el.id)) {
          allMoved.add(el.id);
          changed = true;
        }
      }
    }
  }
}

/** Recursively apply a color to an element and its children */
export function applyColorRecursive(
  el: SketchElement,
  property: 'color' | 'fillColor',
  value: string | undefined
): void {
  if (property === 'color') {
    el.color = value as string;
  } else {
    el.fillColor = value;
  }
  if (el.type === 'group') {
    for (const subEl of el.elements) {
      applyColorRecursive(subEl, property, value);
    }
  }
}
