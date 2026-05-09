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
import type { DrawMode, DrawToolContext, SelectionType, ToolMode } from './types.ts';
import { ViewportController } from './viewport.ts';
import { setupAllEvents } from './ui-events.ts';
import { StateManager, type State } from './state.ts';
import { SyncManager } from '@js/sync.ts';
import { syncGallery } from './store.ts';

// noinspection JSUnusedGlobalSymbols
export default function init(payload?: SharedFilesPayload): void | (() => void) {
  const dom = getDom(document);
  if (!dom) return;

  const ctx = dom.canvas.getContext('2d');
  if (!ctx) return;

  // --- Module instances ---
  const history = new HistoryManager();
  const state = new StateManager(history);
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

  const getCanvasCenter = () => {
    const vp = viewport.state;
    return {
      x: (dom.canvas.clientWidth / 2 - vp.x) / vp.scale,
      y: (dom.canvas.clientHeight / 2 - vp.y) / vp.scale,
    };
  };
  imageTool.setGetCanvasCenter(getCanvasCenter);

  // Register each tool's declared options with the toolbar
  for (const [mode, tool] of toolRegistry) {
    toolbar.registerToolOptions(mode, tool.toolOptions);
  }

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
    elements: state.getElements(),
  });

  const updateUndoRedo = () => toolbar.updateUndoRedo(history);

  imageTool.setOnInsert((el) => {
    const elements = state.getElements();
    history.push(elements);
    state.setElements([...elements, el]);
    state.setHasUnsavedChanges(true);
    updateUndoRedo();
    renderer.markDirty();
    renderer.requestDraw();
  });

  // --- Input handler ---
  const inputHandler = new PointerInputHandler(
    dom,
    viewport,
    renderer,
    elementEditor,
    toolRegistry,
    history,
    () => state.getState(),
    (patch: Partial<State>) => {
      if (patch.elements !== undefined) state.setElements(patch.elements);
      if (patch.hasUnsavedChanges !== undefined)
        state.setHasUnsavedChanges(patch.hasUnsavedChanges);
      if (patch.currentRecord !== undefined) state.setCurrentRecord(patch.currentRecord);
    },
    getToolContext,
    updateUndoRedo
  );

  // --- Draw scene ---
  const drawScene = (): void => {
    const mode = state.getMode();
    const activeTool = toolRegistry.get(mode as DrawMode) ?? null;
    const toolCtx = activeTool ? getToolContext() : null;
    const { start, end } = inputHandler.getDrawPoints();
    renderer.drawScene(
      state.getElements(),
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
    state.setMode(next);
    imageTool.setGetCanvasCenter(getCanvasCenter);
    toolbar.setMode(next);
    renderer.requestDrawImmediate(inputHandler.getStreamingState());
  };

  toolbar.setModeChangeHandler(setMode);

  // --- Actions & State Updates ---
  const onUndo = (): void => {
    if (state.undo()) {
      renderer.markDirty();
      updateUndoRedo();
      renderer.requestDraw();
    }
  };

  const onRedo = (): void => {
    if (state.redo()) {
      renderer.markDirty();
      updateUndoRedo();
      renderer.requestDraw();
    }
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
    const bounds = getCropBounds(state.getElements());
    if (bounds) viewport.centerOnContent(bounds);
    renderer.markDirty();
    renderer.requestDrawImmediate();
  };

  const applySelectedChange = (): void => {
    if (elementEditor.getSelectedIds().length > 0) {
      state.setHasUnsavedChanges(true);
      renderer.markDirty();
      updateUndoRedo();
      renderer.requestDrawImmediate();
    }
  };

  const updateColorIndicator = (): void => toolbar.updateColorIndicator(dom.colorInput.value);

  const updateFillColorIndicator = (color?: string): void => {
    const c = color || dom.fillColorInput.value;
    if (c !== 'transparent') dom.fillColorInput.value = c;
    toolbar.updateFillColorIndicator(c);
  };

  const updateBrushStyleIndicator = (style: 'normal' | 'shaky' | 'natural'): void =>
    toolbar.updateBrushStyleIndicator(style);

  const updateStrokeWidthIndicator = () =>
    toolbar.updateStrokeWidthIndicator(parseInt(dom.widthInput.value, 10));

  toolbar.setSelectionTypeChangeHandler((type) => {
    elementEditor.setSelectionType(type);
    toolbar.updateSelectionTypeIndicator(type);
    renderer.requestDrawImmediate();
  });

  let currentBgClass = 'checkerboard-bg';
  const setBackground = (bgClass: string): void => {
    dom.appContainer.classList.remove('checkerboard-bg', 'solid-black-bg', 'warm-white-bg');
    dom.appContainer.classList.add(bgClass);
    currentBgClass = bgClass;
    dom.canvasBg.value = bgClass;
  };

  const applyTextChange = (): void => {
    const elements = state.getElements();
    if (elementEditor.getSelectedIds().length > 0) {
      state.pushHistory();
      elementEditor.updateSelectedText(elements);
      state.setHasUnsavedChanges(true);
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
      state.pushHistory();
      state.setElements(elementEditor.moveElementToFront(state.getElements()));
      state.setHasUnsavedChanges(true);
      renderer.markDirty();
      updateUndoRedo();
      renderer.requestDrawImmediate();
    }
  });

  toolbar.setMoveToBelowHandler(() => {
    if (elementEditor.getSelectedIds().length > 0) {
      state.pushHistory();
      state.setElements(elementEditor.moveElementToBelow(state.getElements()));
      state.setHasUnsavedChanges(true);
      renderer.markDirty();
      updateUndoRedo();
      renderer.requestDrawImmediate();
    }
  });

  toolbar.setResizeImageHandler(async () => {
    const el = elementEditor.getSelectedElement(state.getElements());
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
      state.pushHistory();
      const cx = el.position.x + el.imageWidth / 2;
      const cy = el.position.y + el.imageHeight / 2;
      el.imageWidth = origW;
      el.imageHeight = origH;
      el.position.x = cx - origW / 2;
      el.position.y = cy - origH / 2;
      state.setHasUnsavedChanges(true);
      renderer.markDirty();
      updateUndoRedo();
      renderer.requestDrawImmediate();
    }
  });

  toolbar.setGroupHandler(() => {
    if (elementEditor.getSelectedIds().length > 1) {
      state.pushHistory();
      state.setElements(elementEditor.groupSelected(state.getElements()));
      state.setHasUnsavedChanges(true);
      renderer.markDirty();
      updateUndoRedo();
      renderer.requestDrawImmediate();
    }
  });

  toolbar.setUngroupHandler(() => {
    if (elementEditor.getSelectedIds().length === 1) {
      state.pushHistory();
      state.setElements(elementEditor.ungroupSelected(state.getElements()));
      state.setHasUnsavedChanges(true);
      renderer.markDirty();
      updateUndoRedo();
      renderer.requestDrawImmediate();
    }
  });

  toolbar.setResetRotationHandler(() => {
    if (elementEditor.getSelectedIds().length > 0) {
      const elements = state.getElements();
      state.pushHistory();
      elementEditor.resetSelectedRotation(elements);
      state.setHasUnsavedChanges(true);
      renderer.markDirty();
      updateUndoRedo();
      renderer.requestDrawImmediate();
    }
  });

  toolbar.setDuplicateHandler(() => {
    if (elementEditor.getSelectedIds().length > 0) {
      state.pushHistory();
      const res = elementEditor.duplicateSelected(state.getElements());
      state.setElements(res.elements);
      state.setHasUnsavedChanges(true);
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
    getState: () => state.getState(),
    setState: (patch: Partial<State>) => {
      if (patch.elements !== undefined) state.setElements(patch.elements);
      if (patch.hasUnsavedChanges !== undefined)
        state.setHasUnsavedChanges(patch.hasUnsavedChanges);
      if (patch.currentRecord !== undefined) state.setCurrentRecord(patch.currentRecord);
    },
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
  const initialSelectionType = (dom.selectionTypeInput.value as SelectionType) || 'box';
  elementEditor.setSelectionType(initialSelectionType);
  toolbar.updateSelectionTypeIndicator(initialSelectionType);
  renderer.requestDraw();

  if (payload?.sharedFiles?.length) {
    imageTool.setMaxSize(undefined);
    imageTool.setGetCanvasCenter(getCanvasCenter);
    imageTool.loadImageFromFile(payload.sharedFiles[0]);
  }

  // --- Background sync ---
  void SyncManager.isBackendAvailable().then((available) => {
    if (available) {
      void syncGallery();
    }
  });

  // --- Cleanup ---
  return () => {
    renderer.dispose();
    resizeObserver.disconnect();
    toolbar.detach();
    inputHandler.detach();
    setPathCache(null);
    elementEditor.reset();
  };
}
