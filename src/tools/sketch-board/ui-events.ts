import type { SketchDom } from './dom.ts';
import type { HistoryManager } from './history.ts';
import type { ViewportController } from './viewport.ts';
import type { SceneRenderer } from './renderer.ts';
import type { ElementEditor } from './element-editor.ts';
import type { ImageTool } from './shapes/image-tool.ts';
import type { SketchElement, ToolMode, DrawToolContext } from './types.ts';
import { setupHistoryEvents } from './events/history.ts';
import { setupViewportEvents } from './events/viewport.ts';
import { setupActionEvents } from './events/actions.ts';
import { setupPropertyEvents } from './events/properties.ts';
import { setupElementEvents } from './events/elements.ts';
import { setupImageEvents } from './events/images.ts';

export type EventSetupParams = {
  dom: SketchDom;
  history: HistoryManager;
  viewport: ViewportController;
  renderer: SceneRenderer;
  elementEditor: ElementEditor;
  imageTool: ImageTool;

  getState: () => { mode: ToolMode; elements: SketchElement[]; hasUnsavedChanges: boolean };
  setState: (patch: {
    elements?: SketchElement[];
    hasUnsavedChanges?: boolean;
    mode?: ToolMode;
  }) => void;
  getToolContext: () => DrawToolContext;
  getCanvasCenter: () => { x: number; y: number };

  updateUndoRedo: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  applySelectedChange: () => void;
  updateColorIndicator: () => void;
  updateFillColorIndicator: (color?: string) => void;
  updateBrushStyleIndicator: (style: 'normal' | 'shaky' | 'natural') => void;
  updateStrokeWidthIndicator: () => void;
  setBackground: (bgClass: string) => void;
  applyTextChange: () => void;
  getCurrentBgClass: () => string;
};

export function setupAllEvents(params: EventSetupParams): void {
  const {
    dom,
    history,
    viewport,
    renderer,
    elementEditor,
    imageTool,
    getState,
    setState,
    getToolContext,
    getCanvasCenter,
    updateUndoRedo,
    onUndo,
    onRedo,
    onZoomIn,
    onZoomOut,
    onZoomReset,
    applySelectedChange,
    updateColorIndicator,
    updateFillColorIndicator,
    updateBrushStyleIndicator,
    updateStrokeWidthIndicator,
    setBackground,
    applyTextChange,
    getCurrentBgClass,
  } = params;

  const hideDrawTools = () => {
    if ('hidePopover' in dom.drawTools && typeof dom.drawTools.hidePopover === 'function') {
      dom.drawTools.hidePopover();
    }
  };

  setupHistoryEvents(dom, history, renderer, getState, setState, updateUndoRedo, onUndo, onRedo);
  setupViewportEvents(dom, onZoomIn, onZoomOut, onZoomReset, setBackground);
  setupActionEvents(
    dom,
    viewport,
    renderer,
    history,
    getState,
    setState,
    updateUndoRedo,
    getCurrentBgClass
  );
  setupPropertyEvents(
    dom,
    elementEditor,
    history,
    renderer,
    getState,
    setState,
    getToolContext,
    updateColorIndicator,
    updateFillColorIndicator,
    updateBrushStyleIndicator,
    updateStrokeWidthIndicator,
    applySelectedChange,
    applyTextChange,
    updateUndoRedo
  );
  setupElementEvents(
    dom,
    elementEditor,
    history,
    viewport,
    renderer,
    getState,
    setState,
    updateUndoRedo
  );
  setupImageEvents(dom, imageTool, getCanvasCenter, hideDrawTools);
}
