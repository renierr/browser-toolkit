import router from '@js/router.ts';
import { showMessage } from '@js/ui.ts';
import type { SketchDom } from '../dom.ts';
import type { ViewportController } from '../viewport.ts';
import type { SceneRenderer } from '../renderer.ts';
import type { SketchElement } from '../types.ts';
import { confirmDiscardIfNeeded, showInfoModal } from '../ui-helpers.ts';
import {
  copyToClipboard,
  exportDrawing,
  renderGallery,
  saveDrawing,
  shareDrawing,
} from '../gallery.ts';
import type { State } from '../state.ts';

export function setupActionEvents(
  dom: SketchDom,
  viewport: ViewportController,
  renderer: SceneRenderer,
  history: { clear: () => void },
  getState: () => State,
  setState: (patch: Partial<State>) => void,
  updateUndoRedo: () => void,
  getCurrentBgClass: () => string
) {
  dom.btnBackOverview.addEventListener('click', () => {
    if (!confirmDiscardIfNeeded(getState().hasUnsavedChanges)) return;
    router.goOverview();
  });

  dom.btnSave.addEventListener('click', async () => {
    const { elements, mode, currentRecord } = getState();
    const savedRecord = await saveDrawing(
      elements,
      viewport.state,
      mode,
      getCurrentBgClass(),
      currentRecord
    );
    if (savedRecord) {
      setState({ hasUnsavedChanges: false, currentRecord: savedRecord });
    }
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
        setState({ elements, hasUnsavedChanges: false, currentRecord: record });
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

  const getExportParams = () => {
    const format = (dom.exportFormat.value as 'png' | 'jpg' | 'webp') || 'png';
    const scale = dom.exportHighDpi.checked ? window.devicePixelRatio || 1 : 1;
    const bgClass = getCurrentBgClass();
    const bg =
      format === 'jpg'
        ? bgClass === 'checkerboard-bg'
          ? 'warm-white-bg'
          : bgClass
        : bgClass === 'checkerboard-bg'
          ? undefined
          : bgClass;
    return { format, scale, bg };
  };

  dom.btnExport.addEventListener('click', async () => {
    const { format, scale, bg } = getExportParams();
    await exportDrawing(
      renderer.renderTempCanvas(getState().elements, { scale, background: bg }),
      format
    );
  });

  dom.btnShare.addEventListener('click', async () => {
    const { format, scale, bg } = getExportParams();
    await shareDrawing(
      renderer.renderTempCanvas(getState().elements, { scale, background: bg }),
      format
    );
  });

  dom.btnClipboard.addEventListener('click', async () => {
    const { scale, bg } = getExportParams();
    await copyToClipboard(
      renderer.renderTempCanvas(getState().elements, { scale, background: bg })
    );
  });
}
