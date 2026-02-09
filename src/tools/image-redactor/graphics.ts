import type { Operation, Rect } from './types';

export function drawCropOverlay(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  rect: Rect,
  baseImage: CanvasImageSource
) {
  // Clear canvas first
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Draw base image
  ctx.drawImage(baseImage, 0, 0);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw the undimmed part by clearing and redrawing the cropped region
  if (rect.w > 0 && rect.h > 0) {
    ctx.clearRect(rect.x, rect.y, rect.w, rect.h);
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
  canvas: HTMLCanvasElement,
  snapshot: CanvasImageSource,
  rect: Rect,
  color?: string
) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(snapshot, 0, 0);
  ctx.strokeStyle = color || '#ff0000';
  ctx.lineWidth = 2;
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  ctx.fillStyle = color ? color + '1A' : 'rgba(255,0,0,0.1)'; // 1A is approx 10% alpha
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
}

export function applyEffect(
  ctx: CanvasRenderingContext2D,
  _canvas: HTMLCanvasElement,
  operation: Operation
) {
  const { rect, tool: type, intensity, color } = operation;
  const { x, y, w, h } = rect;
  if (w < 1 || h < 1) return;

  if (type === 'fill') {
    ctx.fillStyle = color || '#000000';
    ctx.fillRect(x, y, w, h);
  } else if (type === 'blur') {
    // Extract the region to blur
    const regionData = ctx.getImageData(x, y, w, h);

    // Create source canvas with the region
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = w;
    srcCanvas.height = h;
    const srcCtx = srcCanvas.getContext('2d')!;
    srcCtx.putImageData(regionData, 0, 0);

    // Create destination canvas for blur effect
    const blurCanvas = document.createElement('canvas');
    blurCanvas.width = w;
    blurCanvas.height = h;
    const blurCtx = blurCanvas.getContext('2d')!;

    // Apply blur by drawing from source to destination with filter
    const blurAmount = Math.max(1, intensity * 0.2);
    blurCtx.filter = `blur(${blurAmount}px)`;
    blurCtx.drawImage(srcCanvas, 0, 0);

    // Clear the original region and draw the blurred result
    ctx.clearRect(x, y, w, h);
    ctx.drawImage(blurCanvas, 0, 0, w, h, x, y, w, h);
  } else if (type === 'pixelate') {
    const minDim = Math.min(w, h);
    const factor = 0.02 + (intensity / 100) * 0.18;
    const blockSize = Math.max(4, minDim * factor);

    const sw = Math.floor(w / blockSize);
    const sh = Math.floor(h / blockSize);
    if (sw < 1 || sh < 1) return;

    // Extract the region to pixelate
    const regionData = ctx.getImageData(x, y, w, h);

    // Create offscreen canvas for the region
    const regionCanvas = document.createElement('canvas');
    regionCanvas.width = w;
    regionCanvas.height = h;
    const regionCtx = regionCanvas.getContext('2d')!;
    regionCtx.putImageData(regionData, 0, 0);

    // Create small canvas for downscaling
    const offCanvas = document.createElement('canvas');
    offCanvas.width = sw;
    offCanvas.height = sh;
    const offCtx = offCanvas.getContext('2d')!;

    offCtx.imageSmoothingEnabled = false;

    // Downscale from the region canvas
    offCtx.drawImage(regionCanvas, 0, 0, w, h, 0, 0, sw, sh);

    // Clear the original region and draw pixelated result
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(x, y, w, h);
    ctx.drawImage(offCanvas, 0, 0, sw, sh, x, y, w, h);
    ctx.restore();
  } else if (type === 'noise') {
    const noiseCanvas = getNoiseCanvas();
    const pattern = ctx.createPattern(noiseCanvas, 'repeat');

    if (pattern) {
      ctx.save();

      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.globalAlpha = 1.0;

      const scale = 1 + (intensity / 100) * 3;

      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = pattern;

      ctx.translate(x, y);
      ctx.scale(scale, scale);
      ctx.fillRect(0, 0, w / scale + 1, h / scale + 1);

      ctx.restore();
    }
  }
}

// Singleton noise canvas to avoid regeneration and shimmering
let noiseCanvas: HTMLCanvasElement | null = null;

function getNoiseCanvas() {
  if (noiseCanvas) return noiseCanvas;

  const size = 256;
  noiseCanvas = document.createElement('canvas');
  noiseCanvas.width = size;
  noiseCanvas.height = size;
  const ctx = noiseCanvas.getContext('2d')!;
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const v = Math.random() * 255;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  return noiseCanvas;
}
