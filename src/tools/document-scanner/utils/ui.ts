import type { Point } from './perspective';

export function drawLiveOverlay(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  detectedCorners: Point[] | null,
  vWidth: number,
  vHeight: number
) {
  canvas.width = video.clientWidth;
  canvas.height = video.clientHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!detectedCorners) return;

  const scaleX = canvas.width / vWidth;
  const scaleY = canvas.height / vHeight;

  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 3;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(detectedCorners[0].x * scaleX, detectedCorners[0].y * scaleY);
  for (let i = 1; i < 4; i++) {
    ctx.lineTo(detectedCorners[i].x * scaleX, detectedCorners[i].y * scaleY);
  }
  ctx.closePath();
  ctx.stroke();
}

export function drawPerspectiveOverlay(
  ctx: CanvasRenderingContext2D,
  corners: Point[]
) {
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < 4; i++) {
    ctx.lineTo(corners[i].x, corners[i].y);
  }
  ctx.closePath();
  ctx.stroke();

  ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
  ctx.fill();
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
