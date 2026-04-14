import { getTextBounds } from './drawing.ts';
import type { SketchDom } from './dom.ts';
import type { HistoryManager } from './history.ts';
import type { SceneRenderer } from './renderer.ts';
import type { TextTool } from './shapes/text-tool.ts';
import type { DrawToolContext, Point, SketchElement, TextElement } from './types.ts';

export class TextEditor {
  private readonly dom: SketchDom;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly history: HistoryManager;
  private readonly renderer: SceneRenderer;

  private selectedElementId: string | null = null;
  private isDragging = false;
  private dragStartPos: Point | null = null;
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

  getSelectedId(): string | null {
    return this.selectedElementId;
  }

  isTextInputActive(): boolean {
    return this.textInputActive;
  }

  handleSelectPointerDown(
    point: Point,
    elements: SketchElement[]
  ): { found: boolean; elementId: string | null } {
    let foundText: TextElement | null = null;
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      if (el.type === 'text') {
        const bounds = getTextBounds(this.ctx, el);
        const padding = Math.max(4, el.width / 2);
        if (
          point.x >= bounds.x - padding &&
          point.x <= bounds.x + bounds.w + padding &&
          point.y >= bounds.y - padding &&
          point.y <= bounds.y + bounds.h + padding
        ) {
          foundText = el;
          break;
        }
      }
    }

    if (foundText) {
      this.selectedElementId = foundText.id;
      this.isDragging = true;
      this.dragStartPos = point;
      this.dom.fontFamily.value = foundText.fontFamily;
      this.dom.fontSize.value = String(foundText.fontSize);
      if (foundText.fontWeight === 'bold') {
        this.dom.fontBold.classList.add('btn-primary');
      } else {
        this.dom.fontBold.classList.remove('btn-primary');
      }
      if (foundText.fontStyle === 'italic') {
        this.dom.fontItalic.classList.add('btn-primary');
      } else {
        this.dom.fontItalic.classList.remove('btn-primary');
      }
      this.dom.deleteText.classList.remove('hidden');
      this.dom.canvas.setAttribute('data-cursor', 'move');
      return { found: true, elementId: foundText.id };
    }

    this.selectedElementId = null;
    this.isDragging = false;
    this.dragStartPos = null;
    this.dom.deleteText.classList.add('hidden');
    return { found: false, elementId: null };
  }

  handleSelectPointerMove(point: Point, elements: SketchElement[]): boolean {
    if (!this.isDragging || !this.selectedElementId || !this.dragStartPos) return false;

    const dx = point.x - this.dragStartPos.x;
    const dy = point.y - this.dragStartPos.y;
    const el = elements.find((e) => e.id === this.selectedElementId);
    if (el && el.type === 'text') {
      el.position.x += dx;
      el.position.y += dy;
      this.dragStartPos = point;
      return true;
    }
    return false;
  }

  handleSelectPointerUp(
    elements: SketchElement[],
    hasUnsaved: boolean
  ): { pushed: boolean; hasUnsavedChanges: boolean } {
    let pushed = false;
    if (this.isDragging && this.selectedElementId) {
      this.history.push(elements);
      pushed = true;
      hasUnsaved = true;
    }
    this.isDragging = false;
    this.dragStartPos = null;
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

  deleteSelectedText(elements: SketchElement[]): SketchElement[] {
    if (!this.selectedElementId) return elements;
    const filtered = elements.filter((e) => e.id !== this.selectedElementId);
    this.selectedElementId = null;
    this.dom.deleteText.classList.add('hidden');
    this.history.push(filtered);
    return filtered;
  }

  clearSelection(): void {
    if (this.selectedElementId) {
      this.selectedElementId = null;
      this.dom.deleteText.classList.add('hidden');
    }
  }

  reset(): void {
    this.selectedElementId = null;
    this.isDragging = false;
    this.dragStartPos = null;
    this.textInputActive = false;
    this.dom.deleteText.classList.add('hidden');
    const existingInput = document.getElementById('text-input-overlay');
    if (existingInput) existingInput.remove();
  }
}
