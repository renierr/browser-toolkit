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
  btnExportGallery: HTMLButtonElement;
  btnImportGallery: HTMLButtonElement;
  inputImportGallery: HTMLInputElement;
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
  btnSelectBox: HTMLButtonElement;
  btnSelectLasso: HTMLButtonElement;
  selectionTypeInput: HTMLInputElement;
  toolOptSelectTypes: HTMLElement[];
  textInputOverlay: HTMLDivElement | null;
  zoomToast: HTMLDivElement | null;
};

export function getDom(doc: Document): SketchDom | null {
  const el = <T extends HTMLElement>(id: string) => doc.getElementById(id) as T | null;
  const all = <T extends HTMLElement>(selector: string) =>
    Array.from(doc.querySelectorAll(selector)) as T[];

  const canvas = el<HTMLCanvasElement>('sketch-canvas');
  const galleryModal = el<HTMLDialogElement>('gallery-modal');
  const galleryList = el<HTMLDivElement>('gallery-list');
  const galleryTemplate = el<HTMLTemplateElement>('gallery-item-template');
  const colorInput = el<HTMLInputElement>('stroke-color');
  const colorIndicator = el<HTMLDivElement>('color-indicator');
  const colorPopup = el<HTMLDivElement>('color-popup');
  const fillColorInput = el<HTMLInputElement>('fill-color');
  const fillColorIndicator = el<HTMLDivElement>('fill-color-indicator');
  const fillColorPopup = el<HTMLDivElement>('fill-color-popup');
  const quickColorButtons = all<HTMLButtonElement>('.quick-color');
  const fillQuickColorButtons = all<HTMLButtonElement>('.fill-quick-color');
  const widthInput = el<HTMLInputElement>('stroke-width');
  const strokeWidthBtn = el<HTMLButtonElement>('stroke-width-btn');
  const strokeWidthIndicator = el<HTMLDivElement>('stroke-width-indicator');
  const strokeWidthPopup = el<HTMLDivElement>('stroke-width-popup');
  const strokeWidthPresets = all<HTMLElement>('.stroke-width-preset');
  const exportFormat = el<HTMLSelectElement>('export-format');
  const exportHighDpi = el<HTMLInputElement>('export-high-dpi');
  const btnBackOverview = el<HTMLButtonElement>('back-overview');
  const btnOverviewLabel = el<HTMLSpanElement>('overview-label');
  const btnClear = el<HTMLButtonElement>('clear-canvas');
  const btnUndo = el<HTMLButtonElement>('undo-action');
  const btnRedo = el<HTMLButtonElement>('redo-action');
  const btnSave = el<HTMLButtonElement>('save-drawing');
  const btnGallery = el<HTMLButtonElement>('open-gallery');
  const btnExport = el<HTMLButtonElement>('export-file');
  const btnExportGallery = el<HTMLButtonElement>('export-gallery');
  const btnImportGallery = el<HTMLButtonElement>('import-gallery');
  const inputImportGallery = el<HTMLInputElement>('import-gallery-file');
  const btnShare = el<HTMLButtonElement>('share-drawing');
  const btnClipboard = el<HTMLButtonElement>('copy-image');
  const btnInfo = el<HTMLButtonElement>('show-info');
  const infoModal = el<HTMLDialogElement>('info-modal');
  const infoDimensions = el<HTMLSpanElement>('info-dimensions');
  const infoLocation = el<HTMLSpanElement>('info-location');
  const infoElements = el<HTMLSpanElement>('info-elements');
  const infoBackground = el<HTMLSpanElement>('info-background');
  const infoColors = el<HTMLDivElement>('info-colors');
  const btnZoomOut = el<HTMLButtonElement>('zoom-out');
  const btnZoomIn = el<HTMLButtonElement>('zoom-in');
  const btnZoomReset = el<HTMLButtonElement>('zoom-reset');
  const btnZoomOutMobile = el<HTMLButtonElement>('zoom-out-mobile');
  const btnZoomInMobile = el<HTMLButtonElement>('zoom-in-mobile');
  const btnZoomResetMobile = el<HTMLButtonElement>('zoom-reset-mobile');
  const zoomLevel = el<HTMLSpanElement>('zoom-level');
  const zoomLevelMobile = el<HTMLSpanElement>('zoom-level-mobile');
  const canvasBg = el<HTMLSelectElement>('canvas-bg');
  const appContainer = el<HTMLDivElement>('sketch-app-container');
  const btnModeDraw = el<HTMLButtonElement>('mode-draw');
  const btnModePan = el<HTMLButtonElement>('mode-pan');
  const btnImportImage = el<HTMLButtonElement>('import-image');
  const btnPasteImage = el<HTMLButtonElement>('paste-image');
  const modePan = el<HTMLButtonElement>('mode-pan');
  const modeFreehand = el<HTMLButtonElement>('mode-freehand');
  const modeLine = el<HTMLButtonElement>('mode-line');
  const modeRect = el<HTMLButtonElement>('mode-rect');
  const modeEllipse = el<HTMLButtonElement>('mode-ellipse');
  const modeTriangle = el<HTMLButtonElement>('mode-triangle');
  const modeDiamond = el<HTMLButtonElement>('mode-diamond');
  const modeHexagon = el<HTMLButtonElement>('mode-hexagon');
  const modeArrow = el<HTMLButtonElement>('mode-arrow');
  const modeDoubleArrow = el<HTMLButtonElement>('mode-double-arrow');
  const modeSpeechBubble = el<HTMLButtonElement>('mode-speech-bubble');
  const modeCheckmark = el<HTMLButtonElement>('mode-checkmark');
  const modeText = el<HTMLButtonElement>('mode-text');
  const modeSelect = el<HTMLButtonElement>('mode-select');
  const drawTools = el<HTMLUListElement>('draw-tools');
  const drawToolsBtn = el<HTMLButtonElement>('draw-tools-btn');
  const drawToolsIcon = el<HTMLElement>('draw-tools-icon');
  const drawToolsLabel = el<HTMLSpanElement>('draw-tools-label');
  const drawOptions = el<HTMLElement>('draw-options');
  const toolOptions = el<HTMLElement>('tool-options');
  const fontFamily = el<HTMLSelectElement>('font-family');
  const fontSize = el<HTMLInputElement>('font-size');
  const fontBold = el<HTMLButtonElement>('font-bold');
  const fontItalic = el<HTMLButtonElement>('font-italic');
  const moveToFront = el<HTMLButtonElement>('element-to-front');
  const moveToBelow = el<HTMLButtonElement>('element-to-below');
  const btnResizeImageOriginal = el<HTMLButtonElement>('resize-image-original');
  const groupElements = el<HTMLButtonElement>('group-elements');
  const ungroupElements = el<HTMLButtonElement>('ungroup-elements');
  const deleteElement = el<HTMLButtonElement>('delete-element');
  const duplicateElement = el<HTMLButtonElement>('duplicate-element');
  const resetRotation = el<HTMLButtonElement>('reset-rotation');
  const zoomToast = el<HTMLDivElement>('zoom-toast');
  const drawOpts = all<HTMLElement>('.draw-opt');
  const toolOptShapes = all<HTMLElement>('.tool-opt-shape');
  const toolOptTexts = all<HTMLElement>('.tool-opt-text');
  const toolOptImages = all<HTMLElement>('.tool-opt-image');
  const toolOptColors = all<HTMLElement>('.tool-opt-color');
  const toolOptBrushes = all<HTMLElement>('.tool-opt-brush');
  const toolOptWidths = all<HTMLElement>('.tool-opt-width');
  const brushStyleBtn = el<HTMLButtonElement>('brush-style-btn');
  const brushStylePopup = el<HTMLDivElement>('brush-style-popup');
  const brushNormal = el<HTMLButtonElement>('brush-normal');
  const brushShaky = el<HTMLButtonElement>('brush-shaky');
  const brushNatural = el<HTMLButtonElement>('brush-natural');
  const brushStyleLabel = el<HTMLSpanElement>('brush-style-label');
  const brushStyleInput = el<HTMLInputElement>('brush-style');
  const btnSelectBox = el<HTMLButtonElement>('select-box');
  const btnSelectLasso = el<HTMLButtonElement>('select-lasso');
  const selectionTypeInput = el<HTMLInputElement>('selection-type');
  const toolOptSelectTypes = all<HTMLElement>('.tool-opt-select-type');

  const required: Record<string, HTMLElement | null> = {
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
    btnExportGallery,
    btnImportGallery,
    inputImportGallery,
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
    drawToolsIcon,
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
    btnSelectBox,
    btnSelectLasso,
    selectionTypeInput,
  };

  for (const [name, element] of Object.entries(required)) {
    if (!element) {
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
    btnExportGallery: btnExportGallery!,
    btnImportGallery: btnImportGallery!,
    inputImportGallery: inputImportGallery!,
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
    toolOptSelectTypes,
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
    btnSelectBox: btnSelectBox!,
    btnSelectLasso: btnSelectLasso!,
    selectionTypeInput: selectionTypeInput!,
    textInputOverlay: null,
    zoomToast,
  };
}
