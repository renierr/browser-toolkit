import type { Point } from './perspective';
import type { ScannedPage } from '../types';

export function drawLiveOverlay(
  canvas: HTMLCanvasElement,
  corners: Point[] | null
) {
  const ctx = canvas.getContext('2d')!;
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
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 6; // Thicker
  ctx.lineJoin = 'round';
  ctx.shadowBlur = 10;
  ctx.shadowColor = '#3b82f6';

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
  corners.forEach(p => {
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

export function drawPerspectiveOverlay(
  ctx: CanvasRenderingContext2D,
  corners: Point[]
) {
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
  onStart: (e: PointerEvent, index: number) => void
) {
  if (!canvas.width || !canvas.height) return;

  let handles = container.querySelectorAll('.corner-handle');
  if (handles.length !== corners.length) {
    container.innerHTML = '';
    corners.forEach((_, i) => {
      const handle = document.createElement('div');
      handle.className = 'corner-handle';
      handle.addEventListener('pointerdown', (e) => onStart(e as PointerEvent, i));
      container.appendChild(handle);
    });
    handles = container.querySelectorAll('.corner-handle');
  }

  corners.forEach((p, i) => {
    const handle = handles[i] as HTMLElement;
    handle.style.left = `${(p.x / canvas.width) * 100}%`;
    handle.style.top = `${(p.y / canvas.height) * 100}%`;
  });
}

export function updateMagnifier(
  e: PointerEvent,
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

  // Position magnifier near the pointer, but keep it on screen
  let left = e.clientX - rect.left;
  let top = e.clientY - rect.top - magSize;

  // Check viewport boundaries relative to the canvas container
  // We want to position it relative to the canvas wrapper usually, but here it's absolute to the wrapper
  // Let's just ensure it doesn't go off the top/left/right/bottom of the visible area if possible.
  // Since 'magnifier' is absolute positioned inside the relative container, we use local coordinates.

  // Simple boundary check against the canvas container
  if (top < 0) {
    top = e.clientY - rect.top + 40; // Move below finger if too close to top
  }
  if (left < 0) left = 0;
  if (left + magSize > rect.width) left = rect.width - magSize;

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
    point.x - (magSize / 2) / zoom,
    point.y - (magSize / 2) / zoom,
    magSize / zoom,
    magSize / zoom,
    0, 0, magSize, magSize
  );

  // Draw crosshair on magnifier
  mCtx.strokeStyle = 'rgba(59, 130, 246, 0.5)';
  mCtx.lineWidth = 1;
  mCtx.beginPath();
  mCtx.moveTo(magSize / 2, 0);
  mCtx.lineTo(magSize / 2, magSize);
  mCtx.moveTo(0, magSize / 2);
  mCtx.lineTo(magSize, magSize / 2);
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
      index === currentPageIndex ? 'active border-primary ring-2 ring-primary/20' : 'border-base-300'
    }`;
    card.dataset.index = index.toString();

    const thumb = document.createElement('img');
    thumb.src = page.processedCanvas.toDataURL('image/jpeg', 0.5);
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

  (window as any).lucide?.createIcons();
}
