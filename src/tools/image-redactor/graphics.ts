import type { Operation, Rect } from './types';

export function drawCropOverlay(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  rect: Rect,
  baseImage: CanvasImageSource
) {
  // Use drawImage for GPU acceleration
  ctx.drawImage(baseImage, 0, 0);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw the undimmed part
  if (rect.w > 0 && rect.h > 0) {
    ctx.drawImage(baseImage, rect.x, rect.y, rect.w, rect.h, rect.x, rect.y, rect.w, rect.h);
  }

  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

  ctx.fillStyle = '#fff';

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

export function drawRedactPreview(
  ctx: CanvasRenderingContext2D,
  snapshot: CanvasImageSource,
  rect: Rect,
  color?: string
) {
  ctx.drawImage(snapshot, 0, 0);
  ctx.strokeStyle = color || '#ff0000';
  ctx.lineWidth = 2;
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  ctx.fillStyle = color ? color + '1A' : 'rgba(255,0,0,0.1)'; // 1A is approx 10% alpha
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
}

export function applyEffect(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  operation: Operation
) {
  const { rect, tool: type, intensity, color } = operation;
  const { x, y, w, h } = rect;
  if (w < 1 || h < 1) return;

  if (type === 'fill') {
    ctx.fillStyle = color || '#000000';
    ctx.fillRect(x, y, w, h);
  } else if (type === 'blur') {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    const blurAmount = Math.max(1, intensity * 0.4);
    ctx.filter = `blur(${blurAmount}px)`;
    ctx.drawImage(canvas, 0, 0);
    ctx.restore();
  } else if (type === 'pixelate') {
    const minDim = Math.min(w, h);
    const factor = 0.02 + (intensity / 100) * 0.18;
    const blockSize = Math.max(4, minDim * factor);

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
  } else if (type === 'noise') {
    const imageData = ctx.getImageData(x, y, w, h);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const noise = Math.random() * 255;
      data[i] = noise; // R
      data[i + 1] = noise; // G
      data[i + 2] = noise; // B
      // Alpha remains unchanged or can be set to 255
      // data[i + 3] = 255;
    }

    const offCanvas = document.createElement('canvas');
    offCanvas.width = w;
    offCanvas.height = h;
    const offCtx = offCanvas.getContext('2d')!;
    const noiseImage = offCtx.createImageData(w, h);
    const noiseData = noiseImage.data;

    for (let i = 0; i < noiseData.length; i += 4) {
      const v = Math.random() * 255;
      noiseData[i] = v;
      noiseData[i + 1] = v;
      noiseData[i + 2] = v;
      noiseData[i + 3] = 255;
    }
    offCtx.putImageData(noiseImage, 0, 0);

    ctx.save();
    ctx.globalAlpha = Math.max(0.1, intensity / 100);
    ctx.drawImage(offCanvas, x, y);
    ctx.restore();
  }
}
