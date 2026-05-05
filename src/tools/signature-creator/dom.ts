interface DomElements {
  canvas: HTMLCanvasElement;
  canvasContainer: HTMLElement;
  clearBtn: HTMLElement;
  undoBtn: HTMLButtonElement;
  redoBtn: HTMLButtonElement;
  saveBtn: HTMLElement;
  resetBtn: HTMLElement;
  copyClipboardBtn: HTMLElement;
  downloadPngBtn: HTMLElement;
  downloadSvgBtn: HTMLElement;
  downloadAnimatedBtn: HTMLElement;
  signaturesList: HTMLElement;
  savedContainer: HTMLElement;
  template: HTMLTemplateElement;

  penColorInput: HTMLInputElement;
  penWidthInput: HTMLInputElement;
  penWidthValue: HTMLElement;
  curveModeSelect: HTMLSelectElement;
  rdpModeSelect: HTMLSelectElement;
  dpiInput: HTMLInputElement;

  moveToleranceInput: HTMLInputElement;
  moveToleranceValue: HTMLElement;

  minWidthFactorInput: HTMLInputElement;
  minWidthFactorValue: HTMLElement;

  maxWidthFactorInput: HTMLInputElement;
  maxWidthFactorValue: HTMLElement;

  velocitySensitivityInput: HTMLInputElement;
  velocitySensitivityValue: HTMLElement;

  pressureInfluenceInput: HTMLInputElement;
  pressureInfluenceValue: HTMLElement;

  velocityInfluenceInput: HTMLInputElement;
  velocityInfluenceValue: HTMLElement;

  widthSmoothingInput: HTMLInputElement;
  widthSmoothingValue: HTMLElement;

  exportSignaturesBtn: HTMLElement;
  importSignaturesBtn: HTMLElement;
  importFileInput: HTMLInputElement;
  syncBtn: HTMLButtonElement;
}

let cached: DomElements | null = null;

function getById<T extends Element>(root: Document | Element, id: string): T {
  const el =
    'getElementById' in root
      ? (root as Document).getElementById(id)
      : root.querySelector(`#${CSS.escape(id)}`);
  if (!el) throw new Error(`Element with id \`${id}\` not found`);
  return el as T;
}

function getInput(root: Document | Element, id: string): HTMLInputElement {
  return getById<HTMLInputElement>(root, id);
}

function getSelect(root: Document | Element, id: string): HTMLSelectElement {
  return getById<HTMLSelectElement>(root, id);
}

function getElement(root: Document | Element, id: string): HTMLElement {
  return getById<HTMLElement>(root, id);
}

function getCanvas(root: Document | Element, id: string): HTMLCanvasElement {
  return getById<HTMLCanvasElement>(root, id);
}

function getTemplateElement(root: Document | Element, id: string): HTMLTemplateElement {
  return getById<HTMLTemplateElement>(root, id);
}

/**
 * Returns a cached object of DOM elements. Call this after the DOM is available.
 * Pass a specific root (Document or container Element) to scope queries.
 */
export function getDomElements(root: Document | Element = document): DomElements {
  if (cached) return cached;

  cached = {
    canvas: getCanvas(root, 'signature-canvas'),
    canvasContainer: getElement(root, 'canvas-container'),
    clearBtn: getElement(root, 'clear-btn'),
    undoBtn: getById<HTMLButtonElement>(root, 'undo-btn'),
    redoBtn: getById<HTMLButtonElement>(root, 'redo-btn'),
    saveBtn: getElement(root, 'save-btn'),
    resetBtn: getElement(root, 'reset-btn'),
    copyClipboardBtn: getElement(root, 'copy-clipboard'),
    downloadPngBtn: getElement(root, 'download-current-png-btn'),
    downloadSvgBtn: getElement(root, 'download-current-svg-btn'),
    downloadAnimatedBtn: getElement(root, 'download-current-animated-btn'),
    signaturesList: getElement(root, 'signatures-list'),
    savedContainer: getElement(root, 'saved-signatures-container'),
    template: getTemplateElement(root, 'signature-item-template'),

    penColorInput: getInput(root, 'stroke-color'),
    penWidthInput: getInput(root, 'stroke-width'),
    penWidthValue: getElement(root, 'width-value'),
    curveModeSelect: getSelect(root, 'curve-mode'),
    rdpModeSelect: getSelect(root, 'rdp-epsilon'),
    dpiInput: getInput(root, 'export-dpi'),

    moveToleranceInput: getInput(root, 'move-tolerance'),
    moveToleranceValue: getElement(root, 'move-tolerance-value'),

    minWidthFactorInput: getInput(root, 'min-width-factor'),
    minWidthFactorValue: getElement(root, 'min-width-factor-value'),

    maxWidthFactorInput: getInput(root, 'max-width-factor'),
    maxWidthFactorValue: getElement(root, 'max-width-factor-value'),

    velocitySensitivityInput: getInput(root, 'velocity-sensitivity'),
    velocitySensitivityValue: getElement(root, 'velocity-sensitivity-value'),

    pressureInfluenceInput: getInput(root, 'pressure-influence'),
    pressureInfluenceValue: getElement(root, 'pressure-influence-value'),

    velocityInfluenceInput: getInput(root, 'velocity-influence'),
    velocityInfluenceValue: getElement(root, 'velocity-influence-value'),

    widthSmoothingInput: getInput(root, 'width-smoothing'),
    widthSmoothingValue: getElement(root, 'width-smoothing-value'),

    exportSignaturesBtn: getElement(root, 'export-signatures-btn'),
    importSignaturesBtn: getElement(root, 'import-signatures-btn'),
    importFileInput: getInput(root, 'import-file-input'),
    syncBtn: getById<HTMLButtonElement>(root, 'signatures-sync-btn'),
  };

  return cached;
}

/**
 * Clear cached references (useful for tests or if DOM is replaced).
 */
export function resetDomElements(): void {
  cached = null;
}
