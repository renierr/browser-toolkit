import { renderToolIconSvg } from '@js/tool-icons.ts';
import type { SketchDom } from './dom.ts';
import type { ToolMode } from './types.ts';

const TOOL_ICONS: Record<ToolMode, string> = {
  pan: 'hand',
  select: 'mouse-pointer-2',
  freehand: 'pen-tool',
  line: 'slash',
  rect: 'square',
  ellipse: 'circle',
  triangle: 'triangle',
  arrow: 'arrow-up-right',
  text: 'type',
};

const TOOL_LABELS: Record<ToolMode, string> = {
  pan: 'Pan',
  select: 'Select',
  freehand: 'Freehand',
  line: 'Line',
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  triangle: 'Triangle',
  arrow: 'Arrow',
  text: 'Text',
};

const SHAPE_MODES: ReadonlySet<ToolMode> = new Set(['rect', 'ellipse', 'triangle']);

export class ToolbarController {
  private readonly dom: SketchDom;
  private isCollapsed = false;
  private onModeChange: ((mode: ToolMode) => void) | null = null;
  private readonly listeners: Array<{ el: EventTarget; type: string; fn: EventListener }> = [];

  constructor(dom: SketchDom) {
    this.dom = dom;
  }

  setModeChangeHandler(handler: (mode: ToolMode) => void): void {
    this.onModeChange = handler;
  }

  isFilled(): boolean {
    return this.dom.filledToggle.classList.contains('btn-primary');
  }

  setMode(next: ToolMode): void {
    const dom = this.dom;
    closeDrawToolsDropdown();

    const isDrawMode = next !== 'pan' && next !== 'select';
    const isTextMode = next === 'text';
    const isSelectMode = next === 'select';
    const isShapeMode = SHAPE_MODES.has(next);

    // Main mode buttons
    if (isDrawMode) {
      dom.btnModeDraw.classList.add('btn-primary');
      dom.btnModePan.classList.remove('btn-primary');
      dom.drawTools.classList.remove('hidden');
      dom.drawOptions.classList.remove('hidden');
      dom.drawOptions.classList.add('h-7', 'w-px', 'bg-base-300');
      for (const el of dom.drawOpts) el.classList.remove('hidden');
      this.updateDrawToolsLabel(next);
    } else {
      if (isSelectMode) {
        dom.btnModeDraw.classList.remove('btn-primary');
        dom.btnModePan.classList.remove('btn-primary');
      } else {
        dom.btnModePan.classList.add('btn-primary');
        dom.btnModeDraw.classList.remove('btn-primary');
      }
      dom.drawTools.classList.add('hidden');
      dom.drawOptions.classList.add('hidden');
      dom.drawOptions.classList.remove('h-7', 'w-px', 'bg-base-300');
      for (const el of dom.drawOpts) el.classList.add('hidden');
    }

    // Per-tool options visibility
    if (isTextMode || isSelectMode || isShapeMode) {
      dom.toolOptions.classList.remove('hidden');
    } else {
      dom.toolOptions.classList.add('hidden');
    }

    // Shape fill toggle
    for (const el of dom.toolOptShapes) {
      if (isShapeMode) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    }

    // Text options
    for (const el of dom.toolOptTexts) {
      if (isTextMode || isSelectMode) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    }

    // Delete button only visible when something is selected (handled by ElementEditor)
    if (!isSelectMode) {
      dom.deleteElement.classList.add('hidden');
    }

    // Mode button highlight
    for (const [key, btn] of Object.entries(dom.modeButtons)) {
      if (key === next) {
        btn.classList.add('btn-primary');
      } else {
        btn.classList.remove('btn-primary');
      }
    }

    // Cursor
    if (isSelectMode) {
      dom.canvas.setAttribute('data-cursor', 'pointer');
    } else if (next === 'pan') {
      dom.canvas.setAttribute('data-cursor', 'grab');
    } else if (isTextMode) {
      dom.canvas.setAttribute('data-cursor', 'text');
    } else {
      dom.canvas.setAttribute('data-cursor', 'crosshair');
    }
  }

  toggleCollapse(): void {
    this.isCollapsed = !this.isCollapsed;
    const dom = this.dom;
    if (this.isCollapsed) {
      dom.btnOverviewLabel.classList.add('hidden');
      for (const el of dom.toolbarInners) el.classList.add('hidden');
      dom.btnCollapse.classList.add('rotate-180');
      dom.btnCollapse.title = 'Expand toolbar';
    } else {
      dom.btnOverviewLabel.classList.remove('hidden');
      for (const el of dom.toolbarInners) el.classList.remove('hidden');
      dom.btnCollapse.classList.remove('rotate-180');
      dom.btnCollapse.title = 'Collapse toolbar';
    }
  }

  attach(): void {
    const dom = this.dom;
    const setMode = (m: ToolMode): void => {
      this.onModeChange?.(m);
    };

    this.on(dom.btnModePan, 'click', () => setMode('pan'));
    this.on(dom.btnModeDraw, 'click', () => setMode('freehand'));
    this.on(dom.modeButtons.pan, 'click', () => setMode('pan'));
    this.on(dom.modeButtons.select, 'click', () => setMode('select'));
    this.on(dom.modeButtons.freehand, 'click', () => setMode('freehand'));
    this.on(dom.modeButtons.line, 'click', () => setMode('line'));
    this.on(dom.modeButtons.rect, 'click', () => setMode('rect'));
    this.on(dom.modeButtons.ellipse, 'click', () => setMode('ellipse'));
    this.on(dom.modeButtons.triangle, 'click', () => setMode('triangle'));
    this.on(dom.modeButtons.arrow, 'click', () => setMode('arrow'));
    this.on(dom.modeButtons.text, 'click', () => setMode('text'));
    this.on(dom.btnCollapse, 'click', () => this.toggleCollapse());
    this.on(dom.filledToggle, 'click', () => {
      dom.filledToggle.classList.toggle('btn-primary');
    });
  }

  detach(): void {
    for (const { el, type, fn } of this.listeners) {
      el.removeEventListener(type, fn);
    }
    this.listeners.length = 0;
  }

  private on(el: EventTarget, type: string, fn: EventListener): void {
    el.addEventListener(type, fn);
    this.listeners.push({ el, type, fn });
  }

  private updateDrawToolsLabel(tool: ToolMode): void {
    this.dom.drawToolsLabel.textContent = TOOL_LABELS[tool];
    this.dom.drawToolsIcon.innerHTML = renderToolIconSvg(TOOL_ICONS[tool], 'w-4 h-4');
  }
}

function closeDrawToolsDropdown(): void {
  (document.activeElement as HTMLElement)?.blur();
}
