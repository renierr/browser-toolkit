import type { SketchElement } from './types.ts';

const MAX_HISTORY = 100;

export class HistoryManager {
  private undoStack: SketchElement[][] = [];
  private redoStack: SketchElement[][] = [];

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  push(elements: SketchElement[]): void {
    this.undoStack.push(cloneElements(elements));
    if (this.undoStack.length > MAX_HISTORY) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  undo(current: SketchElement[]): SketchElement[] | null {
    if (this.undoStack.length === 0) return null;
    this.redoStack.push(cloneElements(current));
    const prev = this.undoStack.pop();
    return prev ? cloneElements(prev) : null;
  }

  redo(current: SketchElement[]): SketchElement[] | null {
    if (this.redoStack.length === 0) return null;
    this.undoStack.push(cloneElements(current));
    const next = this.redoStack.pop();
    return next ? cloneElements(next) : null;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}

function cloneElements(source: SketchElement[]): SketchElement[] {
  return source.map((el) => JSON.parse(JSON.stringify(el)) as SketchElement);
}
