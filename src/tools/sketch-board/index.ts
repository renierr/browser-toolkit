import router from '@js/router.ts';
import { showMessage } from '@js/ui.ts';
import { debounce } from '@js/utils.ts';
import type { SharedFilesPayload } from '@js/share-target.ts';
import { getCropBounds, setImageGetter } from './drawing.ts';
import { setPathCache } from './utils/brush-styles.ts';
import { getDom } from './dom.ts';
import { confirmDiscardIfNeeded, showInfoModal } from './ui-helpers.ts';
import { ElementEditor } from './element-editor.ts';
import {
  copyToClipboard,
  exportDrawing,
  renderGallery,
  saveDrawing,
  shareDrawing,
} from './gallery.ts';
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
    brushStyle: dom.brushStyleInput.value as 'normal' | 'shaky',
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

  // --- Image tool setup ---
  imageTool.setOnInsert((el) => {
    history.push(elements);
    elements = [...elements, el];
    hasUnsavedChanges = true;
    renderer.markDirty();
    updateUndoRedo();
    renderer.requestDraw();
  });

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

  // --- Undo / Redo ---
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

  // --- Zoom ---
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

  // --- Quick color ---
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

  const updateBrushStyleIndicator = (style: 'normal' | 'shaky'): void => {
    toolbar.updateBrushStyleIndicator(style);
  };
  
  const updateStrokeWidthIndicator = () => {
    const width = parseInt(dom.widthInput.value, 10);
    toolbar.updateStrokeWidthIndicator(width);
  };

  const onQuickColorClick = (event: Event): void => {
    const target = event.currentTarget as HTMLButtonElement;
    const color = target.getAttribute('data-color');
    if (!color) return;
    dom.colorInput.value = color;
    updateColorIndicator();
    dom.colorInput.dispatchEvent(new Event('change', { bubbles: true }));
    if ('hidePopover' in dom.colorPopup && typeof dom.colorPopup.hidePopover === 'function') {
      dom.colorPopup.hidePopover();
    }
    // Also apply to selected element if in select mode
    if (elementEditor.getSelectedIds().length > 0) {
      history.push(elements);
      elementEditor.applySelectedColor(elements);
      applySelectedChange();
    }
  };

  const onFillQuickColorClick = (event: Event): void => {
    const target = event.currentTarget as HTMLButtonElement;
    const color = target.getAttribute('data-color');
    if (!color) return;
    updateFillColorIndicator(color);
    if (
      'hidePopover' in dom.fillColorPopup &&
      typeof dom.fillColorPopup.hidePopover === 'function'
    ) {
      dom.fillColorPopup.hidePopover();
    }
    if (elementEditor.getSelectedIds().length > 0) {
      history.push(elements);
      elementEditor.updateSelectedFillColor(elements, color);
      applySelectedChange();
    }
  };

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

    // Fallback for older drawings if metadata is missing: load current image data
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

  // --- Event setup ---
  const setupHistoryEvents = () => {
    dom.btnUndo.addEventListener('click', onUndo);
    dom.btnRedo.addEventListener('click', onRedo);
    dom.btnClear.addEventListener('click', () => {
      if (elements.length === 0 || !hasUnsavedChanges) {
        elements = [];
        history.clear();
        renderer.markDirty();
        updateUndoRedo();
        renderer.requestDraw();
        return;
      }
      if (!window.confirm('Discard current unsaved changes and clear canvas?')) return;
      elements = [];
      hasUnsavedChanges = false;
      history.clear();
      renderer.markDirty();
      updateUndoRedo();
      renderer.requestDraw();
    });
  };

  const setupViewportEvents = () => {
    dom.btnZoomIn.addEventListener('click', onZoomIn);
    dom.btnZoomOut.addEventListener('click', onZoomOut);
    dom.btnZoomReset.addEventListener('click', onZoomReset);
    dom.btnZoomInMobile.addEventListener('click', onZoomIn);
    dom.btnZoomOutMobile.addEventListener('click', onZoomOut);
    dom.btnZoomResetMobile.addEventListener('click', onZoomReset);
    dom.canvasBg.addEventListener('change', () => setBackground(dom.canvasBg.value));
  };

  const setupActionEvents = () => {
    dom.btnBackOverview.addEventListener('click', () => {
      if (!confirmDiscardIfNeeded(hasUnsavedChanges)) return;
      router.goOverview();
    });

    dom.btnSave.addEventListener('click', async () => {
      const saved = await saveDrawing(elements, viewport.state, mode, currentBgClass);
      if (saved) hasUnsavedChanges = false;
    });

    dom.btnInfo.addEventListener('click', () => showInfoModal(dom, elements, currentBgClass));

    dom.btnGallery.addEventListener('click', async () => {
      try {
        await renderGallery(dom, (record) => {
          if (!confirmDiscardIfNeeded(hasUnsavedChanges)) return;
          elements = record.elements.map((el) => JSON.parse(JSON.stringify(el)) as SketchElement);
          viewport.restore({ ...record.viewport, scale: record.viewport.scale || 1 });
          hasUnsavedChanges = false;
          history.clear();
          renderer.markDirty();
          updateUndoRedo();
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
      const scale = dom.exportHighDpi.checked ? window.devicePixelRatio || 1 : 1;
      const bg =
        format === 'jpg'
          ? currentBgClass === 'checkerboard-bg'
            ? 'warm-white-bg'
            : currentBgClass
          : currentBgClass === 'checkerboard-bg'
            ? undefined
            : currentBgClass;
      await exportDrawing(renderer.renderTempCanvas(elements, { scale, background: bg }), format);
    });

    dom.btnShare.addEventListener('click', async () => {
      const format = (dom.exportFormat.value as 'png' | 'jpg' | 'webp') || 'png';
      const scale = dom.exportHighDpi.checked ? window.devicePixelRatio || 1 : 1;
      const bg =
        format === 'jpg'
          ? currentBgClass === 'checkerboard-bg'
            ? 'warm-white-bg'
            : currentBgClass
          : currentBgClass === 'checkerboard-bg'
            ? undefined
            : currentBgClass;
      await shareDrawing(renderer.renderTempCanvas(elements, { scale, background: bg }), format);
    });

    dom.btnClipboard.addEventListener('click', async () => {
      const scale = dom.exportHighDpi.checked ? window.devicePixelRatio || 1 : 1;
      const bg = currentBgClass === 'checkerboard-bg' ? undefined : currentBgClass;
      await copyToClipboard(renderer.renderTempCanvas(elements, { scale, background: bg }));
    });
  };

  const setupPropertyEvents = () => {
    for (const button of dom.quickColorButtons) {
      button.addEventListener('click', onQuickColorClick);
    }
    for (const button of dom.fillQuickColorButtons) {
      button.addEventListener('click', onFillQuickColorClick);
    }
    dom.fontFamily.addEventListener('change', applyTextChange);
    dom.fontSize.addEventListener('input', applyTextChange);

    let preColorSnapshot: SketchElement[] | null = null;
    dom.colorInput.addEventListener('input', () => {
      if (elementEditor.getSelectedIds().length > 0) {
        if (!preColorSnapshot) preColorSnapshot = JSON.parse(JSON.stringify(elements));
        elementEditor.applySelectedColor(elements);
        updateColorIndicator();
        renderer.markDirty();
        renderer.requestDraw();
      } else if (elementEditor.isTextInputActive()) {
        elementEditor.updateActiveTextInputStyle(getToolContext());
        updateColorIndicator();
        renderer.requestDraw();
      } else {
        updateColorIndicator();
      }
    });

    dom.colorInput.addEventListener('change', () => {
      if (elementEditor.getSelectedIds().length > 0) {
        if (preColorSnapshot) {
          history.pushSnapshot(preColorSnapshot);
          preColorSnapshot = null;
        }
        hasUnsavedChanges = true;
        updateUndoRedo();
      }
    });

    let preFillColorSnapshot: SketchElement[] | null = null;
    dom.fillColorInput.addEventListener('input', () => {
      if (elementEditor.getSelectedIds().length > 0) {
        if (!preFillColorSnapshot) preFillColorSnapshot = JSON.parse(JSON.stringify(elements));
        elementEditor.applySelectedFillColor(elements);
        updateFillColorIndicator();
        renderer.markDirty();
        renderer.requestDraw();
      } else {
        updateFillColorIndicator();
      }
    });

    dom.fillColorInput.addEventListener('change', () => {
      if (elementEditor.getSelectedIds().length > 0) {
        if (preFillColorSnapshot) {
          history.pushSnapshot(preFillColorSnapshot);
          preFillColorSnapshot = null;
        }
        hasUnsavedChanges = true;
        updateUndoRedo();
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

    dom.brushNormal.addEventListener('click', () => {
      updateBrushStyleIndicator('normal');
      if (elementEditor.getSelectedIds().length > 0) {
        history.push(elements);
        elementEditor.applySelectedBrushStyle(elements, 'normal');
        applySelectedChange();
      }
    });

    dom.brushShaky.addEventListener('click', () => {
      updateBrushStyleIndicator('shaky');
      if (elementEditor.getSelectedIds().length > 0) {
        history.push(elements);
        elementEditor.applySelectedBrushStyle(elements, 'shaky');
        applySelectedChange();
      }
    });


    for (const btn of dom.strokeWidthPresets) {
      btn.addEventListener('click', () => {
        const width = parseInt((btn as HTMLButtonElement).dataset.width ?? '3', 10);
        dom.widthInput.value = width.toString();
        updateStrokeWidthIndicator();
        dom.widthInput.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }

    dom.widthInput.addEventListener(
      'input',
      debounce(() => {
        updateStrokeWidthIndicator();
        if (elementEditor.getSelectedIds().length > 0) {
          elementEditor.applySelectedStrokeWidth(elements, parseInt(dom.widthInput.value, 10));
          renderer.markDirty();
          renderer.requestDraw();
        }
      }, 50)
    );
    dom.widthInput.addEventListener('change', () => {
      if (elementEditor.getSelectedIds().length > 0) {
        history.push(elements);
        elementEditor.applySelectedStrokeWidth(elements, parseInt(dom.widthInput.value, 10));
        applySelectedChange();
      }
    });
  };

  const setupElementEvents = () => {
    const btnEditText = document.getElementById('edit-text') as HTMLButtonElement | null;
    if (btnEditText) {
      btnEditText.addEventListener('click', () => {
        if (elementEditor.getSelectedIds().length === 1) {
          history.push(elements);
          elementEditor.editSelectedText(elements, viewport.state, () => {
            hasUnsavedChanges = true;
            renderer.markDirty();
            updateUndoRedo();
            renderer.requestDrawImmediate();
          });
        }
      });
    }

    dom.deleteElement.addEventListener('click', () => {
      if (elementEditor.getSelectedIds().length > 0) {
        history.push(elements);
        elements = elementEditor.deleteSelected(elements);
        hasUnsavedChanges = true;
        renderer.markDirty();
        updateUndoRedo();
        renderer.requestDrawImmediate();
      }
    });

    dom.canvas.addEventListener(
      'keydown',
      (e) => {
        if (
          elementEditor.getSelectedIds().length > 0 &&
          (e.key === 'Delete' || e.key === 'Backspace')
        ) {
          e.preventDefault();
          history.push(elements);
          elements = elementEditor.deleteSelected(elements);
          hasUnsavedChanges = true;
          renderer.markDirty();
          updateUndoRedo();
          renderer.requestDrawImmediate();
        }
      },
      { passive: false }
    );
  };

  const setupImageEvents = () => {
    dom.btnImportImage.addEventListener('click', () => {
      imageTool.setGetCanvasCenter(getCanvasCenter);
      (document.activeElement as HTMLElement)?.blur();
      if ('hidePopover' in dom.drawTools && typeof dom.drawTools.hidePopover === 'function') {
        dom.drawTools.hidePopover();
      }
      imageTool.triggerFileInput();
    });

    dom.btnPasteImage.addEventListener('click', async () => {
      imageTool.setGetCanvasCenter(getCanvasCenter);
      (document.activeElement as HTMLElement)?.blur();
      if ('hidePopover' in dom.drawTools && typeof dom.drawTools.hidePopover === 'function') {
        dom.drawTools.hidePopover();
      }
      const pasted = await imageTool.pasteFromClipboard();
      if (!pasted) {
        showMessage('No image in clipboard or permission denied.', {
          type: 'alert',
          timeoutMs: 2000,
        });
      }
    });
  };

  // --- Attach modules ---
  setupHistoryEvents();
  setupViewportEvents();
  setupActionEvents();
  setupPropertyEvents();
  setupElementEvents();
  setupImageEvents();

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
  updateBrushStyleIndicator(dom.brushStyleInput.value as 'normal' | 'shaky');
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
      button.removeEventListener('click', onQuickColorClick);
    }
    for (const button of dom.fillQuickColorButtons) {
      button.removeEventListener('click', onFillQuickColorClick);
    }
    elementEditor.reset();
  };
}
