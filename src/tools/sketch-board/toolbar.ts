import { renderToolIconSvg } from '@js/tool-icons.ts';
import type { SketchDom } from './dom.ts';
import type { ToolMode } from './types.ts';

const TOOL_ICONS: Record<ToolMode, string> = {
  pan: 'hand',
  select: 'mouse-pointer-2',
  freehand: 'pen-tool',
  line: 'slash',
  rect: 'square',
  'rect-filled': 'square',
  ellipse: 'circle',
  'ellipse-filled': 'circle',
  text: 'type',
};

const TOOL_LABELS: Record<ToolMode, string> = {
  pan: 'Pan',
  select: 'Select',
  freehand: 'Freehand',
  line: 'Line',
  rect: 'Rect (outline)',
  'rect-filled': 'Rect (filled)',
  ellipse: 'Ellipse (outline)',
  'ellipse-filled': 'Ellipse (filled)',
  text: 'Text',
};

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

  setMode(next: ToolMode): void {
    const dom = this.dom;
    closeDrawToolsDropdown();

    const isDrawMode = next !== 'pan' && next !== 'select' && next !== 'text';
    const isTextMode = next === 'text';
    const isSelectMode = next === 'select';

    if (isDrawMode) {
      dom.btnModeDraw.classList.add('btn-primary');
      dom.btnModePan.classList.remove('btn-primary');
      dom.drawTools.classList.remove('hidden');
      dom.drawOptions.classList.remove('hidden');
      dom.drawOptions.classList.add('h-7', 'w-px', 'bg-base-300');
      dom.drawOptionsDivider.classList.remove('hidden');
      for (const el of dom.drawOpts) el.classList.remove('hidden');
      this.updateDrawToolsLabel(next);
    } else if (isSelectMode) {
      dom.btnModeDraw.classList.remove('btn-primary');
      dom.btnModePan.classList.remove('btn-primary');
      dom.drawTools.classList.add('hidden');
      dom.drawOptions.classList.add('hidden');
      dom.drawOptions.classList.remove('h-7', 'w-px', 'bg-base-300');
      dom.drawOptionsDivider.classList.add('hidden');
      for (const el of dom.drawOpts) el.classList.add('hidden');
    } else if (isTextMode) {
      dom.btnModeDraw.classList.remove('btn-primary');
      dom.btnModePan.classList.remove('btn-primary');
      dom.drawTools.classList.add('hidden');
      dom.drawOptions.classList.add('hidden');
      dom.drawOptions.classList.remove('h-7', 'w-px', 'bg-base-300');
      dom.drawOptionsDivider.classList.add('hidden');
      for (const el of dom.drawOpts) el.classList.add('hidden');
    } else {
      dom.btnModePan.classList.add('btn-primary');
      dom.btnModeDraw.classList.remove('btn-primary');
      dom.drawTools.classList.add('hidden');
      dom.drawOptions.classList.add('hidden');
      dom.drawOptions.classList.remove('h-7', 'w-px', 'bg-base-300');
      dom.drawOptionsDivider.classList.add('hidden');
      for (const el of dom.drawOpts) el.classList.add('hidden');
      dom.btnModeDraw.title = 'Draw';
    }

    if (isTextMode || isSelectMode) {
      dom.textToolbar.classList.remove('hidden');
    } else {
      dom.textToolbar.classList.add('hidden');
      dom.deleteText.classList.add('hidden');
    }

    for (const [key, btn] of Object.entries(dom.modeButtons)) {
      if (key === next) {
        btn.classList.add('btn-primary');
      } else {
        btn.classList.remove('btn-primary');
      }
    }

    if (isSelectMode) {
      dom.canvas.setAttribute('data-cursor', 'pointer');
    } else if (next === 'pan') {
      dom.canvas.setAttribute('data-cursor', 'grab');
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
    this.on((dom.modeButtons as Record<string, HTMLButtonElement>)['rect-filled'], 'click', () =>
      setMode('rect-filled')
    );
    this.on(dom.modeButtons.ellipse, 'click', () => setMode('ellipse'));
    this.on((dom.modeButtons as Record<string, HTMLButtonElement>)['ellipse-filled'], 'click', () =>
      setMode('ellipse-filled')
    );
    this.on(dom.modeButtons.text, 'click', () => setMode('text'));
    this.on(dom.btnCollapse, 'click', () => this.toggleCollapse());
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
    const className =
      'w-4 h-4' + (tool === 'ellipse-filled' || tool === 'rect-filled' ? ' fill-current' : '');
    this.dom.drawToolsIcon.innerHTML = renderToolIconSvg(TOOL_ICONS[tool], className);
  }
}

function closeDrawToolsDropdown(): void {
  (document.activeElement as HTMLElement)?.blur();
}
