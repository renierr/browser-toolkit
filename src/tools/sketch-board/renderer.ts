import { drawElement, getCropBounds, getTextBounds } from './drawing.ts';
import type { DrawTool } from './shapes/base-tool.ts';
import type { DrawToolContext, Point, SketchElement, ViewportState } from './types.ts';

export class SceneRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly dpr: number;
  private readonly baseLayerCanvas: HTMLCanvasElement;
  private readonly baseLayerCtx: CanvasRenderingContext2D;

  private renderRaf: number | null = null;
  private renderQueued = false;
  private baseLayerDirty = true;
  private drawSceneFn: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.dpr = window.devicePixelRatio || 1;
    this.baseLayerCanvas = document.createElement('canvas');
    const blCtx = this.baseLayerCanvas.getContext('2d');
    if (!blCtx) throw new Error('[SceneRenderer] Failed to create base layer context');
    this.baseLayerCtx = blCtx;
  }

  /** Bind the full scene draw function (set once from orchestrator) */
  setDrawScene(fn: () => void): void {
    this.drawSceneFn = fn;
  }

  markDirty(): void {
    this.baseLayerDirty = true;
  }

  requestDraw(): void {
    this.renderQueued = true;
    if (this.renderRaf !== null) return;
    this.renderRaf = window.requestAnimationFrame(() => {
      this.renderRaf = null;
      if (!this.renderQueued) return;
      this.renderQueued = false;
      this.drawSceneFn?.();
    });
  }

  requestDrawImmediate(isStreamingFreehand = false): void {
    this.renderQueued = false;
    if (this.renderRaf !== null) {
      window.cancelAnimationFrame(this.renderRaf);
      this.renderRaf = null;
    }
    if (isStreamingFreehand) return;
    this.drawSceneFn?.();
  }

  resizeCanvas(): void {
    const rect = this.canvas.getBoundingClientRect();
    const nextW = Math.max(1, Math.round(rect.width * this.dpr));
    const nextH = Math.max(1, Math.round(rect.height * this.dpr));
    if (this.canvas.width === nextW && this.canvas.height === nextH) return;
    this.canvas.width = nextW;
    this.canvas.height = nextH;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.markDirty();
    this.requestDraw();
  }

  drawScene(
    elements: SketchElement[],
    viewport: ViewportState,
    selectedElementId: string | null,
    activeTool: DrawTool | null,
    toolCtx: DrawToolContext | null,
    drawStart: Point | null,
    drawEnd: Point | null
  ): void {
    this.renderBaseLayer(elements, viewport);

    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(this.baseLayerCanvas, 0, 0);
    this.ctx.restore();

    this.ctx.save();
    this.ctx.translate(viewport.x, viewport.y);
    this.ctx.scale(viewport.scale, viewport.scale);

    if (selectedElementId) {
      const selectedEl = elements.find((el) => el.id === selectedElementId);
      if (selectedEl && selectedEl.type === 'text') {
        const bounds = getTextBounds(this.ctx, selectedEl);
        this.ctx.setLineDash([4, 4]);
        this.ctx.strokeStyle = '#2563eb';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(bounds.x - 4, bounds.y - 4, bounds.w + 8, bounds.h + 8);
        this.ctx.setLineDash([]);
      }
    }

    if (activeTool && toolCtx && drawStart && drawEnd) {
      activeTool.drawPreview(this.ctx, toolCtx);
    }

    this.ctx.restore();
  }

  renderTempCanvas(elements: SketchElement[]): HTMLCanvasElement | null {
    const bounds = getCropBounds(elements);
    if (!bounds) return null;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = bounds.w;
    tempCanvas.height = bounds.h;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return null;

    tempCtx.translate(-bounds.x, -bounds.y);
    for (const el of elements) {
      drawElement(tempCtx, el);
    }

    return tempCanvas;
  }

  /** Provide access to the main context for tools that need incremental drawing */
  getContext(): CanvasRenderingContext2D {
    return this.ctx;
  }

  dispose(): void {
    if (this.renderRaf !== null) {
      window.cancelAnimationFrame(this.renderRaf);
      this.renderRaf = null;
    }
  }

  private renderBaseLayer(elements: SketchElement[], viewport: ViewportState): void {
    if (!this.baseLayerDirty) return;
    this.syncBaseLayerSize();

    const cssW = this.canvas.width / this.dpr;
    const cssH = this.canvas.height / this.dpr;

    this.baseLayerCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.baseLayerCtx.clearRect(0, 0, cssW, cssH);
    this.baseLayerCtx.save();
    this.baseLayerCtx.translate(viewport.x, viewport.y);
    this.baseLayerCtx.scale(viewport.scale, viewport.scale);
    for (const el of elements) {
      drawElement(this.baseLayerCtx, el);
    }
    this.baseLayerCtx.restore();
    this.baseLayerDirty = false;
  }

  private syncBaseLayerSize(): void {
    if (
      this.baseLayerCanvas.width === this.canvas.width &&
      this.baseLayerCanvas.height === this.canvas.height
    ) {
      return;
    }
    this.baseLayerCanvas.width = this.canvas.width;
    this.baseLayerCanvas.height = this.canvas.height;
    this.markDirty();
  }
}
