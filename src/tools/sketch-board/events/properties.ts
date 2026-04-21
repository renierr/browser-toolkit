import { debounce } from '@js/utils.ts';
import type { SketchDom } from '../dom.ts';
import type { ElementEditor } from '../element-editor.ts';
import type { HistoryManager } from '../history.ts';
import type { SceneRenderer } from '../renderer.ts';
import type { DrawToolContext, SketchElement } from '../types.ts';

export function setupPropertyEvents(
  dom: SketchDom,
  elementEditor: ElementEditor,
  history: HistoryManager,
  renderer: SceneRenderer,
  getState: () => { elements: SketchElement[] },
  setState: (patch: { hasUnsavedChanges: boolean }) => void,
  getToolContext: () => DrawToolContext,
  updateColorIndicator: () => void,
  updateFillColorIndicator: (color?: string) => void,
  updateBrushStyleIndicator: (style: 'normal' | 'shaky' | 'natural') => void,
  updateStrokeWidthIndicator: () => void,
  applySelectedChange: () => void,
  applyTextChange: () => void,
  updateUndoRedo: () => void
) {
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

  const setupBrushBtn = (btn: HTMLElement, style: 'normal' | 'shaky' | 'natural') => {
    btn.addEventListener('click', () => {
      const { elements } = getState();
      updateBrushStyleIndicator(style);
      if (elementEditor.getSelectedIds().length > 0) {
        history.push(elements);
        elementEditor.applySelectedBrushStyle(elements, style);
        applySelectedChange();
      }
    });
  };

  setupBrushBtn(dom.brushNormal, 'normal');
  setupBrushBtn(dom.brushShaky, 'shaky');
  setupBrushBtn(dom.brushNatural, 'natural');

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
}
