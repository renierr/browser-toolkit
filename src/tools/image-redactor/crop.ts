import type { Rect, Point, HandleType } from './types';

const HANDLE_SIZE = 24; // Hitbox Größe
const MIN_SIZE = 50;

export function getHitHandle(pos: Point, rect: Rect): HandleType {
  const half = HANDLE_SIZE / 2;

  const isHit = (tx: number, ty: number) =>
    Math.abs(pos.x - tx) <= half && Math.abs(pos.y - ty) <= half;

  if (isHit(rect.x, rect.y)) return 'tl';
  if (isHit(rect.x + rect.w, rect.y)) return 'tr';
  if (isHit(rect.x, rect.y + rect.h)) return 'bl';
  if (isHit(rect.x + rect.w, rect.y + rect.h)) return 'br';

  // Check 'Inside' für Move
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
    newRect.x += delta.x;
    newRect.y += delta.y;
    // Optional: Hier Bounds check einfügen, damit man nicht aus dem Bild schiebt
  } else if (handle) {
    if (handle.includes('l')) {
      newRect.x += delta.x;
      newRect.w -= delta.x;
    }
    if (handle.includes('r')) {
      newRect.w += delta.x;
    }
    if (handle.includes('t')) {
      newRect.y += delta.y;
      newRect.h -= delta.y;
    }
    if (handle.includes('b')) {
      newRect.h += delta.y;
    }
  }

  // Constraints erzwingen (Min Size & Negativ-Werte verhindern)
  if (newRect.w < MIN_SIZE) newRect.w = MIN_SIZE;
  if (newRect.h < MIN_SIZE) newRect.h = MIN_SIZE;

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
