import type { ToolMode } from './types.ts';

export type SketchDom = {
  canvas: HTMLCanvasElement;
  galleryModal: HTMLDialogElement;
  galleryList: HTMLDivElement;
  galleryTemplate: HTMLTemplateElement;
  colorInput: HTMLInputElement;
  colorPopup: HTMLDetailsElement;
  quickColorButtons: HTMLButtonElement[];
  widthInput: HTMLInputElement;
  exportFormat: HTMLSelectElement;
  btnBackOverview: HTMLButtonElement;
  btnOverviewLabel: HTMLSpanElement;
  btnClear: HTMLButtonElement;
  btnUndo: HTMLButtonElement;
  btnRedo: HTMLButtonElement;
  btnSave: HTMLButtonElement;
  btnGallery: HTMLButtonElement;
  btnExport: HTMLButtonElement;
  btnClipboard: HTMLButtonElement;
  btnZoomOut: HTMLButtonElement;
  btnZoomIn: HTMLButtonElement;
  btnZoomReset: HTMLButtonElement;
  btnModeDraw: HTMLButtonElement;
  btnModePan: HTMLButtonElement;
  btnCollapse: HTMLButtonElement;
  toolbarInners: HTMLElement[];
  drawTools: HTMLElement;
  drawToolsBtn: HTMLLabelElement;
  drawToolsIcon: HTMLSpanElement;
  drawToolsLabel: HTMLSpanElement;
  drawOptions: HTMLElement;
  drawOptionsDivider: HTMLElement;
  drawOpts: HTMLElement[];
  modeButtons: Record<ToolMode, HTMLButtonElement>;
  textToolbar: HTMLElement;
  fontFamily: HTMLSelectElement;
  fontSize: HTMLInputElement;
  fontBold: HTMLButtonElement;
  fontItalic: HTMLButtonElement;
  deleteText: HTMLButtonElement;
  textInputOverlay: HTMLDivElement | null;
};

export function getDom(doc: Document): SketchDom | null {
  const canvas = doc.getElementById('sketch-canvas') as HTMLCanvasElement | null;
  const galleryModal = doc.getElementById('gallery-modal') as HTMLDialogElement | null;
  const galleryList = doc.getElementById('gallery-list') as HTMLDivElement | null;
  const galleryTemplate = doc.getElementById('gallery-item-template') as HTMLTemplateElement | null;
  const colorInput = doc.getElementById('stroke-color') as HTMLInputElement | null;
  const colorPopup = doc.getElementById('color-popup') as HTMLDetailsElement | null;
  const quickColorButtons = Array.from(doc.querySelectorAll('.quick-color')) as HTMLButtonElement[];
  const widthInput = doc.getElementById('stroke-width') as HTMLInputElement | null;
  const exportFormat = doc.getElementById('export-format') as HTMLSelectElement | null;
  const btnBackOverview = doc.getElementById('back-overview') as HTMLButtonElement | null;
  const btnOverviewLabel = doc.getElementById('overview-label') as HTMLSpanElement | null;
  const btnClear = doc.getElementById('clear-canvas') as HTMLButtonElement | null;
  const btnUndo = doc.getElementById('undo-action') as HTMLButtonElement | null;
  const btnRedo = doc.getElementById('redo-action') as HTMLButtonElement | null;
  const btnSave = doc.getElementById('save-drawing') as HTMLButtonElement | null;
  const btnGallery = doc.getElementById('open-gallery') as HTMLButtonElement | null;
  const btnExport = doc.getElementById('export-file') as HTMLButtonElement | null;
  const btnClipboard = doc.getElementById('copy-image') as HTMLButtonElement | null;
  const btnZoomOut = doc.getElementById('zoom-out') as HTMLButtonElement | null;
  const btnZoomIn = doc.getElementById('zoom-in') as HTMLButtonElement | null;
  const btnZoomReset = doc.getElementById('zoom-reset') as HTMLButtonElement | null;
  const btnModeDraw = doc.getElementById('mode-draw') as HTMLButtonElement | null;
  const btnModePan = doc.getElementById('mode-pan') as HTMLButtonElement | null;
  const modePan = doc.getElementById('mode-pan') as HTMLButtonElement | null;
  const modeFreehand = doc.getElementById('mode-freehand') as HTMLButtonElement | null;
  const modeLine = doc.getElementById('mode-line') as HTMLButtonElement | null;
  const modeRect = doc.getElementById('mode-rect') as HTMLButtonElement | null;
  const modeRectFilled = doc.getElementById('mode-rect-filled') as HTMLButtonElement | null;
  const modeEllipse = doc.getElementById('mode-ellipse') as HTMLButtonElement | null;
  const modeEllipseFilled = doc.getElementById('mode-ellipse-filled') as HTMLButtonElement | null;
  const modeText = doc.getElementById('mode-text') as HTMLButtonElement | null;
  const modeSelect = doc.getElementById('mode-select') as HTMLButtonElement | null;
  const drawTools = doc.getElementById('draw-tools') as HTMLElement | null;
  const drawToolsBtn = doc.getElementById('draw-tools-btn') as HTMLLabelElement | null;
  const drawToolsIcon = doc.getElementById('draw-tools-icon') as HTMLElement | null;
  const drawToolsLabel = doc.getElementById('draw-tools-label') as HTMLSpanElement | null;
  const drawOptions = doc.getElementById('draw-options') as HTMLElement | null;
  const drawOptionsDivider = doc.getElementById('draw-options-divider') as HTMLElement | null;
  const textToolbar = doc.getElementById('text-toolbar') as HTMLElement | null;
  const fontFamily = doc.getElementById('font-family') as HTMLSelectElement | null;
  const fontSize = doc.getElementById('font-size') as HTMLInputElement | null;
  const fontBold = doc.getElementById('font-bold') as HTMLButtonElement | null;
  const fontItalic = doc.getElementById('font-italic') as HTMLButtonElement | null;
  const deleteText = doc.getElementById('delete-text') as HTMLButtonElement | null;
  const drawOpts = Array.from(doc.querySelectorAll('.draw-opt')) as HTMLElement[];
  const btnCollapse = doc.getElementById('collapse-toolbar') as HTMLButtonElement | null;
  const toolbarInners = Array.from(doc.querySelectorAll('.toolbar-inner')) as HTMLElement[];

  if (
    !canvas ||
    !galleryModal ||
    !galleryList ||
    !galleryTemplate ||
    !colorInput ||
    !colorPopup ||
    !widthInput ||
    !exportFormat ||
    !btnBackOverview ||
    !btnOverviewLabel ||
    !btnClear ||
    !btnUndo ||
    !btnRedo ||
    !btnSave ||
    !btnGallery ||
    !btnExport ||
    !btnClipboard ||
    !btnZoomOut ||
    !btnZoomIn ||
    !btnZoomReset ||
    !btnModeDraw ||
    !btnModePan ||
    !modePan ||
    !modeFreehand ||
    !modeLine ||
    !modeRect ||
    !modeRectFilled ||
    !modeEllipse ||
    !modeEllipseFilled ||
    !modeText ||
    !modeSelect ||
    !drawTools ||
    !drawToolsBtn ||
    !drawToolsIcon ||
    !drawToolsLabel ||
    !drawOptions ||
    !drawOptionsDivider ||
    !textToolbar ||
    !fontFamily ||
    !fontSize ||
    !fontBold ||
    !fontItalic ||
    !deleteText ||
    !btnCollapse ||
    toolbarInners.length === 0
  ) {
    return null;
  }

  return {
    canvas,
    galleryModal,
    galleryList,
    galleryTemplate,
    colorInput,
    colorPopup,
    quickColorButtons,
    widthInput,
    exportFormat,
    btnBackOverview,
    btnOverviewLabel,
    btnClear,
    btnUndo,
    btnRedo,
    btnSave,
    btnGallery,
    btnExport,
    btnClipboard,
    btnZoomOut,
    btnZoomIn,
    btnZoomReset,
    btnModeDraw,
    btnModePan,
    btnCollapse,
    toolbarInners,
    drawTools,
    drawToolsBtn,
    drawToolsIcon,
    drawToolsLabel,
    drawOptions,
    drawOptionsDivider,
    drawOpts,
    modeButtons: {
      pan: modePan,
      select: modeSelect,
      freehand: modeFreehand,
      line: modeLine,
      rect: modeRect,
      'rect-filled': modeRectFilled,
      ellipse: modeEllipse,
      'ellipse-filled': modeEllipseFilled,
      text: modeText,
    },
    textToolbar,
    fontFamily,
    fontSize,
    fontBold,
    fontItalic,
    deleteText,
    textInputOverlay: null,
  };
}
