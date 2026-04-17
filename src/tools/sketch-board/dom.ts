import type { ToolMode } from './types.ts';

export type SketchDom = {
  canvas: HTMLCanvasElement;
  galleryModal: HTMLDialogElement;
  galleryList: HTMLDivElement;
  galleryTemplate: HTMLTemplateElement;
  colorInput: HTMLInputElement;
  colorPopup: HTMLDivElement;
  quickColorButtons: HTMLButtonElement[];
  widthInput: HTMLInputElement;
  exportFormat: HTMLSelectElement;
  exportHighDpi: HTMLInputElement;
  btnBackOverview: HTMLButtonElement;
  btnOverviewLabel: HTMLSpanElement;
  btnClear: HTMLButtonElement;
  btnUndo: HTMLButtonElement;
  btnRedo: HTMLButtonElement;
  btnSave: HTMLButtonElement;
  btnGallery: HTMLButtonElement;
  btnExport: HTMLButtonElement;
  btnShare: HTMLButtonElement;
  btnClipboard: HTMLButtonElement;
  btnInfo: HTMLButtonElement;
  infoModal: HTMLDialogElement;
  infoDimensions: HTMLSpanElement;
  infoLocation: HTMLSpanElement;
  infoElements: HTMLSpanElement;
  infoBackground: HTMLSpanElement;
  infoColors: HTMLDivElement;
  btnZoomOut: HTMLButtonElement;
  btnZoomIn: HTMLButtonElement;
  btnZoomReset: HTMLButtonElement;
  btnZoomOutMobile: HTMLButtonElement;
  btnZoomInMobile: HTMLButtonElement;
  btnZoomResetMobile: HTMLButtonElement;
  canvasBg: HTMLSelectElement;
  appContainer: HTMLDivElement;
  btnModeDraw: HTMLButtonElement;
  btnModePan: HTMLButtonElement;
  btnImportImage: HTMLButtonElement;
  btnPasteImage: HTMLButtonElement;
  drawTools: HTMLUListElement;
  drawToolsBtn: HTMLButtonElement;
  drawToolsIcon: HTMLSpanElement;
  drawToolsLabel: HTMLSpanElement;
  drawOptions: HTMLElement;
  drawOpts: HTMLElement[];
  modeButtons: Record<ToolMode, HTMLButtonElement>;
  toolOptions: HTMLElement;
  toolOptShapes: HTMLElement[];
  toolOptTexts: HTMLElement[];
  toolOptImages: HTMLElement[];
  toolOptColors: HTMLElement[];
  filledToggle: HTMLButtonElement;
  fontFamily: HTMLSelectElement;
  fontSize: HTMLInputElement;
  fontBold: HTMLButtonElement;
  fontItalic: HTMLButtonElement;
  moveToFront: HTMLButtonElement;
  moveToBelow: HTMLButtonElement;
  btnResizeImageOriginal: HTMLButtonElement;
  deleteElement: HTMLButtonElement;
  textInputOverlay: HTMLDivElement | null;
  zoomToast: HTMLDivElement | null;
};

export function getDom(doc: Document): SketchDom | null {
  const canvas = doc.getElementById('sketch-canvas') as HTMLCanvasElement | null;
  const galleryModal = doc.getElementById('gallery-modal') as HTMLDialogElement | null;
  const galleryList = doc.getElementById('gallery-list') as HTMLDivElement | null;
  const galleryTemplate = doc.getElementById('gallery-item-template') as HTMLTemplateElement | null;
  const colorInput = doc.getElementById('stroke-color') as HTMLInputElement | null;
  const colorPopup = doc.getElementById('color-popup') as HTMLDivElement | null;
  const quickColorButtons = Array.from(doc.querySelectorAll('.quick-color')) as HTMLButtonElement[];
  const widthInput = doc.getElementById('stroke-width') as HTMLInputElement | null;
  const exportFormat = doc.getElementById('export-format') as HTMLSelectElement | null;
  const exportHighDpi = doc.getElementById('export-high-dpi') as HTMLInputElement | null;
  const btnBackOverview = doc.getElementById('back-overview') as HTMLButtonElement | null;
  const btnOverviewLabel = doc.getElementById('overview-label') as HTMLSpanElement | null;
  const btnClear = doc.getElementById('clear-canvas') as HTMLButtonElement | null;
  const btnUndo = doc.getElementById('undo-action') as HTMLButtonElement | null;
  const btnRedo = doc.getElementById('redo-action') as HTMLButtonElement | null;
  const btnSave = doc.getElementById('save-drawing') as HTMLButtonElement | null;
  const btnGallery = doc.getElementById('open-gallery') as HTMLButtonElement | null;
  const btnExport = doc.getElementById('export-file') as HTMLButtonElement | null;
  const btnShare = doc.getElementById('share-drawing') as HTMLButtonElement | null;
  const btnClipboard = doc.getElementById('copy-image') as HTMLButtonElement | null;
  const btnInfo = doc.getElementById('show-info') as HTMLButtonElement | null;
  const infoModal = doc.getElementById('info-modal') as HTMLDialogElement | null;
  const infoDimensions = doc.getElementById('info-dimensions') as HTMLSpanElement | null;
  const infoLocation = doc.getElementById('info-location') as HTMLSpanElement | null;
  const infoElements = doc.getElementById('info-elements') as HTMLSpanElement | null;
  const infoBackground = doc.getElementById('info-background') as HTMLSpanElement | null;
  const infoColors = doc.getElementById('info-colors') as HTMLDivElement | null;
  const btnZoomOut = doc.getElementById('zoom-out') as HTMLButtonElement | null;
  const btnZoomIn = doc.getElementById('zoom-in') as HTMLButtonElement | null;
  const btnZoomReset = doc.getElementById('zoom-reset') as HTMLButtonElement | null;
  const btnZoomOutMobile = doc.getElementById('zoom-out-mobile') as HTMLButtonElement | null;
  const btnZoomInMobile = doc.getElementById('zoom-in-mobile') as HTMLButtonElement | null;
  const btnZoomResetMobile = doc.getElementById('zoom-reset-mobile') as HTMLButtonElement | null;
  const canvasBg = doc.getElementById('canvas-bg') as HTMLSelectElement | null;
  const appContainer = doc.getElementById('sketch-app-container') as HTMLDivElement | null;
  const btnModeDraw = doc.getElementById('mode-draw') as HTMLButtonElement | null;
  const btnModePan = doc.getElementById('mode-pan') as HTMLButtonElement | null;
  const btnImportImage = doc.getElementById('import-image') as HTMLButtonElement | null;
  const btnPasteImage = doc.getElementById('paste-image') as HTMLButtonElement | null;
  const modePan = doc.getElementById('mode-pan') as HTMLButtonElement | null;
  const modeFreehand = doc.getElementById('mode-freehand') as HTMLButtonElement | null;
  const modeLine = doc.getElementById('mode-line') as HTMLButtonElement | null;
  const modeRect = doc.getElementById('mode-rect') as HTMLButtonElement | null;
  const modeEllipse = doc.getElementById('mode-ellipse') as HTMLButtonElement | null;
  const modeTriangle = doc.getElementById('mode-triangle') as HTMLButtonElement | null;
  const modeArrow = doc.getElementById('mode-arrow') as HTMLButtonElement | null;
  const modeText = doc.getElementById('mode-text') as HTMLButtonElement | null;
  const modeSelect = doc.getElementById('mode-select') as HTMLButtonElement | null;
  const drawTools = doc.getElementById('draw-tools') as HTMLUListElement | null;
  const drawToolsBtn = doc.getElementById('draw-tools-btn') as HTMLButtonElement | null;
  const drawToolsIcon = doc.getElementById('draw-tools-icon') as HTMLElement | null;
  const drawToolsLabel = doc.getElementById('draw-tools-label') as HTMLSpanElement | null;
  const drawOptions = doc.getElementById('draw-options') as HTMLElement | null;
  const toolOptions = doc.getElementById('tool-options') as HTMLElement | null;
  const filledToggle = doc.getElementById('filled-toggle') as HTMLButtonElement | null;
  const fontFamily = doc.getElementById('font-family') as HTMLSelectElement | null;
  const fontSize = doc.getElementById('font-size') as HTMLInputElement | null;
  const fontBold = doc.getElementById('font-bold') as HTMLButtonElement | null;
  const fontItalic = doc.getElementById('font-italic') as HTMLButtonElement | null;
  const moveToFront = doc.getElementById('element-to-front') as HTMLButtonElement | null;
  const moveToBelow = doc.getElementById('element-to-below') as HTMLButtonElement | null;
  const btnResizeImageOriginal = doc.getElementById(
    'resize-image-original'
  ) as HTMLButtonElement | null;
  const deleteElement = doc.getElementById('delete-element') as HTMLButtonElement | null;
  const zoomToast = doc.getElementById('zoom-toast') as HTMLDivElement | null;
  const drawOpts = Array.from(doc.querySelectorAll('.draw-opt')) as HTMLElement[];
  const toolOptShapes = Array.from(doc.querySelectorAll('.tool-opt-shape')) as HTMLElement[];
  const toolOptTexts = Array.from(doc.querySelectorAll('.tool-opt-text')) as HTMLElement[];
  const toolOptImages = Array.from(doc.querySelectorAll('.tool-opt-image')) as HTMLElement[];
  const toolOptColors = Array.from(doc.querySelectorAll('.tool-opt-color')) as HTMLElement[];

  if (
    !canvas ||
    !galleryModal ||
    !galleryList ||
    !galleryTemplate ||
    !colorInput ||
    !colorPopup ||
    !widthInput ||
    !exportFormat ||
    !exportHighDpi ||
    !btnBackOverview ||
    !btnOverviewLabel ||
    !btnClear ||
    !btnUndo ||
    !btnRedo ||
    !btnSave ||
    !btnGallery ||
    !btnExport ||
    !btnShare ||
    !btnClipboard ||
    !btnInfo ||
    !infoModal ||
    !infoDimensions ||
    !infoLocation ||
    !infoElements ||
    !infoBackground ||
    !infoColors ||
    !btnZoomOut ||
    !btnZoomIn ||
    !btnZoomReset ||
    !btnZoomOutMobile ||
    !btnZoomInMobile ||
    !btnZoomResetMobile ||
    !canvasBg ||
    !appContainer ||
    !btnModeDraw ||
    !btnModePan ||
    !btnImportImage ||
    !btnPasteImage ||
    !modePan ||
    !modeFreehand ||
    !modeLine ||
    !modeRect ||
    !modeEllipse ||
    !modeTriangle ||
    !modeArrow ||
    !modeText ||
    !modeSelect ||
    !drawTools ||
    !drawToolsBtn ||
    !drawToolsIcon ||
    !drawToolsLabel ||
    !drawOptions ||
    !toolOptions ||
    !filledToggle ||
    !fontFamily ||
    !fontSize ||
    !fontBold ||
    !fontItalic ||
    !moveToFront ||
    !moveToBelow ||
    !btnResizeImageOriginal ||
    !deleteElement
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
    exportHighDpi,
    btnBackOverview,
    btnOverviewLabel,
    btnClear,
    btnUndo,
    btnRedo,
    btnSave,
    btnGallery,
    btnExport,
    btnShare,
    btnClipboard,
    btnInfo,
    infoModal,
    infoDimensions,
    infoLocation,
    infoElements,
    infoBackground,
    infoColors,
    btnZoomOut,
    btnZoomIn,
    btnZoomReset,
    btnZoomOutMobile,
    btnZoomInMobile,
    btnZoomResetMobile,
    canvasBg,
    appContainer,
    btnModeDraw,
    btnModePan,
    btnImportImage,
    btnPasteImage,
    drawTools,
    drawToolsBtn,
    drawToolsIcon,
    drawToolsLabel,
    drawOptions,
    drawOpts,
    modeButtons: {
      pan: modePan,
      select: modeSelect,
      freehand: modeFreehand,
      line: modeLine,
      rect: modeRect,
      ellipse: modeEllipse,
      triangle: modeTriangle,
      arrow: modeArrow,
      text: modeText,
      image: modeFreehand,
    },
    toolOptions,
    toolOptShapes,
    toolOptTexts,
    toolOptImages,
    toolOptColors,
    filledToggle,
    fontFamily,
    fontSize,
    fontBold,
    fontItalic,
    moveToFront,
    moveToBelow,
    btnResizeImageOriginal,
    deleteElement,
    textInputOverlay: null,
    zoomToast,
  };
}
