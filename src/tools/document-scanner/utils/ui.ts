import type { Point } from './perspective';
import type { ScannedPage } from '../types';

// Cache for live overlay canvas context (called at 60fps)
let overlayCtxCache: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null = null;

function getOverlayCtx(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  if (!overlayCtxCache || overlayCtxCache.canvas !== canvas) {
    overlayCtxCache = { canvas, ctx: canvas.getContext('2d')! };
  }
  return overlayCtxCache.ctx;
}

/** Release cached references. Call on tool cleanup / destroy. */
export function resetUiState() {
  overlayCtxCache = null;
}

export function drawLiveOverlay(
  canvas: HTMLCanvasElement,
  corners: Point[] | null,
  color = '#3b82f6'
) {
  const ctx = getOverlayCtx(canvas);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!corners) return;

  // Draw a semi-transparent fill for the detected area
  ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < 4; i++) {
    ctx.lineTo(corners[i].x, corners[i].y);
  }
  ctx.closePath();
  ctx.fill();

  // Draw the border with a glow effect
  ctx.strokeStyle = color;
  ctx.lineWidth = 6; // Thicker
  ctx.lineJoin = 'round';
  ctx.shadowBlur = 10;
  ctx.shadowColor = color;

  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < 4; i++) {
    ctx.lineTo(corners[i].x, corners[i].y);
  }
  ctx.closePath();
  ctx.stroke();

  // Reset shadow for other drawings
  ctx.shadowBlur = 0;

  // Draw corner points (matching the new handle style: hollow with cross)
  corners.forEach((p) => {
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
    ctx.stroke();

    // Crosshair
    ctx.beginPath();
    ctx.moveTo(p.x - 12, p.y);
    ctx.lineTo(p.x + 12, p.y);
    ctx.moveTo(p.x, p.y - 12);
    ctx.lineTo(p.x, p.y + 12);
    ctx.stroke();
  });
}

export function drawPerspectiveOverlay(ctx: CanvasRenderingContext2D, corners: Point[]) {
  ctx.save();
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 6; // Thicker
  ctx.lineJoin = 'round';

  // Make perspective lines dotted/dashed
  ctx.setLineDash([15, 10]);

  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < 4; i++) {
    ctx.lineTo(corners[i].x, corners[i].y);
  }
  ctx.closePath();
  ctx.stroke();

  ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
  ctx.fill();
  ctx.restore();
}

export function updateCornerHandles(
  container: HTMLElement,
  corners: Point[],
  canvas: HTMLCanvasElement,
  onStart: (e: PointerEvent, index: number, isEdge?: boolean) => void
) {
  if (!canvas.width || !canvas.height) return;

  // Total handles: 4 corners + 4 edges
  const totalHandles = 8;
  let handles = container.querySelectorAll('.corner-handle, .edge-handle');

  if (handles.length !== totalHandles) {
    container.innerHTML = '';
    // Create 4 corner handles
    for (let i = 0; i < 4; i++) {
      const handle = document.createElement('div');
      handle.className = 'corner-handle';
      handle.addEventListener('pointerdown', (e) => onStart(e as PointerEvent, i, false));
      container.appendChild(handle);
    }
    // Create 4 edge handles
    for (let i = 0; i < 4; i++) {
      const handle = document.createElement('div');
      handle.className = 'edge-handle';
      // Edge 0 (TL→TR) = top, Edge 2 (BR→BL) = bottom → Y axis only
      // Edge 1 (TR→BR) = right, Edge 3 (BL→TL) = left → X axis only
      handle.dataset.axis = i === 0 || i === 2 ? 'y' : 'x';
      handle.addEventListener('pointerdown', (e) => onStart(e as PointerEvent, i, true));
      container.appendChild(handle);
    }
    handles = container.querySelectorAll('.corner-handle, .edge-handle');
  }

  // Update corner handles
  for (let i = 0; i < 4; i++) {
    const p = corners[i];
    const handle = handles[i] as HTMLElement;
    handle.style.left = `${(p.x / canvas.width) * 100}%`;
    handle.style.top = `${(p.y / canvas.height) * 100}%`;
  }

  // Update edge handles (midpoints)
  for (let i = 0; i < 4; i++) {
    const p1 = corners[i];
    const p2 = corners[(i + 1) % 4];
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    const handle = handles[i + 4] as HTMLElement;
    handle.style.left = `${(midX / canvas.width) * 100}%`;
    handle.style.top = `${(midY / canvas.height) * 100}%`;
  }
}

export function updateMagnifier(
  canvas: HTMLCanvasElement,
  originalImage: HTMLImageElement,
  magnifier: HTMLElement,
  magnifierCanvas: HTMLCanvasElement,
  mCtx: CanvasRenderingContext2D,
  point: Point
) {
  const rect = canvas.getBoundingClientRect();
  const magSize = 128;
  const zoom = 2;

  // Position magnifier relative to the handle's display position
  const handleDisplayX = (point.x / canvas.width) * rect.width;
  const handleDisplayY = (point.y / canvas.height) * rect.height;

  let left = handleDisplayX - magSize / 2;
  let top = handleDisplayY - magSize - 60; // Position above the handle

  // Viewport-relative boundary check
  const magRect = {
    left: rect.left + left,
    top: rect.top + top,
    right: rect.left + left + magSize,
    bottom: rect.top + top + magSize,
  };

  // Ensure top is visible in viewport
  if (magRect.top < 0) {
    // If it's too high, move it below the handle
    top = handleDisplayY + 40;
  }

  // Ensure left/right are within viewport
  if (magRect.left < 0) {
    left = -rect.left; // Align to viewport left
  } else if (magRect.right > window.innerWidth) {
    left = window.innerWidth - rect.left - magSize; // Align to viewport right
  }

  // Final check to keep it within the canvas container if possible (optional but good)
  if (left < 0) left = 0;
  if (left + magSize > rect.width) left = rect.width - magSize;
  if (top + magSize > rect.height) {
    // If it's too low and going off the bottom of the canvas, adjust it
    top = rect.height - magSize;
  }

  magnifier.style.left = `${left}px`;
  magnifier.style.top = `${top}px`;

  magnifierCanvas.width = magSize;
  magnifierCanvas.height = magSize;

  // Draw the magnified area from the original image
  // point is in image coordinates
  mCtx.clearRect(0, 0, magSize, magSize);

  // Draw white background first (for transparent images)
  mCtx.fillStyle = 'white';
  mCtx.fillRect(0, 0, magSize, magSize);

  mCtx.drawImage(
    originalImage,
    point.x - magSize / 2 / zoom,
    point.y - magSize / 2 / zoom,
    magSize / zoom,
    magSize / zoom,
    0,
    0,
    magSize,
    magSize
  );

  // Draw crosshair on magnifier
  mCtx.strokeStyle = 'rgba(59, 130, 246, 0.8)'; // Increased opacity
  mCtx.lineWidth = 2; // Increased line width
  mCtx.beginPath();
  mCtx.moveTo(magSize / 2, 0);
  mCtx.lineTo(magSize / 2, magSize);
  mCtx.moveTo(0, magSize / 2);
  mCtx.lineTo(magSize, magSize / 2);
  mCtx.stroke();

  // Draw a small circle at the center of the crosshair for better precision
  mCtx.beginPath();
  mCtx.arc(magSize / 2, magSize / 2, 2, 0, Math.PI * 2);
  mCtx.fillStyle = 'white';
  mCtx.fill();
  mCtx.stroke();
}

export function renderPageList(
  container: HTMLElement,
  pages: ScannedPage[],
  currentPageIndex: number,
  onSelect: (index: number) => void
) {
  container.innerHTML = '';
  pages.forEach((page, index) => {
    const card = document.createElement('div');
    card.className = `page-card relative group aspect-[3/4] bg-base-100 rounded-lg overflow-hidden border-2 cursor-pointer touch-none ${
      index === currentPageIndex
        ? 'active border-primary ring-2 ring-primary/20'
        : 'border-base-300'
    }`;
    card.dataset.index = index.toString();

    const thumb = document.createElement('img');
    thumb.src = page.thumbnailUrl || '';
    thumb.className = 'checkerboard-bg w-full h-full object-contain pointer-events-none bg-white';

    card.innerHTML = `
      <div class="absolute top-1 right-1 z-10">
        <button class="btn btn-circle btn-error btn-xs btn-remove-page" data-index="${index}">
          <i data-lucide="x" class="w-3 h-3"></i>
        </button>
      </div>
      <div class="absolute bottom-1 right-1 bg-base-300/90 px-1.5 rounded text-[10px] font-bold z-10">
        ${index + 1}
      </div>
    `;
    card.prepend(thumb);

    card.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.btn-remove-page')) return;
      onSelect(index);
    });

    container.appendChild(card);
  });
}

export function calculateSmoothedPosition(
  targetX: number,
  targetY: number,
  currentX: number,
  currentY: number,
  smoothingFactor: number
): { x: number; y: number } {
  return {
    x: currentX + (targetX - currentX) * smoothingFactor,
    y: currentY + (targetY - currentY) * smoothingFactor,
  };
}

export function constrainPoint(
  x: number,
  y: number,
  width: number,
  height: number
): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(width, x)),
    y: Math.max(0, Math.min(height, y)),
  };
}
