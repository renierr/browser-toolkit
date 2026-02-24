import type { SharedFilesPayload } from '../../js/share-target';
import { warp, type Point } from './utils/perspective';
import { applyFilters as applyFiltersUtil } from './utils/filters';
import {
  startCamera as startCameraUtil,
  stopCamera as stopCameraUtil,
  isTorchSupported,
  toggleTorch,
  capturePhoto,
} from './utils/camera';
import {
  detectCornersOnImage,
  calculateLiveDetection,
  releaseBuffers,
  isStable,
  resetDetectionHistory,
} from './utils/detection';
import { setupFileDropzone } from '../../js/file-utils.ts';
import {
  drawLiveOverlay,
  drawPerspectiveOverlay,
  updateCornerHandles,
  updateMagnifier,
  renderPageList as renderPageListUtil,
  calculateSmoothedPosition,
  constrainPoint,
} from './utils/ui';
import { startLevelSensor } from './utils/sensors';
import { generateAndDownloadPDF } from './utils/pdf';
import { sourceToCanvas } from './utils/canvas';
import type { ScannedPage } from './types';
import Sortable from 'sortablejs';
import { copyCanvasToClipboard, downloadCanvasAsImage } from '../../js/utils.ts';

// noinspection JSUnusedGlobalSymbols
export default function init(payload?: SharedFilesPayload) {
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

  // Nudge controls
  const nudgeControls = document.getElementById('nudge-controls')!;
  const btnNudgeUp = document.getElementById('btn-nudge-up')!;
  const btnNudgeDown = document.getElementById('btn-nudge-down')!;
  const btnNudgeLeft = document.getElementById('btn-nudge-left')!;
  const btnNudgeRight = document.getElementById('btn-nudge-right')!;

  // Auto-snap countdown
  const autoSnapCountdown = document.getElementById('auto-snap-countdown')!;
  const autoSnapNumber = document.getElementById('auto-snap-number')!;

  let stream: MediaStream | null = null;
  let currentFacingMode: 'user' | 'environment' = 'environment';
  let isPortrait = false;
  let pages: ScannedPage[] = [];
  let currentPageIndex: number = -1;
  let activeHandle: number | null = null;
  let isEdgeDragging = false;
  let selectedHandle: number | null = null;
  let activePointerId: number | null = null;
  let isFilterMode = false;
  let stopLevelSensor: (() => void) | null = null;
  let isFlashOn = false;
  let isDebugMode = false;

  // --- Camera Logic ---

  const cameraOverlay = document.getElementById('camera-overlay') as HTMLCanvasElement;
  const detectionCanvas = document.createElement('canvas');
  const dCtx = detectionCanvas.getContext('2d', { willReadFrequently: true })!;
  let detectionFrameId: number | null = null;
  let detectionFrameCounter = 0;
  let stableCount = 0;
  let lastResult: Point[] | null = null;

  // Display-side interpolation: smoothly animate overlay corners
  let displayCorners: Point[] | null = null;
  let targetCorners: Point[] | null = null;
  let targetColor = '#00FF00';
  const LERP_SPEED = 0.25; // 0-1, lower = smoother but laggier

  // Auto-snap countdown state
  let countdownValue = 0; // 0 = not counting, 3/2/1 = active countdown
  let countdownTimerId: ReturnType<typeof setInterval> | null = null;
  // Frames of stability needed before countdown starts (~3s at ~15fps detection rate)
  const STABLE_FRAMES_BEFORE_COUNTDOWN = 45;

  function lerpPoint(a: Point, b: Point, t: number): Point {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  function startCountdown() {
    if (countdownTimerId) return; // already running
    countdownValue = 3;
    autoSnapCountdown.classList.remove('hidden');
    autoSnapNumber.textContent = '3';

    countdownTimerId = setInterval(() => {
      countdownValue--;
      if (countdownValue > 0) {
        autoSnapNumber.textContent = String(countdownValue);
      } else {
        cancelCountdown();
        handleAutoCapture();
      }
    }, 1000);
  }

  function cancelCountdown() {
    if (countdownTimerId) {
      clearInterval(countdownTimerId);
      countdownTimerId = null;
    }
    countdownValue = 0;
    autoSnapCountdown.classList.add('hidden');
    autoSnapNumber.textContent = '';
  }

  async function startCamera() {
    btnStartScan.classList.add('hidden');
    cameraView.classList.remove('hidden');
    cameraControls.classList.remove('hidden');

    stream = await startCameraUtil(video, currentFacingMode, stream, isPortrait);

    isTorchSupported(stream).then((supported) => {
      if (supported) {
        btnFlash.classList.remove('hidden');
        isFlashOn = false;
        updateFlashButton();
      } else {
        btnFlash.classList.add('hidden');
      }
    });

    if (checkLiveDetection.checked) {
      startLiveDetection();
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
    stopLiveDetection();
    if (stopLevelSensor) {
      stopLevelSensor();
      stopLevelSensor = null;
    }
    levelIndicator.classList.add('opacity-0');
    isFlashOn = false;
    updateFlashButton();
  }

  function handleAutoCapture() {
    cancelCountdown();
    stableCount = 0;
    btnCapture.click();
  }

  function startLiveDetection() {
    if (detectionFrameId) return; // Already running

    let detectingInProgress = false;

    const loop = () => {
      // 1. Check if we should stop
      if (video.paused || video.ended || !checkLiveDetection.checked) {
        stopLiveDetection();
        return;
      }

      // --- Display-side interpolation: run every frame for smooth overlay ---
      if (targetCorners && displayCorners) {
        displayCorners = displayCorners.map((dp, i) =>
          lerpPoint(dp, targetCorners![i], LERP_SPEED)
        );
        drawLiveOverlay(cameraOverlay, displayCorners, targetColor);
      } else if (targetCorners && !displayCorners) {
        // First detection — snap immediately
        displayCorners = targetCorners.map((p) => ({ ...p }));
        drawLiveOverlay(cameraOverlay, displayCorners, targetColor);
      }

      // --- Detection: throttle to every 4th frame (~15fps on 60fps) ---
      detectionFrameCounter++;
      if (detectionFrameCounter % 4 === 0 && !detectingInProgress) {
        detectingInProgress = true;

        calculateLiveDetection(
          video,
          detectionCanvas,
          dCtx,
          cameraOverlay,
          isDebugMode
        ).then((result) => {
          detectingInProgress = false;

          // result is null when worker detection is still in-flight (frame skipped)
          if (result === null) return;

          if (isDebugMode) {
            console.log(
              `[Scanner Debug] Frame ${detectionFrameCounter} | Stable: ${stableCount} | Countdown: ${countdownValue} | Found: ${result?.upscaled ? 'yes' : 'no'}`
            );
          }

          if (result.upscaled) {
            // Update the interpolation target (display loop smoothly animates to it)
            targetCorners = result.upscaled;

            // Check stability
            if (isStable(lastResult, result.lastDetectedCorners)) {
              stableCount++;
            } else {
              stableCount = 0;
              cancelCountdown();
            }
            lastResult = result.lastDetectedCorners;

            // Color: green = detected, gold = stable/hold still
            targetColor = stableCount > 6 ? '#FFD700' : '#00FF00';

            // Auto-snap: start 3-2-1 countdown after sustained stability
            if (!isDebugMode && stableCount >= STABLE_FRAMES_BEFORE_COUNTDOWN && !countdownTimerId) {
              startCountdown();
            }
          } else {
            // Lost detection — clear overlay and cancel countdown
            targetCorners = null;
            displayCorners = null;
            const oCtx = cameraOverlay.getContext('2d');
            if (oCtx) oCtx.clearRect(0, 0, cameraOverlay.width, cameraOverlay.height);
            stableCount = 0;
            lastResult = null;
            cancelCountdown();
          }
        }).catch(() => {
          detectingInProgress = false;
        });
      }

      // Schedule next frame
      detectionFrameId = requestAnimationFrame(loop);
    };

    detectionFrameId = requestAnimationFrame(loop);
  }

  function stopLiveDetection() {
    if (detectionFrameId) {
      cancelAnimationFrame(detectionFrameId);
      detectionFrameId = null;
    }
    resetDetectionHistory();
    cancelCountdown();
    targetCorners = null;
    displayCorners = null;
    stableCount = 0;
    lastResult = null;
    const oCtx = cameraOverlay.getContext('2d');
    if (oCtx) oCtx.clearRect(0, 0, cameraOverlay.width, cameraOverlay.height);
  }

  checkLiveDetection.addEventListener('change', () => {
    if (checkLiveDetection.checked) {
      startLiveDetection();
    } else {
      stopLiveDetection();
    }
  });

  checkLiveDebug.addEventListener('change', () => {
    isDebugMode = checkLiveDebug.checked;
    if (isDebugMode) {
      if (debugView) debugView.classList.remove('hidden');
    } else {
      if (debugView) debugView.classList.add('hidden');
    }
  });

  btnCapture.addEventListener('click', async () => {
    const liveCorners = lastResult; // Save the last detected corners from video coordinates
    const blob = await capturePhoto(video, stream);

    if (blob) {
      const img = new Image();
      img.src = URL.createObjectURL(blob);
      img.onload = async () => {
        let corners: Point[] | null = null;
        if (liveCorners) {
          const vAspect = video.videoWidth / video.videoHeight;
          const iAspect = img.width / img.height;

          // Map normalized video coordinates to photo coordinates
          // accounting for how the browser might have cropped the video stream
          corners = liveCorners.map((p) => {
            let nx = p.x;
            let ny = p.y;

            if (Math.abs(vAspect - iAspect) > 0.01) {
              if (vAspect > iAspect) {
                const scale = iAspect / vAspect;
                ny = (ny - 0.5) * scale + 0.5;
              } else {
                const scale = vAspect / iAspect;
                nx = (nx - 0.5) * scale + 0.5;
              }
            }

            return { x: nx * img.width, y: ny * img.height };
          });
        }

        if (!corners) {
          corners = await detectCornersOnImage(img);
        }

        addPage(img, corners);
      };
    }
  });

  btnSwitch.addEventListener('click', async () => {
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    await startCamera();
  });

  btnRotate.addEventListener('click', async () => {
    isPortrait = !isPortrait;
    await startCamera();
  });

  function updateFlashButton() {
    if (isFlashOn) {
      btnFlash.classList.add('text-yellow-400');
      btnFlash.classList.remove('text-base-content');
    } else {
      btnFlash.classList.remove('text-yellow-400');
      btnFlash.classList.add('text-base-content');
    }
  }

  btnFlash.addEventListener('click', async () => {
    isFlashOn = !isFlashOn;
    await toggleTorch(stream, isFlashOn);
    updateFlashButton();
  });

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

    const newPage: ScannedPage = {
      id: crypto.randomUUID(),
      originalImage: img,
      processedCanvas: pCanvas,
      corners: initialCorners,
      filter: 'none',
    };

    pages.push(newPage);
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

  btnAddPage.addEventListener('click', async () => {
    captureContainer.classList.remove('hidden');
    editorContainer.classList.add('hidden');
    dropzoneContainer.classList.remove('hidden');
    cameraView.classList.add('hidden');
    cameraControls.classList.add('hidden');
    btnStartScan.classList.remove('hidden');
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
    selectedHandle = null;

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

      // Update handle selection state
      const handles = cornerHandles.querySelectorAll('.corner-handle');
      handles.forEach((h, i) => {
        if (i === selectedHandle) {
          h.classList.add('selected');
        } else {
          h.classList.remove('selected');
        }
      });
    } else {
      applyFilters();
    }
  }

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let smoothedX = 0;
  let smoothedY = 0;
  const smoothingFactor = 0.4; // 1.0 = no smoothing, 0.1 = heavy smoothing

  function onStart(e: PointerEvent, index: number, isEdge: boolean = false) {
    e.preventDefault();
    activeHandle = index;
    isEdgeDragging = isEdge;
    if (!isEdge) selectedHandle = index;
    activePointerId = e.pointerId;

    isDragging = false;
    startX = e.clientX;
    startY = e.clientY;

    const rect = canvas.getBoundingClientRect();
    smoothedX = (e.clientX - rect.left) * (canvas.width / rect.width);
    smoothedY = (e.clientY - rect.top) * (canvas.height / rect.height);

    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onEnd);
    target.addEventListener('pointercancel', onEnd);

    magnifier.classList.remove('hidden');

    const page = pages[currentPageIndex];
    let magPoint: Point;
    if (isEdge) {
      const p1 = page.corners[index];
      const p2 = page.corners[(index + 1) % 4];
      magPoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    } else {
      magPoint = page.corners[index];
    }

    updateMagnifier(canvas, page.originalImage, magnifier, magnifierCanvas, mCtx, magPoint);
    updateEditor();
  }

  function onMove(e: PointerEvent) {
    if (activeHandle === null || currentPageIndex === -1) return;
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    e.preventDefault();

    if (!isDragging) {
      const dist = Math.sqrt(Math.pow(e.clientX - startX, 2) + Math.pow(e.clientY - startY, 2));
      if (dist > 3) {
        isDragging = true;
      } else {
        return;
      }
    }

    const page = pages[currentPageIndex];
    const rect = canvas.getBoundingClientRect();
    const targetX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const targetY = (e.clientY - rect.top) * (canvas.height / rect.height);

    const smoothed = calculateSmoothedPosition(
      targetX,
      targetY,
      smoothedX,
      smoothedY,
      smoothingFactor
    );

    const dx = smoothed.x - smoothedX;
    const dy = smoothed.y - smoothedY;

    smoothedX = smoothed.x;
    smoothedY = smoothed.y;

    if (isEdgeDragging) {
      const i1 = activeHandle;
      const i2 = (activeHandle + 1) % 4;

      // Edge 0 (TL→TR) = top, Edge 2 (BR→BL) = bottom → move Y only
      // Edge 1 (TR→BR) = right, Edge 3 (BL→TL) = left → move X only
      const isHorizontalEdge = activeHandle === 0 || activeHandle === 2;
      const constrainedDx = isHorizontalEdge ? 0 : dx;
      const constrainedDy = isHorizontalEdge ? dy : 0;

      page.corners[i1] = constrainPoint(
        page.corners[i1].x + constrainedDx,
        page.corners[i1].y + constrainedDy,
        canvas.width,
        canvas.height
      );
      page.corners[i2] = constrainPoint(
        page.corners[i2].x + constrainedDx,
        page.corners[i2].y + constrainedDy,
        canvas.width,
        canvas.height
      );
    } else {
      let newX = smoothedX;
      let newY = smoothedY;

      if (e.pointerType === 'touch' || e.pointerType === 'pen') {
        const touchOffset = 60 * (canvas.height / rect.height);
        newY = smoothedY - touchOffset;
      }

      page.corners[activeHandle] = constrainPoint(newX, newY, canvas.width, canvas.height);
    }

    updateEditor();

    let magPoint: Point;
    if (isEdgeDragging) {
      const p1 = page.corners[activeHandle];
      const p2 = page.corners[(activeHandle + 1) % 4];
      magPoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    } else {
      magPoint = page.corners[activeHandle];
    }

    updateMagnifier(canvas, page.originalImage, magnifier, magnifierCanvas, mCtx, magPoint);
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

  function nudgeSelectedHandle(dx: number, dy: number) {
    if (selectedHandle === null || currentPageIndex === -1) return;
    const page = pages[currentPageIndex];
    const corner = page.corners[selectedHandle];

    const nudgeAmount = 2;
    const newX = corner.x + dx * nudgeAmount;
    const newY = corner.y + dy * nudgeAmount;

    page.corners[selectedHandle] = constrainPoint(newX, newY, canvas.width, canvas.height);
    updateEditor();
  }

  btnNudgeUp.addEventListener('click', () => nudgeSelectedHandle(0, -1));
  btnNudgeDown.addEventListener('click', () => nudgeSelectedHandle(0, 1));
  btnNudgeLeft.addEventListener('click', () => nudgeSelectedHandle(-1, 0));
  btnNudgeRight.addEventListener('click', () => nudgeSelectedHandle(1, 0));

  function warpImage() {
    const page = pages[currentPageIndex];
    if (!page) return;

    const outCanvas = warp(page.originalImage, page.corners);
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

    const warpedCanvas = warp(page.originalImage, page.corners);
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

  btnReset.addEventListener('click', async () => {
    if (
      pages.length === 0 ||
      confirm('Are you sure you want to start over? All changes will be lost.')
    ) {
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

  btnStartScan.addEventListener('click', startCamera);

  btnStopScan.addEventListener('click', () => {
    stopCamera();
    btnStartScan.classList.remove('hidden');
  });

  if (payload?.sharedFiles?.length) {
    Array.from(payload.sharedFiles).forEach(handleFile);
  }

  const resizeObserver = new ResizeObserver(() => {
    if (currentPageIndex !== -1) updateEditor();
  });
  resizeObserver.observe(editorContainer);

  return () => {
    releaseBuffers();
    stopCamera();
    resizeObserver.disconnect();
    sortable.destroy();
  };
}
