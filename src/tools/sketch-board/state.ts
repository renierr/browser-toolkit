import type { SketchElement, ToolMode } from './types.ts';
import type { HistoryManager } from './history.ts';

export type State = {
  mode: ToolMode;
  elements: SketchElement[];
  hasUnsavedChanges: boolean;
};

export class StateManager {
  private mode: ToolMode = 'pan';
  private elements: SketchElement[] = [];
  private hasUnsavedChanges = false;
  private history: HistoryManager;

  constructor(history: HistoryManager) {
    this.history = history;
  }

  getState(): State {
    return {
      mode: this.mode,
      elements: this.elements,
      hasUnsavedChanges: this.hasUnsavedChanges,
    };
  }

  setMode(mode: ToolMode) {
    this.mode = mode;
  }

  getMode(): ToolMode {
    return this.mode;
  }

  setElements(elements: SketchElement[]) {
    this.elements = elements;
  }

  getElements(): SketchElement[] {
    return this.elements;
  }

  setHasUnsavedChanges(value: boolean) {
    this.hasUnsavedChanges = value;
  }

  getHasUnsavedChanges(): boolean {
    return this.hasUnsavedChanges;
  }

  pushHistory() {
    this.history.push(this.elements);
  }

  undo(): SketchElement[] | null {
    const prev = this.history.undo(this.elements);
    if (prev) {
      this.elements = prev;
      this.hasUnsavedChanges = true;
      return prev;
    }
    return null;
  }

  redo(): SketchElement[] | null {
    const next = this.history.redo(this.elements);
    if (next) {
      this.elements = next;
      this.hasUnsavedChanges = true;
      return next;
    }
    return null;
  }

  clear() {
    this.elements = [];
    this.hasUnsavedChanges = false;
    this.history.clear();
  }
}
