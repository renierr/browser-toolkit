import type { SketchDom } from '../dom.ts';
import type { ElementEditor } from '../element-editor.ts';
import type { HistoryManager } from '../history.ts';
import type { ViewportController } from '../viewport.ts';
import type { SceneRenderer } from '../renderer.ts';
import type { State } from '../state.ts';

export function setupElementEvents(
  dom: SketchDom,
  elementEditor: ElementEditor,
  history: HistoryManager,
  viewport: ViewportController,
  renderer: SceneRenderer,
  getState: () => State,
  setState: (patch: Partial<State>) => void,
  updateUndoRedo: () => void
) {
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

  const deleteSelected = () => {
    const { elements } = getState();
    if (elementEditor.getSelectedIds().length > 0) {
      history.push(elements);
      const nextElements = elementEditor.deleteSelected(elements);
      setState({ elements: nextElements, hasUnsavedChanges: true });
      renderer.markDirty();
      updateUndoRedo();
      renderer.requestDrawImmediate();
    }
  };

  dom.deleteElement.addEventListener('click', deleteSelected);

  dom.canvas.addEventListener(
    'keydown',
    (e) => {
      if (
        elementEditor.getSelectedIds().length > 0 &&
        (e.key === 'Delete' || e.key === 'Backspace')
      ) {
        if (elementEditor.isTextInputActive()) return;
        e.preventDefault();
        deleteSelected();
      }
    },
    { passive: false }
  );
}
