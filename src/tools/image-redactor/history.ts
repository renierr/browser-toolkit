export class HistoryManager {
  private stack: ImageData[] = [];
  private readonly maxSteps: number;

  constructor(maxSteps = 15) {
    this.maxSteps = maxSteps;
  }

  push(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
    if (this.stack.length >= this.maxSteps) {
      this.stack.shift();
    }
    this.stack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
  }

  undo(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): boolean {
    if (this.stack.length === 0) return false;

    const lastState = this.stack.pop();
    if (lastState) {
      if (canvas.width !== lastState.width || canvas.height !== lastState.height) {
        canvas.width = lastState.width;
        canvas.height = lastState.height;
      }
      ctx.putImageData(lastState, 0, 0);
      return true;
    }
    return false;
  }

  clear() {
    this.stack = [];
  }

  canUndo(): boolean {
    return this.stack.length > 0;
  }
}
