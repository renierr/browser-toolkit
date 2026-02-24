/**
 * Pointer-based drag handling for perspective corner and edge handles.
 * Also provides keyboard nudge support.
 *
 * All state is scoped to the instance returned by createHandleDrag().
 */
import type { Point } from './perspective';
import type { ScannedPage } from '../types';
import { calculateSmoothedPosition, constrainPoint, updateMagnifier } from './ui';

export interface HandleDragDeps {
  canvas: HTMLCanvasElement;
  magnifier: HTMLElement;
  magnifierCanvas: HTMLCanvasElement;
  mCtx: CanvasRenderingContext2D;
  getPage: () => ScannedPage | undefined;
  updateEditor: () => void;
}

export interface HandleDrag {
  /** Pointer-down handler to pass to updateCornerHandles */
  onStart: (e: PointerEvent, index: number, isEdge?: boolean) => void;
  getSelectedHandle(): number | null;
  clearSelectedHandle(): void;
  nudge(dx: number, dy: number): void;
  destroy(): void;
}

const SMOOTHING_FACTOR = 0.4;

export function createHandleDrag(deps: HandleDragDeps): HandleDrag {
  const { canvas, magnifier, magnifierCanvas, mCtx, getPage, updateEditor } = deps;

  // All state is local to this closure
  let activeHandle: number | null = null;
  let isEdgeDragging = false;
  let selectedHandle: number | null = null;
  let activePointerId: number | null = null;
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let smoothedX = 0;
  let smoothedY = 0;

  // --- Drag handlers ---

  function onMove(e: PointerEvent) {
    if (activeHandle === null) return;
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    e.preventDefault();

    if (!isDragging) {
      const dist = Math.sqrt((e.clientX - startX) ** 2 + (e.clientY - startY) ** 2);
      if (dist > 3) isDragging = true;
      else return;
    }

    const page = getPage();
    if (!page) return;

    const rect = canvas.getBoundingClientRect();
    const targetX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const targetY = (e.clientY - rect.top) * (canvas.height / rect.height);

    const smoothed = calculateSmoothedPosition(targetX, targetY, smoothedX, smoothedY, SMOOTHING_FACTOR);
    const dx = smoothed.x - smoothedX;
    const dy = smoothed.y - smoothedY;
    smoothedX = smoothed.x;
    smoothedY = smoothed.y;

    if (isEdgeDragging) {
      const i1 = activeHandle;
      const i2 = (activeHandle + 1) % 4;

      // Edge 0 (TL→TR) = top, Edge 2 (BR→BL) = bottom → move Y only
      // Edge 1 (TR→BR) = right, Edge 3 (BL→TL) = left → move X only
      const isHorizontalEdge = activeHandle === 0 || activeHandle === 2;
      const constrainedDx = isHorizontalEdge ? 0 : dx;
      const constrainedDy = isHorizontalEdge ? dy : 0;

      page.corners[i1] = constrainPoint(
        page.corners[i1].x + constrainedDx, page.corners[i1].y + constrainedDy,
        canvas.width, canvas.height
      );
      page.corners[i2] = constrainPoint(
        page.corners[i2].x + constrainedDx, page.corners[i2].y + constrainedDy,
        canvas.width, canvas.height
      );
    } else {
      let newX = smoothedX;
      let newY = smoothedY;

      if (e.pointerType === 'touch' || e.pointerType === 'pen') {
        const touchOffset = 60 * (canvas.height / rect.height);
        newY = smoothedY - touchOffset;
      }

      page.corners[activeHandle] = constrainPoint(newX, newY, canvas.width, canvas.height);
    }

    updateEditor();

    let magPoint: Point;
    if (isEdgeDragging) {
      const p1 = page.corners[activeHandle];
      const p2 = page.corners[(activeHandle + 1) % 4];
      magPoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    } else {
      magPoint = page.corners[activeHandle];
    }
    updateMagnifier(canvas, page.originalImage!, magnifier, magnifierCanvas, mCtx, magPoint);
  }

  function onEnd(e: PointerEvent) {
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    const target = e.currentTarget as HTMLElement;
    target.removeEventListener('pointermove', onMove);
    target.removeEventListener('pointerup', onEnd);
    target.removeEventListener('pointercancel', onEnd);
    activeHandle = null;
    activePointerId = null;
    magnifier.classList.add('hidden');
  }

  function onStart(e: PointerEvent, index: number, isEdge: boolean = false) {
    e.preventDefault();
    activeHandle = index;
    isEdgeDragging = isEdge;
    if (!isEdge) selectedHandle = index;
    activePointerId = e.pointerId;

    isDragging = false;
    startX = e.clientX;
    startY = e.clientY;

    const rect = canvas.getBoundingClientRect();
    smoothedX = (e.clientX - rect.left) * (canvas.width / rect.width);
    smoothedY = (e.clientY - rect.top) * (canvas.height / rect.height);

    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onEnd);
    target.addEventListener('pointercancel', onEnd);

    magnifier.classList.remove('hidden');

    const page = getPage();
    if (!page || !page.originalImage) return;

    let magPoint: Point;
    if (isEdge) {
      const p1 = page.corners[index];
      const p2 = page.corners[(index + 1) % 4];
      magPoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    } else {
      magPoint = page.corners[index];
    }

    updateMagnifier(canvas, page.originalImage, magnifier, magnifierCanvas, mCtx, magPoint);
    updateEditor();
  }

  // --- Public API ---

  return {
    onStart,

    getSelectedHandle() {
      return selectedHandle;
    },

    clearSelectedHandle() {
      selectedHandle = null;
    },

    nudge(dx: number, dy: number) {
      if (selectedHandle === null) return;
      const page = getPage();
      if (!page) return;

      const corner = page.corners[selectedHandle];
      const nudgeAmount = 2;
      page.corners[selectedHandle] = constrainPoint(
        corner.x + dx * nudgeAmount,
        corner.y + dy * nudgeAmount,
        canvas.width,
        canvas.height
      );
      updateEditor();
    },

    destroy() {
      activeHandle = null;
      activePointerId = null;
      selectedHandle = null;
    },
  };
}
