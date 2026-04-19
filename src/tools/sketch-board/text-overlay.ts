import type { SketchDom } from './dom.ts';
import type { SceneRenderer } from './renderer.ts';
import type { TextTool } from './shapes/text-tool.ts';
import type { DrawToolContext, Point, SketchElement, ViewportState } from './types.ts';

type CreationOverlay = {
  type: 'creation';
  input: HTMLTextAreaElement;
  onFinish: (element: SketchElement | null) => void;
  position: Point;
  toolCtx: DrawToolContext;
  textTool: TextTool;
  finish: () => void;
  cancel: () => void;
};

type EditOverlay = {
  type: 'edit';
  input: HTMLTextAreaElement;
  finish: () => void;
  cancel: () => void;
};

type ActiveOverlay = CreationOverlay | EditOverlay;

export type ShowOverlayParams = {
  position: Point;
  textTool: TextTool;
  toolCtx: DrawToolContext;
  onFinish: (element: SketchElement | null) => void;
};

export type EditOverlayParams = {
  element: SketchElement;
  viewport: ViewportState;
  onFinish: () => void;
};

export class TextOverlayManager {
  private readonly dom: SketchDom;
  private readonly renderer: SceneRenderer;
  private activeOverlay: ActiveOverlay | null = null;
  private textInputActive = false;

  constructor(dom: SketchDom, renderer: SceneRenderer) {
    this.dom = dom;
    this.renderer = renderer;
  }

  isActive(): boolean {
    return this.textInputActive;
  }

  finish(): void {
    this.activeOverlay?.finish();
  }

  cancel(): void {
    this.activeOverlay?.cancel();
  }

  updateStyle(toolCtx: DrawToolContext): void {
    if (!this.activeOverlay) return;
    const { input } = this.activeOverlay;
    if (this.activeOverlay.type === 'creation') {
      this.activeOverlay.toolCtx = toolCtx;
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

  show(params: ShowOverlayParams): void {
    const { position, textTool, toolCtx, onFinish } = params;
    this.textInputActive = true;
    const viewport = toolCtx.viewport;
    const rect = this.dom.canvas.getBoundingClientRect();
    const x = rect.left + viewport.x + position.x * viewport.scale;
    const y = rect.top + viewport.y + position.y * viewport.scale;

    this.removeExistingInput();

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
      const state = this.activeOverlay;
      if (!state) return;
      this.activeOverlay = null;
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
      const state = this.activeOverlay;
      if (!state) return;
      this.activeOverlay = null;
      this.textInputActive = false;

      const { input } = state;
      if (input.parentNode) input.remove();

      if (state.type === 'creation') {
        state.textTool.reset();
        state.onFinish(null);
      }
    };

    this.activeOverlay = {
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

  edit(params: EditOverlayParams): void {
    const { element: el, viewport, onFinish } = params;
    if (el.type !== 'text') return;

    this.textInputActive = true;
    const rect = this.dom.canvas.getBoundingClientRect();
    const x = rect.left + viewport.x + el.position.x * viewport.scale - 5;
    const y = rect.top + viewport.y + el.position.y * viewport.scale - 5;

    this.removeExistingInput();

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
      const state = this.activeOverlay;
      if (!state || state.type !== 'edit') return;
      this.activeOverlay = null;
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
      const state = this.activeOverlay;
      if (!state || state.type !== 'edit') return;
      this.activeOverlay = null;
      this.textInputActive = false;

      if (input.parentNode) input.remove();
      this.renderer.requestDraw();
    };

    this.activeOverlay = {
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

  reset(): void {
    this.textInputActive = false;
    this.activeOverlay = null;
    this.removeExistingInput();
  }

  private removeExistingInput(): void {
    const existingInput = document.getElementById('text-input-overlay');
    if (existingInput) existingInput.remove();
  }
}
