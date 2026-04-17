import { renderToolIconSvg } from '@js/tool-icons.ts';
import type { ToolOptionId } from './shapes/base-tool.ts';
import type { SketchDom } from './dom.ts';
import type { DrawMode, ToolMode } from './types.ts';

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
  image: 'image',
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
  image: 'Image',
};

export class ToolbarController {
  private readonly dom: SketchDom;
  private onModeChange: ((mode: ToolMode) => void) | null = null;
  private onFilledToggle: (() => void) | null = null;
  private onMoveToFront: (() => void) | null = null;
  private onMoveToBelow: (() => void) | null = null;
  private onResizeImage: (() => void) | null = null;
  private readonly listeners: Array<{ el: EventTarget; type: string; fn: EventListener }> = [];
  private toolOptionsMap = new Map<DrawMode, ReadonlySet<ToolOptionId>>();

  constructor(dom: SketchDom) {
    this.dom = dom;
  }

  setModeChangeHandler(handler: (mode: ToolMode) => void): void {
    this.onModeChange = handler;
  }

  setFilledToggleHandler(handler: () => void): void {
    this.onFilledToggle = handler;
  }

  setMoveToFrontHandler(handler: () => void): void {
    this.onMoveToFront = handler;
  }

  setMoveToBelowHandler(handler: () => void): void {
    this.onMoveToBelow = handler;
  }
  setResizeImageHandler(handler: () => void): void {
    this.onResizeImage = handler;
  }

  /** Register tool options from the tool registry */
  registerToolOptions(mode: DrawMode, options: ReadonlySet<ToolOptionId>): void {
    this.toolOptionsMap.set(mode, options);
  }

  isFilled(): boolean {
    return this.dom.filledToggle.classList.contains('btn-primary');
  }

  setMode(next: ToolMode): void {
    const dom = this.dom;
    closeDrawToolsDropdown();

    const isDrawMode = next !== 'pan' && next !== 'select';
    const isSelectMode = next === 'select';

    // Main mode buttons
    if (isDrawMode) {
      dom.btnModeDraw.classList.add('btn-primary');
      dom.btnModePan.classList.remove('btn-primary');
      dom.drawToolsBtn.classList.remove('hidden');
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
      dom.drawToolsBtn.classList.add('hidden');
      dom.drawOptions.classList.add('hidden');
      dom.drawOptions.classList.remove('h-7', 'w-px', 'bg-base-300');
      for (const el of dom.drawOpts) el.classList.add('hidden');
    }

    // Per-tool options: driven by the tool's declared toolOptions
    if (isDrawMode) {
      const opts = this.toolOptionsMap.get(next as DrawMode) ?? new Set();
      this.applyToolOptions(opts);
    } else {
      // Pan/select: hide all tool options (select will be driven by ElementEditor)
      this.applyToolOptions(new Set());
    }

    // Delete button hidden — ElementEditor shows it on selection
    dom.deleteElement.classList.add('hidden');

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
    } else if (next === 'text') {
      dom.canvas.setAttribute('data-cursor', 'text');
    } else {
      dom.canvas.setAttribute('data-cursor', 'crosshair');
    }
  }

  /** Show tool options matching the given option set + delete button (used by ElementEditor) */
  showSelectionOptions(options: ReadonlySet<ToolOptionId>): void {
    this.applyToolOptions(options);
    // Always show tool-options container for selection (z-order buttons need it visible)
    this.dom.toolOptions.classList.remove('hidden');
    this.dom.deleteElement.classList.remove('hidden');
    this.dom.moveToFront.classList.remove('hidden');
    this.dom.moveToBelow.classList.remove('hidden');
  }

  /** Hide all selection/tool options (used by ElementEditor on deselect) */
  hideSelectionOptions(): void {
    this.applyToolOptions(new Set());
    this.dom.deleteElement.classList.add('hidden');
    this.dom.moveToFront.classList.add('hidden');
    this.dom.moveToBelow.classList.add('hidden');
    // Also hide color controls that are outside #tool-options
    for (const el of this.dom.toolOptColors) el.classList.add('hidden');
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

    this.on(dom.filledToggle, 'click', () => {
      dom.filledToggle.classList.toggle('btn-primary');
      this.onFilledToggle?.();
    });

    this.on(dom.moveToFront, 'click', () => {
      this.onMoveToFront?.();
    });

    this.on(dom.moveToBelow, 'click', () => {
      this.onMoveToBelow?.();
    });

    this.on(dom.btnResizeImageOriginal, 'click', () => {
      this.onResizeImage?.();
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

  /** Generic option group visibility driver */
  private applyToolOptions(options: ReadonlySet<ToolOptionId>): void {
    const dom = this.dom;
    const hasAny = options.size > 0;

    if (hasAny) {
      dom.toolOptions.classList.remove('hidden');
    } else {
      dom.toolOptions.classList.add('hidden');
    }

    // Color controls (live outside #tool-options, in the main toolbar)
    for (const el of dom.toolOptColors) {
      if (options.has('color')) el.classList.remove('hidden');
      else el.classList.add('hidden');
    }

    // Fill toggle
    for (const el of dom.toolOptShapes) {
      if (options.has('fill')) el.classList.remove('hidden');
      else el.classList.add('hidden');
    }

    // Font options
    for (const el of dom.toolOptTexts) {
      if (options.has('font')) el.classList.remove('hidden');
      else el.classList.add('hidden');
    }

    // Image options
    for (const el of dom.toolOptImages) {
      if (options.has('image')) el.classList.remove('hidden');
      else el.classList.add('hidden');
    }
  }
}

function closeDrawToolsDropdown(): void {
  (document.activeElement as HTMLElement)?.blur();
  const popover = document.getElementById('draw-tools');
  if (popover && 'hidePopover' in popover && typeof popover.hidePopover === 'function') {
    popover.hidePopover();
  }
}
