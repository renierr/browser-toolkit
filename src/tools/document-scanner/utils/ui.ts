import type { Point } from './perspective';

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
