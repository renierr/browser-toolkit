import { getElementBounds, normalizeRect } from './drawing.ts';
import type { SketchDom } from './dom.ts';
import type { HistoryManager } from './history.ts';
import type { SceneRenderer } from './renderer.ts';
import { optionsForElementType } from './shapes/base-tool.ts';
import type { TextTool } from './shapes/text-tool.ts';
import type { ToolbarController } from './toolbar.ts';
import type { DrawToolContext, Point, SketchElement } from './types.ts';

const HANDLE_SIZE = 8;
const MOVE_THRESHOLD = 5;

type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'start' | 'end';

export class ElementEditor {
  private readonly dom: SketchDom;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly history: HistoryManager;
  private readonly renderer: SceneRenderer;
  private toolbar: ToolbarController | null = null;

  private selectedElementId: string | null = null;
  private isDragging = false;
  private isResizing = false;
  private hasMovedBeyondThreshold = false;
  private activeHandle: ResizeHandle | null = null;
  private dragStartPos: Point | null = null;
  private resizeStartBounds: { x: number; y: number; w: number; h: number } | null = null;
  private textInputActive = false;

  constructor(
    dom: SketchDom,
    ctx: CanvasRenderingContext2D,
    history: HistoryManager,
    renderer: SceneRenderer
  ) {
    this.dom = dom;
    this.ctx = ctx;
    this.history = history;
    this.renderer = renderer;
  }

  setToolbar(toolbar: ToolbarController): void {
    this.toolbar = toolbar;
  }

  getSelectedId(): string | null {
    return this.selectedElementId;
  }

  isTextInputActive(): boolean {
    return this.textInputActive;
  }

  getSelectedElement(elements: SketchElement[]): SketchElement | null {
    if (!this.selectedElementId) return null;
    return elements.find((e) => e.id === this.selectedElementId) ?? null;
  }

  handleSelectPointerDown(
    point: Point,
    elements: SketchElement[]
  ): { found: boolean; elementId: string | null } {
    // Check resize handles first
    if (this.selectedElementId) {
      const el = elements.find((e) => e.id === this.selectedElementId);
      if (el) {
        const handle = this.hitTestHandle(point, el);
        if (handle) {
          this.isResizing = true;
          this.hasMovedBeyondThreshold = false;
          this.activeHandle = handle;
          this.dragStartPos = point;
          this.resizeStartBounds = getElementBounds(this.ctx, el);
          this.setCursorForHandle(handle);
          this.history.push(elements);
          return { found: true, elementId: el.id };
        }
      }
    }

    // Hit-test elements (iterate in reverse for top-most first)
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      const bounds = getElementBounds(this.ctx, el);
      const padding = Math.max(4, el.width / 2);
      if (
        point.x >= bounds.x - padding &&
        point.x <= bounds.x + bounds.w + padding &&
        point.y >= bounds.y - padding &&
        point.y <= bounds.y + bounds.h + padding
      ) {
        this.selectedElementId = el.id;
        this.isDragging = true;
        this.hasMovedBeyondThreshold = false;
        this.dragStartPos = point;

        // Sync toolbar options for selected element type
        this.syncToolbarForElement(el);

        this.dom.canvas.setAttribute('data-cursor', 'move');
        this.history.push(elements);
        return { found: true, elementId: el.id };
      }
    }

    this.selectedElementId = null;
    this.isDragging = false;
    this.isResizing = false;
    this.activeHandle = null;
    this.dragStartPos = null;
    this.toolbar?.hideSelectionOptions();
    return { found: false, elementId: null };
  }

  handleSelectPointerMove(point: Point, elements: SketchElement[]): boolean {
    if (this.isResizing && this.selectedElementId && this.dragStartPos && this.activeHandle) {
      const moved = this.doResize(point, elements);
      if (moved) this.hasMovedBeyondThreshold = true;
      return moved;
    }

    if (!this.isDragging || !this.selectedElementId || !this.dragStartPos) return false;

    const dx = Math.abs(point.x - this.dragStartPos.x);
    const dy = Math.abs(point.y - this.dragStartPos.y);

    if (!this.hasMovedBeyondThreshold && dx < MOVE_THRESHOLD && dy < MOVE_THRESHOLD) {
      return false;
    }

    this.hasMovedBeyondThreshold = true;
    return this.doMove(point, elements);
  }

  handleSelectPointerUp(
    _elements: SketchElement[],
    hasUnsaved: boolean
  ): { pushed: boolean; hasUnsavedChanges: boolean } {
    const pushed = Boolean(
      (this.isDragging || this.isResizing) && this.selectedElementId && this.hasMovedBeyondThreshold
    );
    if (pushed) {
      hasUnsaved = true;
    }
    this.isDragging = false;
    this.isResizing = false;
    this.hasMovedBeyondThreshold = false;
    this.activeHandle = null;
    this.dragStartPos = null;
    this.resizeStartBounds = null;
    if (this.selectedElementId) {
      this.dom.canvas.setAttribute('data-cursor', 'pointer');
    }
    return { pushed, hasUnsavedChanges: hasUnsaved };
  }

  showTextInputOverlay(
    position: Point,
    textTool: TextTool,
    toolCtx: DrawToolContext,
    onFinish: (element: SketchElement | null) => void
  ): void {
    this.textInputActive = true;
    const viewport = toolCtx.viewport;
    const rect = this.dom.canvas.getBoundingClientRect();
    const x = rect.left + viewport.x + position.x * viewport.scale;
    const y = rect.top + viewport.y + position.y * viewport.scale;

    const existingInput = document.getElementById('text-input-overlay');
    if (existingInput) existingInput.remove();

    const input = document.createElement('input');
    input.id = 'text-input-overlay';
    input.type = 'text';
    input.className =
      'absolute bg-transparent border border-blue-500 rounded text-base-content outline-none z-50';
    input.style.left = `${x}px`;
    input.style.top = `${y}px`;
    input.style.fontSize = `${toolCtx.fontSize}px`;
    input.style.fontFamily = toolCtx.fontFamily;
    input.style.fontWeight = toolCtx.fontWeight;
    input.style.fontStyle = toolCtx.fontStyle;
    input.style.color = toolCtx.color;
    input.style.width = '200px';

    const finish = (): void => {
      const value = input.value;
      input.remove();
      this.textInputActive = false;
      textTool.setText(value);
      if (value.trim()) {
        const offsetX = 1;
        const offsetY = 7;
        const commitPos: Point = { x: position.x + offsetX, y: position.y + offsetY };
        textTool.onPointerDown(commitPos, toolCtx);
        textTool.setText(value);
        const el = textTool.commit(value, toolCtx);
        onFinish(el);
      } else {
        onFinish(null);
      }
      textTool.reset();
    };

    const cancel = (): void => {
      input.remove();
      this.textInputActive = false;
      textTool.reset();
      onFinish(null);
    };

    input.addEventListener('input', () => {
      textTool.setText(input.value);
      this.renderer.requestDraw();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finish();
      } else if (e.key === 'Escape') {
        cancel();
      }
    });

    input.addEventListener('blur', () => {
      finish();
    });

    document.body.appendChild(input);
    input.focus();
  }

  updateSelectedText(elements: SketchElement[]): void {
    if (!this.selectedElementId) return;
    const el = elements.find((e) => e.id === this.selectedElementId);
    if (!el || el.type !== 'text') return;
    el.color = this.dom.colorInput.value;
    el.fontFamily = this.dom.fontFamily.value;
    el.fontSize = parseInt(this.dom.fontSize.value, 10);
    el.fontWeight = this.dom.fontBold.classList.contains('btn-primary') ? 'bold' : 'normal';
    el.fontStyle = this.dom.fontItalic.classList.contains('btn-primary') ? 'italic' : 'normal';
    this.history.push(elements);
  }

  /** Live-update color of selected element (no history push) */
  applySelectedColor(elements: SketchElement[]): void {
    if (!this.selectedElementId) return;
    const el = elements.find((e) => e.id === this.selectedElementId);
    if (!el) return;
    el.color = this.dom.colorInput.value;
  }

  /** Commit color change to history (call on input release) */
  commitSelectedColor(elements: SketchElement[]): void {
    if (!this.selectedElementId) return;
    this.history.push(elements);
  }

  /** Toggle filled state of the selected shape element */
  updateSelectedFilled(elements: SketchElement[], filled: boolean): void {
    if (!this.selectedElementId) return;
    const el = elements.find((e) => e.id === this.selectedElementId);
    if (!el) return;
    if ('filled' in el) {
      (el as { filled?: boolean }).filled = filled;
      this.history.push(elements);
    }
  }

  deleteSelected(elements: SketchElement[]): SketchElement[] {
    if (!this.selectedElementId) return elements;
    const filtered = elements.filter((e) => e.id !== this.selectedElementId);
    this.selectedElementId = null;
    this.toolbar?.hideSelectionOptions();
    this.history.push(filtered);
    return filtered;
  }

  clearSelection(): void {
    if (this.selectedElementId) {
      this.selectedElementId = null;
      this.toolbar?.hideSelectionOptions();
    }
  }

  reset(): void {
    this.selectedElementId = null;
    this.isDragging = false;
    this.isResizing = false;
    this.hasMovedBeyondThreshold = false;
    this.activeHandle = null;
    this.dragStartPos = null;
    this.resizeStartBounds = null;
    this.textInputActive = false;
    this.toolbar?.hideSelectionOptions();
    const existingInput = document.getElementById('text-input-overlay');
    if (existingInput) existingInput.remove();
  }

  /** Draw selection highlight and resize handles */
  drawSelection(canvasCtx: CanvasRenderingContext2D, elements: SketchElement[]): void {
    if (!this.selectedElementId) return;
    const el = elements.find((e) => e.id === this.selectedElementId);
    if (!el) return;

    const bounds = getElementBounds(canvasCtx, el);
    const pad = 4;

    // Dashed bounding box
    canvasCtx.setLineDash([4, 4]);
    canvasCtx.strokeStyle = '#2563eb';
    canvasCtx.lineWidth = 2;
    canvasCtx.strokeRect(bounds.x - pad, bounds.y - pad, bounds.w + pad * 2, bounds.h + pad * 2);
    canvasCtx.setLineDash([]);

    // Resize handles
    const handles = this.getHandlePositions(el, bounds);
    canvasCtx.fillStyle = '#2563eb';
    canvasCtx.strokeStyle = '#ffffff';
    canvasCtx.lineWidth = 1;
    for (const pos of handles) {
      canvasCtx.fillRect(
        pos.x - HANDLE_SIZE / 2,
        pos.y - HANDLE_SIZE / 2,
        HANDLE_SIZE,
        HANDLE_SIZE
      );
      canvasCtx.strokeRect(
        pos.x - HANDLE_SIZE / 2,
        pos.y - HANDLE_SIZE / 2,
        HANDLE_SIZE,
        HANDLE_SIZE
      );
    }
  }

  private doMove(point: Point, elements: SketchElement[]): boolean {
    if (!this.dragStartPos || !this.selectedElementId) return false;
    const dx = point.x - this.dragStartPos.x;
    const dy = point.y - this.dragStartPos.y;
    const el = elements.find((e) => e.id === this.selectedElementId);
    if (!el) return false;

    if (el.type === 'text') {
      el.position.x += dx;
      el.position.y += dy;
    } else if (el.type === 'freehand') {
      for (const p of el.points) {
        p.x += dx;
        p.y += dy;
      }
    } else {
      // line, rect, ellipse, triangle, arrow
      el.start.x += dx;
      el.start.y += dy;
      el.end.x += dx;
      el.end.y += dy;
    }
    this.dragStartPos = point;
    return true;
  }

  private doResize(point: Point, elements: SketchElement[]): boolean {
    if (!this.dragStartPos || !this.selectedElementId || !this.activeHandle) return false;
    const el = elements.find((e) => e.id === this.selectedElementId);
    if (!el) return false;

    // Freehand doesn't resize
    if (el.type === 'freehand') return false;

    // Line/arrow: drag start or end point directly
    if (
      (el.type === 'line' || el.type === 'arrow') &&
      (this.activeHandle === 'start' || this.activeHandle === 'end')
    ) {
      if (this.activeHandle === 'start') {
        el.start.x = point.x;
        el.start.y = point.y;
      } else {
        el.end.x = point.x;
        el.end.y = point.y;
      }
      this.dragStartPos = point;
      return true;
    }

    // Shapes with start/end bounding box (rect, ellipse, triangle)
    if ('start' in el && 'end' in el) {
      const rect = normalizeRect(el.start, el.end);
      const handle = this.activeHandle;
      let { x, y, w, h } = rect;

      if (handle === 'nw' || handle === 'w' || handle === 'sw') x = point.x;
      if (handle === 'ne' || handle === 'e' || handle === 'se') w = point.x - x;
      if (handle === 'nw' || handle === 'n' || handle === 'ne') y = point.y;
      if (handle === 'sw' || handle === 's' || handle === 'se') h = point.y - y;

      if (handle === 'w' || handle === 'nw' || handle === 'sw') w = rect.x + rect.w - point.x;
      if (handle === 'n' || handle === 'nw' || handle === 'ne') h = rect.y + rect.h - point.y;

      el.start.x = x;
      el.start.y = y;
      el.end.x = x + w;
      el.end.y = y + h;
      this.dragStartPos = point;
      return true;
    }

    // Text: resize changes font size proportionally
    if (el.type === 'text' && this.resizeStartBounds) {
      const dy = point.y - this.dragStartPos.y;
      const newSize = Math.max(8, Math.min(200, el.fontSize + dy * 0.5));
      el.fontSize = Math.round(newSize);
      el.width = el.fontSize;
      this.dragStartPos = point;
      return true;
    }

    return false;
  }

  private hitTestHandle(point: Point, el: SketchElement): ResizeHandle | null {
    // Freehand: no resize handles
    if (el.type === 'freehand') return null;

    const bounds = getElementBounds(this.ctx, el);

    // Line/arrow: start and end handles only
    if (el.type === 'line' || el.type === 'arrow') {
      if (this.isNearPoint(point, el.start)) return 'start';
      if (this.isNearPoint(point, el.end)) return 'end';
      return null;
    }

    const pad = 4;
    const positions = this.getCornerHandlePositions(bounds, pad);
    const handleNames: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

    for (let i = 0; i < positions.length; i++) {
      if (this.isNearPoint(point, positions[i])) return handleNames[i];
    }
    return null;
  }

  private getHandlePositions(
    el: SketchElement,
    bounds: { x: number; y: number; w: number; h: number }
  ): Point[] {
    if (el.type === 'freehand') return [];
    if (el.type === 'line' || el.type === 'arrow') {
      return [{ ...el.start }, { ...el.end }];
    }
    return this.getCornerHandlePositions(bounds, 4);
  }

  private getCornerHandlePositions(
    bounds: { x: number; y: number; w: number; h: number },
    pad: number
  ): Point[] {
    const x = bounds.x - pad;
    const y = bounds.y - pad;
    const w = bounds.w + pad * 2;
    const h = bounds.h + pad * 2;
    return [
      { x, y }, // nw
      { x: x + w / 2, y }, // n
      { x: x + w, y }, // ne
      { x: x + w, y: y + h / 2 }, // e
      { x: x + w, y: y + h }, // se
      { x: x + w / 2, y: y + h }, // s
      { x, y: y + h }, // sw
      { x, y: y + h / 2 }, // w
    ];
  }

  private isNearPoint(point: Point, target: Point): boolean {
    const threshold = HANDLE_SIZE + 4;
    return Math.abs(point.x - target.x) <= threshold && Math.abs(point.y - target.y) <= threshold;
  }

  private setCursorForHandle(handle: ResizeHandle): void {
    const cursorMap: Record<ResizeHandle, string> = {
      nw: 'nwse-resize',
      n: 'ns-resize',
      ne: 'nesw-resize',
      e: 'ew-resize',
      se: 'nwse-resize',
      s: 'ns-resize',
      sw: 'nesw-resize',
      w: 'ew-resize',
      start: 'crosshair',
      end: 'crosshair',
    };
    this.dom.canvas.style.cursor = cursorMap[handle];
  }

  private syncBoldItalicButtons(fontWeight: string, fontStyle: string): void {
    if (fontWeight === 'bold') {
      this.dom.fontBold.classList.add('btn-primary');
    } else {
      this.dom.fontBold.classList.remove('btn-primary');
    }
    if (fontStyle === 'italic') {
      this.dom.fontItalic.classList.add('btn-primary');
    } else {
      this.dom.fontItalic.classList.remove('btn-primary');
    }
  }

  /** Sync toolbar options and color input based on selected element type */
  private syncToolbarForElement(el: SketchElement): void {
    // Sync color input to the selected element's color
    this.dom.colorInput.value = el.color;

    // Show context-appropriate options via generic option set
    const options = optionsForElementType(el.type);
    this.toolbar?.showSelectionOptions(options);

    // Populate text-specific fields
    if (el.type === 'text') {
      this.dom.fontFamily.value = el.fontFamily;
      this.dom.fontSize.value = String(el.fontSize);
      this.syncBoldItalicButtons(el.fontWeight, el.fontStyle);
    }

    // Sync filled toggle for shapes
    if ('filled' in el && el.filled) {
      this.dom.filledToggle.classList.add('btn-primary');
    } else {
      this.dom.filledToggle.classList.remove('btn-primary');
    }
  }
}
