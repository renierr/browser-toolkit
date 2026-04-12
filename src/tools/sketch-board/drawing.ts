import type { DrawMode, DrawingMeta, Point, SketchElement, ToolMode } from './types.ts';

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
  ctx.strokeStyle = el.color;
  ctx.lineWidth = el.width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (el.type === 'freehand') {
    if (el.points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(el.points[0].x, el.points[0].y);
    for (let i = 1; i < el.points.length; i++) {
      ctx.lineTo(el.points[i].x, el.points[i].y);
    }
    ctx.stroke();
    return;
  }

  if (el.type === 'line') {
    ctx.beginPath();
    ctx.moveTo(el.start.x, el.start.y);
    ctx.lineTo(el.end.x, el.end.y);
    ctx.stroke();
    return;
  }

  const rect = normalizeRect(el.start, el.end);

  if (el.type === 'rect') {
    if (rect.w < 1 || rect.h < 1) return;
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    return;
  }

  if (rect.w < 1 || rect.h < 1) return;
  ctx.beginPath();
  ctx.ellipse(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w / 2, rect.h / 2, 0, 0, Math.PI * 2);
  ctx.stroke();
}

export function buildPreviewElement(
  mode: DrawMode,
  start: Point,
  end: Point,
  color: string,
  width: number,
  points: Point[]
): SketchElement | null {
  if (mode === 'freehand') {
    if (points.length < 2) return null;
    return {
      id: crypto.randomUUID(),
      type: 'freehand',
      color,
      width,
      points: points.map((p) => ({ ...p })),
    };
  }

  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  if (dx < 1 && dy < 1) return null;

  if (mode === 'line') {
    return {
      id: crypto.randomUUID(),
      type: 'line',
      color,
      width,
      start: { ...start },
      end: { ...end },
    };
  }

  if (mode === 'rect') {
    return {
      id: crypto.randomUUID(),
      type: 'rect',
      color,
      width,
      start: { ...start },
      end: { ...end },
    };
  }

  return {
    id: crypto.randomUUID(),
    type: 'ellipse',
    color,
    width,
    start: { ...start },
    end: { ...end },
  };
}

export function buildMeta(elements: SketchElement[], lastTool: ToolMode): DrawingMeta {
  const colors = Array.from(new Set(elements.map((el) => el.color))).slice(0, 12);
  return {
    elementCount: elements.length,
    colors,
    lastTool,
  };
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

    const rect = normalizeRect(el.start, el.end);
    minX = Math.min(minX, rect.x - el.width);
    minY = Math.min(minY, rect.y - el.width);
    maxX = Math.max(maxX, rect.x + rect.w + el.width);
    maxY = Math.max(maxY, rect.y + rect.h + el.width);
  }

  return { minX, minY, maxX, maxY };
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
