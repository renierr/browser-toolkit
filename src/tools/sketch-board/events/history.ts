import type { SketchDom } from '../dom.ts';
import type { HistoryManager } from '../history.ts';
import type { SceneRenderer } from '../renderer.ts';
import type { State } from '../state.ts';

export function setupHistoryEvents(
  dom: SketchDom,
  history: HistoryManager,
  renderer: SceneRenderer,
  getState: () => State,
  setState: (patch: Partial<State>) => void,
  updateUndoRedo: () => void,
  onUndo: () => void,
  onRedo: () => void
) {
  dom.btnUndo.addEventListener('click', onUndo);
  dom.btnRedo.addEventListener('click', onRedo);
  dom.btnClear.addEventListener('click', () => {
    const { elements, hasUnsavedChanges } = getState();
    if (elements.length === 0 || !hasUnsavedChanges) {
      setState({ elements: [], currentRecord: undefined });
      history.clear();
      renderer.markDirty();
      updateUndoRedo();
      renderer.requestDraw();
      return;
    }
    if (!window.confirm('Discard current unsaved changes and clear canvas?')) return;
    setState({ elements: [], hasUnsavedChanges: false, currentRecord: undefined });
    history.clear();
    renderer.markDirty();
    updateUndoRedo();
    renderer.requestDraw();
  });
}
