import type { ToolMode } from './types.ts';

export type SketchDom = {
  canvas: HTMLCanvasElement;
  galleryModal: HTMLDialogElement;
  galleryList: HTMLDivElement;
  galleryTemplate: HTMLTemplateElement;
  colorInput: HTMLInputElement;
  widthInput: HTMLInputElement;
  exportFormat: HTMLSelectElement;
  btnBackOverview: HTMLButtonElement;
  btnClear: HTMLButtonElement;
  btnUndo: HTMLButtonElement;
  btnRedo: HTMLButtonElement;
  btnSave: HTMLButtonElement;
  btnGallery: HTMLButtonElement;
  btnExport: HTMLButtonElement;
  btnClipboard: HTMLButtonElement;
  modeButtons: Record<ToolMode, HTMLButtonElement>;
};

export function getDom(doc: Document): SketchDom | null {
  const canvas = doc.getElementById('sketch-canvas') as HTMLCanvasElement | null;
  const galleryModal = doc.getElementById('gallery-modal') as HTMLDialogElement | null;
  const galleryList = doc.getElementById('gallery-list') as HTMLDivElement | null;
  const galleryTemplate = doc.getElementById('gallery-item-template') as HTMLTemplateElement | null;
  const colorInput = doc.getElementById('stroke-color') as HTMLInputElement | null;
  const widthInput = doc.getElementById('stroke-width') as HTMLInputElement | null;
  const exportFormat = doc.getElementById('export-format') as HTMLSelectElement | null;
  const btnBackOverview = doc.getElementById('back-overview') as HTMLButtonElement | null;
  const btnClear = doc.getElementById('clear-canvas') as HTMLButtonElement | null;
  const btnUndo = doc.getElementById('undo-action') as HTMLButtonElement | null;
  const btnRedo = doc.getElementById('redo-action') as HTMLButtonElement | null;
  const btnSave = doc.getElementById('save-drawing') as HTMLButtonElement | null;
  const btnGallery = doc.getElementById('open-gallery') as HTMLButtonElement | null;
  const btnExport = doc.getElementById('export-file') as HTMLButtonElement | null;
  const btnClipboard = doc.getElementById('copy-image') as HTMLButtonElement | null;
  const modePan = doc.getElementById('mode-pan') as HTMLButtonElement | null;
  const modeFreehand = doc.getElementById('mode-freehand') as HTMLButtonElement | null;
  const modeLine = doc.getElementById('mode-line') as HTMLButtonElement | null;
  const modeRect = doc.getElementById('mode-rect') as HTMLButtonElement | null;
  const modeEllipse = doc.getElementById('mode-ellipse') as HTMLButtonElement | null;

  if (
    !canvas ||
    !galleryModal ||
    !galleryList ||
    !galleryTemplate ||
    !colorInput ||
    !widthInput ||
    !exportFormat ||
    !btnBackOverview ||
    !btnClear ||
    !btnUndo ||
    !btnRedo ||
    !btnSave ||
    !btnGallery ||
    !btnExport ||
    !btnClipboard ||
    !modePan ||
    !modeFreehand ||
    !modeLine ||
    !modeRect ||
    !modeEllipse
  ) {
    return null;
  }

  return {
    canvas,
    galleryModal,
    galleryList,
    galleryTemplate,
    colorInput,
    widthInput,
    exportFormat,
    btnBackOverview,
    btnClear,
    btnUndo,
    btnRedo,
    btnSave,
    btnGallery,
    btnExport,
    btnClipboard,
    modeButtons: {
      pan: modePan,
      freehand: modeFreehand,
      line: modeLine,
      rect: modeRect,
      ellipse: modeEllipse,
    },
  };
}
