import type { SketchDom } from '../dom.ts';
import type { HistoryManager } from '../history.ts';
import type { SceneRenderer } from '../renderer.ts';
import type { SketchElement } from '../types.ts';

export function setupHistoryEvents(
  dom: SketchDom,
  history: HistoryManager,
  renderer: SceneRenderer,
  getState: () => { elements: SketchElement[]; hasUnsavedChanges: boolean },
  setState: (patch: { elements?: SketchElement[]; hasUnsavedChanges?: boolean }) => void,
  updateUndoRedo: () => void,
  onUndo: () => void,
  onRedo: () => void
) {
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
}
