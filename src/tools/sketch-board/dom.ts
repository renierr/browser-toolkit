import type { ToolMode } from './types.ts';

export type SketchDom = {
  canvas: HTMLCanvasElement;
  galleryModal: HTMLDialogElement;
  galleryList: HTMLDivElement;
  galleryTemplate: HTMLTemplateElement;
  colorInput: HTMLInputElement;
  colorIndicator: HTMLDivElement;
  colorPopup: HTMLDivElement;
  fillColorInput: HTMLInputElement;
  fillColorIndicator: HTMLDivElement;
  fillColorPopup: HTMLDivElement;
  quickColorButtons: HTMLButtonElement[];
  fillQuickColorButtons: HTMLButtonElement[];
  widthInput: HTMLInputElement;
  strokeWidthBtn: HTMLButtonElement;
  strokeWidthIndicator: HTMLDivElement;
  strokeWidthPopup: HTMLDivElement;
  strokeWidthPresets: HTMLElement[];
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
  zoomLevel: HTMLSpanElement;
  zoomLevelMobile: HTMLSpanElement;
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
  modeButtons: Partial<Record<ToolMode, HTMLButtonElement>>;
  toolOptions: HTMLElement;
  toolOptShapes: HTMLElement[];
  toolOptTexts: HTMLElement[];
  toolOptImages: HTMLElement[];
  toolOptColors: HTMLElement[];
  toolOptBrushes: HTMLElement[];
  toolOptWidths: HTMLElement[];
  fontFamily: HTMLSelectElement;
  fontSize: HTMLInputElement;
  fontBold: HTMLButtonElement;
  fontItalic: HTMLButtonElement;
  moveToFront: HTMLButtonElement;
  moveToBelow: HTMLButtonElement;
  btnResizeImageOriginal: HTMLButtonElement;
  groupElements: HTMLButtonElement;
  ungroupElements: HTMLButtonElement;
  deleteElement: HTMLButtonElement;
  duplicateElement: HTMLButtonElement;
  resetRotation: HTMLButtonElement;
  brushStyleBtn: HTMLButtonElement;
  brushStylePopup: HTMLDivElement;
  brushNormal: HTMLButtonElement;
  brushShaky: HTMLButtonElement;
  brushNatural: HTMLButtonElement;
  brushStyleLabel: HTMLSpanElement;
  brushStyleInput: HTMLInputElement;
  textInputOverlay: HTMLDivElement | null;
  zoomToast: HTMLDivElement | null;
};

export function getDom(doc: Document): SketchDom | null {
  const canvas = doc.getElementById('sketch-canvas') as HTMLCanvasElement | null;
  const galleryModal = doc.getElementById('gallery-modal') as HTMLDialogElement | null;
  const galleryList = doc.getElementById('gallery-list') as HTMLDivElement | null;
  const galleryTemplate = doc.getElementById('gallery-item-template') as HTMLTemplateElement | null;
  const colorInput = doc.getElementById('stroke-color') as HTMLInputElement | null;
  const colorIndicator = doc.getElementById('color-indicator') as HTMLDivElement | null;
  const colorPopup = doc.getElementById('color-popup') as HTMLDivElement | null;
  const fillColorInput = doc.getElementById('fill-color') as HTMLInputElement | null;
  const fillColorIndicator = doc.getElementById('fill-color-indicator') as HTMLDivElement | null;
  const fillColorPopup = doc.getElementById('fill-color-popup') as HTMLDivElement | null;
  const quickColorButtons = Array.from(doc.querySelectorAll('.quick-color')) as HTMLButtonElement[];
  const fillQuickColorButtons = Array.from(
    doc.querySelectorAll('.fill-quick-color')
  ) as HTMLButtonElement[];
  const widthInput = doc.getElementById('stroke-width') as HTMLInputElement | null;
  const strokeWidthBtn = doc.getElementById('stroke-width-btn') as HTMLButtonElement | null;
  const strokeWidthIndicator = doc.getElementById(
    'stroke-width-indicator'
  ) as HTMLDivElement | null;
  const strokeWidthPopup = doc.getElementById('stroke-width-popup') as HTMLDivElement | null;
  const strokeWidthPresets = Array.from(
    doc.querySelectorAll('.stroke-width-preset')
  ) as HTMLElement[];
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
  const zoomLevel = doc.getElementById('zoom-level') as HTMLSpanElement | null;
  const zoomLevelMobile = doc.getElementById('zoom-level-mobile') as HTMLSpanElement | null;
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
  const modeDiamond = doc.getElementById('mode-diamond') as HTMLButtonElement | null;
  const modeHexagon = doc.getElementById('mode-hexagon') as HTMLButtonElement | null;
  const modeArrow = doc.getElementById('mode-arrow') as HTMLButtonElement | null;
  const modeDoubleArrow = doc.getElementById('mode-double-arrow') as HTMLButtonElement | null;
  const modeSpeechBubble = doc.getElementById('mode-speech-bubble') as HTMLButtonElement | null;
  const modeCheckmark = doc.getElementById('mode-checkmark') as HTMLButtonElement | null;
  const modeText = doc.getElementById('mode-text') as HTMLButtonElement | null;
  const modeSelect = doc.getElementById('mode-select') as HTMLButtonElement | null;
  const drawTools = doc.getElementById('draw-tools') as HTMLUListElement | null;
  const drawToolsBtn = doc.getElementById('draw-tools-btn') as HTMLButtonElement | null;
  const drawToolsIcon = doc.getElementById('draw-tools-icon') as HTMLElement | null;
  const drawToolsLabel = doc.getElementById('draw-tools-label') as HTMLSpanElement | null;
  const drawOptions = doc.getElementById('draw-options') as HTMLElement | null;
  const toolOptions = doc.getElementById('tool-options') as HTMLElement | null;
  const fontFamily = doc.getElementById('font-family') as HTMLSelectElement | null;
  const fontSize = doc.getElementById('font-size') as HTMLInputElement | null;
  const fontBold = doc.getElementById('font-bold') as HTMLButtonElement | null;
  const fontItalic = doc.getElementById('font-italic') as HTMLButtonElement | null;
  const moveToFront = doc.getElementById('element-to-front') as HTMLButtonElement | null;
  const moveToBelow = doc.getElementById('element-to-below') as HTMLButtonElement | null;
  const btnResizeImageOriginal = doc.getElementById(
    'resize-image-original'
  ) as HTMLButtonElement | null;
  const groupElements = doc.getElementById('group-elements') as HTMLButtonElement | null;
  const ungroupElements = doc.getElementById('ungroup-elements') as HTMLButtonElement | null;
  const deleteElement = doc.getElementById('delete-element') as HTMLButtonElement | null;
  const duplicateElement = doc.getElementById('duplicate-element') as HTMLButtonElement | null;
  const resetRotation = doc.getElementById('reset-rotation') as HTMLButtonElement | null;
  const zoomToast = doc.getElementById('zoom-toast') as HTMLDivElement | null;
  const drawOpts = Array.from(doc.querySelectorAll('.draw-opt')) as HTMLElement[];
  const toolOptShapes = Array.from(doc.querySelectorAll('.tool-opt-shape')) as HTMLElement[];
  const toolOptTexts = Array.from(doc.querySelectorAll('.tool-opt-text')) as HTMLElement[];
  const toolOptImages = Array.from(doc.querySelectorAll('.tool-opt-image')) as HTMLElement[];
  const toolOptColors = Array.from(doc.querySelectorAll('.tool-opt-color')) as HTMLElement[];
  const toolOptBrushes = Array.from(doc.querySelectorAll('.tool-opt-brush')) as HTMLElement[];
  const toolOptWidths = Array.from(doc.querySelectorAll('.tool-opt-width')) as HTMLElement[];
  const brushStyleBtn = doc.getElementById('brush-style-btn') as HTMLButtonElement | null;
  const brushStylePopup = doc.getElementById('brush-style-popup') as HTMLDivElement | null;
  const brushNormal = doc.getElementById('brush-normal') as HTMLButtonElement | null;
  const brushShaky = doc.getElementById('brush-shaky') as HTMLButtonElement | null;
  const brushNatural = doc.getElementById('brush-natural') as HTMLButtonElement | null;
  const brushStyleLabel = doc.getElementById('brush-style-label') as HTMLSpanElement | null;
  const brushStyleInput = doc.getElementById('brush-style') as HTMLInputElement | null;

  const requiredElements: Record<string, HTMLElement | null> = {
    canvas,
    galleryModal,
    galleryList,
    galleryTemplate,
    colorInput,
    colorIndicator,
    colorPopup,
    fillColorInput,
    fillColorIndicator,
    fillColorPopup,
    widthInput,
    strokeWidthBtn,
    strokeWidthIndicator,
    strokeWidthPopup,
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
    zoomLevel,
    zoomLevelMobile,
    canvasBg,
    appContainer,
    btnModeDraw,
    btnModePan,
    btnImportImage,
    btnPasteImage,
    modePan,
    modeFreehand,
    modeLine,
    modeRect,
    modeEllipse,
    modeTriangle,
    modeDiamond,
    modeHexagon,
    modeArrow,
    modeDoubleArrow,
    modeSpeechBubble,
    modeCheckmark,
    modeText,
    modeSelect,
    drawTools,
    drawToolsBtn,
    drawToolsIcon: drawToolsIcon as HTMLElement,
    drawToolsLabel,
    drawOptions,
    toolOptions,
    fontFamily,
    fontSize,
    fontBold,
    fontItalic,
    moveToFront,
    moveToBelow,
    btnResizeImageOriginal,
    groupElements,
    ungroupElements,
    deleteElement,
    duplicateElement,
    resetRotation,
    brushStyleBtn,
    brushStylePopup,
    brushNormal,
    brushShaky,
    brushNatural,
    brushStyleLabel,
    brushStyleInput,
  };

  for (const [name, el] of Object.entries(requiredElements)) {
    if (!el) {
      console.error(`[SketchBoard] Required DOM element "${name}" is missing.`);
      return null;
    }
  }

  return {
    canvas: canvas!,
    galleryModal: galleryModal!,
    galleryList: galleryList!,
    galleryTemplate: galleryTemplate!,
    colorInput: colorInput!,
    colorIndicator: colorIndicator!,
    colorPopup: colorPopup!,
    fillColorInput: fillColorInput!,
    fillColorIndicator: fillColorIndicator!,
    fillColorPopup: fillColorPopup!,
    quickColorButtons,
    fillQuickColorButtons,
    widthInput: widthInput!,
    strokeWidthBtn: strokeWidthBtn!,
    strokeWidthIndicator: strokeWidthIndicator!,
    strokeWidthPopup: strokeWidthPopup!,
    strokeWidthPresets,
    exportFormat: exportFormat!,
    exportHighDpi: exportHighDpi!,
    btnBackOverview: btnBackOverview!,
    btnOverviewLabel: btnOverviewLabel!,
    btnClear: btnClear!,
    btnUndo: btnUndo!,
    btnRedo: btnRedo!,
    btnSave: btnSave!,
    btnGallery: btnGallery!,
    btnExport: btnExport!,
    btnShare: btnShare!,
    btnClipboard: btnClipboard!,
    btnInfo: btnInfo!,
    infoModal: infoModal!,
    infoDimensions: infoDimensions!,
    infoLocation: infoLocation!,
    infoElements: infoElements!,
    infoBackground: infoBackground!,
    infoColors: infoColors!,
    btnZoomOut: btnZoomOut!,
    btnZoomIn: btnZoomIn!,
    btnZoomReset: btnZoomReset!,
    btnZoomOutMobile: btnZoomOutMobile!,
    btnZoomInMobile: btnZoomInMobile!,
    btnZoomResetMobile: btnZoomResetMobile!,
    zoomLevel: zoomLevel!,
    zoomLevelMobile: zoomLevelMobile!,
    canvasBg: canvasBg!,
    appContainer: appContainer!,
    btnModeDraw: btnModeDraw!,
    btnModePan: btnModePan!,
    btnImportImage: btnImportImage!,
    btnPasteImage: btnPasteImage!,
    drawTools: drawTools!,
    drawToolsBtn: drawToolsBtn!,
    drawToolsIcon: drawToolsIcon as HTMLSpanElement,
    drawToolsLabel: drawToolsLabel!,
    drawOptions: drawOptions!,
    drawOpts,
    modeButtons: {
      pan: modePan!,
      select: modeSelect!,
      freehand: modeFreehand!,
      line: modeLine!,
      rect: modeRect!,
      ellipse: modeEllipse!,
      triangle: modeTriangle!,
      diamond: modeDiamond!,
      hexagon: modeHexagon!,
      arrow: modeArrow!,
      'double-arrow': modeDoubleArrow!,
      'speech-bubble': modeSpeechBubble!,
      checkmark: modeCheckmark!,
      text: modeText!,
    },
    toolOptions: toolOptions!,
    toolOptShapes,
    toolOptTexts,
    toolOptImages,
    toolOptColors,
    toolOptBrushes,
    toolOptWidths,
    fontFamily: fontFamily!,
    fontSize: fontSize!,
    fontBold: fontBold!,
    fontItalic: fontItalic!,
    moveToFront: moveToFront!,
    moveToBelow: moveToBelow!,
    btnResizeImageOriginal: btnResizeImageOriginal!,
    groupElements: groupElements!,
    ungroupElements: ungroupElements!,
    deleteElement: deleteElement!,
    duplicateElement: duplicateElement!,
    resetRotation: resetRotation!,
    brushStyleBtn: brushStyleBtn!,
    brushStylePopup: brushStylePopup!,
    brushNormal: brushNormal!,
    brushShaky: brushShaky!,
    brushNatural: brushNatural!,
    brushStyleLabel: brushStyleLabel!,
    brushStyleInput: brushStyleInput!,
    textInputOverlay: null,
    zoomToast,
  };
}
