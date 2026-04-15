import router from '@js/router.ts';
import { showMessage } from '@js/ui.ts';
import type { SharedFilesPayload } from '@js/share-target.ts';
import { getCropBounds, setImageGetter } from './drawing.ts';
import { getDom } from './dom.ts';
import { ElementEditor } from './element-editor.ts';
import { copyToClipboard, exportDrawing, renderGallery, saveDrawing, shareDrawing } from './gallery.ts';
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
import { ToolbarController } from './toolbar.ts';
import type { DrawMode, DrawToolContext, SketchElement, ToolMode } from './types.ts';
import { ViewportController } from './viewport.ts';

// noinspection JSUnusedGlobalSymbols
export default function init(payload?: SharedFilesPayload): void | (() => void) {
  const dom = getDom(document);
  if (!dom) return;
  const ctx = dom.canvas.getContext('2d');
  if (!ctx) return;

  // --- Mutable state (scoped to init) ---
  let mode: ToolMode = 'pan';
  let elements: SketchElement[] = [];
  let hasUnsavedChanges = false;

  // --- Module instances ---
  const history = new HistoryManager();
  const viewport = new ViewportController(dom.canvas);
  const renderer = new SceneRenderer(dom.canvas, ctx);
  setImageGetter((data) => renderer.getCachedImage(data));
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
  toolRegistry.set('arrow', new ArrowTool());
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
    filled: toolbar.isFilled(),
    viewport: viewport.state,
  });

  const updateUndoRedoButtons = (): void => {
    dom.btnUndo.disabled = !history.canUndo;
    dom.btnRedo.disabled = !history.canRedo;
    
    const undoBadge = dom.btnUndo.querySelector('#undo-badge') as HTMLElement | null;
    if (undoBadge) {
      if (history.undoLength > 0) {
        undoBadge.textContent = String(history.undoLength);
        undoBadge.classList.remove('hidden');
      } else {
        undoBadge.classList.add('hidden');
      }
    }

    const redoBadge = dom.btnRedo.querySelector('#redo-badge') as HTMLElement | null;
    if (redoBadge) {
      if (history.redoLength > 0) {
        redoBadge.textContent = String(history.redoLength);
        redoBadge.classList.remove('hidden');
      } else {
        redoBadge.classList.add('hidden');
      }
    }
  };

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
    updateUndoRedoButtons
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

  // --- Image tool setup ---
  imageTool.setOnInsert((el) => {
    history.push(elements);
    elements = [...elements, el];
    hasUnsavedChanges = true;
    renderer.markDirty();
    updateUndoRedoButtons();
    renderer.requestDraw();
  });

  // --- Toolbar mode changes ---
  const setMode = (next: ToolMode): void => {
    elementEditor.clearSelection();
    mode = next;
    imageTool.setGetCanvasCenter(() => {
      const vp = viewport.state;
      return {
        x: (dom.canvas.width / 2 - vp.x) / vp.scale,
        y: (dom.canvas.height / 2 - vp.y) / vp.scale,
      };
    });
    toolbar.setMode(next);
    renderer.requestDrawImmediate(inputHandler.getStreamingState());
  };

  toolbar.setModeChangeHandler(setMode);

  // --- Undo / Redo ---
  const onUndo = (): void => {
    const prev = history.undo(elements);
    if (!prev) return;
    elements = prev;
    hasUnsavedChanges = true;
    renderer.markDirty();
    updateUndoRedoButtons();
    renderer.requestDraw();
  };

  const onRedo = (): void => {
    const next = history.redo(elements);
    if (!next) return;
    elements = next;
    hasUnsavedChanges = true;
    renderer.markDirty();
    updateUndoRedoButtons();
    renderer.requestDraw();
  };

  // --- Zoom ---
  const onZoomIn = (): void => {
    viewport.applyZoom(1);
    const bounds = getCropBounds(elements);
    if (bounds) viewport.centerOnContent(bounds);
    renderer.markDirty();
    renderer.requestDrawImmediate();
  };

  const onZoomOut = (): void => {
    viewport.applyZoom(-1);
    const bounds = getCropBounds(elements);
    if (bounds) viewport.centerOnContent(bounds);
    renderer.markDirty();
    renderer.requestDrawImmediate();
  };

  const onZoomReset = (): void => {
    viewport.resetScale();
    renderer.markDirty();
    drawScene();
    const bounds = getCropBounds(elements);
    if (bounds) viewport.centerOnContent(bounds);
    renderer.requestDrawImmediate();
  };

  // --- Confirm discard ---
  const confirmDiscardIfNeeded = (): boolean => {
    if (!hasUnsavedChanges) return true;
    return window.confirm('Discard current unsaved changes?');
  };

  // --- Quick color ---
  const applySelectedChange = (): void => {
    if (elementEditor.getSelectedId()) {
      hasUnsavedChanges = true;
      renderer.markDirty();
      updateUndoRedoButtons();
      renderer.requestDrawImmediate();
    }
  };

  const onQuickColorClick = (event: Event): void => {
    const target = event.currentTarget as HTMLButtonElement;
    const color = target.getAttribute('data-color');
    if (!color) return;
    dom.colorInput.value = color;
    dom.colorPopup.removeAttribute('open');
    // Also apply to selected element if in select mode
    if (elementEditor.getSelectedId()) {
      history.push(elements);
      elementEditor.applySelectedColor(elements);
      applySelectedChange();
    }
  };

  toolbar.setFilledToggleHandler(() => {
    if (elementEditor.getSelectedId()) {
      history.push(elements);
      elementEditor.updateSelectedFilled(elements, toolbar.isFilled());
      applySelectedChange();
    }
  });

  toolbar.setMoveToFrontHandler(() => {
    if (elementEditor.getSelectedId()) {
      history.push(elements);
      elements = elementEditor.moveElementToFront(elements);
      hasUnsavedChanges = true;
      renderer.markDirty();
      updateUndoRedoButtons();
      renderer.requestDrawImmediate();
    }
  });

  toolbar.setMoveToBelowHandler(() => {
    if (elementEditor.getSelectedId()) {
      history.push(elements);
      elements = elementEditor.moveElementToBelow(elements);
      hasUnsavedChanges = true;
      renderer.markDirty();
      updateUndoRedoButtons();
      renderer.requestDrawImmediate();
    }
  });

  // --- Event listeners ---
  dom.btnBackOverview.addEventListener('click', () => {
    if (!confirmDiscardIfNeeded()) return;
    router.goOverview();
  });

  dom.btnUndo.addEventListener('click', onUndo);
  dom.btnRedo.addEventListener('click', onRedo);
  dom.btnZoomIn.addEventListener('click', onZoomIn);
  dom.btnZoomOut.addEventListener('click', onZoomOut);
  dom.btnZoomReset.addEventListener('click', onZoomReset);

  for (const button of dom.quickColorButtons) {
    button.addEventListener('click', onQuickColorClick);
  }

  dom.btnImportImage.addEventListener('click', () => {
    imageTool.setGetCanvasCenter(() => {
      const vp = viewport.state;
      return {
        x: (dom.canvas.clientWidth / 2 - vp.x) / vp.scale,
        y: (dom.canvas.clientHeight / 2 - vp.y) / vp.scale,
      };
    });
    (document.activeElement as HTMLElement)?.blur();
    imageTool.triggerFileInput();
  });

  dom.btnPasteImage.addEventListener('click', async () => {
    imageTool.setGetCanvasCenter(() => {
      const vp = viewport.state;
      return {
        x: (dom.canvas.clientWidth / 2 - vp.x) / vp.scale,
        y: (dom.canvas.clientHeight / 2 - vp.y) / vp.scale,
      };
    });
    (document.activeElement as HTMLElement)?.blur();
    const pasted = await imageTool.pasteFromClipboard();
    if (!pasted) {
      showMessage('No image in clipboard or permission denied.', {
        type: 'alert',
        timeoutMs: 2000,
      });
    }
  });

  dom.btnClear.addEventListener('click', () => {
    if (elements.length === 0 || !hasUnsavedChanges) {
      elements = [];
      history.clear();
      renderer.markDirty();
      updateUndoRedoButtons();
      renderer.requestDraw();
      return;
    }
    if (!window.confirm('Discard current unsaved changes and clear canvas?')) return;
    elements = [];
    hasUnsavedChanges = false;
    history.clear();
    renderer.markDirty();
    updateUndoRedoButtons();
    renderer.requestDraw();
  });

  dom.btnSave.addEventListener('click', async () => {
    const saved = await saveDrawing(elements, viewport.state, mode);
    if (saved) hasUnsavedChanges = false;
  });

  dom.btnGallery.addEventListener('click', async () => {
    try {
      await renderGallery(dom, (record) => {
        if (!confirmDiscardIfNeeded()) return;
        elements = record.elements.map((el) => JSON.parse(JSON.stringify(el)) as SketchElement);
        viewport.restore({ ...record.viewport, scale: record.viewport.scale || 1 });
        hasUnsavedChanges = false;
        history.clear();
        renderer.markDirty();
        updateUndoRedoButtons();
        renderer.requestDraw();
        showMessage(`Loaded "${record.name}".`, { timeoutMs: 2000 });
      });
      dom.galleryModal.showModal();
    } catch (error) {
      console.error('[SketchBoard] Failed to open gallery', error);
      showMessage('Failed to load saved drawings.', { type: 'alert', timeoutMs: 3000 });
    }
  });

  dom.btnExport.addEventListener('click', async () => {
    const format = (dom.exportFormat.value as 'png' | 'jpg' | 'webp') || 'png';
    await exportDrawing(renderer.renderTempCanvas(elements), format);
  });

  dom.btnShare.addEventListener('click', async () => {
    const format = (dom.exportFormat.value as 'png' | 'jpg' | 'webp') || 'png';
    await shareDrawing(renderer.renderTempCanvas(elements), format);
  });

  dom.btnClipboard.addEventListener('click', async () => {
    await copyToClipboard(renderer.renderTempCanvas(elements));
  });

  // --- Text property changes (apply to selected text element) ---
  const applyTextChange = (): void => {
    if (elementEditor.getSelectedId()) {
      history.push(elements);
      elementEditor.updateSelectedText(elements);
      hasUnsavedChanges = true;
      renderer.markDirty();
      updateUndoRedoButtons();
      renderer.requestDrawImmediate();
    }
  };

  dom.fontFamily.addEventListener('change', applyTextChange);
  dom.fontSize.addEventListener('input', applyTextChange);

  // Color: live visual update on input, history commit on change
  let preColorSnapshot: SketchElement[] | null = null;
  dom.colorInput.addEventListener('input', () => {
    if (elementEditor.getSelectedId()) {
      if (!preColorSnapshot) {
        preColorSnapshot = JSON.parse(JSON.stringify(elements));
      }
      elementEditor.applySelectedColor(elements);
      renderer.markDirty();
      renderer.requestDraw();
    }
  });
  dom.colorInput.addEventListener('change', () => {
    if (elementEditor.getSelectedId()) {
      if (preColorSnapshot) {
        history.pushSnapshot(preColorSnapshot);
        preColorSnapshot = null;
      }
      hasUnsavedChanges = true;
      updateUndoRedoButtons();
    }
  });

  dom.fontBold.addEventListener('click', () => {
    dom.fontBold.classList.toggle('btn-primary');
    applyTextChange();
  });

  dom.fontItalic.addEventListener('click', () => {
    dom.fontItalic.classList.toggle('btn-primary');
    applyTextChange();
  });

  dom.deleteElement.addEventListener('click', () => {
    if (elementEditor.getSelectedId()) {
      history.push(elements);
      elements = elementEditor.deleteSelected(elements);
      hasUnsavedChanges = true;
      renderer.markDirty();
      updateUndoRedoButtons();
      renderer.requestDrawImmediate();
    }
  });

  const onKeyDown = (e: KeyboardEvent): void => {
    if (elementEditor.getSelectedId() && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      history.push(elements);
      elements = elementEditor.deleteSelected(elements);
      hasUnsavedChanges = true;
      renderer.markDirty();
      updateUndoRedoButtons();
      renderer.requestDrawImmediate();
    }
  };

  dom.canvas.addEventListener('keydown', onKeyDown, { passive: false });

  // --- Attach modules ---
  toolbar.attach();
  inputHandler.attach();

  const resizeObserver = new ResizeObserver(() => renderer.resizeCanvas());
  resizeObserver.observe(dom.canvas);

  // --- Initial setup ---
  dom.canvas.style.touchAction = 'none';
  updateUndoRedoButtons();
  setMode('pan');
  renderer.resizeCanvas();
  renderer.requestDraw();

  if (payload?.sharedFiles?.length) {
    imageTool.setMaxSize(undefined);
    imageTool.setGetCanvasCenter(() => {
      const vp = viewport.state;
      return {
        x: (dom.canvas.clientWidth / 2 - vp.x) / vp.scale,
        y: (dom.canvas.clientHeight / 2 - vp.y) / vp.scale,
      };
    });
    imageTool.loadImageFromFile(payload.sharedFiles[0]);
  }

  // --- Cleanup ---
  return () => {
    renderer.dispose();
    resizeObserver.disconnect();
    toolbar.detach();
    inputHandler.detach();
    dom.canvas.removeEventListener('keydown', onKeyDown);
    for (const button of dom.quickColorButtons) {
      button.removeEventListener('click', onQuickColorClick);
    }
    elementEditor.reset();
  };
}
