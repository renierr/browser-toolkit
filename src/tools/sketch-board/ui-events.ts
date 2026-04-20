import router from '@js/router.ts';
import { showMessage } from '@js/ui.ts';
import { debounce } from '@js/utils.ts';
import type { SketchDom } from './dom.ts';
import type { HistoryManager } from './history.ts';
import type { ViewportController } from './viewport.ts';
import type { SceneRenderer } from './renderer.ts';
import type { ElementEditor } from './element-editor.ts';
import type { ImageTool } from './shapes/image-tool.ts';
import type { SketchElement, ToolMode, DrawToolContext } from './types.ts';
import { confirmDiscardIfNeeded, showInfoModal } from './ui-helpers.ts';
import {
  copyToClipboard,
  exportDrawing,
  renderGallery,
  saveDrawing,
  shareDrawing,
} from './gallery.ts';

export type EventSetupParams = {
  dom: SketchDom;
  history: HistoryManager;
  viewport: ViewportController;
  renderer: SceneRenderer;
  elementEditor: ElementEditor;
  imageTool: ImageTool;

  getState: () => { mode: ToolMode; elements: SketchElement[]; hasUnsavedChanges: boolean };
  setState: (patch: { elements?: SketchElement[]; hasUnsavedChanges?: boolean; mode?: ToolMode }) => void;
  getToolContext: () => DrawToolContext;
  getCanvasCenter: () => { x: number; y: number };

  updateUndoRedo: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  applySelectedChange: () => void;
  updateColorIndicator: () => void;
  updateFillColorIndicator: (color?: string) => void;
  updateBrushStyleIndicator: (style: 'normal' | 'shaky' | 'natural') => void;
  updateStrokeWidthIndicator: () => void;
  setBackground: (bgClass: string) => void;
  applyTextChange: () => void;
  getCurrentBgClass: () => string;
};

export function setupAllEvents(params: EventSetupParams): void {
  const {
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
    getCurrentBgClass,
  } = params;

  // --- Quick color handlers ---
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
    const { elements } = getState();
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
    const { elements } = getState();
    if (elementEditor.getSelectedIds().length > 0) {
      history.push(elements);
      elementEditor.updateSelectedFillColor(elements, color);
      applySelectedChange();
    }
  };

  // --- Sub-setup functions ---
  const setupHistoryEvents = () => {
    dom.btnUndo.addEventListener('click', onUndo);
    dom.btnRedo.addEventListener('click', onRedo);
    dom.btnClear.addEventListener('click', () => {
      const { elements, hasUnsavedChanges } = getState();
      if (elements.length === 0 || !hasUnsavedChanges) {
        setState({ elements: [] });
        history.clear();
        renderer.markDirty();
        updateUndoRedo();
        renderer.requestDraw();
        return;
      }
      if (!window.confirm('Discard current unsaved changes and clear canvas?')) return;
      setState({ elements: [], hasUnsavedChanges: false });
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
      if (!confirmDiscardIfNeeded(getState().hasUnsavedChanges)) return;
      router.goOverview();
    });

    dom.btnSave.addEventListener('click', async () => {
      const { elements, mode } = getState();
      const saved = await saveDrawing(elements, viewport.state, mode, getCurrentBgClass());
      if (saved) setState({ hasUnsavedChanges: false });
    });

    dom.btnInfo.addEventListener('click', () =>
      showInfoModal(dom, getState().elements, getCurrentBgClass())
    );

    dom.btnGallery.addEventListener('click', async () => {
      try {
        await renderGallery(dom, (record) => {
          if (!confirmDiscardIfNeeded(getState().hasUnsavedChanges)) return;
          const elements = record.elements.map(
            (el) => JSON.parse(JSON.stringify(el)) as SketchElement
          );
          viewport.restore({ ...record.viewport, scale: record.viewport.scale || 1 });
          setState({ elements, hasUnsavedChanges: false });
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
      const currentBgClass = getCurrentBgClass();
      const bg =
        format === 'jpg'
          ? currentBgClass === 'checkerboard-bg'
            ? 'warm-white-bg'
            : currentBgClass
          : currentBgClass === 'checkerboard-bg'
            ? undefined
            : currentBgClass;
      await exportDrawing(
        renderer.renderTempCanvas(getState().elements, { scale, background: bg }),
        format
      );
    });

    dom.btnShare.addEventListener('click', async () => {
      const format = (dom.exportFormat.value as 'png' | 'jpg' | 'webp') || 'png';
      const scale = dom.exportHighDpi.checked ? window.devicePixelRatio || 1 : 1;
      const currentBgClass = getCurrentBgClass();
      const bg =
        format === 'jpg'
          ? currentBgClass === 'checkerboard-bg'
            ? 'warm-white-bg'
            : currentBgClass
          : currentBgClass === 'checkerboard-bg'
            ? undefined
            : currentBgClass;
      await shareDrawing(
        renderer.renderTempCanvas(getState().elements, { scale, background: bg }),
        format
      );
    });

    dom.btnClipboard.addEventListener('click', async () => {
      const scale = dom.exportHighDpi.checked ? window.devicePixelRatio || 1 : 1;
      const currentBgClass = getCurrentBgClass();
      const bg = currentBgClass === 'checkerboard-bg' ? undefined : currentBgClass;
      await copyToClipboard(
        renderer.renderTempCanvas(getState().elements, { scale, background: bg })
      );
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
      const { elements } = getState();
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
        setState({ hasUnsavedChanges: true });
        updateUndoRedo();
      }
    });

    let preFillColorSnapshot: SketchElement[] | null = null;
    dom.fillColorInput.addEventListener('input', () => {
      const { elements } = getState();
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
        setState({ hasUnsavedChanges: true });
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
      const { elements } = getState();
      updateBrushStyleIndicator('normal');
      if (elementEditor.getSelectedIds().length > 0) {
        history.push(elements);
        elementEditor.applySelectedBrushStyle(elements, 'normal');
        applySelectedChange();
      }
    });

    dom.brushShaky.addEventListener('click', () => {
      const { elements } = getState();
      updateBrushStyleIndicator('shaky');
      if (elementEditor.getSelectedIds().length > 0) {
        history.push(elements);
        elementEditor.applySelectedBrushStyle(elements, 'shaky');
        applySelectedChange();
      }
    });

    dom.brushNatural.addEventListener('click', () => {
      const { elements } = getState();
      updateBrushStyleIndicator('natural');
      if (elementEditor.getSelectedIds().length > 0) {
        history.push(elements);
        elementEditor.applySelectedBrushStyle(elements, 'natural');
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
        const { elements } = getState();
        updateStrokeWidthIndicator();
        if (elementEditor.getSelectedIds().length > 0) {
          elementEditor.applySelectedStrokeWidth(elements, parseInt(dom.widthInput.value, 10));
          renderer.markDirty();
          renderer.requestDraw();
        }
      }, 50)
    );
    dom.widthInput.addEventListener('change', () => {
      const { elements } = getState();
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
        const { elements } = getState();
        if (elementEditor.getSelectedIds().length === 1) {
          history.push(elements);
          elementEditor.editSelectedText(elements, viewport.state, () => {
            setState({ hasUnsavedChanges: true });
            renderer.markDirty();
            updateUndoRedo();
            renderer.requestDrawImmediate();
          });
        }
      });
    }

    dom.deleteElement.addEventListener('click', () => {
      const { elements } = getState();
      if (elementEditor.getSelectedIds().length > 0) {
        history.push(elements);
        const nextElements = elementEditor.deleteSelected(elements);
        setState({ elements: nextElements, hasUnsavedChanges: true });
        renderer.markDirty();
        updateUndoRedo();
        renderer.requestDrawImmediate();
      }
    });

    dom.canvas.addEventListener(
      'keydown',
      (e) => {
        const { elements } = getState();
        if (
          elementEditor.getSelectedIds().length > 0 &&
          (e.key === 'Delete' || e.key === 'Backspace')
        ) {
          e.preventDefault();
          history.push(elements);
          const nextElements = elementEditor.deleteSelected(elements);
          setState({ elements: nextElements, hasUnsavedChanges: true });
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

  // Execute all setups
  setupHistoryEvents();
  setupViewportEvents();
  setupActionEvents();
  setupPropertyEvents();
  setupElementEvents();
  setupImageEvents();
}
