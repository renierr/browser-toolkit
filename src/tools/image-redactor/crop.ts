import type { Rect, Point, HandleType } from './types';

const HANDLE_SIZE = 24;
const MIN_SIZE = 50;

export function getHitHandle(pos: Point, rect: Rect): HandleType {
  const half = HANDLE_SIZE / 2;

  const isHit = (tx: number, ty: number) =>
    Math.abs(pos.x - tx) <= half && Math.abs(pos.y - ty) <= half;

  if (isHit(rect.x, rect.y)) return 'tl';
  if (isHit(rect.x + rect.w, rect.y)) return 'tr';
  if (isHit(rect.x, rect.y + rect.h)) return 'bl';
  if (isHit(rect.x + rect.w, rect.y + rect.h)) return 'br';

  if (
    pos.x > rect.x + half &&
    pos.x < rect.x + rect.w - half &&
    pos.y > rect.y + half &&
    pos.y < rect.y + rect.h - half
  ) {
    return 'move';
  }

  return null;
}

export function resizeRect(
  handle: HandleType,
  startRect: Rect,
  delta: Point,
  bounds: { w: number; h: number }
): Rect {
  const newRect = { ...startRect };

  if (handle === 'move') {
    newRect.x = Math.max(0, Math.min(startRect.x + delta.x, bounds.w - startRect.w));
    newRect.y = Math.max(0, Math.min(startRect.y + delta.y, bounds.h - startRect.h));
    return newRect;
  }

  if (handle) {
    if (handle.includes('l')) {
      const maxX = startRect.x + startRect.w - MIN_SIZE;
      newRect.x = Math.max(0, Math.min(startRect.x + delta.x, maxX));
      newRect.w = startRect.x + startRect.w - newRect.x;
    }
    if (handle.includes('r')) {
      const maxW = bounds.w - startRect.x;
      newRect.w = Math.max(MIN_SIZE, Math.min(startRect.w + delta.x, maxW));
    }
    if (handle.includes('t')) {
      const maxY = startRect.y + startRect.h - MIN_SIZE;
      newRect.y = Math.max(0, Math.min(startRect.y + delta.y, maxY));
      newRect.h = startRect.y + startRect.h - newRect.y;
    }
    if (handle.includes('b')) {
      const maxH = bounds.h - startRect.y;
      newRect.h = Math.max(MIN_SIZE, Math.min(startRect.h + delta.y, maxH));
    }
  }

  return newRect;
}

export function normalizeRect(x: number, y: number, w: number, h: number): Rect {
  let nx = x,
    ny = y,
    nw = w,
    nh = h;
  if (nw < 0) {
    nx += nw;
    nw = Math.abs(nw);
  }
  if (nh < 0) {
    ny += nh;
    nh = Math.abs(nh);
  }
  return { x: nx, y: ny, w: nw, h: nh };
}
