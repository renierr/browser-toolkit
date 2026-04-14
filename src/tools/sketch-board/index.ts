import { renderToolIconSvg } from '@js/tool-icons.ts';
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
  getTextBounds,
  makeThumbnail,
} from './drawing.ts';
import { getDom } from './dom.ts';
import { deleteDrawing, getAllDrawings, putDrawing } from './store.ts';
import type {
  DrawMode,
  DrawingRecord,
  Point,
  SketchElement,
  TextElement,
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
  let isToolbarCollapsed = false;

  let textInputActive = false;
  let textInputPosition: Point | null = null;
  let textInputValue = '';
  let selectedElementId: string | null = null;
  let isDraggingText = false;
  let dragStartPos: Point | null = null;

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

  let isStreamingFreehand = false;

  let pinchStartDist = 0;
  let pinchStartCenter: Point | null = null;

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

  const TOOL_ICONS: Record<ToolMode, string> = {
    pan: 'hand',
    select: 'mouse-pointer-2',
    freehand: 'pen-tool',
    line: 'slash',
    rect: 'square',
    'rect-filled': 'square',
    ellipse: 'circle',
    'ellipse-filled': 'circle',
    text: 'type',
  };

  const TOOL_LABELS: Record<ToolMode, string> = {
    pan: 'Pan',
    select: 'Select',
    freehand: 'Freehand',
    line: 'Line',
    rect: 'Rect (outline)',
    'rect-filled': 'Rect (filled)',
    ellipse: 'Ellipse (outline)',
    'ellipse-filled': 'Ellipse (filled)',
    text: 'Text',
  };

  const updateDrawToolsLabel = (tool: ToolMode): void => {
    ui.drawToolsLabel.textContent = TOOL_LABELS[tool];
    const className =
      'w-4 h-4' + (tool === 'ellipse-filled' || tool === 'rect-filled' ? ' fill-current' : '');
    ui.drawToolsIcon.innerHTML = renderToolIconSvg(TOOL_ICONS[tool], className);
  };

  const closeDrawToolsDropdown = (): void => {
    (document.activeElement as HTMLElement)?.blur();
  };

  const setMode = (next: ToolMode): void => {
    closeDrawToolsDropdown();

    if (selectedElementId) {
      selectedElementId = null;
      ui.deleteText.classList.add('hidden');
      requestDrawImmediate();
    }

    mode = next;
    const isDrawMode = next !== 'pan' && next !== 'select';
    const isTextMode = next === 'text';
    const isSelectMode = next === 'select';

    if (isDrawMode) {
      ui.btnModeDraw.classList.add('btn-primary');
      ui.btnModePan.classList.remove('btn-primary');
      ui.drawTools.classList.remove('hidden');
      ui.drawOptions.classList.remove('hidden');
      ui.drawOptions.classList.add('h-7', 'w-px', 'bg-base-300');
      ui.drawOptionsDivider.classList.remove('hidden');
      for (const el of ui.drawOpts) {
        el.classList.remove('hidden');
      }
      updateDrawToolsLabel(next);
    } else if (isSelectMode) {
      ui.btnModeDraw.classList.remove('btn-primary');
      ui.btnModePan.classList.remove('btn-primary');
      ui.drawTools.classList.add('hidden');
      ui.drawOptions.classList.add('hidden');
      ui.drawOptions.classList.remove('h-7', 'w-px', 'bg-base-300');
      ui.drawOptionsDivider.classList.add('hidden');
      for (const el of ui.drawOpts) {
        el.classList.add('hidden');
      }
    } else if (isTextMode) {
      ui.btnModeDraw.classList.remove('btn-primary');
      ui.btnModePan.classList.remove('btn-primary');
      ui.drawTools.classList.add('hidden');
      ui.drawOptions.classList.add('hidden');
      ui.drawOptions.classList.remove('h-7', 'w-px', 'bg-base-300');
      ui.drawOptionsDivider.classList.add('hidden');
      for (const el of ui.drawOpts) {
        el.classList.add('hidden');
      }
    } else {
      ui.btnModePan.classList.add('btn-primary');
      ui.btnModeDraw.classList.remove('btn-primary');
      ui.drawTools.classList.add('hidden');
      ui.drawOptions.classList.add('hidden');
      ui.drawOptions.classList.remove('h-7', 'w-px', 'bg-base-300');
      ui.drawOptionsDivider.classList.add('hidden');
      for (const el of ui.drawOpts) {
        el.classList.add('hidden');
      }
      ui.btnModeDraw.title = 'Draw';
    }

    if (isTextMode || isSelectMode) {
      ui.textToolbar.classList.remove('hidden');
    } else {
      ui.textToolbar.classList.add('hidden');
      ui.deleteText.classList.add('hidden');
    }

    for (const [key, btn] of Object.entries(ui.modeButtons)) {
      if (key === next) {
        btn.classList.add('btn-primary');
      } else {
        btn.classList.remove('btn-primary');
      }
    }

    if (isSelectMode) {
      ui.canvas.style.cursor = 'pointer';
    } else if (mode === 'pan') {
      ui.canvas.style.cursor = 'grab';
    } else {
      ui.canvas.style.cursor = 'crosshair';
    }
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

    if (selectedElementId) {
      const selectedEl = elements.find((el) => el.id === selectedElementId);
      if (selectedEl && selectedEl.type === 'text') {
        const bounds = getTextBounds(ctx2, selectedEl);
        ctx2.setLineDash([4, 4]);
        ctx2.strokeStyle = '#2563eb';
        ctx2.lineWidth = 2;
        ctx2.strokeRect(bounds.x - 4, bounds.y - 4, bounds.w + 8, bounds.h + 8);
        ctx2.setLineDash([]);
      }
    }

    if (drawStart && drawEnd && mode !== 'pan' && mode !== 'select') {
      const fontSize = parseInt(ui.fontSize.value, 10);
      const fontWeight = ui.fontBold.classList.contains('btn-primary') ? 'bold' : 'normal';
      const fontStyle = ui.fontItalic.classList.contains('btn-primary') ? 'italic' : 'normal';
      drawLivePreview(
        ctx2,
        mode as DrawMode,
        drawStart,
        drawEnd,
        ui.colorInput.value,
        Math.round(parseInt(ui.widthInput.value, 10) / viewport.scale),
        freehandPoints,
        textInputActive ? textInputValue : undefined,
        ui.fontFamily.value,
        fontSize,
        fontWeight,
        fontStyle
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
    if (mode === 'pan') {
      ui.canvas.style.cursor = 'grab';
    } else if (mode === 'select') {
      ui.canvas.style.cursor = 'pointer';
    } else if (mode === 'text') {
      ui.canvas.style.cursor = 'text';
    } else {
      ui.canvas.style.cursor = 'crosshair';
    }
  };

  const commitCurrentDraft = (): void => {
    if (!drawStart || !drawEnd || mode === 'pan' || mode === 'select') return;

    const fontSize = parseInt(ui.fontSize.value, 10);
    const fontWeight = ui.fontBold.classList.contains('btn-primary') ? 'bold' : 'normal';
    const fontStyle = ui.fontItalic.classList.contains('btn-primary') ? 'italic' : 'normal';

    const draft = buildPreviewElement(
      mode as DrawMode,
      drawStart,
      drawEnd,
      ui.colorInput.value,
      parseInt(ui.widthInput.value, 10),
      freehandPoints,
      textInputValue || undefined,
      ui.fontFamily.value,
      fontSize,
      fontWeight,
      fontStyle
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
    if (activePointerId !== null && event.button !== 0) return;

    activePointerId = event.pointerId;
    isPointerActive = true;
    ui.canvas.setPointerCapture(event.pointerId);

    if (mode === 'pan') {
      panStartPointer = { x: event.clientX, y: event.clientY };
      panStartViewport = { ...viewport };
      ui.canvas.style.cursor = 'grabbing';
      return;
    }

    if (mode === 'select') {
      const point = toWorld(event.clientX, event.clientY);
      let foundText: TextElement | null = null;
      for (let i = elements.length - 1; i >= 0; i--) {
        const el = elements[i];
        if (el.type === 'text') {
          const bounds = getTextBounds(ctx2, el);
          const padding = Math.max(4, el.width / 2);
          if (
            point.x >= bounds.x - padding &&
            point.x <= bounds.x + bounds.w + padding &&
            point.y >= bounds.y - padding &&
            point.y <= bounds.y + bounds.h + padding
          ) {
            foundText = el;
            break;
          }
        }
      }
      if (foundText) {
        selectedElementId = foundText.id;
        isDraggingText = true;
        dragStartPos = point;
        ui.fontFamily.value = foundText.fontFamily;
        ui.fontSize.value = String(foundText.fontSize);
        if (foundText.fontWeight === 'bold') {
          ui.fontBold.classList.add('btn-primary');
        } else {
          ui.fontBold.classList.remove('btn-primary');
        }
        if (foundText.fontStyle === 'italic') {
          ui.fontItalic.classList.add('btn-primary');
        } else {
          ui.fontItalic.classList.remove('btn-primary');
        }
        ui.deleteText.classList.remove('hidden');
        ui.canvas.style.cursor = 'move';
      } else {
        selectedElementId = null;
        isDraggingText = false;
        dragStartPos = null;
        ui.deleteText.classList.add('hidden');
      }
      requestDrawImmediate();
      return;
    }

    if (mode === 'text') {
      const point = toWorld(event.clientX, event.clientY);
      drawStart = point;
      drawEnd = point;
      textInputActive = true;
      textInputPosition = point;
      textInputValue = '';
      ui.canvas.style.cursor = 'text';
      showTextInputOverlay(point);
      event.preventDefault();
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
      const fontSize = parseInt(ui.fontSize.value, 10);
      const fontWeight = ui.fontBold.classList.contains('btn-primary') ? 'bold' : 'normal';
      const fontStyle = ui.fontItalic.classList.contains('btn-primary') ? 'italic' : 'normal';
      drawLivePreview(
        ctx2,
        'freehand',
        point,
        point,
        ui.colorInput.value,
        Math.round(parseInt(ui.widthInput.value, 10) / viewport.scale),
        freehandPoints,
        undefined,
        ui.fontFamily.value,
        fontSize,
        fontWeight,
        fontStyle
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

    if (mode === 'select' && isDraggingText && selectedElementId && dragStartPos) {
      const point = toWorld(event.clientX, event.clientY);
      const dx = point.x - dragStartPos.x;
      const dy = point.y - dragStartPos.y;
      const el = elements.find((e) => e.id === selectedElementId);
      if (el && el.type === 'text') {
        el.position.x += dx;
        el.position.y += dy;
        dragStartPos = point;
        markBaseLayerDirty();
        requestDrawImmediate();
      }
      return;
    }

    if (mode === 'select' || mode === 'text') {
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

    if (mode === 'select') {
      if (isDraggingText && selectedElementId) {
        pushUndoState();
        hasUnsavedChanges = true;
        markBaseLayerDirty();
        updateUndoRedoButtons();
      }
      isDraggingText = false;
      dragStartPos = null;
      if (selectedElementId) {
        ui.canvas.style.cursor = 'pointer';
      }
      resetPointerState();
      return;
    }

    if (mode === 'text') {
      resetPointerState();
      return;
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

  const showTextInputOverlay = (position: Point): void => {
    const rect = ui.canvas.getBoundingClientRect();
    const x = rect.left + viewport.x + position.x * viewport.scale;
    const y = rect.top + viewport.y + position.y * viewport.scale;

    const existingInput = document.getElementById('text-input-overlay');
    if (existingInput) existingInput.remove();

    const input = document.createElement('input');
    input.id = 'text-input-overlay';
    input.type = 'text';
    input.className =
      'absolute bg-transparent border-2 border-blue-500 rounded px-1 text-base-content outline-none z-50';
    input.style.left = `${x}px`;
    input.style.top = `${y}px`;
    const fontSize = parseInt(ui.fontSize.value, 10);
    input.style.fontSize = `${fontSize * viewport.scale}px`;
    input.style.fontFamily = ui.fontFamily.value;
    input.style.fontWeight = ui.fontBold.classList.contains('btn-primary') ? 'bold' : 'normal';
    input.style.fontStyle = ui.fontItalic.classList.contains('btn-primary') ? 'italic' : 'normal';
    input.style.color = ui.colorInput.value;
    input.style.width = '200px';

    input.addEventListener('input', () => {
      textInputValue = input.value;
      requestDraw();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finishTextInput();
      } else if (e.key === 'Escape') {
        cancelTextInput();
      }
    });

    input.addEventListener('blur', () => {
      finishTextInput();
    });

    document.body.appendChild(input);
    input.focus();
  };

  const finishTextInput = (): void => {
    const input = document.getElementById('text-input-overlay') as HTMLInputElement | null;
    if (input) {
      textInputValue = input.value;
      input.remove();
    }
    textInputActive = false;
    if (textInputValue.trim() !== '' && textInputPosition) {
      drawStart = textInputPosition;
      drawEnd = textInputPosition;
      commitCurrentDraft();
    }
    textInputPosition = null;
    textInputValue = '';
    ui.canvas.style.cursor = mode === 'text' ? 'text' : 'crosshair';
    requestDrawImmediate();
  };

  const cancelTextInput = (): void => {
    const input = document.getElementById('text-input-overlay') as HTMLInputElement | null;
    if (input) input.remove();
    textInputActive = false;
    textInputPosition = null;
    textInputValue = '';
    ui.canvas.style.cursor = mode === 'text' ? 'text' : 'crosshair';
    requestDrawImmediate();
  };

  const updateSelectedText = (): void => {
    if (!selectedElementId) return;
    const el = elements.find((e) => e.id === selectedElementId);
    if (!el || el.type !== 'text') return;
    el.color = ui.colorInput.value;
    el.fontFamily = ui.fontFamily.value;
    el.fontSize = parseInt(ui.fontSize.value, 10);
    el.fontWeight = ui.fontBold.classList.contains('btn-primary') ? 'bold' : 'normal';
    el.fontStyle = ui.fontItalic.classList.contains('btn-primary') ? 'italic' : 'normal';
    pushUndoState();
    hasUnsavedChanges = true;
    markBaseLayerDirty();
    updateUndoRedoButtons();
    requestDrawImmediate();
  };

  const deleteSelectedText = (): void => {
    if (!selectedElementId) return;
    elements = elements.filter((e) => e.id !== selectedElementId);
    selectedElementId = null;
    ui.deleteText.classList.add('hidden');
    pushUndoState();
    hasUnsavedChanges = true;
    markBaseLayerDirty();
    updateUndoRedoButtons();
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

  const onToggleToolbar = (): void => {
    isToolbarCollapsed = !isToolbarCollapsed;
    if (isToolbarCollapsed) {
      ui.btnOverviewLabel.classList.add('hidden');
      for (const el of ui.toolbarInners) {
        el.classList.add('hidden');
      }
      ui.btnCollapse.classList.add('rotate-180');
      ui.btnCollapse.title = 'Expand toolbar';
    } else {
      ui.btnOverviewLabel.classList.remove('hidden');
      for (const el of ui.toolbarInners) {
        el.classList.remove('hidden');
      }
      ui.btnCollapse.classList.remove('rotate-180');
      ui.btnCollapse.title = 'Collapse toolbar';
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

  const centerViewportOnContent = (): void => {
    const bounds = getCropBounds(elements);
    if (!bounds) return;

    const rect = ui.canvas.getBoundingClientRect();
    const canvasCenterX = rect.left + rect.width / 2;
    const canvasCenterY = rect.top + rect.height / 2;
    const worldCenterX = bounds.x + bounds.w / 2;
    const worldCenterY = bounds.y + bounds.h / 2;

    viewport.x = canvasCenterX - worldCenterX * viewport.scale;
    viewport.y = canvasCenterY - worldCenterY * viewport.scale;
    markBaseLayerDirty();
    requestDrawImmediate();
  };

  const onZoomIn = (): void => {
    applyZoom(1);
    centerViewportOnContent();
  };
  const onZoomOut = (): void => {
    applyZoom(-1);
    centerViewportOnContent();
  };
  const onZoomReset = (): void => {
    viewport.scale = 1;
    markBaseLayerDirty();
    drawScene();
    centerViewportOnContent();
  };

  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const delta = -Math.sign(event.deltaY);
    applyZoom(delta);
    centerViewportOnContent();
  };

  const getTouchDistance = (t0: Touch, t1: Touch): number => {
    const dx = t0.clientX - t1.clientX;
    const dy = t0.clientY - t1.clientY;
    return Math.hypot(dx, dy);
  };

  const getTouchCenter = (t0: Touch, t1: Touch): Point => {
    return {
      x: (t0.clientX + t1.clientX) / 2,
      y: (t0.clientY + t1.clientY) / 2,
    };
  };

  const onTouchStart = (event: TouchEvent): void => {
    const touches = event.touches;
    if (touches.length === 2) {
      event.preventDefault();
      const t0 = touches[0];
      const t1 = touches[1];
      pinchStartDist = getTouchDistance(t0, t1);
      pinchStartCenter = getTouchCenter(t0, t1);
    }
  };

  const onTouchMove = (event: TouchEvent): void => {
    const touches = event.touches;
    if (touches.length === 2 && pinchStartDist > 0 && pinchStartCenter) {
      event.preventDefault();
      const t0 = touches[0];
      const t1 = touches[1];
      const currentDist = getTouchDistance(t0, t1);
      const currentCenter = getTouchCenter(t0, t1);

      const scaleRatio = currentDist / pinchStartDist;
      if (Math.abs(scaleRatio - 1) > 0.05) {
        const delta = scaleRatio > 1 ? 1 : -1;
        applyZoom(delta);
        centerViewportOnContent();
        pinchStartDist = currentDist;
        pinchStartCenter = currentCenter;
      }
    }
  };

  const onTouchEnd = (event: TouchEvent): void => {
    if (event.touches.length < 2) {
      pinchStartDist = 0;
      pinchStartCenter = null;
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

  ui.btnModePan.addEventListener('click', () => setMode('pan'));
  ui.btnModeDraw.addEventListener('click', () => {
    if (mode === 'pan') {
      setMode('freehand');
    } else {
      setMode('pan');
    }
  });
  ui.modeButtons.pan.addEventListener('click', () => setMode('pan'));
  ui.modeButtons.select.addEventListener('click', () => setMode('select'));
  ui.modeButtons.freehand.addEventListener('click', () => setMode('freehand'));
  ui.modeButtons.line.addEventListener('click', () => setMode('line'));
  ui.modeButtons.rect.addEventListener('click', () => setMode('rect'));
  (ui.modeButtons as Record<string, HTMLButtonElement>)['rect-filled'].addEventListener(
    'click',
    () => setMode('rect-filled')
  );
  ui.modeButtons.ellipse.addEventListener('click', () => setMode('ellipse'));
  (ui.modeButtons as Record<string, HTMLButtonElement>)['ellipse-filled'].addEventListener(
    'click',
    () => setMode('ellipse-filled')
  );
  ui.modeButtons.text.addEventListener('click', () => setMode('text'));

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
  ui.btnCollapse.addEventListener('click', onToggleToolbar);

  ui.fontFamily.addEventListener('change', () => {
    if (selectedElementId) updateSelectedText();
  });
  ui.fontSize.addEventListener('input', () => {
    if (selectedElementId) updateSelectedText();
  });
  ui.fontBold.addEventListener('click', () => {
    ui.fontBold.classList.toggle('btn-primary');
    if (selectedElementId) updateSelectedText();
  });
  ui.fontItalic.addEventListener('click', () => {
    ui.fontItalic.classList.toggle('btn-primary');
    if (selectedElementId) updateSelectedText();
  });
  ui.deleteText.addEventListener('click', deleteSelectedText);

  const onKeyDown = (e: KeyboardEvent): void => {
    if (selectedElementId && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      deleteSelectedText();
    }
  };

  ui.canvas.addEventListener('keydown', onKeyDown, { passive: false });
  ui.canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
  ui.canvas.addEventListener('pointermove', onPointerMove, { passive: false });
  ui.canvas.addEventListener('pointerup', onPointerUp, { passive: false });
  ui.canvas.addEventListener('pointercancel', onPointerUp, { passive: false });

  ui.canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  ui.canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  ui.canvas.addEventListener('touchend', onTouchEnd, { passive: false });
  ui.canvas.addEventListener('touchcancel', onTouchEnd, { passive: false });

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
    ui.canvas.removeEventListener('touchstart', onTouchStart);
    ui.canvas.removeEventListener('touchmove', onTouchMove);
    ui.canvas.removeEventListener('touchend', onTouchEnd);
    ui.canvas.removeEventListener('touchcancel', onTouchEnd);
    for (const button of ui.quickColorButtons) {
      button.removeEventListener('click', onQuickColorClick);
    }
    ui.canvas.removeEventListener('keydown', onKeyDown);
  };
}
