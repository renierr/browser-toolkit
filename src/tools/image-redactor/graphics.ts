import type { Operation, Rect } from './types';

// Reusable offscreen canvases to avoid GC pressure
let _srcCanvas: HTMLCanvasElement | null = null;
let _dstCanvas: HTMLCanvasElement | null = null;
let noiseCanvas: HTMLCanvasElement | null = null;

function getWorkCanvas(
  width: number,
  height: number,
  index: 0 | 1 = 0
): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas =
    index === 0
      ? (_srcCanvas ??= document.createElement('canvas'))
      : (_dstCanvas ??= document.createElement('canvas'));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.clearRect(0, 0, width, height);
  return [canvas, ctx];
}

export function cleanupWorkCanvases() {
  if (_srcCanvas) {
    _srcCanvas.width = 0;
    _srcCanvas.height = 0;
    _srcCanvas = null;
  }
  if (_dstCanvas) {
    _dstCanvas.width = 0;
    _dstCanvas.height = 0;
    _dstCanvas = null;
  }
}

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
  canvas: HTMLCanvasElement,
  operation: Operation
) {
  const { rect, tool: type, intensity, color } = operation;
  const { x, y, w, h } = rect;
  if (w < 1 || h < 1) return;

  if (type === 'fill') {
    ctx.fillStyle = color || '#000000';
    ctx.fillRect(x, y, w, h);
    return;
  }

  if (type === 'blur') {
    // Add padding to handle blur edge bleeding
    const blurAmount = Math.max(1, intensity * 0.5);
    const padding = Math.ceil(blurAmount * 2);

    // Calculate padded region (clamped to canvas bounds)
    const px = Math.max(0, x - padding);
    const py = Math.max(0, y - padding);
    const px2 = Math.min(canvas.width, x + w + padding);
    const py2 = Math.min(canvas.height, y + h + padding);
    const pw = px2 - px;
    const ph = py2 - py;

    // Get work canvases
    const [srcCanvas, srcCtx] = getWorkCanvas(pw, ph, 0);
    const [dstCanvas, dstCtx] = getWorkCanvas(pw, ph, 1);

    // Copy padded region to source canvas
    srcCtx.drawImage(canvas, px, py, pw, ph, 0, 0, pw, ph);

    // Apply blur filter drawing from src to dst
    dstCtx.filter = `blur(${blurAmount}px)`;
    dstCtx.drawImage(srcCanvas, 0, 0);
    dstCtx.filter = 'none';

    // Calculate the inner region coordinates relative to padded canvas
    const innerX = x - px;
    const innerY = y - py;

    // Only draw back the original selection area (not the padding)
    ctx.clearRect(x, y, w, h);
    ctx.drawImage(dstCanvas, innerX, innerY, w, h, x, y, w, h);
    return;
  }

  if (type === 'pixelate') {
    const minDim = Math.min(w, h);
    const factor = 0.02 + (intensity / 100) * 0.18;
    const blockSize = Math.max(4, minDim * factor);

    const sw = Math.max(1, Math.floor(w / blockSize));
    const sh = Math.max(1, Math.floor(h / blockSize));

    // Get work canvases - small one for downscaling
    const [smallCanvas, smallCtx] = getWorkCanvas(sw, sh, 0);

    // Downscale directly from main canvas region
    smallCtx.imageSmoothingEnabled = true; // Average colors when downscaling
    smallCtx.drawImage(canvas, x, y, w, h, 0, 0, sw, sh);

    // Upscale back without smoothing for pixelated look
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(x, y, w, h);
    ctx.drawImage(smallCanvas, 0, 0, sw, sh, x, y, w, h);
    ctx.restore();
    return;
  }

  if (type === 'noise') {
    const noiseCanvas = getNoiseCanvas();
    const pattern = ctx.createPattern(noiseCanvas, 'repeat');

    if (pattern) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();

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
