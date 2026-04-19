import { getElementBounds } from './utils/bounds.ts';
import { normalizeRect } from './utils/drawing-shared.ts';
import type { SketchDom } from './dom.ts';
import type { HistoryManager } from './history.ts';
import type { SceneRenderer } from './renderer.ts';
import { optionsForElementType } from './shapes/base-tool.ts';
import type { TextTool } from './shapes/text-tool.ts';
import type { ToolbarController } from './toolbar.ts';
import type { BrushStyle, DrawToolContext, Point, SketchElement } from './types.ts';
import { applySnapOffset, getSnapTarget } from './utils/snapping.ts';

const HANDLE_SIZE = 8;
const MOVE_THRESHOLD = 5;

type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'start' | 'end' | 'rotate';

export class ElementEditor {
  private readonly dom: SketchDom;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly history: HistoryManager;
  private readonly renderer: SceneRenderer;
  private toolbar: ToolbarController | null = null;

  private selectedElementIds = new Set<string>();
  private selectionBox: { start: Point; end: Point } | null = null;
  private isDragging = false;
  private isResizing = false;
  private isRotating = false;
  private hasMovedBeyondThreshold = false;
  private activeHandle: ResizeHandle | null = null;
  private dragStartPos: Point | null = null;
  private resizeStartBounds: { x: number; y: number; w: number; h: number } | null = null;
  private rotationStartAngle = 0;
  private elementStartRotation = 0;
  private textInputActive = false;
  private pointerDownHitSelected = false;
  private dragStartSnapshot: SketchElement[] | null = null;
  private activeSnapPoint: Point | null = null;
  private activeTextOverlay:
    | {
        type: 'creation';
        input: HTMLTextAreaElement;
        onFinish: (element: SketchElement | null) => void;
        position: Point;
        toolCtx: DrawToolContext;
        textTool: TextTool;
        finish: () => void;
        cancel: () => void;
      }
    | {
        type: 'edit';
        input: HTMLTextAreaElement;
        finish: () => void;
        cancel: () => void;
      }
    | null = null;

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

  getSelectedIds(): string[] {
    return Array.from(this.selectedElementIds);
  }

  getSelectionBox(): { start: Point; end: Point } | null {
    return this.selectionBox;
  }

  isTextInputActive(): boolean {
    return this.textInputActive;
  }

  getSelectedElement(elements: SketchElement[]): SketchElement | null {
    if (this.selectedElementIds.size !== 1) return null;
    const id = this.selectedElementIds.values().next().value;
    return elements.find((e) => e.id === id) ?? null;
  }

  handleSelectPointerDown(
    point: Point,
    elements: SketchElement[],
    shiftKey = false
  ): { found: boolean; elementId: string | null } {
    this.pointerDownHitSelected = false;
    this.selectionBox = null;

    // Check resize/rotate handles first (only if single element selected for now)
    if (this.selectedElementIds.size === 1) {
      const id = this.selectedElementIds.values().next().value;
      const el = elements.find((e) => e.id === id);
      if (el) {
        const handle = this.hitTestHandle(point, el);
        if (handle) {
          if (handle === 'rotate') {
            this.isRotating = true;
            this.hasMovedBeyondThreshold = false;
            const bounds = getElementBounds(this.ctx, el, true);
            const cx = bounds.x + bounds.w / 2;
            const cy = bounds.y + bounds.h / 2;
            this.rotationStartAngle = Math.atan2(point.y - cy, point.x - cx);
            this.elementStartRotation = el.rotation || 0;
            this.activeHandle = 'rotate';
          } else {
            this.isResizing = true;
            this.hasMovedBeyondThreshold = false;
            this.activeHandle = handle;
            this.resizeStartBounds = getElementBounds(this.ctx, el, true);
          }
          this.dragStartPos = point;
          this.setCursorForHandle(handle);
          this.dragStartSnapshot = JSON.parse(JSON.stringify(elements));
          return { found: true, elementId: el.id };
        }
      }
    }

    // Check if clicking on an already selected element (to drag)
    for (const id of this.selectedElementIds) {
      const el = elements.find((e) => e.id === id);
      if (!el) continue;
      const bounds = getElementBounds(this.ctx, el);
      const padding = Math.max(4, el.width / 2);
      if (
        point.x >= bounds.x - padding &&
        point.x <= bounds.x + bounds.w + padding &&
        point.y >= bounds.y - padding &&
        point.y <= bounds.y + bounds.h + padding
      ) {
        this.pointerDownHitSelected = true;
        this.isDragging = true;
        this.hasMovedBeyondThreshold = false;
        this.dragStartPos = point;
        this.dragStartSnapshot = JSON.parse(JSON.stringify(elements));
        return { found: true, elementId: el.id };
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
        if (!shiftKey) {
          this.selectedElementIds.clear();
        }
        this.selectedElementIds.add(el.id);
        this.isDragging = true;
        this.hasMovedBeyondThreshold = false;
        this.dragStartPos = point;

        // Sync toolbar options for selected element type (if single selected)
        if (this.selectedElementIds.size === 1) {
          this.syncToolbarForElement(el);
        } else {
          this.toolbar?.showSelectionOptions(new Set(['group', 'color', 'fill']));
        }

        this.dom.canvas.setAttribute('data-cursor', 'move');
        this.dragStartSnapshot = JSON.parse(JSON.stringify(elements));
        return { found: true, elementId: el.id };
      }
    }

    // No element hit - start selection box
    if (!shiftKey) {
      this.selectedElementIds.clear();
    }
    this.selectionBox = { start: { ...point }, end: { ...point } };
    this.isDragging = false;
    this.isResizing = false;
    this.activeHandle = null;
    this.dragStartPos = point;
    this.toolbar?.hideSelectionOptions();
    return { found: false, elementId: null };
  }

  handleSelectPointerMove(point: Point, elements: SketchElement[]): boolean {
    if (this.selectionBox) {
      this.selectionBox.end = { ...point };
      return true;
    }

    if (this.isRotating && this.selectedElementIds.size === 1 && this.activeHandle === 'rotate') {
      const id = this.selectedElementIds.values().next().value;
      const el = elements.find((e) => e.id === id);
      if (el) {
        const bounds = getElementBounds(this.ctx, el, true);
        const cx = bounds.x + bounds.w / 2;
        const cy = bounds.y + bounds.h / 2;
        const currentAngle = Math.atan2(point.y - cy, point.x - cx);
        const diff = currentAngle - this.rotationStartAngle;
        el.rotation = this.elementStartRotation + diff;
        this.hasMovedBeyondThreshold = true;
        return true;
      }
    }

    if (
      this.isResizing &&
      this.selectedElementIds.size === 1 &&
      this.dragStartPos &&
      this.activeHandle
    ) {
      const id = this.selectedElementIds.values().next().value;
      const el = elements.find((e) => e.id === id);
      if (el) {
        const moved = this.doResize(point, el, elements);
        if (moved) this.hasMovedBeyondThreshold = true;
        return moved;
      }
    }

    if (!this.isDragging || this.selectedElementIds.size === 0 || !this.dragStartPos) return false;

    const dx = Math.abs(point.x - this.dragStartPos.x);
    const dy = Math.abs(point.y - this.dragStartPos.y);

    if (!this.hasMovedBeyondThreshold && dx < MOVE_THRESHOLD && dy < MOVE_THRESHOLD) {
      return false;
    }

    this.hasMovedBeyondThreshold = true;
    return this.doMove(point, elements);
  }

  handleSelectPointerUp(
    elements: SketchElement[],
    hasUnsaved: boolean
  ): { pushed: boolean; hasUnsavedChanges: boolean } {
    if (this.selectionBox) {
      const rect = normalizeRect(this.selectionBox.start, this.selectionBox.end);
      if (rect.w > 2 || rect.h > 2) {
        for (const el of elements) {
          const bounds = getElementBounds(this.ctx, el);
          if (
            !(
              bounds.x > rect.x + rect.w ||
              bounds.x + bounds.w < rect.x ||
              bounds.y > rect.y + rect.h ||
              bounds.y + bounds.h < rect.y
            )
          ) {
            this.selectedElementIds.add(el.id);
          }
        }
      }
      this.selectionBox = null;
      if (this.selectedElementIds.size > 0) {
        if (this.selectedElementIds.size === 1) {
          const id = this.selectedElementIds.values().next().value;
          const el = elements.find((e) => e.id === id);
          if (el) this.syncToolbarForElement(el);
        } else {
          this.toolbar?.showSelectionOptions(new Set(['group', 'color', 'fill']));
        }
      }
      return { pushed: false, hasUnsavedChanges: hasUnsaved };
    }

    const didMove = Boolean(
      (this.isDragging || this.isResizing || this.isRotating) &&
      this.selectedElementIds.size > 0 &&
      this.hasMovedBeyondThreshold
    );
    const hitSelected = Boolean(
      this.pointerDownHitSelected &&
      this.selectedElementIds.size === 1 &&
      !this.hasMovedBeyondThreshold
    );

    // Click on selected element without moving - select element behind it
    if (hitSelected && this.dragStartPos && this.selectedElementIds.size === 1) {
      const currentId = this.selectedElementIds.values().next().value;
      if (!currentId) return { pushed: false, hasUnsavedChanges: hasUnsaved };
      const nextEl = this.getNextElementBehind(currentId, this.dragStartPos, elements);
      if (nextEl) {
        this.selectedElementIds.clear();
        this.selectedElementIds.add(nextEl.id);
        this.syncToolbarForElement(nextEl);
        hasUnsaved = true;
      } else {
        // No element behind - keep selected
        this.dom.canvas.setAttribute('data-cursor', 'pointer');
      }
    } else if (didMove) {
      hasUnsaved = true;
      if (this.selectedElementIds.size === 1) {
        const id = this.selectedElementIds.values().next().value;
        const el = elements.find((e) => e.id === id);
        if (el) this.syncToolbarForElement(el);
      }
    }

    if (didMove && this.dragStartSnapshot) {
      this.history.pushSnapshot(this.dragStartSnapshot);
      hasUnsaved = true;
    }

    this.isDragging = false;
    this.isResizing = false;
    this.isRotating = false;
    this.hasMovedBeyondThreshold = false;
    this.activeHandle = null;
    this.dragStartPos = null;
    this.resizeStartBounds = null;
    this.pointerDownHitSelected = false;
    this.dragStartSnapshot = null;
    this.activeSnapPoint = null;

    if (this.selectedElementIds.size > 0) {
      this.dom.canvas.setAttribute('data-cursor', 'pointer');
    }
    return { pushed: didMove, hasUnsavedChanges: hasUnsaved };
  }

  private getNextElementBehind(
    currentId: string,
    point: Point,
    elements: SketchElement[]
  ): SketchElement | null {
    // Find index of current element
    const currentIdx = elements.findIndex((e) => e.id === currentId);
    if (currentIdx === -1) return null;

    // Iterate through elements below current (lower indices render behind)
    for (let i = currentIdx - 1; i >= 0; i--) {
      const el = elements[i];
      const bounds = getElementBounds(this.ctx, el);
      const padding = Math.max(4, el.width / 2);
      if (
        point.x >= bounds.x - padding &&
        point.x <= bounds.x + bounds.w + padding &&
        point.y >= bounds.y - padding &&
        point.y <= bounds.y + bounds.h + padding
      ) {
        return el;
      }
    }
    return null;
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

    const input = document.createElement('textarea');
    input.id = 'text-input-overlay';
    input.className =
      'absolute bg-transparent border border-blue-500 rounded text-base-content outline-none z-50 overflow-hidden resize-none py-0 px-1';
    input.style.left = `${x}px`;
    input.style.top = `${y}px`;
    input.style.fontSize = `${toolCtx.fontSize * toolCtx.viewport.scale}px`;
    input.style.fontFamily = toolCtx.fontFamily;
    input.style.fontWeight = toolCtx.fontWeight;
    input.style.fontStyle = toolCtx.fontStyle;
    input.style.color = toolCtx.color;
    input.style.width = '400px';
    input.style.height = `${toolCtx.fontSize * 1.2}px`;
    input.style.lineHeight = '1.2';
    input.style.whiteSpace = 'pre-wrap';

    const finish = (): void => {
      const state = this.activeTextOverlay;
      if (!state) return;
      this.activeTextOverlay = null;
      this.textInputActive = false;

      const { input } = state;
      const value = input.value;
      if (input.parentNode) input.remove();

      if (state.type === 'creation') {
        const { textTool, onFinish, position, toolCtx } = state;
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
      }
    };

    const cancel = (): void => {
      const state = this.activeTextOverlay;
      if (!state) return;
      this.activeTextOverlay = null;
      this.textInputActive = false;

      const { input } = state;
      if (input.parentNode) input.remove();

      if (state.type === 'creation') {
        state.textTool.reset();
        state.onFinish(null);
      }
    };

    this.activeTextOverlay = {
      type: 'creation',
      input,
      onFinish,
      position,
      toolCtx,
      textTool,
      finish,
      cancel,
    };

    input.addEventListener('input', () => {
      textTool.setText(input.value);
      input.style.height = 'auto';
      input.style.height = `${input.scrollHeight}px`;
      this.renderer.requestDraw();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        finish();
      } else if (e.key === 'Escape') {
        cancel();
      }
    });

    document.body.appendChild(input);
    input.focus();
  }

  finishTextInput(): void {
    this.activeTextOverlay?.finish();
  }

  cancelTextInput(): void {
    this.activeTextOverlay?.cancel();
  }

  updateActiveTextInputStyle(toolCtx: DrawToolContext): void {
    if (!this.activeTextOverlay) return;
    const { input } = this.activeTextOverlay;
    if (this.activeTextOverlay.type === 'creation') {
      this.activeTextOverlay.toolCtx = toolCtx;
    }
    const scale = toolCtx.viewport.scale;
    input.style.fontSize = `${toolCtx.fontSize * scale}px`;
    input.style.fontFamily = toolCtx.fontFamily;
    input.style.fontWeight = toolCtx.fontWeight;
    input.style.fontStyle = toolCtx.fontStyle;
    input.style.color = toolCtx.color;
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight}px`;
  }

  editSelectedText(
    elements: SketchElement[],
    viewport: { x: number; y: number; scale: number },
    onFinish: () => void
  ): void {
    if (this.selectedElementIds.size !== 1) return;
    const id = this.selectedElementIds.values().next().value;
    const el = elements.find((e) => e.id === id);
    if (!el || el.type !== 'text') return;

    this.textInputActive = true;
    const rect = this.dom.canvas.getBoundingClientRect();
    const x = rect.left + viewport.x + el.position.x * viewport.scale - 5;
    const y = rect.top + viewport.y + el.position.y * viewport.scale - 5;

    const existingInput = document.getElementById('text-input-overlay');
    if (existingInput) existingInput.remove();

    const input = document.createElement('textarea');
    input.id = 'text-input-overlay';
    input.value = el.text;
    input.className =
      'absolute bg-base-300 border border-blue-500 rounded text-base-content outline-none z-50 overflow-hidden resize-none py-0 px-1';
    input.style.left = `${x}px`;
    input.style.top = `${y}px`;
    input.style.fontSize = `${el.fontSize * viewport.scale}px`;
    input.style.fontFamily = el.fontFamily;
    input.style.fontWeight = el.fontWeight;
    input.style.fontStyle = el.fontStyle;
    input.style.color = el.color;
    input.style.minWidth = '400px';
    input.style.lineHeight = '1.2';
    input.style.whiteSpace = 'pre-wrap';

    const updateHeight = () => {
      input.style.height = 'auto';
      input.style.height = `${input.scrollHeight}px`;
    };

    input.addEventListener('input', updateHeight);

    const finish = (): void => {
      const state = this.activeTextOverlay;
      if (!state || state.type !== 'edit') return;
      this.activeTextOverlay = null;
      this.textInputActive = false;

      const value = input.value;
      if (input.parentNode) input.remove();

      if (value.trim() && value !== el.text) {
        el.text = value;
        onFinish();
      } else {
        this.renderer.requestDraw();
      }
    };

    const cancel = (): void => {
      const state = this.activeTextOverlay;
      if (!state || state.type !== 'edit') return;
      this.activeTextOverlay = null;
      this.textInputActive = false;

      if (input.parentNode) input.remove();
      this.renderer.requestDraw();
    };

    this.activeTextOverlay = {
      type: 'edit',
      input,
      finish,
      cancel,
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
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
    updateHeight();
    input.focus();
    input.select();
  }

  applySelectedBrushStyle(elements: SketchElement[], style: BrushStyle): void {
    if (this.selectedElementIds.size === 0) return;
    for (const id of this.selectedElementIds) {
      const el = elements.find((e) => e.id === id);
      if (el) {
        el.brushStyle = style;
      }
    }
    this.toolbar?.updateBrushStyleIndicator(style);
  }

  updateSelectedText(elements: SketchElement[]): void {
    if (this.selectedElementIds.size !== 1) return;
    const id = this.selectedElementIds.values().next().value;
    const el = elements.find((e) => e.id === id);
    if (!el || el.type !== 'text') return;
    el.color = this.dom.colorInput.value;
    el.fontFamily = this.dom.fontFamily.value;
    el.fontSize = parseInt(this.dom.fontSize.value, 10);
    el.fontWeight = this.dom.fontBold.classList.contains('btn-primary') ? 'bold' : 'normal';
    el.fontStyle = this.dom.fontItalic.classList.contains('btn-primary') ? 'italic' : 'normal';
  }

  /** Live-update color of selected element (no history push) */
  applySelectedColor(elements: SketchElement[]): void {
    if (this.selectedElementIds.size === 0) return;
    const color = this.dom.colorInput.value;
    for (const id of this.selectedElementIds) {
      const el = elements.find((e) => e.id === id);
      if (el) {
        this.applyColorToElement(el, color);
      }
    }
  }

  applySelectedFillColor(elements: SketchElement[]): void {
    if (this.selectedElementIds.size === 0) return;
    const color = this.dom.fillColorInput.value;
    for (const id of this.selectedElementIds) {
      const el = elements.find((e) => e.id === id);
      if (el) {
        this.applyFillColorToElement(el, color);
      }
    }
  }

  updateSelectedFillColor(elements: SketchElement[], color: string | null): void {
    if (this.selectedElementIds.size === 0) return;
    for (const id of this.selectedElementIds) {
      const el = elements.find((e) => e.id === id);
      if (el) {
        this.applyFillColorToElement(el, color ?? undefined);
      }
    }
  }

  private applyColorToElement(el: SketchElement, color: string): void {
    el.color = color;
    if (el.type === 'group') {
      for (const subEl of el.elements) {
        this.applyColorToElement(subEl, color);
      }
    }
  }

  private applyFillColorToElement(el: SketchElement, color: string | undefined): void {
    el.fillColor = color;
    if (el.type === 'group') {
      for (const subEl of el.elements) {
        this.applyFillColorToElement(subEl, color);
      }
    }
  }

  deleteSelected(elements: SketchElement[]): SketchElement[] {
    if (this.selectedElementIds.size === 0) return elements;
    const filtered = elements.filter((e) => !this.selectedElementIds.has(e.id));
    this.selectedElementIds.clear();
    this.toolbar?.hideSelectionOptions();
    return filtered;
  }

  moveElementToFront(elements: SketchElement[]): SketchElement[] {
    if (this.selectedElementIds.size === 0) return elements;
    const selected: SketchElement[] = [];
    const remaining: SketchElement[] = [];

    for (const el of elements) {
      if (this.selectedElementIds.has(el.id)) {
        selected.push(el);
      } else {
        remaining.push(el);
      }
    }
    return [...remaining, ...selected];
  }

  moveElementToBelow(elements: SketchElement[]): SketchElement[] {
    if (this.selectedElementIds.size === 0) return elements;
    const selected: SketchElement[] = [];
    const remaining: SketchElement[] = [];

    for (const el of elements) {
      if (this.selectedElementIds.size > 0 && this.selectedElementIds.has(el.id)) {
        selected.push(el);
      } else {
        remaining.push(el);
      }
    }
    return [...selected, ...remaining];
  }

  groupSelected(elements: SketchElement[]): SketchElement[] {
    if (this.selectedElementIds.size < 2) return elements;

    const groupElements: SketchElement[] = [];
    const remainingElements: SketchElement[] = [];

    for (const el of elements) {
      if (this.selectedElementIds.has(el.id)) {
        groupElements.push(el);
      } else {
        remainingElements.push(el);
      }
    }

    const group: SketchElement = {
      id: `group-${Date.now()}`,
      type: 'group',
      elements: groupElements,
      color: groupElements[0].color,
      width: groupElements[0].width,
    };

    remainingElements.push(group);
    this.selectedElementIds.clear();
    this.selectedElementIds.add(group.id);
    this.syncToolbarForElement(group);
    return remainingElements;
  }

  ungroupSelected(elements: SketchElement[]): SketchElement[] {
    if (this.selectedElementIds.size !== 1) return elements;
    const id = this.selectedElementIds.values().next().value;
    const el = elements.find((e) => e.id === id);
    if (!el || el.type !== 'group') return elements;

    const remainingElements = elements.filter((e) => e.id !== id);
    this.selectedElementIds.clear();

    for (const subEl of el.elements) {
      remainingElements.push(subEl);
      this.selectedElementIds.add(subEl.id);
    }

    this.toolbar?.showSelectionOptions(new Set(['group', 'color', 'fill']));
    return remainingElements;
  }
 
  resetSelectedRotation(elements: SketchElement[]): void {
    if (this.selectedElementIds.size === 0) return;
    for (const id of this.selectedElementIds) {
      const el = elements.find((e) => e.id === id);
      if (el) {
        el.rotation = 0;
      }
    }
    // Update toolbar for the first selected element (if only one selected)
    if (this.selectedElementIds.size === 1) {
      const id = this.selectedElementIds.values().next().value;
      const el = elements.find((e) => e.id === id);
      if (el) this.syncToolbarForElement(el);
    }
  }

  clearSelection(): void {
    if (this.selectedElementIds.size > 0) {
      this.selectedElementIds.clear();
      this.toolbar?.hideSelectionOptions();
    }
  }

  reset(): void {
    this.selectedElementIds.clear();
    this.selectionBox = null;
    this.isDragging = false;
    this.isResizing = false;
    this.isRotating = false;
    this.hasMovedBeyondThreshold = false;
    this.activeHandle = null;
    this.dragStartPos = null;
    this.resizeStartBounds = null;
    this.textInputActive = false;
    this.dragStartSnapshot = null;
    this.activeSnapPoint = null;
    this.toolbar?.hideSelectionOptions();
    const existingInput = document.getElementById('text-input-overlay');
    if (existingInput) existingInput.remove();
  }


  /** Draw selection highlight and resize handles */
  drawSelection(canvasCtx: CanvasRenderingContext2D, elements: SketchElement[]): void {
    // Draw selection box if active
    if (this.selectionBox) {
      const rect = normalizeRect(this.selectionBox.start, this.selectionBox.end);
      canvasCtx.fillStyle = 'rgba(37, 99, 235, 0.1)';
      canvasCtx.strokeStyle = '#2563eb';
      canvasCtx.lineWidth = 1;
      canvasCtx.fillRect(rect.x, rect.y, rect.w, rect.h);
      canvasCtx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    }

    if (this.selectedElementIds.size === 0) return;

    for (const id of this.selectedElementIds) {
      const el = elements.find((e) => e.id === id);
      if (!el) continue;

      const bounds = getElementBounds(canvasCtx, el, true); // unrotated
      const rotation = el.rotation || 0;
      const centerX = bounds.x + bounds.w / 2;
      const centerY = bounds.y + bounds.h / 2;

      canvasCtx.save();
      if (rotation !== 0) {
        canvasCtx.translate(centerX, centerY);
        canvasCtx.rotate(rotation);
        canvasCtx.translate(-centerX, -centerY);
      }

      const pad = 4;

      // Dashed bounding box
      canvasCtx.setLineDash([4, 4]);
      canvasCtx.strokeStyle = '#2563eb';
      canvasCtx.lineWidth = 2;
      canvasCtx.strokeRect(bounds.x - pad, bounds.y - pad, bounds.w + pad * 2, bounds.h + pad * 2);
      canvasCtx.setLineDash([]);

      // Resize handles (only for single selection)
      if (this.selectedElementIds.size === 1) {
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

        // Draw rotation handle
        const rotHandle = this.getRotationHandlePosition(bounds);
        canvasCtx.beginPath();
        canvasCtx.moveTo(bounds.x + bounds.w / 2, bounds.y - pad);
        canvasCtx.lineTo(rotHandle.x, rotHandle.y);
        canvasCtx.stroke();

        canvasCtx.beginPath();
        canvasCtx.arc(rotHandle.x, rotHandle.y, HANDLE_SIZE / 2, 0, Math.PI * 2);
        canvasCtx.fill();
        canvasCtx.stroke();
      }
      canvasCtx.restore();
    }

    // Draw active snap indicator if resizing in select mode
    if (this.activeSnapPoint) {
      canvasCtx.save();
      canvasCtx.strokeStyle = '#2563eb';
      canvasCtx.lineWidth = 2;
      canvasCtx.setLineDash([4, 4]);
      canvasCtx.beginPath();
      canvasCtx.arc(this.activeSnapPoint.x, this.activeSnapPoint.y, 10, 0, Math.PI * 2);
      canvasCtx.stroke();
      canvasCtx.restore();
    }
  }

  private getRotationHandlePosition(bounds: { x: number; y: number; w: number; h: number }): Point {
    return { x: bounds.x + bounds.w / 2, y: bounds.y - 30 };
  }

  private doMove(point: Point, elements: SketchElement[]): boolean {
    if (!this.dragStartPos || this.selectedElementIds.size === 0) return false;
    const dx = point.x - this.dragStartPos.x;
    const dy = point.y - this.dragStartPos.y;

    const movedIds = new Set(this.selectedElementIds);
    for (const id of this.selectedElementIds) {
      const el = elements.find((e) => e.id === id);
      if (!el) continue;
      this.moveElement(el, dx, dy);
      
      // If we move the whole element, clear its snaps (unless we want to preserve them, 
      // but usually moving the whole arrow means manual positioning)
      if (el.type === 'arrow' || el.type === 'double-arrow' || el.type === 'line') {
        el.startSnap = undefined;
        el.endSnap = undefined;
      }
    }

    this.updateSnappedElements(elements, movedIds);

    this.dragStartPos = point;
    return true;
  }

  private moveElement(el: SketchElement, dx: number, dy: number): void {
    if (el.type === 'text' || el.type === 'image') {
      el.position.x += dx;
      el.position.y += dy;
    } else if (el.type === 'freehand') {
      for (const p of el.points) {
        p.x += dx;
        p.y += dy;
      }
    } else if (el.type === 'group') {
      for (const subEl of el.elements) {
        this.moveElement(subEl, dx, dy);
      }
    } else {
      // line, rect, ellipse, triangle, arrow
      el.start.x += dx;
      el.start.y += dy;
      el.end.x += dx;
      el.end.y += dy;
    }
  }

  private doResize(point: Point, el: SketchElement, elements: SketchElement[]): boolean {
    if (
      !this.dragStartPos ||
      !this.activeHandle ||
      !this.resizeStartBounds ||
      !this.dragStartSnapshot
    )
      return false;

    const snapshotEl = this.dragStartSnapshot.find((e) => e.id === el.id);
    if (!snapshotEl) return false;

    // Line/arrow: drag start or end point directly
    if (
      (el.type === 'line' || el.type === 'arrow' || el.type === 'double-arrow') &&
      (this.activeHandle === 'start' || this.activeHandle === 'end')
    ) {
      const snap = getSnapTarget(point, elements, new Set([el.id]), this.ctx);
      this.activeSnapPoint = snap ? snap.point : null;
      if (this.activeHandle === 'start') {
        if (snap) {
          el.start.x = snap.point.x;
          el.start.y = snap.point.y;
          el.startSnap = { elementId: snap.elementId, offsetX: snap.offsetX, offsetY: snap.offsetY };
        } else {
          el.start.x = point.x;
          el.start.y = point.y;
          el.startSnap = undefined;
        }
      } else {
        if (snap) {
          el.end.x = snap.point.x;
          el.end.y = snap.point.y;
          el.endSnap = { elementId: snap.elementId, offsetX: snap.offsetX, offsetY: snap.offsetY };
        } else {
          el.end.x = point.x;
          el.end.y = point.y;
          el.endSnap = undefined;
        }
      }
      return true;
    }

    const bounds = this.resizeStartBounds;
    const handle = this.activeHandle;
    const rotation = el.rotation || 0;
    const cx = bounds.x + bounds.w / 2;
    const cy = bounds.y + bounds.h / 2;

    // Transform point to local unrotated space
    const dx = point.x - cx;
    const dy = point.y - cy;
    const localPoint = {
      x: cx + dx * Math.cos(-rotation) - dy * Math.sin(-rotation),
      y: cy + dx * Math.sin(-rotation) + dy * Math.cos(-rotation),
    };

    let newX = bounds.x;
    let newY = bounds.y;
    let newW = bounds.w;
    let newH = bounds.h;

    if (handle === 'nw' || handle === 'w' || handle === 'sw') {
      newX = localPoint.x;
      newW = bounds.x + bounds.w - localPoint.x;
    }
    if (handle === 'ne' || handle === 'e' || handle === 'se') {
      newW = localPoint.x - bounds.x;
    }
    if (handle === 'nw' || handle === 'n' || handle === 'ne') {
      newY = localPoint.y;
      newH = bounds.y + bounds.h - localPoint.y;
    }
    if (handle === 'sw' || handle === 's' || handle === 'se') {
      newH = localPoint.y - bounds.y;
    }

    // Min size
    if (newW < 2) newW = 2;
    if (newH < 2) newH = 2;

    // Fixed aspect ratio for text and image corner handles (optional but text needs it)
    if (el.type === 'text') {
      const scale = Math.max(newW / bounds.w, newH / bounds.h);
      const newSize = Math.max(8, Math.min(200, (snapshotEl as any).fontSize * scale));
      el.fontSize = Math.round(newSize);
      this.dom.fontSize.value = String(el.fontSize);
      return true;
    }

    const scaleX = newW / bounds.w;
    const scaleY = newH / bounds.h;

    this.scaleElement(el, snapshotEl, scaleX, scaleY, { x: newX, y: newY }, bounds, elements);
    this.updateSnappedElements([el], new Set([el.id])); // el itself might have snaps that need updating? 
    // Wait, if we RESIZE an arrow, we might need to update its points if it's snapped.
    // Actually scaleElement will overwrite points.
    
    // After any resize, update anything snapped to the moved/resized elements
    const movedIds = new Set(this.selectedElementIds);
    this.updateSnappedElements(elements, movedIds);

    return true;
  }

  private updateSnappedElements(elements: SketchElement[], movedElementIds: Set<string>): void {
    let changed = true;
    let passes = 0;
    const allMoved = new Set(movedElementIds);

    while (changed && passes < 10) {
      changed = false;
      passes++;
      for (const el of elements) {
        if (el.type === 'arrow' || el.type === 'double-arrow' || el.type === 'line') {
          let elChanged = false;
          if (el.startSnap && allMoved.has(el.startSnap.elementId)) {
            const target = elements.find((e) => e.id === el.startSnap!.elementId);
            if (target) {
              const newPos = applySnapOffset(
                this.ctx,
                target,
                el.startSnap!.offsetX,
                el.startSnap!.offsetY
              );
              if (Math.abs(newPos.x - el.start.x) > 0.01 || Math.abs(newPos.y - el.start.y) > 0.01) {
                el.start = newPos;
                elChanged = true;
              }
            }
          }
          if (el.endSnap && allMoved.has(el.endSnap.elementId)) {
            const target = elements.find((e) => e.id === el.endSnap!.elementId);
            if (target) {
              const newPos = applySnapOffset(
                this.ctx,
                target,
                el.endSnap!.offsetX,
                el.endSnap!.offsetY
              );
              if (Math.abs(newPos.x - el.end.x) > 0.01 || Math.abs(newPos.y - el.end.y) > 0.01) {
                el.end = newPos;
                elChanged = true;
              }
            }
          }
          if (elChanged && !allMoved.has(el.id)) {
            allMoved.add(el.id);
            changed = true;
          }
        }
      }
    }
  }

  private scaleElement(
    el: SketchElement,
    snapshotEl: SketchElement,
    scaleX: number,
    scaleY: number,
    newOrigin: Point,
    oldBounds: { x: number; y: number; w: number; h: number },
    elements: SketchElement[]
  ): void {
    if (el.type === 'freehand' && snapshotEl.type === 'freehand') {
      for (let i = 0; i < el.points.length; i++) {
        const p = el.points[i];
        const sp = snapshotEl.points[i];
        if (!sp) continue;
        p.x = newOrigin.x + (sp.x - oldBounds.x) * scaleX;
        p.y = newOrigin.y + (sp.y - oldBounds.y) * scaleY;
      }
    } else if (el.type === 'group' && snapshotEl.type === 'group') {
      for (let i = 0; i < el.elements.length; i++) {
        this.scaleElement(
          el.elements[i],
          snapshotEl.elements[i],
          scaleX,
          scaleY,
          newOrigin,
          oldBounds,
          elements
        );
      }
    } else if (el.type === 'image' && snapshotEl.type === 'image') {
      el.position.x = newOrigin.x + (snapshotEl.position.x - oldBounds.x) * scaleX;
      el.position.y = newOrigin.y + (snapshotEl.position.y - oldBounds.y) * scaleY;
      el.imageWidth = snapshotEl.imageWidth * scaleX;
      el.imageHeight = snapshotEl.imageHeight * scaleY;
    } else if (el.type === 'text' && snapshotEl.type === 'text') {
      el.position.x = newOrigin.x + (snapshotEl.position.x - oldBounds.x) * scaleX;
      el.position.y = newOrigin.y + (snapshotEl.position.y - oldBounds.y) * scaleY;
      // Font size handled in doResize for single selection
    } else if ('start' in el && 'end' in el && 'start' in snapshotEl && 'end' in snapshotEl) {
      el.start.x = newOrigin.x + (snapshotEl.start.x - oldBounds.x) * scaleX;
      el.start.y = newOrigin.y + (snapshotEl.start.y - oldBounds.y) * scaleY;
      el.end.x = newOrigin.x + (snapshotEl.end.x - oldBounds.x) * scaleX;
      el.end.y = newOrigin.y + (snapshotEl.end.y - oldBounds.y) * scaleY;
    }
  }

  private hitTestHandle(point: Point, el: SketchElement): ResizeHandle | null {
    const rotation = el.rotation || 0;
    const bounds = getElementBounds(this.ctx, el, true);
    const cx = bounds.x + bounds.w / 2;
    const cy = bounds.y + bounds.h / 2;

    let localPoint = point;
    if (rotation !== 0) {
      const dx = point.x - cx;
      const dy = point.y - cy;
      localPoint = {
        x: cx + dx * Math.cos(-rotation) - dy * Math.sin(-rotation),
        y: cy + dx * Math.sin(-rotation) + dy * Math.cos(-rotation),
      };
    }

    // Check rotation handle
    const rotHandle = this.getRotationHandlePosition(bounds);
    if (this.isNearPoint(localPoint, rotHandle)) return 'rotate';

    // Line/arrow: start and end handles only
    if (el.type === 'line' || el.type === 'arrow' || el.type === 'double-arrow') {
      if (this.isNearPoint(localPoint, el.start)) return 'start';
      if (this.isNearPoint(localPoint, el.end)) return 'end';
      return null;
    }

    // Text: bottom-right (se) handle only
    if (el.type === 'text') {
      const pad = 4;
      const positions = this.getCornerHandlePositions(bounds, pad);
      if (this.isNearPoint(localPoint, positions[4])) return 'se';
      return null;
    }

    const pad = 4;
    const positions = this.getCornerHandlePositions(bounds, pad);
    const handleNames: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

    for (let i = 0; i < positions.length; i++) {
      if (this.isNearPoint(localPoint, positions[i])) return handleNames[i];
    }
    return null;
  }

  private getHandlePositions(
    el: SketchElement,
    bounds: { x: number; y: number; w: number; h: number }
  ): Point[] {
    if (el.type === 'line' || el.type === 'arrow' || el.type === 'double-arrow') {
      return [{ ...el.start }, { ...el.end }];
    }
    if (el.type === 'text') {
      const positions = this.getCornerHandlePositions(bounds, 4);
      return [positions[4]]; // only returning 'se' (bottom-right) handle for text
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
      rotate: 'grab',
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
    this.toolbar?.updateColorIndicator(el.color);

    // Show context-appropriate options via generic option set
    const options = new Set(optionsForElementType(el.type));
    if (el.type === 'group') {
      options.add('ungroup');
    }
    if (typeof el.rotation === 'number' && Math.abs(el.rotation) > 0.001) {
      options.add('rotation');
    }
    this.toolbar?.showSelectionOptions(options);

    // Populate text-specific fields
    if (el.type === 'text') {
      this.dom.fontFamily.value = el.fontFamily;
      this.dom.fontSize.value = String(el.fontSize);
      this.syncBoldItalicButtons(el.fontWeight, el.fontStyle);
    }

    // Update toolbar indicators
    if (el.color) {
      this.toolbar?.updateColorIndicator(el.color);
    }
    if (el.fillColor) {
      this.toolbar?.updateFillColorIndicator(el.fillColor);
    } else {
      this.toolbar?.updateFillColorIndicator('transparent');
    }
    if (el.brushStyle) {
      this.toolbar?.updateBrushStyleIndicator(el.brushStyle);
    } else {
      this.toolbar?.updateBrushStyleIndicator('normal');
    }

    // Sync fill color
    const fillColor = el.fillColor || 'transparent';
    if (fillColor !== 'transparent') {
      this.dom.fillColorInput.value = fillColor;
    }
    this.toolbar?.updateFillColorIndicator(fillColor);
  }
}
