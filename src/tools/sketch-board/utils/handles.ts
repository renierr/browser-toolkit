import type { Point, SketchElement } from '../types.ts';
import { getElementBounds } from './bounds.ts';
import { normalizeRect } from './drawing-shared.ts';

const HANDLE_SIZE = 8;

export type ResizeHandle =
  | 'nw'
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w'
  | 'start'
  | 'end'
  | 'tail'
  | 'rotate';

type Bounds = { x: number; y: number; w: number; h: number };

const CURSOR_MAP: Record<ResizeHandle, string> = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
  start: 'crosshair',
  end: 'crosshair',
  tail: 'move',
  rotate: 'grab',
};

export function getHandleSize(): number {
  return HANDLE_SIZE;
}

export function getCursorForHandle(handle: ResizeHandle): string {
  return CURSOR_MAP[handle];
}

export function getRotationHandlePosition(bounds: Bounds): Point {
  return { x: bounds.x + bounds.w / 2, y: bounds.y - 30 };
}

export function getCornerHandlePositions(bounds: Bounds, pad: number): Point[] {
  const x = bounds.x - pad;
  const y = bounds.y - pad;
  const w = bounds.w + pad * 2;
  const h = bounds.h + pad * 2;
  return [
    { x, y }, // nw
    { x: x + w / 2, y }, // n
    { x: x + w, y }, // ne
    { x: x + w, y: y + h / 2 }, // e
    { x: x + w, y: y + h }, // se
    { x: x + w / 2, y: y + h }, // s
    { x, y: y + h }, // sw
    { x, y: y + h / 2 }, // w
  ];
}

/** Compute the default tail tip for a speech bubble when none is stored */
export function getDefaultTailTip(el: { start: Point; end: Point }): Point {
  const rect = normalizeRect(el.start, el.end);
  return { x: rect.x + rect.w * 0.15, y: rect.y + rect.h + 20 };
}

/** Visible handle positions for rendering */
export function getHandlePositions(el: SketchElement, bounds: Bounds): Point[] {
  if (el.type === 'line' || el.type === 'arrow' || el.type === 'double-arrow') {
    return [{ ...el.start }, { ...el.end }];
  }
  if (el.type === 'text') {
    const positions = getCornerHandlePositions(bounds, 4);
    return [positions[4]]; // only 'se' handle for text
  }
  return getCornerHandlePositions(bounds, 4);
}

function isNearPoint(point: Point, target: Point): boolean {
  const threshold = HANDLE_SIZE + 4;
  return Math.abs(point.x - target.x) <= threshold && Math.abs(point.y - target.y) <= threshold;
}

/** Transform a world-space point into the element's local (unrotated) space */
function toLocalPoint(point: Point, center: Point, rotation: number): Point {
  if (rotation === 0) return point;
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * Math.cos(-rotation) - dy * Math.sin(-rotation),
    y: center.y + dx * Math.sin(-rotation) + dy * Math.cos(-rotation),
  };
}

/** Hit-test all handles of an element, returning the matched handle or null */
export function hitTestHandle(
  point: Point,
  el: SketchElement,
  ctx: CanvasRenderingContext2D
): ResizeHandle | null {
  const rotation = el.rotation || 0;
  const bounds = getElementBounds(ctx, el, true);
  const cx = bounds.x + bounds.w / 2;
  const cy = bounds.y + bounds.h / 2;

  const localPoint = toLocalPoint(point, { x: cx, y: cy }, rotation);

  // Speech bubble tail handle (check first — it may overlap corner handles)
  if (el.type === 'speech-bubble') {
    const tailTip = el.tailTip ?? getDefaultTailTip(el);
    if (isNearPoint(localPoint, tailTip)) return 'tail';
  }

  // Rotation handle
  const rotHandle = getRotationHandlePosition(bounds);
  if (isNearPoint(localPoint, rotHandle)) return 'rotate';

  // Line/arrow: start and end handles only
  if (el.type === 'line' || el.type === 'arrow' || el.type === 'double-arrow') {
    if (isNearPoint(localPoint, el.start)) return 'start';
    if (isNearPoint(localPoint, el.end)) return 'end';
    return null;
  }

  // Text: bottom-right (se) handle only
  if (el.type === 'text') {
    const pad = 4;
    const positions = getCornerHandlePositions(bounds, pad);
    if (isNearPoint(localPoint, positions[4])) return 'se';
    return null;
  }

  const pad = 4;
  const positions = getCornerHandlePositions(bounds, pad);
  const handleNames: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

  for (let i = 0; i < positions.length; i++) {
    if (isNearPoint(localPoint, positions[i])) return handleNames[i];
  }
  return null;
}

/** Transform a world-space point to unrotated local space for resize calculations */
export function worldToLocalPoint(point: Point, center: Point, rotation: number): Point {
  return toLocalPoint(point, center, rotation);
}
