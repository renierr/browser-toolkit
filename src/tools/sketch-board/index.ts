import { CanvasExporter } from '@js/canvas-utils.ts';
import router from '@js/router.ts';
import { showMessage } from '@js/ui.ts';
import {
  buildMeta,
  buildPreviewElement,
  drawElement,
  drawLiveFreehandSegment,
  drawLivePreview,
  getCropBounds,
  makeThumbnail,
} from './drawing.ts';
import { getDom } from './dom.ts';
import { deleteDrawing, getAllDrawings, putDrawing } from './store.ts';
import type {
  DrawMode,
  DrawingRecord,
  Point,
  SketchElement,
  ToolMode,
  ViewportState,
} from './types.ts';

// noinspection JSUnusedGlobalSymbols
export default function init(): void | (() => void) {
  const dom = getDom(document);
  if (!dom) return;

  const ctx = dom.canvas.getContext('2d');
  if (!ctx) return;
  const ui = dom;
  const ctx2 = ctx;

  let mode: ToolMode = 'pan';
  let elements: SketchElement[] = [];
  let viewport: ViewportState = { x: 0, y: 0, scale: 1 };
  let hasUnsavedChanges = false;
  let undoStack: SketchElement[][] = [];
  let redoStack: SketchElement[][] = [];
  let renderRaf: number | null = null;
  let renderQueued = false;
  let baseLayerDirty = true;

  const MIN_SCALE = 0.1;
  const MAX_SCALE = 10;
  const ZOOM_STEP = 1.25;

  let isPointerActive = false;
  let activePointerId: number | null = null;
  let drawStart: Point | null = null;
  let drawEnd: Point | null = null;
  let freehandPoints: Point[] = [];
  let panStartPointer: Point | null = null;
  let panStartViewport: ViewportState = { x: 0, y: 0, scale: 1 };

  let lastPinchDist = 0;
  let lastPinchCenter: Point | null = null;
  let isStreamingFreehand = false;

  const dpr = window.devicePixelRatio || 1;
  const baseLayerCanvas = document.createElement('canvas');
  const baseLayerCtx = baseLayerCanvas.getContext('2d');

  if (!baseLayerCtx) return;

  const requestDraw = (): void => {
    renderQueued = true;
    if (renderRaf !== null) return;

    renderRaf = window.requestAnimationFrame(() => {
      renderRaf = null;
      if (!renderQueued) return;
      renderQueued = false;
      drawScene();
    });
  };

  const requestDrawImmediate = (): void => {
    renderQueued = false;
    if (renderRaf !== null) {
      window.cancelAnimationFrame(renderRaf);
      renderRaf = null;
    }
    if (isStreamingFreehand) {
      return;
    }
    drawScene();
  };

  const cloneElements = (source: SketchElement[]): SketchElement[] => {
    return source.map((el) => JSON.parse(JSON.stringify(el)) as SketchElement);
  };

  const markBaseLayerDirty = (): void => {
    baseLayerDirty = true;
  };

  const syncBaseLayerSize = (): void => {
    if (baseLayerCanvas.width === ui.canvas.width && baseLayerCanvas.height === ui.canvas.height) {
      return;
    }
    baseLayerCanvas.width = ui.canvas.width;
    baseLayerCanvas.height = ui.canvas.height;
    markBaseLayerDirty();
  };

  const renderBaseLayer = (): void => {
    if (!baseLayerDirty) return;

    syncBaseLayerSize();

    const cssWidth = ui.canvas.width / dpr;
    const cssHeight = ui.canvas.height / dpr;

    baseLayerCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    baseLayerCtx.clearRect(0, 0, cssWidth, cssHeight);
    baseLayerCtx.save();
    baseLayerCtx.translate(viewport.x, viewport.y);
    baseLayerCtx.scale(viewport.scale, viewport.scale);
    for (const el of elements) {
      drawElement(baseLayerCtx, el);
    }
    baseLayerCtx.restore();

    baseLayerDirty = false;
  };

  const updateUndoRedoButtons = (): void => {
    ui.btnUndo.disabled = undoStack.length === 0;
    ui.btnRedo.disabled = redoStack.length === 0;
  };

  const pushUndoState = (): void => {
    undoStack.push(cloneElements(elements));
    if (undoStack.length > 100) {
      undoStack.shift();
    }
    redoStack = [];
    updateUndoRedoButtons();
  };

  const setMode = (next: ToolMode): void => {
    mode = next;
    for (const [key, btn] of Object.entries(ui.modeButtons)) {
      if (key === next) {
        btn.classList.add('btn-primary');
      } else {
        btn.classList.remove('btn-primary');
      }
    }

    ui.canvas.style.cursor = mode === 'pan' ? 'grab' : 'crosshair';
  };

  const resizeCanvas = (): void => {
    const rect = ui.canvas.getBoundingClientRect();
    const nextWidth = Math.max(1, Math.round(rect.width * dpr));
    const nextHeight = Math.max(1, Math.round(rect.height * dpr));

    if (ui.canvas.width === nextWidth && ui.canvas.height === nextHeight) {
      return;
    }

    ui.canvas.width = nextWidth;
    ui.canvas.height = nextHeight;
    ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);
    markBaseLayerDirty();
    requestDraw();
  };

  const toWorld = (clientX: number, clientY: number): Point => {
    const rect = ui.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const { scale } = viewport;
    return {
      x: (x - viewport.x) / scale,
      y: (y - viewport.y) / scale,
    };
  };

  function drawScene(): void {
    renderBaseLayer();

    ctx2.save();
    ctx2.setTransform(1, 0, 0, 1, 0, 0);
    ctx2.clearRect(0, 0, ui.canvas.width, ui.canvas.height);
    ctx2.drawImage(baseLayerCanvas, 0, 0);
    ctx2.restore();

    ctx2.save();
    ctx2.translate(viewport.x, viewport.y);
    ctx2.scale(viewport.scale, viewport.scale);

    if (drawStart && drawEnd && mode !== 'pan') {
      drawLivePreview(
        ctx2,
        mode as DrawMode,
        drawStart,
        drawEnd,
        ui.colorInput.value,
        Math.round(parseInt(ui.widthInput.value, 10) / viewport.scale),
        freehandPoints
      );
    }

    ctx2.restore();
  }

  const resetPointerState = (): void => {
    isPointerActive = false;
    activePointerId = null;
    drawStart = null;
    drawEnd = null;
    freehandPoints = [];
    isStreamingFreehand = false;
    panStartPointer = null;
    ui.canvas.style.cursor = mode === 'pan' ? 'grab' : 'crosshair';
  };

  const commitCurrentDraft = (): void => {
    if (!drawStart || !drawEnd || mode === 'pan') return;

    const draft = buildPreviewElement(
      mode as DrawMode,
      drawStart,
      drawEnd,
      ui.colorInput.value,
      parseInt(ui.widthInput.value, 10),
      freehandPoints
    );

    if (draft) {
      pushUndoState();
      elements.push(draft);
      hasUnsavedChanges = true;
      markBaseLayerDirty();
      updateUndoRedoButtons();
    }
  };

  const confirmDiscardIfNeeded = (): boolean => {
    if (!hasUnsavedChanges) return true;
    return window.confirm('Discard current unsaved changes?');
  };

  const renderGallery = async (): Promise<void> => {
    const rows = await getAllDrawings();
    ui.galleryList.innerHTML = '';

    if (rows.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'col-span-full text-sm opacity-70';
      empty.textContent = 'No drawings saved yet.';
      ui.galleryList.appendChild(empty);
      return;
    }

    for (const row of rows) {
      const node = ui.galleryTemplate.content.cloneNode(true) as DocumentFragment;
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
        if (!confirmDiscardIfNeeded()) return;

        elements = row.elements.map((el) => JSON.parse(JSON.stringify(el)) as SketchElement);
        viewport = { ...row.viewport, scale: row.viewport.scale || 1 };
        hasUnsavedChanges = false;
        undoStack = [];
        redoStack = [];
        markBaseLayerDirty();
        updateUndoRedoButtons();
        requestDraw();
        ui.galleryModal.close();
        showMessage(`Loaded "${row.name}".`, { timeoutMs: 2000 });
      });

      btnDelete.addEventListener('click', async () => {
        await deleteDrawing(row.id);
        await renderGallery();
      });

      ui.galleryList.appendChild(node);
    }
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') {
      const allTouches = document.querySelectorAll('#sketch-canvas');
      if (!allTouches.length) return;
    }

    if (activePointerId !== null && activePointerId !== event.pointerId) {
      const otherActive = document.elementFromPoint(event.clientX, event.clientY);
      if (otherActive === ui.canvas) {
        if (activePointerId !== null && lastPinchCenter) {
          const currentPointers = [event];
          const newDist = getPinchDist(currentPointers);
          if (newDist > 0 && lastPinchDist > 0) {
            const scale = newDist / lastPinchDist;
            if (Math.abs(scale - 1) > 0.1) {
              const delta = scale > 1 ? 1 : -1;
              applyZoom(delta, lastPinchCenter.x, lastPinchCenter.y);
              lastPinchDist = newDist;
              return;
            }
          }
        }
      }
    }

    if (activePointerId !== null && event.button !== 0) return;

    activePointerId = event.pointerId;
    isPointerActive = true;
    ui.canvas.setPointerCapture(event.pointerId);

    lastPinchDist = event.pressure > 0 ? event.pressure : 0;
    lastPinchCenter = { x: event.clientX, y: event.clientY };

    if (mode === 'pan') {
      panStartPointer = { x: event.clientX, y: event.clientY };
      panStartViewport = { ...viewport };
      ui.canvas.style.cursor = 'grabbing';
      return;
    }

    const point = toWorld(event.clientX, event.clientY);
    drawStart = point;
    drawEnd = point;
    freehandPoints = [point];
    isStreamingFreehand = mode === 'freehand';

    if (isStreamingFreehand) {
      ctx2.save();
      ctx2.translate(viewport.x, viewport.y);
      ctx2.scale(viewport.scale, viewport.scale);
      drawLivePreview(
        ctx2,
        'freehand',
        point,
        point,
        ui.colorInput.value,
        Math.round(parseInt(ui.widthInput.value, 10) / viewport.scale),
        freehandPoints
      );
      ctx2.restore();
      event.preventDefault();
      return;
    }

    event.preventDefault();
    requestDrawImmediate();
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!isPointerActive || activePointerId !== event.pointerId) return;

    if (mode === 'pan') {
      if (!panStartPointer) return;
      viewport.x = panStartViewport.x + (event.clientX - panStartPointer.x);
      viewport.y = panStartViewport.y + (event.clientY - panStartPointer.y);
      markBaseLayerDirty();
      requestDraw();
      return;
    }

    if (!drawStart) return;
    const coalesced =
      typeof event.getCoalescedEvents === 'function'
        ? event.getCoalescedEvents()
        : ([] as PointerEvent[]);
    const samples = coalesced.length > 0 ? coalesced : [event];
    const color = ui.colorInput.value;
    const width = parseInt(ui.widthInput.value, 10);

    for (const sample of samples) {
      const next = toWorld(sample.clientX, sample.clientY);
      drawEnd = next;
      if (mode === 'freehand') {
        const prev = freehandPoints[freehandPoints.length - 1];
        if (!prev) {
          freehandPoints.push(next);
          continue;
        }

        const dx = next.x - prev.x;
        const dy = next.y - prev.y;
        if (dx * dx + dy * dy >= 0.8) {
          freehandPoints.push(next);
          ctx2.save();
          ctx2.translate(viewport.x, viewport.y);
          ctx2.scale(viewport.scale, viewport.scale);
          drawLiveFreehandSegment(ctx2, prev, next, color, Math.round(width / viewport.scale));
          ctx2.restore();
        }
      }
    }

    event.preventDefault();

    if (mode === 'freehand' && isStreamingFreehand) {
      return;
    }

    requestDraw();
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (!isPointerActive || activePointerId !== event.pointerId) return;

    if (ui.canvas.hasPointerCapture(event.pointerId)) {
      ui.canvas.releasePointerCapture(event.pointerId);
    }

    if (mode !== 'pan') {
      const point = toWorld(event.clientX, event.clientY);
      drawEnd = point;
      if (mode === 'freehand') {
        const prev = freehandPoints[freehandPoints.length - 1];
        if (!prev || prev.x !== point.x || prev.y !== point.y) {
          freehandPoints.push(point);
        }
      }
      commitCurrentDraft();
    }

    resetPointerState();
    requestDrawImmediate();
  };

  const onSave = async (): Promise<void> => {
    if (elements.length === 0) {
      showMessage('Nothing to save yet.', { type: 'warning', timeoutMs: 2500 });
      return;
    }

    const nameInput = window.prompt('Version name:', `Drawing ${new Date().toLocaleString()}`);
    if (!nameInput) return;

    const bounds = getCropBounds(elements);
    const thumbUrl = bounds ? makeThumbnail(elements) : '';

    const now = Date.now();
    const record: DrawingRecord = {
      id: crypto.randomUUID(),
      name: nameInput.trim(),
      createdAt: now,
      updatedAt: now,
      viewport: { ...viewport },
      elements: elements.map((el) => JSON.parse(JSON.stringify(el)) as SketchElement),
      thumbnailDataUrl: thumbUrl,
      meta: buildMeta(elements, mode),
    };

    try {
      await putDrawing(record);
      hasUnsavedChanges = false;
      showMessage(`Saved version "${record.name}".`, { timeoutMs: 2500 });
    } catch (error) {
      console.error('[SketchBoard] Failed to save drawing', error);
      showMessage('Failed to save drawing.', { type: 'alert', timeoutMs: 3000 });
    }
  };

  const renderTempCanvas = (): HTMLCanvasElement | null => {
    const bounds = getCropBounds(elements);
    if (!bounds) return null;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = bounds.w;
    tempCanvas.height = bounds.h;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return null;

    const offsetX = -bounds.x;
    const offsetY = -bounds.y;
    tempCtx.translate(offsetX, offsetY);
    for (const el of elements) {
      drawElement(tempCtx, el);
    }

    return tempCanvas;
  };

  const onExport = async (): Promise<void> => {
    const format = (ui.exportFormat.value as 'png' | 'jpg' | 'webp') || 'png';
    const tempCanvas = renderTempCanvas();
    if (!tempCanvas) {
      showMessage('Nothing to export.', { type: 'warning', timeoutMs: 2500 });
      return;
    }

    try {
      await CanvasExporter.download(tempCanvas, `sketch-${Date.now()}`, format, 0.92);
    } catch (error) {
      console.error('[SketchBoard] Export failed', error);
      showMessage('Export failed.', { type: 'alert', timeoutMs: 3000 });
    }
  };

  const onBackOverview = (): void => {
    if (!confirmDiscardIfNeeded()) return;
    router.goOverview();
  };

  const onUndo = (): void => {
    if (undoStack.length === 0) return;
    redoStack.push(cloneElements(elements));
    const prev = undoStack.pop();
    if (!prev) return;
    elements = cloneElements(prev);
    hasUnsavedChanges = true;
    markBaseLayerDirty();
    updateUndoRedoButtons();
    requestDraw();
  };

  const onRedo = (): void => {
    if (redoStack.length === 0) return;
    undoStack.push(cloneElements(elements));
    const next = redoStack.pop();
    if (!next) return;
    elements = cloneElements(next);
    hasUnsavedChanges = true;
    markBaseLayerDirty();
    updateUndoRedoButtons();
    requestDraw();
  };

  const onClipboard = async (): Promise<void> => {
    const tempCanvas = renderTempCanvas();
    if (!tempCanvas) {
      showMessage('Nothing to copy.', { type: 'warning', timeoutMs: 2500 });
      return;
    }

    try {
      await CanvasExporter.copyToClipboard(tempCanvas);
      showMessage('Copied canvas image to clipboard.', { timeoutMs: 2500 });
    } catch (error) {
      console.error('[SketchBoard] Clipboard copy failed', error);
      showMessage('Clipboard copy failed.', { type: 'alert', timeoutMs: 3000 });
    }
  };

  const applyZoom = (delta: number, focusX?: number, focusY?: number): void => {
    const oldScale = viewport.scale;
    let newScale = oldScale * Math.pow(ZOOM_STEP, delta);
    newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));

    if (newScale === oldScale) return;

    if (focusX !== undefined && focusY !== undefined) {
      const rect = ui.canvas.getBoundingClientRect();
      const canvasX = focusX - rect.left;
      const canvasY = focusY - rect.top;
      const worldX = (canvasX - viewport.x) / oldScale;
      const worldY = (canvasY - viewport.y) / oldScale;
      viewport.x = canvasX - worldX * newScale;
      viewport.y = canvasY - worldY * newScale;
    }

    viewport.scale = newScale;
    markBaseLayerDirty();
    requestDrawImmediate();
  };

  const onZoomIn = (): void => applyZoom(1);
  const onZoomOut = (): void => applyZoom(-1);
  const onZoomReset = (): void => {
    viewport.scale = 1;
    markBaseLayerDirty();
    requestDrawImmediate();
  };

  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const delta = -Math.sign(event.deltaY);
    applyZoom(delta, event.clientX, event.clientY);
  };

  const getPinchDist = (pts: PointerEvent[]): number => {
    if (pts.length < 2) return 0;
    const dx = pts[1].clientX - pts[0].clientX;
    const dy = pts[1].clientY - pts[0].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const onQuickColorClick = (event: Event): void => {
    const target = event.currentTarget as HTMLButtonElement;
    const color = target.getAttribute('data-color');
    if (!color) return;
    ui.colorInput.value = color;
    ui.colorPopup.removeAttribute('open');
  };

  ui.btnBackOverview.addEventListener('click', onBackOverview);
  ui.btnUndo.addEventListener('click', onUndo);
  ui.btnRedo.addEventListener('click', onRedo);
  for (const button of ui.quickColorButtons) {
    button.addEventListener('click', onQuickColorClick);
  }

  ui.modeButtons.pan.addEventListener('click', () => setMode('pan'));
  ui.modeButtons.freehand.addEventListener('click', () => setMode('freehand'));
  ui.modeButtons.line.addEventListener('click', () => setMode('line'));
  ui.modeButtons.rect.addEventListener('click', () => setMode('rect'));
  ui.modeButtons.ellipse.addEventListener('click', () => setMode('ellipse'));

  ui.btnZoomIn.addEventListener('click', onZoomIn);
  ui.btnZoomOut.addEventListener('click', onZoomOut);
  ui.btnZoomReset.addEventListener('click', onZoomReset);

  ui.canvas.addEventListener('wheel', onWheel, { passive: false });

  ui.btnClear.addEventListener('click', () => {
    if (elements.length === 0 || !hasUnsavedChanges) {
      elements = [];
      undoStack = [];
      redoStack = [];
      markBaseLayerDirty();
      updateUndoRedoButtons();
      requestDraw();
      return;
    }

    if (!window.confirm('Discard current unsaved changes and clear canvas?')) return;

    elements = [];
    hasUnsavedChanges = false;
    undoStack = [];
    redoStack = [];
    markBaseLayerDirty();
    updateUndoRedoButtons();
    requestDraw();
  });

  ui.btnSave.addEventListener('click', () => void onSave());
  ui.btnGallery.addEventListener('click', async () => {
    try {
      await renderGallery();
      ui.galleryModal.showModal();
    } catch (error) {
      console.error('[SketchBoard] Failed to open gallery', error);
      showMessage('Failed to load saved drawings.', { type: 'alert', timeoutMs: 3000 });
    }
  });
  ui.btnExport.addEventListener('click', () => void onExport());
  ui.btnClipboard.addEventListener('click', () => void onClipboard());

  ui.canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
  ui.canvas.addEventListener('pointermove', onPointerMove, { passive: false });
  ui.canvas.addEventListener('pointerup', onPointerUp, { passive: false });
  ui.canvas.addEventListener('pointercancel', onPointerUp, { passive: false });

  const resizeObserver = new ResizeObserver(() => {
    resizeCanvas();
  });
  resizeObserver.observe(ui.canvas);

  ui.canvas.style.touchAction = 'none';
  updateUndoRedoButtons();
  setMode('pan');
  resizeCanvas();
  requestDraw();

  return () => {
    if (renderRaf !== null) {
      window.cancelAnimationFrame(renderRaf);
      renderRaf = null;
    }
    resizeObserver.disconnect();
    ui.canvas.removeEventListener('pointerdown', onPointerDown);
    ui.canvas.removeEventListener('pointermove', onPointerMove);
    ui.canvas.removeEventListener('pointerup', onPointerUp);
    ui.canvas.removeEventListener('pointercancel', onPointerUp);
    ui.canvas.removeEventListener('wheel', onWheel);
    for (const button of ui.quickColorButtons) {
      button.removeEventListener('click', onQuickColorClick);
    }
  };
}
