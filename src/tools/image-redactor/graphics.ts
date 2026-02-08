import type { Rect } from './types';

export function drawCropOverlay(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  rect: Rect,
  baseImage: ImageData
) {
  ctx.putImageData(baseImage, 0, 0);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.putImageData(baseImage, 0, 0, rect.x, rect.y, rect.w, rect.h);

  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

  ctx.fillStyle = '#fff';

  // Scale visual handle size based on device pixel ratio
  const dpr = window.devicePixelRatio || 1;
  const size = Math.max(32, 16 * dpr);
  const half = size / 2;

  const corners = [
    { x: rect.x, y: rect.y }, // TL
    { x: rect.x + rect.w, y: rect.y }, // TR
    { x: rect.x + rect.w, y: rect.y + rect.h }, // BR
    { x: rect.x, y: rect.y + rect.h }, // BL
  ];

  corners.forEach((c) => {
    ctx.fillRect(c.x - half, c.y - half, size, size);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(c.x - half, c.y - half, size, size);
  });

  ctx.beginPath();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  ctx.moveTo(rect.x + rect.w / 3, rect.y);
  ctx.lineTo(rect.x + rect.w / 3, rect.y + rect.h);
  ctx.moveTo(rect.x + (2 * rect.w) / 3, rect.y);
  ctx.lineTo(rect.x + (2 * rect.w) / 3, rect.y + rect.h);
  ctx.moveTo(rect.x, rect.y + rect.h / 3);
  ctx.lineTo(rect.x + rect.w, rect.y + rect.h / 3);
  ctx.moveTo(rect.x, rect.y + (2 * rect.h) / 3);
  ctx.lineTo(rect.x + rect.w, rect.y + (2 * rect.h) / 3);
  ctx.stroke();
}

export function drawRedactPreview(ctx: CanvasRenderingContext2D, snapshot: ImageData, rect: Rect) {
  ctx.putImageData(snapshot, 0, 0);
  ctx.strokeStyle = '#ff0000';
  ctx.lineWidth = 2;
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  ctx.fillStyle = 'rgba(255,0,0,0.1)';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
}

export function applyEffect(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  rect: Rect,
  type: 'pixelate' | 'blur' | 'fill'
) {
  const { x, y, w, h } = rect;
  if (w < 1 || h < 1) return;

  if (type === 'fill') {
    ctx.fillStyle = '#000000';
    ctx.fillRect(x, y, w, h);
  } else if (type === 'blur') {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.filter = 'blur(15px)';
    ctx.drawImage(canvas, 0, 0);
    ctx.restore();
  } else if (type === 'pixelate') {
    const blockSize = Math.max(8, Math.min(w, h) / 15);
    const offCanvas = document.createElement('canvas');
    const sw = Math.floor(w / blockSize);
    const sh = Math.floor(h / blockSize);
    if (sw < 1 || sh < 1) return;

    offCanvas.width = sw;
    offCanvas.height = sh;
    const offCtx = offCanvas.getContext('2d')!;

    offCtx.imageSmoothingEnabled = false;
    ctx.imageSmoothingEnabled = false;

    offCtx.drawImage(canvas, x, y, w, h, 0, 0, sw, sh);
    ctx.drawImage(offCanvas, 0, 0, sw, sh, x, y, w, h);

    ctx.imageSmoothingEnabled = true;
  }
}
