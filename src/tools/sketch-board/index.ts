import { CanvasExporter } from '@js/canvas-utils.ts';
import { showMessage } from '@js/ui.ts';

type ToolMode = 'pan' | 'freehand' | 'line' | 'rect' | 'ellipse';

type Point = {
  x: number;
  y: number;
};

type BaseElement = {
  id: string;
  type: ToolMode;
  color: string;
  width: number;
};

type FreehandElement = BaseElement & {
  type: 'freehand';
  points: Point[];
};

type LineElement = BaseElement & {
  type: 'line';
  start: Point;
  end: Point;
};

type RectElement = BaseElement & {
  type: 'rect';
  start: Point;
  end: Point;
};

type EllipseElement = BaseElement & {
  type: 'ellipse';
  start: Point;
  end: Point;
};

type SketchElement = FreehandElement | LineElement | RectElement | EllipseElement;

type ViewportState = {
  x: number;
  y: number;
};

type DrawingMeta = {
  elementCount: number;
  colors: string[];
  lastTool: ToolMode;
};

type DrawingRecord = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  viewport: ViewportState;
  elements: SketchElement[];
  thumbnailDataUrl: string;
  meta: DrawingMeta;
};

const DB_NAME = 'bt-sketch-board-db';
const DB_VERSION = 1;
const STORE_NAME = 'drawings';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllDrawings(): Promise<DrawingRecord[]> {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();

    req.onsuccess = () => {
      const rows = (req.result as DrawingRecord[]) || [];
      rows.sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
}

async function putDrawing(record: DrawingRecord): Promise<void> {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function deleteDrawing(id: string): Promise<void> {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function normalizeRect(start: Point, end: Point): { x: number; y: number; w: number; h: number } {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    w: Math.abs(end.x - start.x),
    h: Math.abs(end.y - start.y),
  };
}

function createElementId(): string {
  return crypto.randomUUID();
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

function drawElement(ctx: CanvasRenderingContext2D, el: SketchElement): void {
  ctx.strokeStyle = el.color;
  ctx.lineWidth = el.width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (el.type === 'freehand') {
    if (el.points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(el.points[0].x, el.points[0].y);
    for (let i = 1; i < el.points.length; i++) {
      const p = el.points[i];
      ctx.lineTo(p.x, p.y);
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

function buildPreviewElement(
  mode: Exclude<ToolMode, 'pan'>,
  start: Point,
  end: Point,
  color: string,
  width: number,
  points: Point[]
): SketchElement | null {
  if (mode === 'freehand') {
    if (points.length < 2) return null;
    return {
      id: createElementId(),
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
      id: createElementId(),
      type: 'line',
      color,
      width,
      start: { ...start },
      end: { ...end },
    };
  }

  if (mode === 'rect') {
    return {
      id: createElementId(),
      type: 'rect',
      color,
      width,
      start: { ...start },
      end: { ...end },
    };
  }

  return {
    id: createElementId(),
    type: 'ellipse',
    color,
    width,
    start: { ...start },
    end: { ...end },
  };
}

function buildMeta(elements: SketchElement[], lastTool: ToolMode): DrawingMeta {
  const colors = Array.from(new Set(elements.map((el) => el.color))).slice(0, 12);
  return {
    elementCount: elements.length,
    colors,
    lastTool,
  };
}

function makeThumbnail(elements: SketchElement[]): string {
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = 320;
  thumbCanvas.height = 200;
  const ctx = thumbCanvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#f4f5f6';
  ctx.fillRect(0, 0, thumbCanvas.width, thumbCanvas.height);

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

// noinspection JSUnusedGlobalSymbols
export default function init(): void | (() => void) {
  const canvas = document.getElementById('sketch-canvas') as HTMLCanvasElement | null;
  const galleryModal = document.getElementById('gallery-modal') as HTMLDialogElement | null;
  const galleryList = document.getElementById('gallery-list') as HTMLDivElement | null;
  const galleryTemplate = document.getElementById(
    'gallery-item-template'
  ) as HTMLTemplateElement | null;
  const colorInput = document.getElementById('stroke-color') as HTMLInputElement | null;
  const widthInput = document.getElementById('stroke-width') as HTMLInputElement | null;
  const exportFormat = document.getElementById('export-format') as HTMLSelectElement | null;
  const btnClear = document.getElementById('clear-canvas') as HTMLButtonElement | null;
  const btnSave = document.getElementById('save-drawing') as HTMLButtonElement | null;
  const btnGallery = document.getElementById('open-gallery') as HTMLButtonElement | null;
  const btnExport = document.getElementById('export-file') as HTMLButtonElement | null;
  const btnClipboard = document.getElementById('copy-image') as HTMLButtonElement | null;

  const modeButtons = {
    pan: document.getElementById('mode-pan') as HTMLButtonElement | null,
    freehand: document.getElementById('mode-freehand') as HTMLButtonElement | null,
    line: document.getElementById('mode-line') as HTMLButtonElement | null,
    rect: document.getElementById('mode-rect') as HTMLButtonElement | null,
    ellipse: document.getElementById('mode-ellipse') as HTMLButtonElement | null,
  };

  if (
    !canvas ||
    !galleryModal ||
    !galleryList ||
    !galleryTemplate ||
    !colorInput ||
    !widthInput ||
    !exportFormat ||
    !btnClear ||
    !btnSave ||
    !btnGallery ||
    !btnExport ||
    !btnClipboard ||
    !modeButtons.pan ||
    !modeButtons.freehand ||
    !modeButtons.line ||
    !modeButtons.rect ||
    !modeButtons.ellipse
  ) {
    return;
  }

  const canvasEl: HTMLCanvasElement = canvas;
  const colorInputEl: HTMLInputElement = colorInput;
  const widthInputEl: HTMLInputElement = widthInput;
  const exportFormatEl: HTMLSelectElement = exportFormat;
  const galleryModalEl: HTMLDialogElement = galleryModal;
  const galleryListEl: HTMLDivElement = galleryList;
  const galleryTemplateEl: HTMLTemplateElement = galleryTemplate;
  const modeButtonsEl: Record<ToolMode, HTMLButtonElement> = {
    pan: modeButtons.pan,
    freehand: modeButtons.freehand,
    line: modeButtons.line,
    rect: modeButtons.rect,
    ellipse: modeButtons.ellipse,
  };
  const ctx = canvasEl.getContext('2d');
  if (!ctx) return;
  const ctx2: CanvasRenderingContext2D = ctx;

  let mode: ToolMode = 'pan';
  let elements: SketchElement[] = [];
  let viewport: ViewportState = { x: 0, y: 0 };

  let isPointerActive = false;
  let activePointerId: number | null = null;
  let drawStart: Point | null = null;
  let drawEnd: Point | null = null;
  let freehandPoints: Point[] = [];
  let panStartPointer: Point | null = null;
  let panStartViewport: ViewportState = { x: 0, y: 0 };

  const dpr = window.devicePixelRatio || 1;

  const setMode = (next: ToolMode): void => {
    mode = next;
    for (const [key, btn] of Object.entries(modeButtonsEl)) {
      if (key === next) {
        btn.classList.add('btn-primary');
      } else {
        btn.classList.remove('btn-primary');
      }
    }

    canvasEl.style.cursor = mode === 'pan' ? 'grab' : 'crosshair';
  };

  const resizeCanvas = (): void => {
    const rect = canvasEl.getBoundingClientRect();
    const nextWidth = Math.max(1, Math.round(rect.width * dpr));
    const nextHeight = Math.max(1, Math.round(rect.height * dpr));

    if (canvasEl.width === nextWidth && canvasEl.height === nextHeight) {
      return;
    }

    canvasEl.width = nextWidth;
    canvasEl.height = nextHeight;
    ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawScene();
  };

  const toWorld = (clientX: number, clientY: number): Point => {
    const rect = canvasEl.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    return {
      x: x - viewport.x,
      y: y - viewport.y,
    };
  };

  function drawScene(): void {
    const cssWidth = canvasEl.width / dpr;
    const cssHeight = canvasEl.height / dpr;

    ctx2.clearRect(0, 0, cssWidth, cssHeight);

    ctx2.save();
    ctx2.translate(viewport.x, viewport.y);

    for (const el of elements) {
      drawElement(ctx2, el);
    }

    if (drawStart && drawEnd && mode !== 'pan') {
      const preview = buildPreviewElement(
        mode,
        drawStart,
        drawEnd,
        colorInputEl.value,
        parseInt(widthInputEl.value, 10),
        freehandPoints
      );

      if (preview) {
        ctx2.globalAlpha = 0.8;
        drawElement(ctx2, preview);
        ctx2.globalAlpha = 1;
      }
    }

    ctx2.restore();
  }

  const resetPointerState = (): void => {
    isPointerActive = false;
    activePointerId = null;
    drawStart = null;
    drawEnd = null;
    freehandPoints = [];
    panStartPointer = null;
    canvasEl.style.cursor = mode === 'pan' ? 'grab' : 'crosshair';
  };

  const commitCurrentDraft = (): void => {
    if (!drawStart || !drawEnd || mode === 'pan') return;

    const draft = buildPreviewElement(
      mode,
      drawStart,
      drawEnd,
      colorInputEl.value,
      parseInt(widthInputEl.value, 10),
      freehandPoints
    );

    if (draft) {
      elements.push(draft);
    }
  };

  const renderGallery = async (): Promise<void> => {
    const rows = await getAllDrawings();
    galleryListEl.innerHTML = '';

    if (rows.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'col-span-full text-sm opacity-70';
      empty.textContent = 'No drawings saved yet.';
      galleryListEl.appendChild(empty);
      return;
    }

    for (const row of rows) {
      const node = galleryTemplateEl.content.cloneNode(true) as DocumentFragment;
      const root = node.querySelector('article');
      const thumb = node.querySelector('.gallery-thumb') as HTMLImageElement | null;
      const name = node.querySelector('.gallery-name') as HTMLDivElement | null;
      const meta = node.querySelector('.gallery-meta') as HTMLDivElement | null;
      const btnLoad = node.querySelector('.load-drawing') as HTMLButtonElement | null;
      const btnDelete = node.querySelector('.delete-drawing') as HTMLButtonElement | null;

      if (!root || !thumb || !name || !meta || !btnLoad || !btnDelete) continue;

      thumb.src = row.thumbnailDataUrl;
      name.textContent = row.name;
      meta.textContent = `${new Date(row.updatedAt).toLocaleString()} - ${row.meta.elementCount} elements`;

      btnLoad.addEventListener('click', () => {
        elements = row.elements.map((el) => JSON.parse(JSON.stringify(el)) as SketchElement);
        viewport = { ...row.viewport };
        drawScene();
        galleryModalEl.close();
        showMessage(`Loaded "${row.name}".`, { timeoutMs: 2000 });
      });

      btnDelete.addEventListener('click', async () => {
        await deleteDrawing(row.id);
        await renderGallery();
      });

      galleryListEl.appendChild(node);
    }
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (activePointerId !== null) return;

    if (event.pointerType === 'mouse' && event.button !== 0) return;

    activePointerId = event.pointerId;
    isPointerActive = true;
    canvasEl.setPointerCapture(event.pointerId);

    if (mode === 'pan') {
      panStartPointer = { x: event.clientX, y: event.clientY };
      panStartViewport = { ...viewport };
      canvasEl.style.cursor = 'grabbing';
      return;
    }

    const point = toWorld(event.clientX, event.clientY);
    drawStart = point;
    drawEnd = point;
    freehandPoints = [point];
    event.preventDefault();
    drawScene();
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!isPointerActive || activePointerId !== event.pointerId) return;

    if (mode === 'pan') {
      if (!panStartPointer) return;
      viewport.x = panStartViewport.x + (event.clientX - panStartPointer.x);
      viewport.y = panStartViewport.y + (event.clientY - panStartPointer.y);
      drawScene();
      return;
    }

    if (!drawStart) return;
    const next = toWorld(event.clientX, event.clientY);
    drawEnd = next;
    if (mode === 'freehand') {
      const prev = freehandPoints[freehandPoints.length - 1];
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      if (dx * dx + dy * dy >= 0.8) {
        freehandPoints.push(next);
      }
    }
    event.preventDefault();
    drawScene();
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (!isPointerActive || activePointerId !== event.pointerId) return;

    if (canvasEl.hasPointerCapture(event.pointerId)) {
      canvasEl.releasePointerCapture(event.pointerId);
    }

    if (mode !== 'pan') {
      const point = toWorld(event.clientX, event.clientY);
      drawEnd = point;
      if (mode === 'freehand') {
        freehandPoints.push(point);
      }
      commitCurrentDraft();
    }

    resetPointerState();
    drawScene();
  };

  const onModeClick = (nextMode: ToolMode): void => {
    setMode(nextMode);
  };

  modeButtons.pan.addEventListener('click', () => onModeClick('pan'));
  modeButtons.freehand.addEventListener('click', () => onModeClick('freehand'));
  modeButtons.line.addEventListener('click', () => onModeClick('line'));
  modeButtons.rect.addEventListener('click', () => onModeClick('rect'));
  modeButtons.ellipse.addEventListener('click', () => onModeClick('ellipse'));

  btnClear.addEventListener('click', () => {
    elements = [];
    drawScene();
  });

  btnSave.addEventListener('click', async () => {
    if (elements.length === 0) {
      showMessage('Nothing to save yet.', { type: 'warning', timeoutMs: 2500 });
      return;
    }

    const nameInput = window.prompt('Version name:', `Drawing ${new Date().toLocaleString()}`);
    if (!nameInput) return;

    const now = Date.now();
    const record: DrawingRecord = {
      id: crypto.randomUUID(),
      name: nameInput.trim(),
      createdAt: now,
      updatedAt: now,
      viewport: { ...viewport },
      elements: elements.map((el) => JSON.parse(JSON.stringify(el)) as SketchElement),
      thumbnailDataUrl: makeThumbnail(elements),
      meta: buildMeta(elements, mode),
    };

    try {
      await putDrawing(record);
      showMessage(`Saved version "${record.name}".`, { timeoutMs: 2500 });
    } catch (error) {
      console.error('[SketchBoard] Failed to save drawing', error);
      showMessage('Failed to save drawing.', { type: 'alert', timeoutMs: 3000 });
    }
  });

  btnGallery.addEventListener('click', async () => {
    try {
      await renderGallery();
      galleryModalEl.showModal();
    } catch (error) {
      console.error('[SketchBoard] Failed to open gallery', error);
      showMessage('Failed to load saved drawings.', { type: 'alert', timeoutMs: 3000 });
    }
  });

  btnExport.addEventListener('click', async () => {
    const format = (exportFormatEl.value as 'png' | 'jpg' | 'webp') || 'png';

    try {
      await CanvasExporter.download(canvasEl, `sketch-${Date.now()}`, format, 0.92);
    } catch (error) {
      console.error('[SketchBoard] Export failed', error);
      showMessage('Export failed.', { type: 'alert', timeoutMs: 3000 });
    }
  });

  btnClipboard.addEventListener('click', async () => {
    try {
      await CanvasExporter.copyToClipboard(canvasEl);
      showMessage('Copied canvas image to clipboard.', { timeoutMs: 2500 });
    } catch (error) {
      console.error('[SketchBoard] Clipboard copy failed', error);
      showMessage('Clipboard copy failed.', { type: 'alert', timeoutMs: 3000 });
    }
  });

  colorInput.value = '#111827';
  canvasEl.style.touchAction = 'none';
  setMode('pan');

  canvasEl.addEventListener('pointerdown', onPointerDown, { passive: false });
  canvasEl.addEventListener('pointermove', onPointerMove, { passive: false });
  canvasEl.addEventListener('pointerup', onPointerUp, { passive: false });
  canvasEl.addEventListener('pointercancel', onPointerUp, { passive: false });

  const resizeObserver = new ResizeObserver(() => {
    resizeCanvas();
  });
  resizeObserver.observe(canvasEl);

  resizeCanvas();
  drawScene();

  return () => {
    resizeObserver.disconnect();
    canvasEl.removeEventListener('pointerdown', onPointerDown);
    canvasEl.removeEventListener('pointermove', onPointerMove);
    canvasEl.removeEventListener('pointerup', onPointerUp);
    canvasEl.removeEventListener('pointercancel', onPointerUp);
  };
}
