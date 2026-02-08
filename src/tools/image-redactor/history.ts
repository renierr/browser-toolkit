export class HistoryManager {
  private undoStack: ImageData[] = [];
  private redoStack: ImageData[] = [];
  private readonly maxSteps: number;

  constructor(maxSteps = 15) {
    this.maxSteps = maxSteps;
  }

  push(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
    if (this.undoStack.length >= this.maxSteps) {
      this.undoStack.shift();
    }
    this.undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    this.redoStack = []; // Clear redo stack on new action
  }

  undo(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): boolean {
    if (this.undoStack.length === 0) return false;

    // Save current state to redo stack before applying undo
    this.redoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));

    const lastState = this.undoStack.pop();
    if (lastState) {
      this.applyState(ctx, canvas, lastState);
      return true;
    }
    return false;
  }

  redo(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): boolean {
    if (this.redoStack.length === 0) return false;

    // Save current state to undo stack before applying redo
    this.undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));

    const nextState = this.redoStack.pop();
    if (nextState) {
      this.applyState(ctx, canvas, nextState);
      return true;
    }
    return false;
  }

  private applyState(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, state: ImageData) {
    if (canvas.width !== state.width || canvas.height !== state.height) {
      canvas.width = state.width;
      canvas.height = state.height;
    }
    ctx.putImageData(state, 0, 0);
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}
