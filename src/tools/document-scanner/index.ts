import type { SharedFilesPayload } from '../../js/share-target';
import { warp, type Point } from './utils/perspective';
import { applyFilters as applyFiltersUtil } from './utils/filters';
import {
  startCamera as startCameraUtil,
  stopCamera as stopCameraUtil,
  isTorchSupported,
  toggleTorch,
  capturePhoto,
  switchToNextCamera,
} from './utils/camera';
import { detectCornersOnImage, releaseBuffers } from './utils/detection';
import { setupFileDropzone } from '../../js/file-utils.ts';
import {
  drawPerspectiveOverlay,
  updateCornerHandles,
  renderPageList as renderPageListUtil,
} from './utils/ui';
import { startLevelSensor } from './utils/sensors';
import { generateAndDownloadPDF } from './utils/pdf';
import { sourceToCanvas } from './utils/canvas';
import type { ScannedPage } from './types';
import Sortable from 'sortablejs';
import { copyCanvasToClipboard, downloadCanvasAsImage } from '../../js/utils.ts';
import { createLiveDetectionLoop } from './utils/live-detection-loop';
import { createHandleDrag } from './utils/handle-drag';

// noinspection JSUnusedGlobalSymbols
export default function init(payload?: SharedFilesPayload) {
  // --- DOM Elements ---

  const video = document.getElementById('video') as HTMLVideoElement;
  const btnStartScan = document.getElementById('btn-start-scan')!;
  const btnStopScan = document.getElementById('btn-stop-scan')!;
  const cameraView = document.getElementById('camera-view')!;
  const captureContainer = document.getElementById('capture-container')!;
  const cameraControls = document.getElementById('camera-controls-sticky')!;
  const editorContainer = document.getElementById('editor-container')!;
  const canvas = document.getElementById('editor-canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const cornerHandles = document.getElementById('corner-handles')!;
  const filterControls = document.getElementById('filter-controls')!;
  const perspectiveActions = document.getElementById('perspective-actions')!;
  const btnCapture = document.getElementById('btn-capture')!;
  const btnSwitch = document.getElementById('btn-switch-camera')!;
  const btnFlash = document.getElementById('btn-flash')!;
  const btnRotate = document.getElementById('btn-rotate-view')!;
  const btnReset = document.getElementById('btn-reset')!;
  const btnDownload = document.getElementById('btn-download')!;
  const btnDownloadPdf = document.getElementById('btn-download-pdf')!;
  const btnImageClipboard = document.getElementById('btn-clipboard')!;
  const btnAddPage = document.getElementById('btn-add-page')!;
  const btnApplyPerspective = document.getElementById('btn-apply-perspective')!;
  const btnModePerspective = document.getElementById('btn-mode-perspective')!;
  const btnModeFilter = document.getElementById('btn-mode-filter')!;
  const filterSelect = document.getElementById('filter-select') as HTMLSelectElement;
  const hintText = document.getElementById('hint-text')!;
  const checkLiveDetection = document.getElementById('check-live-detection') as HTMLInputElement;
  const debugView = document.getElementById('debug-view')!;
  const checkLiveDebug = document.getElementById('check-live-debug') as HTMLInputElement;
  const levelIndicator = document.getElementById('level-indicator')!;
  const levelDot = document.getElementById('level-dot')!;
  const pageList = document.getElementById('page-list')!;
  const dropzoneContainer = document.getElementById('dropzone-container')!;
  const magnifier = document.getElementById('magnifier')!;
  const magnifierCanvas = document.getElementById('magnifier-canvas') as HTMLCanvasElement;
  const mCtx = magnifierCanvas.getContext('2d')!;
  const nudgeControls = document.getElementById('nudge-controls')!;
  const btnNudgeUp = document.getElementById('btn-nudge-up')!;
  const btnNudgeDown = document.getElementById('btn-nudge-down')!;
  const btnNudgeLeft = document.getElementById('btn-nudge-left')!;
  const btnNudgeRight = document.getElementById('btn-nudge-right')!;
  const autoSnapCountdown = document.getElementById('auto-snap-countdown')!;
  const autoSnapNumber = document.getElementById('auto-snap-number')!;
  const cameraOverlay = document.getElementById('camera-overlay') as HTMLCanvasElement;

  // --- State ---

  let stream: MediaStream | null = null;
  let currentFacingMode: 'user' | 'environment' = 'environment';
  let isPortrait = false;
  let pages: ScannedPage[] = [];
  let currentPageIndex: number = -1;
  let isFilterMode = false;
  let stopLevelSensor: (() => void) | null = null;
  let isFlashOn = false;
  let isDebugMode = false;

  // Live detection canvas (offscreen, used for downscaled detection input)
  const detectionCanvas = document.createElement('canvas');
  const dCtx = detectionCanvas.getContext('2d', { willReadFrequently: true })!;

  // --- Handle Drag Setup ---

  const getPage = () => pages[currentPageIndex];
  const handleDrag = createHandleDrag({
    canvas, magnifier, magnifierCanvas, mCtx,
    getPage,
    updateEditor,
  });

  // --- Live Detection Setup ---

  const liveDetection = createLiveDetectionLoop({
    video, detectionCanvas, dCtx, cameraOverlay, checkLiveDetection,
    autoSnapCountdown, autoSnapNumber,
    isDebugMode: () => isDebugMode,
    onAutoCapture: () => { btnCapture.click(); },
  });

  // --- Camera ---

  async function checkAndUpdateTorch() {
    if (!stream) {
      btnFlash.classList.add('hidden');
      return;
    }
    isFlashOn = false;
    updateFlashButton();
    const supported = await isTorchSupported(stream);
    if (supported) {
      btnFlash.classList.remove('hidden');
    } else {
      btnFlash.classList.add('hidden');
    }
  }

  async function startCamera() {
    btnStartScan.classList.add('hidden');
    cameraView.classList.remove('hidden');
    cameraControls.classList.remove('hidden');

    stream = await startCameraUtil(video, currentFacingMode, stream, isPortrait);

    // Fire-and-forget: torch check has retries/delays, don't block camera start
    // noinspection ES6MissingAwait
    checkAndUpdateTorch();

    if (checkLiveDetection.checked) {
      liveDetection.start();
    }
    stopLevelSensor = startLevelSensor(
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
    cameraView.classList.add('hidden');
    cameraControls.classList.add('hidden');
    stream = stopCameraUtil(stream);
    liveDetection.stop();
    if (stopLevelSensor) {
      stopLevelSensor();
      stopLevelSensor = null;
    }
    levelIndicator.classList.add('opacity-0');
    isFlashOn = false;
    updateFlashButton();
  }

  function updateFlashButton() {
    if (isFlashOn) {
      btnFlash.classList.add('text-yellow-400');
      btnFlash.classList.remove('text-base-content');
    } else {
      btnFlash.classList.remove('text-yellow-400');
      btnFlash.classList.add('text-base-content');
    }
  }

  // --- Page Management ---

  async function addPage(img: HTMLImageElement, detectedCorners: Point[] | null = null) {
    const pCanvas = sourceToCanvas(img);

    let initialCorners: Point[];
    if (detectedCorners) {
      initialCorners = detectedCorners;
    } else {
      const detected = await detectCornersOnImage(img);
      initialCorners = detected || [
        { x: 0, y: 0 },
        { x: img.width, y: 0 },
        { x: img.width, y: img.height },
        { x: 0, y: img.height },
      ];
    }

    pages.push({
      id: crypto.randomUUID(),
      originalImage: img,
      processedCanvas: pCanvas,
      corners: initialCorners,
      filter: 'none',
    });
    currentPageIndex = pages.length - 1;

    stopCamera();
    captureContainer.classList.add('hidden');
    dropzoneContainer.classList.add('hidden');
    editorContainer.classList.remove('hidden');

    renderPageList();
    enterPerspectiveMode();
  }

  function renderPageList() {
    renderPageListUtil(pageList, pages, currentPageIndex, (index) => {
      currentPageIndex = index;
      renderPageList();
      enterFilterMode();
    });
  }

  // --- Editor Modes ---

  function enterPerspectiveMode() {
    isFilterMode = false;
    btnModePerspective.classList.add('btn-active');
    btnModeFilter.classList.remove('btn-active');
    filterControls.classList.add('hidden');
    perspectiveActions.classList.remove('hidden');
    nudgeControls.classList.remove('hidden');
    hintText.textContent = 'Drag the corners to match the document boundaries.';
    updateEditor();
  }

  function enterFilterMode() {
    isFilterMode = true;
    btnModePerspective.classList.remove('btn-active');
    btnModeFilter.classList.add('btn-active');
    filterControls.classList.remove('hidden');
    perspectiveActions.classList.add('hidden');
    nudgeControls.classList.add('hidden');
    hintText.textContent = 'Choose a filter to enhance your document.';
    cornerHandles.innerHTML = '';
    handleDrag.clearSelectedHandle();

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
      updateCornerHandles(cornerHandles, page.corners, canvas, handleDrag.onStart);

      const handles = cornerHandles.querySelectorAll('.corner-handle');
      const selected = handleDrag.getSelectedHandle();
      handles.forEach((h, i) => {
        h.classList.toggle('selected', i === selected);
      });
    } else {
      applyFilters();
    }
  }

  function warpImage() {
    const page = pages[currentPageIndex];
    if (!page) return;

    const outCanvas = warp(page.originalImage, page.corners);
    page.processedCanvas.width = outCanvas.width;
    page.processedCanvas.height = outCanvas.height;
    page.processedCanvas.getContext('2d')!.drawImage(outCanvas, 0, 0);

    renderPageList();
    enterFilterMode();
  }

  function applyFilters() {
    const page = pages[currentPageIndex];
    if (!page) return;

    const filter = filterSelect.value as any;
    page.filter = filter;

    const warpedCanvas = warp(page.originalImage, page.corners);
    applyFiltersUtil(warpedCanvas, canvas, ctx, filter);

    page.processedCanvas.width = canvas.width;
    page.processedCanvas.height = canvas.height;
    page.processedCanvas.getContext('2d')!.drawImage(canvas, 0, 0);

    const card = pageList.querySelector(`[data-index="${currentPageIndex}"]`);
    if (card) {
      const img = card.querySelector('img');
      if (img) img.src = page.processedCanvas.toDataURL('image/jpeg', 0.5);
    }
  }

  // --- File Handling ---

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

  // --- Event Listeners ---

  btnStartScan.addEventListener('click', startCamera);

  btnStopScan.addEventListener('click', () => {
    stopCamera();
    btnStartScan.classList.remove('hidden');
  });

  btnCapture.addEventListener('click', async () => {
    const liveCorners = liveDetection.getLastDetectedCorners();
    const blob = await capturePhoto(video, stream);

    if (blob) {
      const img = new Image();
      img.src = URL.createObjectURL(blob);
      img.onload = async () => {
        let corners: Point[] | null = null;
        if (liveCorners) {
          const vAspect = video.videoWidth / video.videoHeight;
          const iAspect = img.width / img.height;

          corners = liveCorners.map((p) => {
            let nx = p.x;
            let ny = p.y;

            if (Math.abs(vAspect - iAspect) > 0.01) {
              if (vAspect > iAspect) {
                ny = (ny - 0.5) * (iAspect / vAspect) + 0.5;
              } else {
                nx = (nx - 0.5) * (vAspect / iAspect) + 0.5;
              }
            }

            return { x: nx * img.width, y: ny * img.height };
          });
        }

        if (!corners) {
          corners = await detectCornersOnImage(img);
        }

        // noinspection ES6MissingAwait
        addPage(img, corners);
      };
    }
  });

  btnSwitch.addEventListener('click', async () => {
    // Cycle through all available camera lenses/devices
    const newStream = await switchToNextCamera(video, stream, isPortrait);
    if (newStream && newStream !== stream) {
      stream = newStream;
      // Re-check torch support for the new lens (fire-and-forget)
      // noinspection ES6MissingAwait
      checkAndUpdateTorch();
    }
  });

  btnRotate.addEventListener('click', async () => {
    isPortrait = !isPortrait;
    await startCamera();
  });

  btnFlash.addEventListener('click', async () => {
    isFlashOn = !isFlashOn;
    await toggleTorch(stream, isFlashOn);
    updateFlashButton();
  });

  checkLiveDetection.addEventListener('change', () => {
    if (checkLiveDetection.checked) {
      liveDetection.start();
    } else {
      liveDetection.stop();
    }
  });

  checkLiveDebug.addEventListener('change', () => {
    isDebugMode = checkLiveDebug.checked;
    debugView.classList.toggle('hidden', !isDebugMode);
  });

  btnApplyPerspective.addEventListener('click', warpImage);
  btnModePerspective.addEventListener('click', enterPerspectiveMode);
  btnModeFilter.addEventListener('click', enterFilterMode);
  filterSelect.addEventListener('change', applyFilters);

  btnNudgeUp.addEventListener('click', () => handleDrag.nudge(0, -1));
  btnNudgeDown.addEventListener('click', () => handleDrag.nudge(0, 1));
  btnNudgeLeft.addEventListener('click', () => handleDrag.nudge(-1, 0));
  btnNudgeRight.addEventListener('click', () => handleDrag.nudge(1, 0));

  btnAddPage.addEventListener('click', async () => {
    captureContainer.classList.remove('hidden');
    editorContainer.classList.add('hidden');
    dropzoneContainer.classList.remove('hidden');
    cameraView.classList.add('hidden');
    cameraControls.classList.add('hidden');
    btnStartScan.classList.remove('hidden');
  });

  btnReset.addEventListener('click', async () => {
    if (pages.length === 0 || confirm('Are you sure you want to start over? All changes will be lost.')) {
      stopCamera();
      pages = [];
      currentPageIndex = -1;
      captureContainer.classList.remove('hidden');
      editorContainer.classList.add('hidden');
      dropzoneContainer.classList.remove('hidden');
      btnStartScan.classList.remove('hidden');
      cornerHandles.innerHTML = '';
      pageList.innerHTML = '';
    }
  });

  btnDownload.addEventListener('click', async () => {
    enterFilterMode();
    await downloadCanvasAsImage(canvas, `scanned-page-${currentPageIndex + 1}.jpg`, 'jpg', 0.9);
  });

  btnDownloadPdf.addEventListener('click', () => generateAndDownloadPDF(pages));

  btnImageClipboard.addEventListener('click', async () => {
    enterFilterMode();
    await copyCanvasToClipboard(canvas, 'jpg', 0.9);
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
        enterFilterMode();
      }
    }
  });

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
    },
  });

  setupFileDropzone('dropzone', 'image-input', (files) => {
    Array.from(files).forEach(handleFile);
  });

  if (payload?.sharedFiles?.length) {
    Array.from(payload.sharedFiles).forEach(handleFile);
  }

  const resizeObserver = new ResizeObserver(() => {
    if (currentPageIndex !== -1) updateEditor();
  });
  resizeObserver.observe(editorContainer);

  // --- Cleanup ---

  return () => {
    releaseBuffers();
    liveDetection.destroy();
    handleDrag.destroy();
    stopCamera();
    resizeObserver.disconnect();
    sortable.destroy();
  };
}
