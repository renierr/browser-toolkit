import type { Point, ViewportState } from './types.ts';

const MIN_SCALE = 0.1;
const MAX_SCALE = 10;
const ZOOM_STEP = 1.25;

export class ViewportController {
  private readonly canvas: HTMLCanvasElement;
  readonly state: ViewportState;

  constructor(canvas: HTMLCanvasElement, initial?: ViewportState) {
    this.canvas = canvas;
    this.state = initial ? { ...initial } : { x: 0, y: 0, scale: 1 };
  }

  get x(): number {
    return this.state.x;
  }
  set x(v: number) {
    this.state.x = v;
  }

  get y(): number {
    return this.state.y;
  }
  set y(v: number) {
    this.state.y = v;
  }

  get scale(): number {
    return this.state.scale;
  }
  set scale(v: number) {
    this.state.scale = v;
  }

  toWorld(clientX: number, clientY: number): Point {
    const rect = this.canvas.getBoundingClientRect();
    const cx = clientX - rect.left;
    const cy = clientY - rect.top;
    return {
      x: (cx - this.state.x) / this.state.scale,
      y: (cy - this.state.y) / this.state.scale,
    };
  }

  applyZoom(delta: number, focusX?: number, focusY?: number): boolean {
    const oldScale = this.state.scale;
    let newScale = oldScale * Math.pow(ZOOM_STEP, delta);
    newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
    if (newScale === oldScale) return false;

    if (focusX !== undefined && focusY !== undefined) {
      const rect = this.canvas.getBoundingClientRect();
      const canvasX = focusX - rect.left;
      const canvasY = focusY - rect.top;
      const worldX = (canvasX - this.state.x) / oldScale;
      const worldY = (canvasY - this.state.y) / oldScale;
      this.state.x = canvasX - worldX * newScale;
      this.state.y = canvasY - worldY * newScale;
    }

    this.state.scale = newScale;
    return true;
  }

  centerOnContent(bounds: { x: number; y: number; w: number; h: number }): void {
    const rect = this.canvas.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const worldCenterX = bounds.x + bounds.w / 2;
    const worldCenterY = bounds.y + bounds.h / 2;
    this.state.x = centerX - worldCenterX * this.state.scale;
    this.state.y = centerY - worldCenterY * this.state.scale;
  }

  resetScale(): void {
    this.state.scale = 1;
  }

  restore(saved: ViewportState): void {
    this.state.x = saved.x;
    this.state.y = saved.y;
    this.state.scale = saved.scale || 1;
  }

  snapshot(): ViewportState {
    return { ...this.state };
  }
}

export function getTouchDistance(t0: Touch, t1: Touch): number {
  const dx = t0.clientX - t1.clientX;
  const dy = t0.clientY - t1.clientY;
  return Math.hypot(dx, dy);
}

export function getTouchCenter(t0: Touch, t1: Touch): Point {
  return {
    x: (t0.clientX + t1.clientX) / 2,
    y: (t0.clientY + t1.clientY) / 2,
  };
}
