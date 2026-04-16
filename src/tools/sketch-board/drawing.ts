import type {
  DrawingMeta,
  ImageElement,
  Point,
  SketchElement,
  TextElement,
  ToolMode,
} from './types.ts';

type ImageGetter = (imageData: string) => HTMLImageElement;
let imageGetter: ImageGetter | null = null;

export function setImageGetter(fn: ImageGetter): void {
  imageGetter = fn;
}

export function normalizeRect(
  start: Point,
  end: Point
): { x: number; y: number; w: number; h: number } {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    w: Math.abs(end.x - start.x),
    h: Math.abs(end.y - start.y),
  };
}

export function drawElement(ctx: CanvasRenderingContext2D, el: SketchElement): void {
  applyStrokeStyle(ctx, el.color, el.width);

  if (el.type === 'freehand') {
    drawFreehand(ctx, el.points);
    return;
  }

  if (el.type === 'line') {
    drawLine(ctx, el.start, el.end);
    return;
  }

  if (el.type === 'rect') {
    drawRect(ctx, el.start, el.end, el.filled);
    return;
  }

  if (el.type === 'ellipse') {
    drawEllipse(ctx, el.start, el.end, el.filled);
    return;
  }

  if (el.type === 'triangle') {
    drawTriangle(ctx, el.start, el.end, el.filled);
    return;
  }

  if (el.type === 'arrow') {
    drawArrow(ctx, el.start, el.end);
    return;
  }

  if (el.type === 'text') {
    drawText(ctx, el);
    return;
  }

  if (el.type === 'image') {
    drawImage(ctx, el);
    return;
  }
}

function applyStrokeStyle(ctx: CanvasRenderingContext2D, color: string, width: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
}

function drawFreehand(ctx: CanvasRenderingContext2D, points: Point[]): void {
  if (points.length === 0) return;
  if (points.length === 1) {
    const p = points[0];
    const radius = Math.max(0.5, (ctx.lineWidth as number) / 2);
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle as string;
    ctx.fill();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();
}

function drawLine(ctx: CanvasRenderingContext2D, start: Point, end: Point): void {
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
}

function drawRect(ctx: CanvasRenderingContext2D, start: Point, end: Point, filled?: boolean): void {
  const rect = normalizeRect(start, end);
  if (rect.w < 1 || rect.h < 1) return;
  if (filled) {
    ctx.fillStyle = ctx.strokeStyle as string;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  } else {
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  }
}

function drawEllipse(
  ctx: CanvasRenderingContext2D,
  start: Point,
  end: Point,
  filled?: boolean
): void {
  const rect = normalizeRect(start, end);
  if (rect.w < 1 || rect.h < 1) return;
  ctx.beginPath();
  ctx.ellipse(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w / 2, rect.h / 2, 0, 0, Math.PI * 2);
  if (filled) {
    ctx.fillStyle = ctx.strokeStyle as string;
    ctx.fill();
  } else {
    ctx.stroke();
  }
}

function drawTriangle(
  ctx: CanvasRenderingContext2D,
  start: Point,
  end: Point,
  filled?: boolean
): void {
  const rect = normalizeRect(start, end);
  if (rect.w < 1 || rect.h < 1) return;
  const topX = rect.x + rect.w / 2;
  const topY = rect.y;
  const bottomLeftX = rect.x;
  const bottomLeftY = rect.y + rect.h;
  const bottomRightX = rect.x + rect.w;
  const bottomRightY = rect.y + rect.h;

  ctx.beginPath();
  ctx.moveTo(topX, topY);
  ctx.lineTo(bottomRightX, bottomRightY);
  ctx.lineTo(bottomLeftX, bottomLeftY);
  ctx.closePath();

  if (filled) {
    ctx.fillStyle = ctx.strokeStyle as string;
    ctx.fill();
  } else {
    ctx.stroke();
  }
}

function drawArrow(ctx: CanvasRenderingContext2D, start: Point, end: Point): void {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;

  const strokeW = ctx.lineWidth;
  const headLen = Math.min(len * 0.3, Math.max(strokeW * 3, 10));
  const angle = Math.atan2(dy, dx);
  const spread = Math.PI / 6;

  // Shaft — stop at the base of the arrowhead
  const shaftEndX = end.x - headLen * Math.cos(angle);
  const shaftEndY = end.y - headLen * Math.sin(angle);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(shaftEndX, shaftEndY);
  ctx.stroke();

  // Arrowhead — width scales with stroke
  const halfBase = Math.max(strokeW * 1.5, headLen * Math.sin(spread));
  const baseX = end.x - headLen * Math.cos(angle);
  const baseY = end.y - headLen * Math.sin(angle);
  const perpX = -Math.sin(angle);
  const perpY = Math.cos(angle);

  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(baseX + perpX * halfBase, baseY + perpY * halfBase);
  ctx.lineTo(baseX - perpX * halfBase, baseY - perpY * halfBase);
  ctx.closePath();
  ctx.fillStyle = ctx.strokeStyle as string;
  ctx.fill();
}

function drawText(ctx: CanvasRenderingContext2D, el: TextElement): void {
  ctx.font = `${el.fontStyle} ${el.fontWeight} ${el.fontSize}px ${el.fontFamily}`;
  ctx.fillStyle = el.color;
  ctx.textBaseline = 'top';
  ctx.fillText(el.text, el.position.x, el.position.y);
}

function drawImage(ctx: CanvasRenderingContext2D, el: ImageElement): void {
  if (!imageGetter) return;
  const img = imageGetter(el.imageData);
  if (img?.complete) {
    ctx.drawImage(img, el.position.x, el.position.y, el.imageWidth, el.imageHeight);
  }
}

function getImageBounds(
  _ctx: CanvasRenderingContext2D,
  el: ImageElement
): { x: number; y: number; w: number; h: number } {
  return {
    x: el.position.x,
    y: el.position.y,
    w: el.imageWidth,
    h: el.imageHeight,
  };
}

export function getTextBounds(
  ctx: CanvasRenderingContext2D,
  el: TextElement
): { x: number; y: number; w: number; h: number } {
  ctx.font = `${el.fontStyle} ${el.fontWeight} ${el.fontSize}px ${el.fontFamily}`;
  const metrics = ctx.measureText(el.text);
  const h = el.fontSize;
  return {
    x: el.position.x,
    y: el.position.y,
    w: metrics.width,
    h: h,
  };
}

/** Generic bounds for any element type */
export function getElementBounds(
  ctx: CanvasRenderingContext2D,
  el: SketchElement
): { x: number; y: number; w: number; h: number } {
  if (el.type === 'text') {
    return getTextBounds(ctx, el);
  }
  if (el.type === 'image') {
    return getImageBounds(ctx, el);
  }
  if (el.type === 'freehand') {
    if (el.points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of el.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    return {
      x: minX - el.width / 2,
      y: minY - el.width / 2,
      w: maxX - minX + el.width,
      h: maxY - minY + el.width,
    };
  }
  // line, rect, ellipse, triangle, arrow — all have start/end
  const rect = normalizeRect(el.start, el.end);
  return {
    x: rect.x - el.width / 2,
    y: rect.y - el.width / 2,
    w: rect.w + el.width,
    h: rect.h + el.width,
  };
}

export function drawLiveFreehandSegment(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  color: string,
  width: number
): void {
  applyStrokeStyle(ctx, color, width);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

export function buildMeta(
  elements: SketchElement[],
  lastTool: ToolMode,
  background: string
): DrawingMeta {
  const colors = Array.from(new Set(elements.map((el) => el.color))).slice(0, 12);
  return {
    elementCount: elements.length,
    colors,
    lastTool,
    background,
  };
}

/** Lazily created context for text measurement (avoids DOM thrash) */
let measureCtx: CanvasRenderingContext2D | null = null;
function getMeasureCtx(): CanvasRenderingContext2D {
  if (!measureCtx) {
    measureCtx = document.createElement('canvas').getContext('2d')!;
  }
  return measureCtx;
}

function computeSceneBounds(elements: SketchElement[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} | null {
  if (elements.length === 0) return null;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const el of elements) {
    if (el.type === 'freehand') {
      for (const p of el.points) {
        minX = Math.min(minX, p.x - el.width);
        minY = Math.min(minY, p.y - el.width);
        maxX = Math.max(maxX, p.x + el.width);
        maxY = Math.max(maxY, p.y + el.width);
      }
      continue;
    }

    if (el.type === 'text') {
      const bounds = getTextBounds(getMeasureCtx(), el);
      minX = Math.min(minX, bounds.x);
      minY = Math.min(minY, bounds.y);
      maxX = Math.max(maxX, bounds.x + bounds.w);
      maxY = Math.max(maxY, bounds.y + bounds.h);
      continue;
    }

    if (el.type === 'image') {
      minX = Math.min(minX, el.position.x);
      minY = Math.min(minY, el.position.y);
      maxX = Math.max(maxX, el.position.x + el.imageWidth);
      maxY = Math.max(maxY, el.position.y + el.imageHeight);
      continue;
    }

    // line, rect, ellipse, triangle, arrow
    const rect = normalizeRect(el.start, el.end);
    minX = Math.min(minX, rect.x - el.width);
    minY = Math.min(minY, rect.y - el.width);
    maxX = Math.max(maxX, rect.x + rect.w + el.width);
    maxY = Math.max(maxY, rect.y + rect.h + el.width);
  }

  return { minX, minY, maxX, maxY };
}

export function getCropBounds(elements: SketchElement[]): {
  x: number;
  y: number;
  w: number;
  h: number;
} | null {
  const bounds = computeSceneBounds(elements);
  if (!bounds) return null;

  const padding = 4;
  return {
    x: Math.floor(bounds.minX - padding),
    y: Math.floor(bounds.minY - padding),
    w: Math.ceil(bounds.maxX - bounds.minX + padding * 2),
    h: Math.ceil(bounds.maxY - bounds.minY + padding * 2),
  };
}

export function makeThumbnail(elements: SketchElement[]): string {
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = 320;
  thumbCanvas.height = 200;
  const ctx = thumbCanvas.getContext('2d');
  if (!ctx) return '';

  const bounds = computeSceneBounds(elements);
  if (!bounds) return thumbCanvas.toDataURL('image/png');

  const pad = 12;
  const contentW = Math.max(1, bounds.maxX - bounds.minX);
  const contentH = Math.max(1, bounds.maxY - bounds.minY);
  const scale = Math.min(
    (thumbCanvas.width - pad * 2) / contentW,
    (thumbCanvas.height - pad * 2) / contentH
  );

  const drawW = contentW * scale;
  const drawH = contentH * scale;
  const offsetX = (thumbCanvas.width - drawW) / 2;
  const offsetY = (thumbCanvas.height - drawH) / 2;

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  ctx.translate(-bounds.minX, -bounds.minY);
  for (const el of elements) drawElement(ctx, el);
  ctx.restore();

  return thumbCanvas.toDataURL('image/png');
}
