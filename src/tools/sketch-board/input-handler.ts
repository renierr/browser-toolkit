import type { SketchDom } from './dom.ts';
import type { ElementEditor } from './element-editor.ts';
import type { HistoryManager } from './history.ts';
import type { SceneRenderer } from './renderer.ts';
import type { DrawTool } from './shapes/base-tool.ts';
import type { TextTool } from './shapes/text-tool.ts';
import type { DrawMode, DrawToolContext, Point, SketchElement, ToolMode } from './types.ts';
import { getTouchCenter, getTouchDistance, type ViewportController } from './viewport.ts';

export class PointerInputHandler {
  private readonly dom: SketchDom;
  private readonly viewport: ViewportController;
  private readonly renderer: SceneRenderer;
  private readonly elementEditor: ElementEditor;
  private readonly toolRegistry: Map<DrawMode, DrawTool>;
  private readonly history: HistoryManager;

  private getState: () => {
    mode: ToolMode;
    elements: SketchElement[];
    hasUnsavedChanges: boolean;
  };
  private setState: (patch: { elements?: SketchElement[]; hasUnsavedChanges?: boolean }) => void;
  private getToolContext: () => DrawToolContext;

  private isPointerActive = false;
  private activePointerId: number | null = null;
  private panStartPointer: Point | null = null;
  private panStartX = 0;
  private panStartY = 0;
  private isStreamingFreehand = false;
  private drawStart: Point | null = null;
  private drawEnd: Point | null = null;

  private pinchStartDist = 0;
  private pinchStartCenter: Point | null = null;

  private readonly listeners: Array<{
    el: EventTarget;
    type: string;
    fn: EventListenerOrEventListenerObject;
    opts?: AddEventListenerOptions;
  }> = [];

  constructor(
    dom: SketchDom,
    viewport: ViewportController,
    renderer: SceneRenderer,
    elementEditor: ElementEditor,
    toolRegistry: Map<DrawMode, DrawTool>,
    history: HistoryManager,
    getState: () => { mode: ToolMode; elements: SketchElement[]; hasUnsavedChanges: boolean },
    setState: (patch: { elements?: SketchElement[]; hasUnsavedChanges?: boolean }) => void,
    getToolContext: () => DrawToolContext
  ) {
    this.dom = dom;
    this.viewport = viewport;
    this.renderer = renderer;
    this.elementEditor = elementEditor;
    this.toolRegistry = toolRegistry;
    this.history = history;
    this.getState = getState;
    this.setState = setState;
    this.getToolContext = getToolContext;
  }

  attach(): void {
    const canvas = this.dom.canvas;
    this.on<PointerEvent>(canvas, 'pointerdown', this.onPointerDown, { passive: false });
    this.on<PointerEvent>(canvas, 'pointermove', this.onPointerMove, { passive: false });
    this.on<PointerEvent>(canvas, 'pointerup', this.onPointerUp, { passive: false });
    this.on<PointerEvent>(canvas, 'pointercancel', this.onPointerUp, { passive: false });
    this.on<WheelEvent>(canvas, 'wheel', this.onWheel, { passive: false });
    this.on<TouchEvent>(canvas, 'touchstart', this.onTouchStart, { passive: false });
    this.on<TouchEvent>(canvas, 'touchmove', this.onTouchMove, { passive: false });
    this.on<TouchEvent>(canvas, 'touchend', this.onTouchEnd, { passive: false });
    this.on<TouchEvent>(canvas, 'touchcancel', this.onTouchEnd, { passive: false });
  }

  detach(): void {
    for (const { el, type, fn, opts } of this.listeners) {
      el.removeEventListener(type, fn, opts);
    }
    this.listeners.length = 0;
  }

  private on<E extends Event>(
    el: EventTarget,
    type: string,
    fn: (e: E) => void,
    opts?: AddEventListenerOptions
  ): void {
    const bound = fn.bind(this) as EventListener;
    el.addEventListener(type, bound, opts);
    this.listeners.push({ el, type, fn: bound, opts });
  }

  private onPointerDown(e: PointerEvent): void {
    if (this.activePointerId !== null && e.button !== 0) return;
    this.activePointerId = e.pointerId;
    this.isPointerActive = true;
    this.dom.canvas.setPointerCapture(e.pointerId);

    const { mode, elements } = this.getState();

    if (mode === 'pan') {
      this.panStartPointer = { x: e.clientX, y: e.clientY };
      this.panStartX = this.viewport.x;
      this.panStartY = this.viewport.y;
      this.dom.canvas.setAttribute('data-cursor', 'grabbing');
      return;
    }

    if (mode === 'select') {
      const point = this.viewport.toWorld(e.clientX, e.clientY);
      this.elementEditor.handleSelectPointerDown(point, elements);
      this.renderer.requestDrawImmediate();
      return;
    }

    if (mode === 'text') {
      const point = this.viewport.toWorld(e.clientX, e.clientY);
      this.drawStart = point;
      this.drawEnd = point;
      const textTool = this.toolRegistry.get('text') as TextTool | undefined;
      if (textTool) {
        const ctx = this.getToolContext();
        textTool.onPointerDown(point, ctx);
        this.dom.canvas.setAttribute('data-cursor', 'text');
        this.elementEditor.showTextInputOverlay(point, textTool, ctx, (el) => {
          if (el) {
            const state = this.getState();
            this.history.push(state.elements);
            state.elements.push(el);
            this.setState({ hasUnsavedChanges: true });
            this.renderer.markDirty();
          }
          this.drawStart = null;
          this.drawEnd = null;
          this.dom.canvas.setAttribute('data-cursor', 'text');
          this.renderer.requestDrawImmediate();
        });
      }
      e.preventDefault();
      this.resetPointerState();
      return;
    }

    // Drawing modes
    const point = this.viewport.toWorld(e.clientX, e.clientY);
    this.drawStart = point;
    this.drawEnd = point;
    const tool = this.toolRegistry.get(mode as DrawMode);
    if (!tool) return;

    const ctx = this.getToolContext();
    tool.onPointerDown(point, ctx);
    this.isStreamingFreehand = tool.streamsLive;

    if (this.isStreamingFreehand) {
      const canvasCtx = this.renderer.getContext();
      canvasCtx.save();
      canvasCtx.translate(this.viewport.x, this.viewport.y);
      canvasCtx.scale(this.viewport.scale, this.viewport.scale);
      tool.drawPreview(canvasCtx, ctx);
      canvasCtx.restore();
      e.preventDefault();
      return;
    }

    e.preventDefault();
    this.renderer.requestDrawImmediate();
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.isPointerActive || this.activePointerId !== e.pointerId) return;

    const { mode, elements } = this.getState();

    if (mode === 'pan') {
      if (!this.panStartPointer) return;
      this.viewport.x = this.panStartX + (e.clientX - this.panStartPointer.x);
      this.viewport.y = this.panStartY + (e.clientY - this.panStartPointer.y);
      this.renderer.markDirty();
      this.renderer.requestDraw();
      return;
    }

    if (mode === 'select') {
      const point = this.viewport.toWorld(e.clientX, e.clientY);
      if (this.elementEditor.handleSelectPointerMove(point, elements)) {
        this.renderer.markDirty();
        this.renderer.requestDraw();
      }
      return;
    }

    if (mode === 'text') return;
    if (!this.drawStart) return;

    const tool = this.toolRegistry.get(mode as DrawMode);
    if (!tool) return;

    const coalesced =
      typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : ([] as PointerEvent[]);
    const samples = coalesced.length > 0 ? coalesced : [e];
    const ctx = this.getToolContext();

    for (const sample of samples) {
      const next = this.viewport.toWorld(sample.clientX, sample.clientY);
      this.drawEnd = next;
      tool.onPointerMove(next, ctx);

      if (tool.streamsLive && tool.drawSegment) {
        const canvasCtx = this.renderer.getContext();
        canvasCtx.save();
        canvasCtx.translate(this.viewport.x, this.viewport.y);
        canvasCtx.scale(this.viewport.scale, this.viewport.scale);
        tool.drawSegment(canvasCtx, ctx);
        canvasCtx.restore();
      }
    }

    e.preventDefault();

    if (tool.streamsLive && this.isStreamingFreehand) return;
    this.renderer.requestDraw();
  }

  private onPointerUp(e: PointerEvent): void {
    if (!this.isPointerActive || this.activePointerId !== e.pointerId) return;

    if (this.dom.canvas.hasPointerCapture(e.pointerId)) {
      this.dom.canvas.releasePointerCapture(e.pointerId);
    }

    const { mode, elements, hasUnsavedChanges } = this.getState();

    if (mode === 'select') {
      const result = this.elementEditor.handleSelectPointerUp(elements, hasUnsavedChanges);
      if (result.pushed) {
        this.setState({ hasUnsavedChanges: result.hasUnsavedChanges });
        this.renderer.markDirty();
      }
      this.resetPointerState();
      return;
    }

    if (mode === 'text') {
      this.resetPointerState();
      return;
    }

    if (mode !== 'pan') {
      const tool = this.toolRegistry.get(mode as DrawMode);
      if (tool) {
        const point = this.viewport.toWorld(e.clientX, e.clientY);
        this.drawEnd = point;
        const ctx = this.getToolContext();
        const element = tool.onPointerUp(point, ctx);
        if (element) {
          this.history.push(elements);
          elements.push(element);
          this.setState({ hasUnsavedChanges: true });
          this.renderer.markDirty();
        }
        tool.reset();
      }
    }

    this.resetPointerState();
    this.renderer.requestDrawImmediate();
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const delta = -Math.sign(e.deltaY);
    this.viewport.applyZoom(delta, e.clientX, e.clientY);
    this.renderer.markDirty();
    this.renderer.requestDrawImmediate();
  }

  private onTouchStart(e: TouchEvent): void {
    if (e.touches.length === 2) {
      e.preventDefault();
      this.pinchStartDist = getTouchDistance(e.touches[0], e.touches[1]);
      this.pinchStartCenter = getTouchCenter(e.touches[0], e.touches[1]);
    }
  }

  private onTouchMove(e: TouchEvent): void {
    if (e.touches.length === 2 && this.pinchStartDist > 0 && this.pinchStartCenter) {
      e.preventDefault();
      const currentDist = getTouchDistance(e.touches[0], e.touches[1]);
      const currentCenter = getTouchCenter(e.touches[0], e.touches[1]);
      const scaleRatio = currentDist / this.pinchStartDist;
      if (Math.abs(scaleRatio - 1) > 0.05) {
        const delta = scaleRatio > 1 ? 1 : -1;
        this.viewport.applyZoom(delta, currentCenter.x, currentCenter.y);
        this.renderer.markDirty();
        this.renderer.requestDrawImmediate();
        this.pinchStartDist = currentDist;
        this.pinchStartCenter = currentCenter;
      }
    }
  }

  private onTouchEnd(e: TouchEvent): void {
    if (e.touches.length < 2) {
      this.pinchStartDist = 0;
      this.pinchStartCenter = null;
    }
  }

  private resetPointerState(): void {
    this.isPointerActive = false;
    this.activePointerId = null;
    this.drawStart = null;
    this.drawEnd = null;
    this.isStreamingFreehand = false;
    this.panStartPointer = null;
    this.dom.canvas.style.cursor = '';

    const { mode } = this.getState();
    if (mode === 'pan') {
      this.dom.canvas.setAttribute('data-cursor', 'grab');
    } else if (mode === 'select') {
      this.dom.canvas.setAttribute('data-cursor', 'pointer');
    } else if (mode === 'text') {
      this.dom.canvas.setAttribute('data-cursor', 'text');
    } else {
      this.dom.canvas.setAttribute('data-cursor', 'crosshair');
    }
  }

  getDrawPoints(): { start: Point | null; end: Point | null } {
    return { start: this.drawStart, end: this.drawEnd };
  }

  getStreamingState(): boolean {
    return this.isStreamingFreehand;
  }
}
