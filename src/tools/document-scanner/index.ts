import type { SharedFilesPayload } from '../../js/share-target';
import { getPerspectiveTransform, type Point } from './utils/perspective';
import { applyFilters as applyFiltersUtil } from './utils/filters';
import { startCamera as startCameraUtil, stopCamera as stopCameraUtil } from './utils/camera';
import { detectDocumentCorners } from './utils/detection';
import { setupFileDropzone } from '../../js/file-utils.ts';

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
      if (video.paused || video.ended) return;

      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!width || !height) return;

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = width;
      tempCanvas.height = height;
      const tCtx = tempCanvas.getContext('2d')!;
      tCtx.drawImage(video, 0, 0);

      const detected = detectDocumentCorners(tempCanvas);
      drawLiveOverlay(detected, width, height);
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

  function drawLiveOverlay(detectedCorners: Point[] | null, vWidth: number, vHeight: number) {
    if (!cameraOverlay) return;
    cameraOverlay.width = video.clientWidth;
    cameraOverlay.height = video.clientHeight;
    const oCtx = cameraOverlay.getContext('2d')!;
    oCtx.clearRect(0, 0, cameraOverlay.width, cameraOverlay.height);

    if (!detectedCorners) return;

    const scaleX = cameraOverlay.width / vWidth;
    const scaleY = cameraOverlay.height / vHeight;

    oCtx.strokeStyle = '#3b82f6';
    oCtx.lineWidth = 3;
    oCtx.setLineDash([5, 5]);
    oCtx.beginPath();
    oCtx.moveTo(detectedCorners[0].x * scaleX, detectedCorners[0].y * scaleY);
    for (let i = 1; i < 4; i++) {
      oCtx.lineTo(detectedCorners[i].x * scaleX, detectedCorners[i].y * scaleY);
    }
    oCtx.closePath();
    oCtx.stroke();
  }

  btnCapture.addEventListener('click', () => {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = video.videoWidth;
    tempCanvas.height = video.videoHeight;
    const tCtx = tempCanvas.getContext('2d')!;
    tCtx.drawImage(video, 0, 0);
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
    tempCanvas.width = img.width;
    tempCanvas.height = img.height;
    const tCtx = tempCanvas.getContext('2d')!;
    tCtx.drawImage(img, 0, 0);
    const detected = detectDocumentCorners(tempCanvas);
    corners = detected || defaultCorners;

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
      drawOverlay();
      updateHandles();
    }
  }

  function drawOverlay() {
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 4; i++) {
      ctx.lineTo(corners[i].x, corners[i].y);
    }
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
    ctx.fill();
  }

  function updateHandles() {
    cornerHandles.innerHTML = '';
    if (!canvas.width || !canvas.height) return;

    corners.forEach((p, i) => {
      const handle = document.createElement('div');
      handle.className = 'corner-handle';
      // Use percentage positioning relative to the canvas container
      handle.style.left = `${(p.x / canvas.width) * 100}%`;
      handle.style.top = `${(p.y / canvas.height) * 100}%`;

      handle.addEventListener('pointerdown', (e) => onStart(e as PointerEvent, i));
      cornerHandles.appendChild(handle);
    });
  }

  function onStart(e: PointerEvent, index: number) {
    e.preventDefault();
    activeHandle = index;
    activePointerId = e.pointerId;
    (e.currentTarget as HTMLElement)?.setPointerCapture?.(e.pointerId);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
  }

  function onMove(e: PointerEvent) {
    if (activeHandle === null || !originalImage) return;
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    e.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX;
    const clientY = e.clientY;

    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);

    corners[activeHandle] = {
      x: Math.max(0, Math.min(canvas.width, x)),
      y: Math.max(0, Math.min(canvas.height, y)),
    };

    updateEditor();
  }

  function onEnd(e: PointerEvent) {
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    activeHandle = null;
    activePointerId = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onEnd);
  }

  // --- Homography / Warping ---
  // Simple bilinear interpolation approach for perspective warping
  function warpImage() {
    if (!originalImage) return;

    // Redraw without overlay before reading pixels
    ctx.drawImage(originalImage, 0, 0);

    // Define output size (estimate from average width/height of corners)
    const w1 = Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y);
    const w2 = Math.hypot(corners[2].x - corners[3].x, corners[2].y - corners[3].y);
    const h1 = Math.hypot(corners[3].x - corners[0].x, corners[3].y - corners[0].y);
    const h2 = Math.hypot(corners[2].x - corners[1].x, corners[2].y - corners[1].y);

    const width = Math.round(Math.max(w1, w2));
    const height = Math.round(Math.max(h1, h2));

    const outCanvas = document.createElement('canvas');
    outCanvas.width = width;
    outCanvas.height = height;
    const outCtx = outCanvas.getContext('2d')!;

    // Using a simple 2D context trick: we can't do full homography easily with 2D ctx,
    // so we'll use a manual pixel manipulation or a more robust approach.
    // For "standard" JS without libraries, we'll implement a basic perspective mapping.

    const srcData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const dstData = outCtx.createImageData(width, height);

    // Compute coefficients for perspective transform
    // (x, y) -> (u, v)
    // u = (ax + by + c) / (gx + hy + 1)
    // v = (dx + ey + f) / (gx + hy + 1)
    // We actually want the inverse mapping (u, v) -> (x, y)

    const transform = getPerspectiveTransform(
      [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: width, y: height },
        { x: 0, y: height },
      ],
      corners
    );

    for (let v = 0; v < height; v++) {
      for (let u = 0; u < width; u++) {
        const den = transform[6] * u + transform[7] * v + 1;
        const x = (transform[0] * u + transform[1] * v + transform[2]) / den;
        const y = (transform[3] * u + transform[4] * v + transform[5]) / den;

        const ix = Math.floor(x);
        const iy = Math.floor(y);

        if (ix >= 0 && ix < canvas.width - 1 && iy >= 0 && iy < canvas.height - 1) {
          const srcIdx = (iy * canvas.width + ix) * 4;
          const dstIdx = (v * width + u) * 4;
          dstData.data[dstIdx] = srcData.data[srcIdx];
          dstData.data[dstIdx + 1] = srcData.data[srcIdx + 1];
          dstData.data[dstIdx + 2] = srcData.data[srcIdx + 2];
          dstData.data[dstIdx + 3] = srcData.data[srcIdx + 3];
        }
      }
    }

    outCtx.putImageData(dstData, 0, 0);

    // Replace original image with warped one for filtering
    const warpedImg = new Image();
    warpedImg.src = outCanvas.toDataURL();
    warpedImg.onload = () => {
      originalImage = warpedImg;
      // Reset corners for the new image dimensions
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
  btnModePerspective.addEventListener('click', () => {
    // If we were in filter mode, we can't easily go back to original perspective
    // without reloading the original capture. For now, just allow switching UI.
    enterPerspectiveMode();
  });
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

  // Handle Shared Files
  if (payload?.sharedFiles?.length) {
    handleFile(payload.sharedFiles[0]);
  } else {
    startCamera();
  }

  window.addEventListener('resize', () => {
    if (!isFilterMode) updateHandles();
  });

  return () => {
    stopCamera();
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onEnd);
  };
}
