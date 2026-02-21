import type { SharedFilesPayload } from '../../js/share-target';
import { warp, type Point } from './utils/perspective';
import { applyFilters as applyFiltersUtil } from './utils/filters';
import { startCamera as startCameraUtil, stopCamera as stopCameraUtil } from './utils/camera';
import { detectDocumentCorners } from './utils/detection';
import { setupFileDropzone, downloadFile } from '../../js/file-utils.ts';
import { drawLiveOverlay, drawPerspectiveOverlay, updateCornerHandles } from './utils/ui';
import Sortable from 'sortablejs';
import mupdf from 'mupdf';
import { addImageToPDFDocument } from '../../js/mupdf-utils.ts';
import { showProgress, hideProgress, showMessage, yieldToUI } from '../../js/ui.ts';

interface ScannedPage {
  id: string;
  originalImage: HTMLImageElement;
  processedCanvas: HTMLCanvasElement;
  corners: Point[];
  filter: 'none' | 'grayscale' | 'b&w' | 'clean';
}

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
    startLevelSensor();
  }

  function stopCamera() {
    stream = stopCameraUtil(stream);
    stopLiveDetection();
    stopLevelSensor();
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

  // --- Level Sensor Logic ---

  function handleOrientation(event: DeviceOrientationEvent) {
    const beta = event.beta;
    const gamma = event.gamma;
    if (beta === null || gamma === null) return;

    levelIndicator.classList.remove('opacity-0');

    let xTilt = gamma;
    let yTilt = beta;

    if (!isPortrait) {
      xTilt = beta;
      yTilt = -gamma;
    }

    const maxTilt = 20;
    const xPerc = Math.max(-maxTilt, Math.min(maxTilt, xTilt)) / maxTilt;
    const yPerc = Math.max(-maxTilt, Math.min(maxTilt, yTilt)) / maxTilt;

    const xPos = xPerc * 40;
    const yPos = yPerc * 40;

    levelDot.style.transform = `translate(${xPos}px, ${yPos}px)`;

    if (Math.abs(xTilt) < 2 && Math.abs(yTilt) < 2) {
      levelDot.classList.replace('bg-primary', 'bg-success');
      levelDot.classList.add('scale-125');
    } else {
      levelDot.classList.replace('bg-success', 'bg-primary');
      levelDot.classList.remove('scale-125');
    }
  }

  function startLevelSensor() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      (DeviceOrientationEvent as any).requestPermission()
        .then((response: string) => {
          if (response === 'granted') {
            window.addEventListener('deviceorientation', handleOrientation);
          }
        });
    } else {
      window.addEventListener('deviceorientation', handleOrientation);
    }
  }

  function stopLevelSensor() {
    window.removeEventListener('deviceorientation', handleOrientation);
    levelIndicator.classList.add('opacity-0');
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
      // Default to whole image if no edges found
      const defaultCorners = [
        { x: 0, y: 0 },
        { x: img.width, y: 0 },
        { x: img.width, y: img.height },
        { x: 0, y: img.height },
      ];

      const tempCanvas = document.createElement('canvas');
      const scale = Math.min(1, 800 / Math.max(img.width, img.height));
      tempCanvas.width = img.width * scale;
      tempCanvas.height = img.height * scale;
      const tCtx = tempCanvas.getContext('2d')!;
      tCtx.drawImage(img, 0, 0, tempCanvas.width, tempCanvas.height);
      const detected = detectDocumentCorners(tempCanvas);

      initialCorners = detected?.map(p => ({
        x: (p.x / tempCanvas.width) * img.width,
        y: (p.y / tempCanvas.height) * img.height
      })) || defaultCorners;
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
    pageList.innerHTML = '';
    pages.forEach((page, index) => {
      const card = document.createElement('div');
      card.className = `page-card relative group aspect-[3/4] bg-base-100 rounded-lg overflow-hidden border-2 cursor-pointer touch-none ${
        index === currentPageIndex ? 'active border-primary ring-2 ring-primary/20' : 'border-base-300'
      }`;
      card.dataset.index = index.toString();

      const thumb = document.createElement('img');
      thumb.src = page.processedCanvas.toDataURL('image/jpeg', 0.5);
      thumb.className = 'w-full h-full object-contain pointer-events-none bg-white';

      card.innerHTML = `
        <div class="absolute top-1 right-1 z-10">
          <button class="btn btn-circle btn-error btn-xs btn-remove-page" data-index="${index}">
            <i data-lucide="x" class="w-3 h-3"></i>
          </button>
        </div>
        <div class="absolute bottom-1 right-1 bg-base-300/90 px-1.5 rounded text-[10px] font-bold z-10">
          ${index + 1}
        </div>
      `;
      card.prepend(thumb);

      card.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.btn-remove-page')) return;
        currentPageIndex = index;
        renderPageList();
        enterPerspectiveMode();
      });

      pageList.appendChild(card);
    });

    (window as any).lucide?.createIcons();
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
    updateMagnifier(e);
  }

  function updateMagnifier(e: PointerEvent) {
    if (activeHandle === null || currentPageIndex === -1) return;
    const page = pages[currentPageIndex];
    const rect = canvas.getBoundingClientRect();

    // Calculate position on canvas
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);

    // Position magnifier above the finger/cursor
    const magSize = 128;
    const zoom = 2;
    magnifier.style.left = `${e.clientX - rect.left}px`;
    magnifier.style.top = `${e.clientY - rect.top - magSize}px`;

    magnifierCanvas.width = magSize;
    magnifierCanvas.height = magSize;

    mCtx.clearRect(0, 0, magSize, magSize);
    mCtx.drawImage(
      page.originalImage,
      x - (magSize / 2) / zoom,
      y - (magSize / 2) / zoom,
      magSize / zoom,
      magSize / zoom,
      0, 0, magSize, magSize
    );
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
    updateMagnifier(e);
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

  // --- Filtering Logic ---

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

  // --- Event Listeners ---

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

  btnDownloadPdf.addEventListener('click', async () => {
    if (pages.length === 0) return;

    showProgress('Generating PDF...');
    const pdfDoc = new mupdf.PDFDocument();

    try {
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        showProgress(`Processing page ${i + 1} of ${pages.length}...`);
        await yieldToUI();

        const imgData = page.processedCanvas.toDataURL('image/jpeg', 0.9);
        const response = await fetch(imgData);
        const imageBytes = await response.arrayBuffer();

        addImageToPDFDocument(pdfDoc, `Page_${i}`, new Uint8Array(imageBytes));
      }

      const pdfBytes = pdfDoc.saveToBuffer('compress,compress-images,garbage');
      await downloadFile(pdfBytes.asUint8Array(), `scanned-doc-${Date.now()}.pdf`, 'application/pdf');

      showMessage('PDF created successfully!', { type: 'info', timeoutMs: 5000 });
    } catch (error) {
      console.error('Failed to generate PDF', error);
      showMessage('Failed to generate PDF.', { type: 'alert' });
    } finally {
      pdfDoc.destroy();
      hideProgress();
    }
  });

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
