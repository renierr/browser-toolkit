import type { SharedFilesPayload } from '@js/share-target.ts';
import { getCropBounds, setImageGetter } from './drawing.ts';
import { setPathCache } from './utils/brush-styles.ts';
import { getDom } from './dom.ts';
import { ElementEditor } from './element-editor.ts';
import { HistoryManager } from './history.ts';
import { PointerInputHandler } from './input-handler.ts';
import { SceneRenderer } from './renderer.ts';
import type { DrawTool } from './shapes/base-tool.ts';
import { ArrowTool } from './shapes/arrow-tool.ts';
import { EllipseTool } from './shapes/ellipse-tool.ts';
import { FreehandTool } from './shapes/freehand-tool.ts';
import { ImageTool } from './shapes/image-tool.ts';
import { LineTool } from './shapes/line-tool.ts';
import { RectTool } from './shapes/rect-tool.ts';
import { TextTool } from './shapes/text-tool.ts';
import { TriangleTool } from './shapes/triangle-tool.ts';
import { DiamondTool } from './shapes/diamond-tool.ts';
import { HexagonTool } from './shapes/hexagon-tool.ts';
import { DoubleArrowTool } from './shapes/double-arrow-tool.ts';
import { CheckmarkTool } from './shapes/checkmark-tool.ts';
import { SpeechBubbleTool } from './shapes/speech-bubble-tool.ts';
import { ToolbarController } from './toolbar.ts';
import type { DrawMode, DrawToolContext, SketchElement, ToolMode } from './types.ts';
import { ViewportController } from './viewport.ts';
import { setupAllEvents } from './ui-events.ts';

// noinspection JSUnusedGlobalSymbols
export default function init(payload?: SharedFilesPayload): void | (() => void) {
  const dom = getDom(document);
  if (!dom) {
    console.error('[SketchBoard] Failed to get DOM');
    return;
  }
  const ctx = dom.canvas.getContext('2d');
  if (!ctx) {
    console.error('[SketchBoard] Failed to get canvas context');
    return;
  }

  // --- Mutable state (scoped to init) ---
  let mode: ToolMode = 'pan';
  let elements: SketchElement[] = [];
  let hasUnsavedChanges = false;
  let currentBgClass = 'checkerboard-bg';

  // --- Module instances ---
  const history = new HistoryManager();
  const viewport = new ViewportController(dom.canvas);
  const renderer = new SceneRenderer(dom.canvas, ctx);
  setImageGetter((data) => renderer.getCachedImage(data));
  const pathCache = new Map<string, Path2D[]>();
  setPathCache(pathCache);
  const elementEditor = new ElementEditor(dom, ctx, history, renderer);
  const toolbar = new ToolbarController(dom);
  elementEditor.setToolbar(toolbar);

  // --- Draw tool registry ---
  const toolRegistry = new Map<DrawMode, DrawTool>();
  toolRegistry.set('freehand', new FreehandTool());
  toolRegistry.set('line', new LineTool());
  toolRegistry.set('rect', new RectTool());
  toolRegistry.set('ellipse', new EllipseTool());
  toolRegistry.set('triangle', new TriangleTool());
  toolRegistry.set('diamond', new DiamondTool());
  toolRegistry.set('hexagon', new HexagonTool());
  toolRegistry.set('arrow', new ArrowTool());
  toolRegistry.set('double-arrow', new DoubleArrowTool());
  toolRegistry.set('checkmark', new CheckmarkTool());
  toolRegistry.set('speech-bubble', new SpeechBubbleTool());
  toolRegistry.set('text', new TextTool());
  const imageTool = new ImageTool();
  toolRegistry.set('image', imageTool);
  imageTool.setGetCanvasCenter(() => {
    const vp = viewport.state;
    return {
      x: (dom.canvas.clientWidth / 2 - vp.x) / vp.scale,
      y: (dom.canvas.clientHeight / 2 - vp.y) / vp.scale,
    };
  });

  // Register each tool's declared options with the toolbar
  for (const [mode, tool] of toolRegistry) {
    toolbar.registerToolOptions(mode, tool.toolOptions);
  }

  // --- State accessors for modules ---
  const getState = () => ({ mode, elements, hasUnsavedChanges });
  const setState = (patch: { elements?: SketchElement[]; hasUnsavedChanges?: boolean }) => {
    if (patch.elements !== undefined) elements = patch.elements;
    if (patch.hasUnsavedChanges !== undefined) hasUnsavedChanges = patch.hasUnsavedChanges;
  };

  const getToolContext = (): DrawToolContext => ({
    color: dom.colorInput.value,
    strokeWidth: Math.round(parseInt(dom.widthInput.value, 10) / viewport.scale),
    fontFamily: dom.fontFamily.value,
    fontSize: parseInt(dom.fontSize.value, 10),
    fontWeight: dom.fontBold.classList.contains('btn-primary') ? 'bold' : 'normal',
    fontStyle: dom.fontItalic.classList.contains('btn-primary') ? 'italic' : 'normal',
    fillColor: dom.fillColorIndicator.style.backgroundColor || null,
    brushStyle: dom.brushStyleInput.value as 'normal' | 'shaky' | 'natural',
    viewport: viewport.state,
    elements,
  });

  const getCanvasCenter = () => {
    const vp = viewport.state;
    return {
      x: (dom.canvas.clientWidth / 2 - vp.x) / vp.scale,
      y: (dom.canvas.clientHeight / 2 - vp.y) / vp.scale,
    };
  };

  const updateUndoRedo = () => toolbar.updateUndoRedo(history);

  // --- Input handler ---
  const inputHandler = new PointerInputHandler(
    dom,
    viewport,
    renderer,
    elementEditor,
    toolRegistry,
    history,
    getState,
    setState,
    getToolContext,
    updateUndoRedo
  );

  // --- Draw scene ---
  const drawScene = (): void => {
    const activeTool = toolRegistry.get(mode as DrawMode) ?? null;
    const toolCtx = activeTool ? getToolContext() : null;
    const { start, end } = inputHandler.getDrawPoints();
    renderer.drawScene(
      elements,
      viewport.state,
      elementEditor,
      mode !== 'pan' && mode !== 'select' ? activeTool : null,
      toolCtx,
      start,
      end
    );
  };

  renderer.setDrawScene(drawScene);

  // --- Toolbar mode changes ---
  const setMode = (next: ToolMode): void => {
    if (elementEditor.isTextInputActive()) {
      elementEditor.finishTextInput();
    }
    elementEditor.clearSelection();
    mode = next;
    imageTool.setGetCanvasCenter(getCanvasCenter);
    toolbar.setMode(next);
    renderer.requestDrawImmediate(inputHandler.getStreamingState());
  };

  toolbar.setModeChangeHandler(setMode);

  // --- Actions & State Updates ---
  const onUndo = (): void => {
    const prev = history.undo(elements);
    if (!prev) return;
    elements = prev;
    hasUnsavedChanges = true;
    renderer.markDirty();
    updateUndoRedo();
    renderer.requestDraw();
  };

  const onRedo = (): void => {
    const next = history.redo(elements);
    if (!next) return;
    elements = next;
    hasUnsavedChanges = true;
    renderer.markDirty();
    updateUndoRedo();
    renderer.requestDraw();
  };

  const onZoomIn = (): void => {
    viewport.applyZoom(1);
    renderer.markDirty();
    renderer.requestDrawImmediate();
  };

  const onZoomOut = (): void => {
    viewport.applyZoom(-1);
    renderer.markDirty();
    renderer.requestDrawImmediate();
  };

  const onZoomReset = (): void => {
    viewport.resetScale();
    const bounds = getCropBounds(elements);
    if (bounds) viewport.centerOnContent(bounds);
    renderer.markDirty();
    renderer.requestDrawImmediate();
  };

  const applySelectedChange = (): void => {
    if (elementEditor.getSelectedIds().length > 0) {
      hasUnsavedChanges = true;
      renderer.markDirty();
      updateUndoRedo();
      renderer.requestDrawImmediate();
    }
  };

  const updateColorIndicator = (): void => {
    toolbar.updateColorIndicator(dom.colorInput.value);
  };

  const updateFillColorIndicator = (color?: string): void => {
    const c = color || dom.fillColorInput.value;
    if (c !== 'transparent') {
      dom.fillColorInput.value = c;
    }
    toolbar.updateFillColorIndicator(c);
  };

  const updateBrushStyleIndicator = (style: 'normal' | 'shaky' | 'natural'): void => {
    toolbar.updateBrushStyleIndicator(style);
  };

  const updateStrokeWidthIndicator = () => {
    const width = parseInt(dom.widthInput.value, 10);
    toolbar.updateStrokeWidthIndicator(width);
  };

  toolbar.setSelectionTypeChangeHandler((type) => {
    elementEditor.setSelectionType(type);
    toolbar.updateSelectionTypeIndicator(type);
    renderer.requestDrawImmediate();
  });

  const setBackground = (bgClass: string): void => {
    dom.appContainer.classList.remove('checkerboard-bg', 'solid-black-bg', 'warm-white-bg');
    dom.appContainer.classList.add(bgClass);
    currentBgClass = bgClass;
    dom.canvasBg.value = bgClass;
  };

  const applyTextChange = (): void => {
    if (elementEditor.getSelectedIds().length > 0) {
      history.push(elements);
      elementEditor.updateSelectedText(elements);
      hasUnsavedChanges = true;
      renderer.markDirty();
      updateUndoRedo();
      renderer.requestDrawImmediate();
    } else if (elementEditor.isTextInputActive()) {
      elementEditor.updateActiveTextInputStyle(getToolContext());
      renderer.requestDrawImmediate();
    }
  };

  // --- Zoom logic ---
  let zoomToastTimeout: ReturnType<typeof setTimeout> | null = null;
  viewport.onZoomChange = () => {
    const zoomText = `${Math.round(viewport.scale * 100)}%`;
    dom.zoomLevel.textContent = zoomText;
    dom.zoomLevelMobile.textContent = zoomText;

    const toast = dom.zoomToast;
    if (!toast) return;
    toast.textContent = zoomText;
    toast.classList.remove('opacity-0');
    toast.classList.add('opacity-100');
    if (zoomToastTimeout) clearTimeout(zoomToastTimeout);
    zoomToastTimeout = setTimeout(() => {
      toast.classList.remove('opacity-100');
      toast.classList.add('opacity-0');
    }, 1500);
  };

  // --- Toolbar Handlers ---
  toolbar.setMoveToFrontHandler(() => {
    if (elementEditor.getSelectedIds().length > 0) {
      history.push(elements);
      elements = elementEditor.moveElementToFront(elements);
      hasUnsavedChanges = true;
      renderer.markDirty();
      updateUndoRedo();
      renderer.requestDrawImmediate();
    }
  });

  toolbar.setMoveToBelowHandler(() => {
    if (elementEditor.getSelectedIds().length > 0) {
      history.push(elements);
      elements = elementEditor.moveElementToBelow(elements);
      hasUnsavedChanges = true;
      renderer.markDirty();
      updateUndoRedo();
      renderer.requestDrawImmediate();
    }
  });

  toolbar.setResizeImageHandler(async () => {
    const el = elementEditor.getSelectedElement(elements);
    if (!el || el.type !== 'image') return;
    let origW = el.originalWidth;
    let origH = el.originalHeight;
    if (!origW || !origH) {
      try {
        const img = new Image();
        img.src = el.imageData;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });
        origW = img.naturalWidth;
        origH = img.naturalHeight;
      } catch (err) {
        console.error('[SketchBoard] Failed to resolve original image size', err);
        return;
      }
    }
    if (origW && origH) {
      history.push(elements);
      const cx = el.position.x + el.imageWidth / 2;
      const cy = el.position.y + el.imageHeight / 2;
      el.imageWidth = origW;
      el.imageHeight = origH;
      el.position.x = cx - origW / 2;
      el.position.y = cy - origH / 2;
      hasUnsavedChanges = true;
      renderer.markDirty();
      updateUndoRedo();
      renderer.requestDrawImmediate();
    }
  });

  toolbar.setGroupHandler(() => {
    if (elementEditor.getSelectedIds().length > 1) {
      history.push(elements);
      elements = elementEditor.groupSelected(elements);
      hasUnsavedChanges = true;
      renderer.markDirty();
      updateUndoRedo();
      renderer.requestDrawImmediate();
    }
  });

  toolbar.setUngroupHandler(() => {
    if (elementEditor.getSelectedIds().length === 1) {
      history.push(elements);
      elements = elementEditor.ungroupSelected(elements);
      hasUnsavedChanges = true;
      renderer.markDirty();
      updateUndoRedo();
      renderer.requestDrawImmediate();
    }
  });

  toolbar.setResetRotationHandler(() => {
    if (elementEditor.getSelectedIds().length > 0) {
      history.push(elements);
      elementEditor.resetSelectedRotation(elements);
      hasUnsavedChanges = true;
      renderer.markDirty();
      updateUndoRedo();
      renderer.requestDrawImmediate();
    }
  });

  toolbar.setDuplicateHandler(() => {
    if (elementEditor.getSelectedIds().length > 0) {
      history.push(elements);
      const res = elementEditor.duplicateSelected(elements);
      elements = res.elements;
      hasUnsavedChanges = true;
      renderer.markDirty();
      updateUndoRedo();
      renderer.requestDrawImmediate();
    }
  });

  // --- UI Wiring ---
  setupAllEvents({
    dom,
    history,
    viewport,
    renderer,
    elementEditor,
    imageTool,
    getState,
    setState,
    getToolContext,
    getCanvasCenter,
    updateUndoRedo,
    onUndo,
    onRedo,
    onZoomIn,
    onZoomOut,
    onZoomReset,
    applySelectedChange,
    updateColorIndicator,
    updateFillColorIndicator,
    updateBrushStyleIndicator,
    updateStrokeWidthIndicator,
    setBackground,
    applyTextChange,
    getCurrentBgClass: () => currentBgClass,
  });

  toolbar.attach();
  inputHandler.attach();

  const resizeObserver = new ResizeObserver(() => renderer.resizeCanvas());
  resizeObserver.observe(dom.canvas);

  // --- Initial setup ---
  dom.canvas.style.touchAction = 'none';
  updateUndoRedo();
  setMode('pan');
  setBackground('checkerboard-bg');
  updateColorIndicator();
  updateFillColorIndicator('transparent');
  updateBrushStyleIndicator(dom.brushStyleInput.value as 'normal' | 'shaky' | 'natural');
  updateStrokeWidthIndicator();
  renderer.resizeCanvas();
  viewport.onZoomChange?.();
  renderer.requestDraw();

  if (payload?.sharedFiles?.length) {
    imageTool.setMaxSize(undefined);
    imageTool.setGetCanvasCenter(getCanvasCenter);
    imageTool.loadImageFromFile(payload.sharedFiles[0]);
  }

  // --- Cleanup ---
  return () => {
    renderer.dispose();
    resizeObserver.disconnect();
    toolbar.detach();
    inputHandler.detach();
    setPathCache(null);
    for (const button of dom.quickColorButtons) {
      button.removeEventListener('click', () => {}); // Note: simplified cleanup
    }
    for (const button of dom.fillQuickColorButtons) {
      button.removeEventListener('click', () => {}); // Note: simplified cleanup
    }
    elementEditor.reset();
  };
}
