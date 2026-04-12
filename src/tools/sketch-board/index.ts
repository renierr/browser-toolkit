import { CanvasExporter } from '@js/canvas-utils.ts';
import router from '@js/router.ts';
import { showMessage } from '@js/ui.ts';
import { drawElement, buildMeta, buildPreviewElement, makeThumbnail } from './drawing.ts';
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
  let viewport: ViewportState = { x: 0, y: 0 };
  let hasUnsavedChanges = false;
  let undoStack: SketchElement[][] = [];
  let redoStack: SketchElement[][] = [];

  let isPointerActive = false;
  let activePointerId: number | null = null;
  let drawStart: Point | null = null;
  let drawEnd: Point | null = null;
  let freehandPoints: Point[] = [];
  let panStartPointer: Point | null = null;
  let panStartViewport: ViewportState = { x: 0, y: 0 };

  const dpr = window.devicePixelRatio || 1;

  const cloneElements = (source: SketchElement[]): SketchElement[] => {
    return source.map((el) => JSON.parse(JSON.stringify(el)) as SketchElement);
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
    drawScene();
  };

  const toWorld = (clientX: number, clientY: number): Point => {
    const rect = ui.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    return {
      x: x - viewport.x,
      y: y - viewport.y,
    };
  };

  function drawScene(): void {
    const cssWidth = ui.canvas.width / dpr;
    const cssHeight = ui.canvas.height / dpr;

    ctx2.clearRect(0, 0, cssWidth, cssHeight);
    ctx2.save();
    ctx2.translate(viewport.x, viewport.y);

    for (const el of elements) {
      drawElement(ctx2, el);
    }

    if (drawStart && drawEnd && mode !== 'pan') {
      const preview = buildPreviewElement(
        mode as DrawMode,
        drawStart,
        drawEnd,
        ui.colorInput.value,
        parseInt(ui.widthInput.value, 10),
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
        viewport = { ...row.viewport };
        hasUnsavedChanges = false;
        undoStack = [];
        redoStack = [];
        updateUndoRedoButtons();
        drawScene();
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
    if (activePointerId !== null) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    activePointerId = event.pointerId;
    isPointerActive = true;
    ui.canvas.setPointerCapture(event.pointerId);

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

    if (ui.canvas.hasPointerCapture(event.pointerId)) {
      ui.canvas.releasePointerCapture(event.pointerId);
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

  const onSave = async (): Promise<void> => {
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
      hasUnsavedChanges = false;
      showMessage(`Saved version "${record.name}".`, { timeoutMs: 2500 });
    } catch (error) {
      console.error('[SketchBoard] Failed to save drawing', error);
      showMessage('Failed to save drawing.', { type: 'alert', timeoutMs: 3000 });
    }
  };

  const onExport = async (): Promise<void> => {
    const format = (ui.exportFormat.value as 'png' | 'jpg' | 'webp') || 'png';
    try {
      await CanvasExporter.download(ui.canvas, `sketch-${Date.now()}`, format, 0.92);
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
    updateUndoRedoButtons();
    drawScene();
  };

  const onRedo = (): void => {
    if (redoStack.length === 0) return;
    undoStack.push(cloneElements(elements));
    const next = redoStack.pop();
    if (!next) return;
    elements = cloneElements(next);
    hasUnsavedChanges = true;
    updateUndoRedoButtons();
    drawScene();
  };

  const onClipboard = async (): Promise<void> => {
    try {
      await CanvasExporter.copyToClipboard(ui.canvas);
      showMessage('Copied canvas image to clipboard.', { timeoutMs: 2500 });
    } catch (error) {
      console.error('[SketchBoard] Clipboard copy failed', error);
      showMessage('Clipboard copy failed.', { type: 'alert', timeoutMs: 3000 });
    }
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

  ui.btnClear.addEventListener('click', () => {
    if (elements.length === 0 || !hasUnsavedChanges) {
      elements = [];
      undoStack = [];
      redoStack = [];
      updateUndoRedoButtons();
      drawScene();
      return;
    }

    if (!window.confirm('Discard current unsaved changes and clear canvas?')) return;

    elements = [];
    hasUnsavedChanges = false;
    undoStack = [];
    redoStack = [];
    updateUndoRedoButtons();
    drawScene();
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
  drawScene();

  return () => {
    resizeObserver.disconnect();
    ui.canvas.removeEventListener('pointerdown', onPointerDown);
    ui.canvas.removeEventListener('pointermove', onPointerMove);
    ui.canvas.removeEventListener('pointerup', onPointerUp);
    ui.canvas.removeEventListener('pointercancel', onPointerUp);
    for (const button of ui.quickColorButtons) {
      button.removeEventListener('click', onQuickColorClick);
    }
  };
}
