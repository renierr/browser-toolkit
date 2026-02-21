import type { SharedFilesPayload } from '../../js/share-target';
import { warp, type Point } from './utils/perspective';
import { applyFilters as applyFiltersUtil } from './utils/filters';
import { startCamera as startCameraUtil, stopCamera as stopCameraUtil } from './utils/camera';
import { detectDocumentCorners } from './utils/detection';
import { setupFileDropzone } from '../../js/file-utils.ts';
import { drawLiveOverlay, drawPerspectiveOverlay, updateCornerHandles } from './utils/ui';

// noinspection JSUnusedGlobalSymbols
export default function init(payload?: SharedFilesPayload) {
  const video = document.getElementById('video') as HTMLVideoElement;
  const captureContainer = document.getElementById('capture-container')!;
  const editorContainer = document.getElementById('editor-container')!;
  const canvas = document.getElementById('editor-canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const cornerHandles = document.getElementById('corner-handles')!;
  const filterControls = document.getElementById('filter-controls')!;
  const perspectiveActions = document.getElementById('perspective-actions')!;
  const btnCapture = document.getElementById('btn-capture')!;
  const btnSwitch = document.getElementById('btn-switch-camera')!;
  const btnReset = document.getElementById('btn-reset')!;
  const btnDownload = document.getElementById('btn-download')!;
  const btnApplyPerspective = document.getElementById('btn-apply-perspective')!;
  const btnModePerspective = document.getElementById('btn-mode-perspective')!;
  const btnModeFilter = document.getElementById('btn-mode-filter')!;
  const filterSelect = document.getElementById('filter-select') as HTMLSelectElement;
  const hintText = document.getElementById('hint-text')!;
  const checkLiveDetection = document.getElementById('check-live-detection') as HTMLInputElement;

  let stream: MediaStream | null = null;
  let currentFacingMode: 'user' | 'environment' = 'environment';
  let originalImage: HTMLImageElement | null = null;
  let corners: Point[] = [];
  let activeHandle: number | null = null;
  let activePointerId: number | null = null;
  let isFilterMode = false;

  // --- Camera Logic ---

  let detectionInterval: number | null = null;
  const cameraOverlay = document.getElementById('camera-overlay') as HTMLCanvasElement;
  const detectionCanvas = document.createElement('canvas');
  const dCtx = detectionCanvas.getContext('2d', { willReadFrequently: true })!;

  async function startCamera() {
    stream = await startCameraUtil(video, currentFacingMode, stream);
    startLiveDetection();
  }

  function stopCamera() {
    stream = stopCameraUtil(stream);
    stopLiveDetection();
  }

  function startLiveDetection() {
    if (detectionInterval) return;
    detectionInterval = window.setInterval(() => {
      if (video.paused || video.ended || !checkLiveDetection.checked) {
        const oCtx = cameraOverlay.getContext('2d');
        if (oCtx) oCtx.clearRect(0, 0, cameraOverlay.width, cameraOverlay.height);
        return;
      }

      const vWidth = video.videoWidth;
      const vHeight = video.videoHeight;
      const cWidth = video.clientWidth;
      const cHeight = video.clientHeight;
      if (!vWidth || !vHeight || !cWidth || !cHeight) return;

      // Calculate the visible crop (object-cover)
      const vAspect = vWidth / vHeight;
      const cAspect = cWidth / cHeight;

      let sWidth, sHeight, sx, sy;
      if (vAspect > cAspect) {
        sHeight = vHeight;
        sWidth = vHeight * cAspect;
        sx = (vWidth - sWidth) / 2;
        sy = 0;
      } else {
        sWidth = vWidth;
        sHeight = vWidth / cAspect;
        sx = 0;
        sy = (vHeight - sHeight) / 2;
      }

      // Downscale for detection performance
      const scale = Math.min(1, 300 / Math.max(sWidth, sHeight));
      const dWidth = Math.floor(sWidth * scale);
      const dHeight = Math.floor(sHeight * scale);

      if (detectionCanvas.width !== dWidth || detectionCanvas.height !== dHeight) {
        detectionCanvas.width = dWidth;
        detectionCanvas.height = dHeight;
      }

      // Draw ONLY the visible part of the video to the detection canvas
      dCtx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, dWidth, dHeight);

      const detected = detectDocumentCorners(detectionCanvas);

      // Upscale corners back to the visible container resolution
      const upscaled = detected?.map(p => ({
        x: p.x / scale,
        y: p.y / scale
      })) || null;

      // Ensure overlay canvas matches container size
      if (cameraOverlay.width !== cWidth || cameraOverlay.height !== cHeight) {
        cameraOverlay.width = cWidth;
        cameraOverlay.height = cHeight;
      }

      drawLiveOverlay(cameraOverlay, upscaled);
    }, 500);
  }

  function stopLiveDetection() {
    if (detectionInterval) {
      clearInterval(detectionInterval);
      detectionInterval = null;
    }
    const oCtx = cameraOverlay.getContext('2d');
    if (oCtx && cameraOverlay) oCtx.clearRect(0, 0, cameraOverlay.width, cameraOverlay.height);
  }

  btnCapture.addEventListener('click', () => {
    const vWidth = video.videoWidth;
    const vHeight = video.videoHeight;
    const cWidth = video.clientWidth;
    const cHeight = video.clientHeight;

    const vAspect = vWidth / vHeight;
    const cAspect = cWidth / cHeight;

    let sWidth, sHeight, sx, sy;

    if (vAspect > cAspect) {
      sHeight = vHeight;
      sWidth = vHeight * cAspect;
      sx = (vWidth - sWidth) / 2;
      sy = 0;
    } else {
      sWidth = vWidth;
      sHeight = vWidth / cAspect;
      sx = 0;
      sy = (vHeight - sHeight) / 2;
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = sWidth;
    tempCanvas.height = sHeight;
    const tCtx = tempCanvas.getContext('2d')!;
    tCtx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);

    const img = new Image();
    img.src = tempCanvas.toDataURL('image/png');
    img.onload = () => {
      loadCapturedImage(img);
    };
  });

  btnSwitch.addEventListener('click', () => {
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    startCamera();
  });

  // --- Image Loading ---

  function loadCapturedImage(img: HTMLImageElement) {
    originalImage = img;
    stopCamera();
    captureContainer.classList.add('hidden');
    editorContainer.classList.remove('hidden');
    const dropzone = document.getElementById('dropzone');
    if (dropzone) dropzone.classList.add('hidden');
    const divider = document.querySelector('.divider');
    if (divider) (divider as HTMLElement).style.display = 'none';

    // Initial corners (rectangle with margin)
    const margin = 0.1;
    const defaultCorners = [
      { x: img.width * margin, y: img.height * margin },
      { x: img.width * (1 - margin), y: img.height * margin },
      { x: img.width * (1 - margin), y: img.height * (1 - margin) },
      { x: img.width * margin, y: img.height * (1 - margin) },
    ];

    // Try auto-detection
    const tempCanvas = document.createElement('canvas');
    const scale = Math.min(1, 800 / Math.max(img.width, img.height));
    tempCanvas.width = img.width * scale;
    tempCanvas.height = img.height * scale;
    const tCtx = tempCanvas.getContext('2d')!;
    tCtx.drawImage(img, 0, 0, tempCanvas.width, tempCanvas.height);
    const detected = detectDocumentCorners(tempCanvas);

    corners = detected?.map(p => ({ x: p.x / scale, y: p.y / scale })) || defaultCorners;

    enterPerspectiveMode();
  }

  function handleFile(file: File) {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target?.result as string;
      img.onload = () => loadCapturedImage(img);
    };
    reader.readAsDataURL(file);
  }

  setupFileDropzone('dropzone', 'image-input', (files) => {
    if (files.length > 0) {
      handleFile(files[0]);
    }
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
    applyFilters();
  }

  function updateEditor() {
    if (!originalImage) return;

    canvas.width = originalImage.width;
    canvas.height = originalImage.height;
    ctx.drawImage(originalImage, 0, 0);

    if (!isFilterMode) {
      drawPerspectiveOverlay(ctx, corners);
      updateCornerHandles(cornerHandles, corners, canvas, onStart);
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
  }

  function onMove(e: PointerEvent) {
    if (activeHandle === null || !originalImage) return;
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    e.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);

    corners[activeHandle] = {
      x: Math.max(0, Math.min(canvas.width, x)),
      y: Math.max(0, Math.min(canvas.height, y)),
    };

    updateEditor();
  }

  function onEnd(e: PointerEvent) {
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    const target = e.currentTarget as HTMLElement;
    target.removeEventListener('pointermove', onMove);
    target.removeEventListener('pointerup', onEnd);
    target.removeEventListener('pointercancel', onEnd);
    activeHandle = null;
    activePointerId = null;
  }

  function warpImage() {
    if (!originalImage) return;
    ctx.drawImage(originalImage, 0, 0);
    const outCanvas = warp(canvas, corners);

    const warpedImg = new Image();
    warpedImg.src = outCanvas.toDataURL();
    warpedImg.onload = () => {
      originalImage = warpedImg;
      const margin = 0.05;
      corners = [
        { x: warpedImg.width * margin, y: warpedImg.height * margin },
        { x: warpedImg.width * (1 - margin), y: warpedImg.height * margin },
        { x: warpedImg.width * (1 - margin), y: warpedImg.height * (1 - margin) },
        { x: warpedImg.width * margin, y: warpedImg.height * (1 - margin) },
      ];
      enterFilterMode();
    };
  }

  // --- Filtering Logic ---

  function applyFilters() {
    if (!originalImage) return;
    const filter = filterSelect.value as 'none' | 'grayscale' | 'b&w' | 'clean';
    applyFiltersUtil(originalImage, canvas, ctx, filter);
  }

  // --- Event Listeners ---

  btnApplyPerspective.addEventListener('click', warpImage);
  btnModePerspective.addEventListener('click', enterPerspectiveMode);
  btnModeFilter.addEventListener('click', enterFilterMode);
  filterSelect.addEventListener('change', applyFilters);

  btnReset.addEventListener('click', () => {
    stopCamera();
    captureContainer.classList.remove('hidden');
    editorContainer.classList.add('hidden');
    const dropzone = document.getElementById('dropzone');
    if (dropzone) dropzone.classList.remove('hidden');
    const divider = document.querySelector('.divider');
    if (divider) (divider as HTMLElement).style.display = 'flex';
    cornerHandles.innerHTML = '';
    originalImage = null;
    startCamera();
  });

  btnDownload.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = 'scanned-document.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  });

  if (payload?.sharedFiles?.length) {
    handleFile(payload.sharedFiles[0]);
  } else {
    startCamera();
  }

  const resizeObserver = new ResizeObserver(() => {
    if (!isFilterMode && originalImage) updateEditor();
  });
  resizeObserver.observe(editorContainer);

  return () => {
    stopCamera();
    resizeObserver.disconnect();
  };
}
