import type { Point, SketchElement } from '../types.ts';
import { getElementBounds } from './bounds.ts';
import {
  getHandleSize,
  getHandlePositions,
  getRotationHandlePosition,
  getDefaultTailTip,
} from './handles.ts';
import { normalizeRect } from './drawing-shared.ts';

export type SelectionRenderParams = {
  ctx: CanvasRenderingContext2D;
  elements: SketchElement[];
  selectedIds: Set<string>;
  selectionBox: { start: Point; end: Point } | null;
  lassoPath: Point[] | null;
  activeSnapPoint: Point | null;
};

/**
 * Draws selection highlights, bounding boxes, handles, and snap indicators
 */
export function drawSelectionDecorations(params: SelectionRenderParams): void {
  const { ctx, elements, selectedIds, selectionBox, lassoPath, activeSnapPoint } = params;

  // Draw selection box if active
  if (selectionBox) {
    const rect = normalizeRect(selectionBox.start, selectionBox.end);
    ctx.fillStyle = 'rgba(37, 99, 235, 0.1)';
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 1;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  }

  // Draw lasso path if active
  if (lassoPath && lassoPath.length > 1) {
    ctx.beginPath();
    ctx.moveTo(lassoPath[0].x, lassoPath[0].y);
    for (let i = 1; i < lassoPath.length; i++) {
      ctx.lineTo(lassoPath[i].x, lassoPath[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(37, 99, 235, 0.1)';
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (selectedIds.size === 0) return;

  const handleSize = getHandleSize();

  for (const id of selectedIds) {
    const el = elements.find((e) => e.id === id);
    if (!el) continue;

    const bounds = getElementBounds(ctx, el, true); // unrotated
    const rotation = el.rotation || 0;
    const centerX = bounds.x + bounds.w / 2;
    const centerY = bounds.y + bounds.h / 2;

    ctx.save();
    if (rotation !== 0) {
      ctx.translate(centerX, centerY);
      ctx.rotate(rotation);
      ctx.translate(-centerX, -centerY);
    }

    const pad = 4;

    // Dashed bounding box
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2;
    ctx.strokeRect(bounds.x - pad, bounds.y - pad, bounds.w + pad * 2, bounds.h + pad * 2);
    ctx.setLineDash([]);

    // Resize handles (only for single selection)
    if (selectedIds.size === 1) {
      const handles = getHandlePositions(el, bounds);
      ctx.fillStyle = '#2563eb';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      for (const pos of handles) {
        ctx.fillRect(pos.x - handleSize / 2, pos.y - handleSize / 2, handleSize, handleSize);
        ctx.strokeRect(pos.x - handleSize / 2, pos.y - handleSize / 2, handleSize, handleSize);
      }

      // Draw rotation handle
      const rotHandle = getRotationHandlePosition(bounds);
      ctx.beginPath();
      ctx.moveTo(bounds.x + bounds.w / 2, bounds.y - pad);
      ctx.lineTo(rotHandle.x, rotHandle.y);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(rotHandle.x, rotHandle.y, handleSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Draw tail handle for speech bubbles
      if (el.type === 'speech-bubble') {
        const tailPos = el.tailTip ?? getDefaultTailTip(el);
        ctx.fillStyle = '#f59e0b';
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(tailPos.x, tailPos.y, handleSize / 2 + 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Draw active snap indicator if resizing in select mode
  if (activeSnapPoint) {
    ctx.save();
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(activeSnapPoint.x, activeSnapPoint.y, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
