import type { SharedFilesPayload } from '../../js/share-target';
import { warp, type Point } from './utils/perspective';
import { applyFilters as applyFiltersUtil } from './utils/filters';
import { startCamera as startCameraUtil, stopCamera as stopCameraUtil } from './utils/camera';
import { detectDocumentCorners, detectCornersOnImage } from './utils/detection';
import { setupFileDropzone } from '../../js/file-utils.ts';
import { drawLiveOverlay, drawPerspectiveOverlay, updateCornerHandles, updateMagnifier, renderPageList as renderPageListUtil } from './utils/ui';
import { startLevelSensor } from './utils/sensors';
import { generateAndDownloadPDF } from './utils/pdf';
import type { ScannedPage } from './types';
import Sortable from 'sortablejs';

// noinspection JSUnusedGlobalSymbols
export default function init(payload?: SharedFilesPayload) {
  const video = document.getElementById('video') as HTMLVideoElement;
  const cameraView = document.getElementById('camera-view')!;
  const captureContainer = document.getElementById('capture-container')!;
  const editorContainer = document.getElementById('editor-container')!;
  const canvas = document.getElementById('editor-canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const cornerHandles = document.getElementById('corner-handles')!;
  const filterControls = document.getElementById('filter-controls')!;
  const perspectiveActions = document.getElementById('perspective-actions')!;
  const btnCapture = document.getElementById('btn-capture')!;
  const btnSwitch = document.getElementById('btn-switch-camera')!;
  const btnRotate = document.getElementById('btn-rotate-view')!;
  const btnReset = document.getElementById('btn-reset')!;
  const btnDownload = document.getElementById('btn-download')!;
  const btnDownloadPdf = document.getElementById('btn-download-pdf')!;
  const btnAddPage = document.getElementById('btn-add-page')!;
  const btnApplyPerspective = document.getElementById('btn-apply-perspective')!;
  const btnModePerspective = document.getElementById('btn-mode-perspective')!;
  const btnModeFilter = document.getElementById('btn-mode-filter')!;
  const filterSelect = document.getElementById('filter-select') as HTMLSelectElement;
  const hintText = document.getElementById('hint-text')!;
  const checkLiveDetection = document.getElementById('check-live-detection') as HTMLInputElement;
  const levelIndicator = document.getElementById('level-indicator')!;
  const levelDot = document.getElementById('level-dot')!;
  const pageList = document.getElementById('page-list')!;
  const dropzoneContainer = document.getElementById('dropzone-container')!;
  const magnifier = document.getElementById('magnifier')!;
  const magnifierCanvas = document.getElementById('magnifier-canvas') as HTMLCanvasElement;
  const mCtx = magnifierCanvas.getContext('2d')!;

  let stream: MediaStream | null = null;
  let currentFacingMode: 'user' | 'environment' = 'environment';
  let isPortrait = true;
  let pages: ScannedPage[] = [];
  let currentPageIndex: number = -1;
  let activeHandle: number | null = null;
  let activePointerId: number | null = null;
  let isFilterMode = false;
  let lastDetectedCorners: Point[] | null = null;
  let stopLevelSensor: (() => void) | null = null;

  // --- Camera Logic ---

  let detectionInterval: number | null = null;
  const cameraOverlay = document.getElementById('camera-overlay') as HTMLCanvasElement;
  const detectionCanvas = document.createElement('canvas');
  const dCtx = detectionCanvas.getContext('2d', { willReadFrequently: true })!;

  async function startCamera() {
    cameraView.classList.toggle('aspect-portrait', isPortrait);
    cameraView.classList.toggle('aspect-landscape', !isPortrait);

    stream = await startCameraUtil(video, currentFacingMode, stream, isPortrait);
    if (checkLiveDetection.checked) {
      startLiveDetection();
    }
    stopLevelSensor = startLevelSensor(
      isPortrait,
      (xPos, yPos, isLevel) => {
        levelDot.style.transform = `translate(${xPos}px, ${yPos}px)`;
        if (isLevel) {
          levelDot.classList.replace('bg-primary', 'bg-success');
          levelDot.classList.add('scale-125');
        } else {
          levelDot.classList.replace('bg-success', 'bg-primary');
          levelDot.classList.remove('scale-125');
        }
      },
      () => levelIndicator.classList.remove('opacity-0')
    );
  }

  function stopCamera() {
    stream = stopCameraUtil(stream);
    stopLiveDetection();
    if (stopLevelSensor) {
      stopLevelSensor();
      stopLevelSensor = null;
    }
    levelIndicator.classList.add('opacity-0');
  }

  function startLiveDetection() {
    if (detectionInterval) return;
    detectionInterval = window.setInterval(() => {
      if (video.paused || video.ended || !checkLiveDetection.checked) {
        const oCtx = cameraOverlay.getContext('2d');
        if (oCtx) oCtx.clearRect(0, 0, cameraOverlay.width, cameraOverlay.height);
        if (!checkLiveDetection.checked) stopLiveDetection();
        return;
      }

      const vWidth = video.videoWidth;
      const vHeight = video.videoHeight;
      const cWidth = video.clientWidth;
      const cHeight = video.clientHeight;
      if (!vWidth || !vHeight || !cWidth || !cHeight) return;

      const scale = Math.min(1, 300 / Math.max(vWidth, vHeight));
      const dWidth = Math.floor(vWidth * scale);
      const dHeight = Math.floor(vHeight * scale);

      if (detectionCanvas.width !== dWidth || detectionCanvas.height !== dHeight) {
        detectionCanvas.width = dWidth;
        detectionCanvas.height = dHeight;
      }

      dCtx.drawImage(video, 0, 0, vWidth, vHeight, 0, 0, dWidth, dHeight);
      const detected = detectDocumentCorners(detectionCanvas);

      if (detected) {
        lastDetectedCorners = detected.map(p => ({
          x: (p.x / dWidth) * vWidth,
          y: (p.y / dHeight) * vHeight
        }));
      } else {
        lastDetectedCorners = null;
      }

      const vAspect = vWidth / vHeight;
      const cAspect = cWidth / cHeight;

      let renderWidth, renderHeight, offsetX, offsetY;
      if (vAspect > cAspect) {
        renderWidth = cWidth;
        renderHeight = cWidth / vAspect;
        offsetX = 0;
        offsetY = (cHeight - renderHeight) / 2;
      } else {
        renderHeight = cHeight;
        renderWidth = cHeight * vAspect;
        offsetX = (cWidth - renderWidth) / 2;
        offsetY = 0;
      }

      const upscaled = detected?.map(p => ({
        x: (p.x / dWidth) * renderWidth + offsetX,
        y: (p.y / dHeight) * renderHeight + offsetY
      })) || null;

      if (cameraOverlay.width !== cWidth || cameraOverlay.height !== cHeight) {
        cameraOverlay.width = cWidth;
        cameraOverlay.height = cHeight;
      }

      drawLiveOverlay(cameraOverlay, upscaled);
    }, 200);
  }

  function stopLiveDetection() {
    if (detectionInterval) {
      clearInterval(detectionInterval);
      detectionInterval = null;
    }
    const oCtx = cameraOverlay.getContext('2d');
    if (oCtx && cameraOverlay) oCtx.clearRect(0, 0, cameraOverlay.width, cameraOverlay.height);
  }

  checkLiveDetection.addEventListener('change', () => {
    if (checkLiveDetection.checked) {
      startLiveDetection();
    } else {
      stopLiveDetection();
    }
  });

  btnCapture.addEventListener('click', () => {
    const vWidth = video.videoWidth;
    const vHeight = video.videoHeight;
    if (!vWidth || !vHeight) return;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = vWidth;
    tempCanvas.height = vHeight;
    const tCtx = tempCanvas.getContext('2d')!;
    tCtx.drawImage(video, 0, 0, vWidth, vHeight);

    const img = new Image();
    img.src = tempCanvas.toDataURL('image/png');
    img.onload = () => {
      addPage(img, lastDetectedCorners);
    };
  });

  btnSwitch.addEventListener('click', () => {
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    startCamera();
  });

  btnRotate.addEventListener('click', () => {
    isPortrait = !isPortrait;
    startCamera();
  });

  // --- Page Management ---

  function addPage(img: HTMLImageElement, detectedCorners: Point[] | null = null) {
    const pCanvas = document.createElement('canvas');
    pCanvas.width = img.width;
    pCanvas.height = img.height;
    const pCtx = pCanvas.getContext('2d')!;
    pCtx.drawImage(img, 0, 0);

    let initialCorners: Point[];
    if (detectedCorners) {
      initialCorners = detectedCorners;
    } else {
      const detected = detectCornersOnImage(img);
      initialCorners = detected || [
        { x: 0, y: 0 },
        { x: img.width, y: 0 },
        { x: img.width, y: img.height },
        { x: 0, y: img.height },
      ];
    }

    const newPage: ScannedPage = {
      id: crypto.randomUUID(),
      originalImage: img,
      processedCanvas: pCanvas,
      corners: initialCorners,
      filter: 'none'
    };

    pages.push(newPage);
    currentPageIndex = pages.length - 1;

    stopCamera();
    captureContainer.classList.add('hidden');
    editorContainer.classList.remove('hidden');
    dropzoneContainer.classList.add('hidden');

    renderPageList();
    enterPerspectiveMode();
  }

  function renderPageList() {
    renderPageListUtil(pageList, pages, currentPageIndex, (index) => {
      currentPageIndex = index;
      renderPageList();
      enterPerspectiveMode();
    });
  }

  const sortable = Sortable.create(pageList, {
    animation: 150,
    ghostClass: 'opacity-20',
    onEnd: (evt) => {
      if (evt.oldIndex !== undefined && evt.newIndex !== undefined) {
        const [moved] = pages.splice(evt.oldIndex, 1);
        pages.splice(evt.newIndex, 0, moved);
        if (currentPageIndex === evt.oldIndex) {
          currentPageIndex = evt.newIndex;
        } else if (currentPageIndex > evt.oldIndex && currentPageIndex <= evt.newIndex) {
          currentPageIndex--;
        } else if (currentPageIndex < evt.oldIndex && currentPageIndex >= evt.newIndex) {
          currentPageIndex++;
        }
        renderPageList();
      }
    }
  });

  pageList.addEventListener('click', (e) => {
    const removeBtn = (e.target as HTMLElement).closest('.btn-remove-page') as HTMLElement;
    if (removeBtn) {
      const index = parseInt(removeBtn.dataset.index!);
      pages.splice(index, 1);
      if (pages.length === 0) {
        btnReset.click();
      } else {
        if (currentPageIndex >= pages.length) currentPageIndex = pages.length - 1;
        renderPageList();
        enterPerspectiveMode();
      }
    }
  });

  btnAddPage.addEventListener('click', () => {
    captureContainer.classList.remove('hidden');
    editorContainer.classList.add('hidden');
    startCamera();
  });

  // --- Image Loading ---

  function handleFile(file: File) {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target?.result as string;
      img.onload = () => addPage(img);
    };
    reader.readAsDataURL(file);
  }

  setupFileDropzone('dropzone', 'image-input', (files) => {
    Array.from(files).forEach(handleFile);
  });

  // --- Perspective Logic ---

  function enterPerspectiveMode() {
    isFilterMode = false;
    btnModePerspective.classList.add('btn-active');
    btnModeFilter.classList.remove('btn-active');
    filterControls.classList.add('hidden');
    perspectiveActions.classList.remove('hidden');
    hintText.textContent = 'Drag the corners to match the document boundaries.';
    updateEditor();
  }

  function enterFilterMode() {
    isFilterMode = true;
    btnModePerspective.classList.remove('btn-active');
    btnModeFilter.classList.add('btn-active');
    filterControls.classList.remove('hidden');
    perspectiveActions.classList.add('hidden');
    hintText.textContent = 'Choose a filter to enhance your document.';
    cornerHandles.innerHTML = '';

    const page = pages[currentPageIndex];
    filterSelect.value = page.filter;
    applyFilters();
  }

  function updateEditor() {
    const page = pages[currentPageIndex];
    if (!page) return;

    canvas.width = page.originalImage.width;
    canvas.height = page.originalImage.height;
    ctx.drawImage(page.originalImage, 0, 0);

    if (!isFilterMode) {
      drawPerspectiveOverlay(ctx, page.corners);
      updateCornerHandles(cornerHandles, page.corners, canvas, onStart);
    } else {
      applyFilters();
    }
  }

  function onStart(e: PointerEvent, index: number) {
    e.preventDefault();
    activeHandle = index;
    activePointerId = e.pointerId;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onEnd);
    target.addEventListener('pointercancel', onEnd);

    magnifier.classList.remove('hidden');
    updateMagnifier(e, canvas, pages[currentPageIndex].originalImage, magnifier, magnifierCanvas, mCtx, activeHandle);
  }

  function onMove(e: PointerEvent) {
    if (activeHandle === null || currentPageIndex === -1) return;
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    e.preventDefault();

    const page = pages[currentPageIndex];
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);

    page.corners[activeHandle] = {
      x: Math.max(0, Math.min(canvas.width, x)),
      y: Math.max(0, Math.min(canvas.height, y)),
    };

    updateEditor();
    updateMagnifier(e, canvas, page.originalImage, magnifier, magnifierCanvas, mCtx, activeHandle);
  }

  function onEnd(e: PointerEvent) {
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    const target = e.currentTarget as HTMLElement;
    target.removeEventListener('pointermove', onMove);
    target.removeEventListener('pointerup', onEnd);
    target.removeEventListener('pointercancel', onEnd);
    activeHandle = null;
    activePointerId = null;
    magnifier.classList.add('hidden');
  }

  function warpImage() {
    const page = pages[currentPageIndex];
    if (!page) return;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = page.originalImage.width;
    tempCanvas.height = page.originalImage.height;
    const tCtx = tempCanvas.getContext('2d')!;
    tCtx.drawImage(page.originalImage, 0, 0);

    const outCanvas = warp(tempCanvas, page.corners);

    page.processedCanvas.width = outCanvas.width;
    page.processedCanvas.height = outCanvas.height;
    const pCtx = page.processedCanvas.getContext('2d')!;
    pCtx.drawImage(outCanvas, 0, 0);

    renderPageList();
    enterFilterMode();
  }

  function applyFilters() {
    const page = pages[currentPageIndex];
    if (!page) return;

    const filter = filterSelect.value as any;
    page.filter = filter;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = page.originalImage.width;
    tempCanvas.height = page.originalImage.height;
    const tCtx = tempCanvas.getContext('2d')!;
    tCtx.drawImage(page.originalImage, 0, 0);

    const warpedCanvas = warp(tempCanvas, page.corners);
    applyFiltersUtil(warpedCanvas, canvas, ctx, filter);

    page.processedCanvas.width = canvas.width;
    page.processedCanvas.height = canvas.height;
    const pCtx = page.processedCanvas.getContext('2d')!;
    pCtx.drawImage(canvas, 0, 0);

    const card = pageList.querySelector(`[data-index="${currentPageIndex}"]`);
    if (card) {
      const img = card.querySelector('img');
      if (img) img.src = page.processedCanvas.toDataURL('image/jpeg', 0.5);
    }
  }

  btnApplyPerspective.addEventListener('click', warpImage);
  btnModePerspective.addEventListener('click', enterPerspectiveMode);
  btnModeFilter.addEventListener('click', enterFilterMode);
  filterSelect.addEventListener('change', applyFilters);

  btnReset.addEventListener('click', () => {
    stopCamera();
    pages = [];
    currentPageIndex = -1;
    captureContainer.classList.remove('hidden');
    editorContainer.classList.add('hidden');
    dropzoneContainer.classList.remove('hidden');
    cornerHandles.innerHTML = '';
    pageList.innerHTML = '';
    startCamera();
  });

  btnDownload.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = `scanned-page-${currentPageIndex + 1}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  });

  btnDownloadPdf.addEventListener('click', () => generateAndDownloadPDF(pages));

  if (payload?.sharedFiles?.length) {
    Array.from(payload.sharedFiles).forEach(handleFile);
  } else {
    startCamera();
  }

  const resizeObserver = new ResizeObserver(() => {
    if (currentPageIndex !== -1) updateEditor();
  });
  resizeObserver.observe(editorContainer);

  return () => {
    stopCamera();
    resizeObserver.disconnect();
    sortable.destroy();
  };
}
