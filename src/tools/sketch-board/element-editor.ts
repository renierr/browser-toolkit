import { getElementBounds, isPointInBounds, getElementCenter } from './utils/bounds.ts';
import { isPointInPolygon } from './utils/geometry.ts';
import { normalizeRect } from './utils/drawing-shared.ts';
import type { SketchDom } from './dom.ts';
import type { HistoryManager } from './history.ts';
import type { SceneRenderer } from './renderer.ts';
import { optionsForElementType } from './shapes/base-tool.ts';
import type { TextTool } from './shapes/text-tool.ts';
import { TextOverlayManager } from './text-overlay.ts';
import type { ToolbarController } from './toolbar.ts';
import type { BrushStyle, DrawToolContext, Point, SelectionType, SketchElement } from './types.ts';
import {
  type ResizeHandle,
  getCursorForHandle,
  hitTestHandle,
  worldToLocalPoint,
} from './utils/handles.ts';
import { getSnapTarget } from './utils/snapping.ts';
import {
  moveElement,
  scaleElement,
  updateSnappedElements,
  applyColorRecursive,
  applyWidthRecursive,
} from './utils/transforms.ts';
import {
  deleteElements,
  duplicateElements,
  groupElements,
  ungroupElements,
  reorderToFront,
  reorderToBelow,
} from './utils/element-operations.ts';
import { drawSelectionDecorations } from './utils/selection-renderer.ts';

const MOVE_THRESHOLD = 5;

export class ElementEditor {
  private readonly dom: SketchDom;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly history: HistoryManager;
  private readonly textOverlay: TextOverlayManager;
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
  private pointerDownHitSelected = false;
  private dragStartSnapshot: SketchElement[] | null = null;
  private activeSnapPoint: Point | null = null;
  private selectionType: SelectionType = 'box';
  private lassoPath: Point[] | null = null;

  constructor(
    dom: SketchDom,
    ctx: CanvasRenderingContext2D,
    history: HistoryManager,
    renderer: SceneRenderer
  ) {
    this.dom = dom;
    this.ctx = ctx;
    this.history = history;
    this.textOverlay = new TextOverlayManager(dom, renderer);
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
    return this.textOverlay.isActive();
  }

  isInteracting(): boolean {
    return this.isDragging || this.isResizing || this.isRotating;
  }

  getActiveInteractionIds(): Set<string> {
    if (!this.isInteracting()) return new Set();
    return new Set(this.selectedElementIds);
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
    this.lassoPath = null;

    // Check resize/rotate handles first (only if single element selected for now)
    if (this.selectedElementIds.size === 1) {
      const id = this.selectedElementIds.values().next().value;
      const el = elements.find((e) => e.id === id);
      if (el) {
        const handle = hitTestHandle(point, el, this.ctx);
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
          this.dom.canvas.style.cursor = getCursorForHandle(handle);
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
      if (isPointInBounds(point, bounds, padding)) {
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
      if (isPointInBounds(point, bounds, padding)) {
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
          this.toolbar?.showSelectionOptions(new Set(['group', 'color', 'fill', 'brush', 'width']));
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
    if (this.selectionType === 'lasso') {
      this.lassoPath = [{ ...point }];
    } else {
      this.selectionBox = { start: { ...point }, end: { ...point } };
    }
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

    if (this.lassoPath) {
      this.lassoPath.push({ ...point });
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
        this.updateSelectionToolbar(elements);
      }
      return { pushed: false, hasUnsavedChanges: hasUnsaved };
    }

    if (this.lassoPath) {
      if (this.lassoPath.length > 2) {
        for (const el of elements) {
          const center = getElementCenter(this.ctx, el);
          if (isPointInPolygon(center, this.lassoPath)) {
            this.selectedElementIds.add(el.id);
          }
        }
      }
      this.lassoPath = null;
      if (this.selectedElementIds.size > 0) {
        this.updateSelectionToolbar(elements);
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
    const currentIdx = elements.findIndex((e) => e.id === currentId);
    if (currentIdx === -1) return null;

    for (let i = currentIdx - 1; i >= 0; i--) {
      const el = elements[i];
      const bounds = getElementBounds(this.ctx, el);
      const padding = Math.max(4, el.width / 2);
      if (isPointInBounds(point, bounds, padding)) {
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
    this.textOverlay.show({ position, textTool, toolCtx, onFinish });
  }

  finishTextInput(): void {
    this.textOverlay.finish();
  }

  cancelTextInput(): void {
    this.textOverlay.cancel();
  }

  updateActiveTextInputStyle(toolCtx: DrawToolContext): void {
    this.textOverlay.updateStyle(toolCtx);
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
    this.textOverlay.edit({ element: el, viewport, onFinish });
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

  applySelectedStrokeWidth(elements: SketchElement[], width: number): void {
    if (this.selectedElementIds.size === 0) return;
    for (const id of this.selectedElementIds) {
      const el = elements.find((e) => e.id === id);
      if (el) {
        applyWidthRecursive(el, width);
      }
    }
    this.toolbar?.updateStrokeWidthIndicator(width);
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
        applyColorRecursive(el, 'color', color);
      }
    }
  }

  applySelectedFillColor(elements: SketchElement[]): void {
    if (this.selectedElementIds.size === 0) return;
    const color = this.dom.fillColorInput.value;
    for (const id of this.selectedElementIds) {
      const el = elements.find((e) => e.id === id);
      if (el) {
        applyColorRecursive(el, 'fillColor', color);
      }
    }
  }

  updateSelectedFillColor(elements: SketchElement[], color: string | null): void {
    if (this.selectedElementIds.size === 0) return;
    for (const id of this.selectedElementIds) {
      const el = elements.find((e) => e.id === id);
      if (el) {
        applyColorRecursive(el, 'fillColor', color ?? undefined);
      }
    }
  }

  deleteSelected(elements: SketchElement[]): SketchElement[] {
    const filtered = deleteElements(elements, this.selectedElementIds);
    this.selectedElementIds.clear();
    this.toolbar?.hideSelectionOptions();
    return filtered;
  }

  duplicateSelected(elements: SketchElement[]): { elements: SketchElement[]; newIds: Set<string> } {
    const res = duplicateElements(elements, this.selectedElementIds);
    this.selectedElementIds = res.newIds;
    return res;
  }

  moveElementToFront(elements: SketchElement[]): SketchElement[] {
    return reorderToFront(elements, this.selectedElementIds);
  }

  moveElementToBelow(elements: SketchElement[]): SketchElement[] {
    return reorderToBelow(elements, this.selectedElementIds);
  }

  groupSelected(elements: SketchElement[]): SketchElement[] {
    const { elements: nextElements, newGroup } = groupElements(elements, this.selectedElementIds);
    if (newGroup) {
      this.selectedElementIds.clear();
      this.selectedElementIds.add(newGroup.id);
      this.syncToolbarForElement(newGroup);
    }
    return nextElements;
  }

  ungroupSelected(elements: SketchElement[]): SketchElement[] {
    const { elements: nextElements, newSelectedIds } = ungroupElements(
      elements,
      this.selectedElementIds
    );
    this.selectedElementIds = newSelectedIds;
    if (this.selectedElementIds.size > 0) {
      this.toolbar?.showSelectionOptions(new Set(['group', 'color', 'fill', 'brush', 'width']));
    }
    return nextElements;
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

  setSelectionType(type: SelectionType): void {
    this.selectionType = type;
  }

  private updateSelectionToolbar(elements: SketchElement[]): void {
    if (this.selectedElementIds.size === 1) {
      const id = this.selectedElementIds.values().next().value;
      const el = elements.find((e) => e.id === id);
      if (el) this.syncToolbarForElement(el);
    } else {
      this.toolbar?.showSelectionOptions(new Set(['group', 'color', 'fill', 'brush', 'width']));
    }
  }

  reset(): void {
    this.selectedElementIds.clear();
    this.selectionBox = null;
    this.lassoPath = null;
    this.isDragging = false;
    this.isResizing = false;
    this.isRotating = false;
    this.hasMovedBeyondThreshold = false;
    this.activeHandle = null;
    this.dragStartPos = null;
    this.resizeStartBounds = null;
    this.dragStartSnapshot = null;
    this.activeSnapPoint = null;
    this.toolbar?.hideSelectionOptions();
    this.textOverlay.reset();
  }

  /** Draw selection highlight and resize handles */
  drawSelection(canvasCtx: CanvasRenderingContext2D, elements: SketchElement[]): void {
    drawSelectionDecorations({
      ctx: canvasCtx,
      elements,
      selectedIds: this.selectedElementIds,
      selectionBox: this.selectionBox,
      lassoPath: this.lassoPath,
      activeSnapPoint: this.activeSnapPoint,
    });
  }

  private doMove(point: Point, elements: SketchElement[]): boolean {
    if (!this.dragStartPos || this.selectedElementIds.size === 0) return false;
    const dx = point.x - this.dragStartPos.x;
    const dy = point.y - this.dragStartPos.y;

    const movedIds = new Set(this.selectedElementIds);
    for (const id of this.selectedElementIds) {
      const el = elements.find((e) => e.id === id);
      if (!el) continue;
      moveElement(el, dx, dy);

      // If we move the whole element, clear its snaps (unless we want to preserve them,
      // but usually moving the whole arrow means manual positioning)
      if (el.type === 'arrow' || el.type === 'double-arrow' || el.type === 'line') {
        el.startSnap = undefined;
        el.endSnap = undefined;
      }
    }

    updateSnappedElements(this.ctx, elements, movedIds);

    this.dragStartPos = point;
    return true;
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
          el.startSnap = {
            elementId: snap.elementId,
            offsetX: snap.offsetX,
            offsetY: snap.offsetY,
          };
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

    // Speech bubble tail handle: free drag
    if (el.type === 'speech-bubble' && this.activeHandle === 'tail') {
      el.tailTip = { x: point.x, y: point.y };
      return true;
    }

    const bounds = this.resizeStartBounds;
    const handle = this.activeHandle;
    const rotation = el.rotation || 0;
    const cx = bounds.x + bounds.w / 2;
    const cy = bounds.y + bounds.h / 2;

    const localPoint = worldToLocalPoint(point, { x: cx, y: cy }, rotation);

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

    scaleElement({
      el,
      snapshotEl,
      scaleX,
      scaleY,
      newOrigin: { x: newX, y: newY },
      oldBounds: bounds,
    });

    // After any resize, update anything snapped to the moved/resized elements
    const movedIds = new Set(this.selectedElementIds);
    updateSnappedElements(this.ctx, elements, movedIds);

    return true;
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

    // Sync stroke width
    if (el.width !== undefined && el.type !== 'image' && el.type !== 'text') {
      this.dom.widthInput.value = String(el.width);
      this.toolbar?.updateStrokeWidthIndicator(el.width);
    }

    // Sync fill color
    const fillColor = el.fillColor || 'transparent';
    if (fillColor !== 'transparent') {
      this.dom.fillColorInput.value = fillColor;
    }
    this.toolbar?.updateFillColorIndicator(fillColor);
  }
}
