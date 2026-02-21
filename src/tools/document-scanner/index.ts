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
  const btnApplyPerspective = document.getElementById('btn-apply-perspective')!;
  const btnModePerspective = document.getElementById('btn-mode-perspective')!;
  const btnModeFilter = document.getElementById('btn-mode-filter')!;
  const filterSelect = document.getElementById('filter-select') as HTMLSelectElement;
  const hintText = document.getElementById('hint-text')!;
  const checkLiveDetection = document.getElementById('check-live-detection') as HTMLInputElement;
  const levelIndicator = document.getElementById('level-indicator')!;
  const levelDot = document.getElementById('level-dot')!;

  let stream: MediaStream | null = null;
  let currentFacingMode: 'user' | 'environment' = 'environment';
  let isPortrait = true;
  let originalImage: HTMLImageElement | null = null;
  let corners: Point[] = [];
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
    // Update UI orientation
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

      // Downscale for detection performance (use full video frame)
      const scale = Math.min(1, 300 / Math.max(vWidth, vHeight));
      const dWidth = Math.floor(vWidth * scale);
      const dHeight = Math.floor(vHeight * scale);

      if (detectionCanvas.width !== dWidth || detectionCanvas.height !== dHeight) {
        detectionCanvas.width = dWidth;
        detectionCanvas.height = dHeight;
      }

      dCtx.drawImage(video, 0, 0, vWidth, vHeight, 0, 0, dWidth, dHeight);

      const detected = detectDocumentCorners(detectionCanvas);

      // Store raw detected corners for capture
      if (detected) {
        lastDetectedCorners = detected.map(p => ({
          x: (p.x / dWidth) * vWidth,
          y: (p.y / dHeight) * vHeight
        }));
      } else {
        lastDetectedCorners = null;
      }

      // Map detected corners to container space taking object-contain into account
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

      // Ensure overlay canvas matches container size
      if (cameraOverlay.width !== cWidth || cameraOverlay.height !== cHeight) {
        cameraOverlay.width = cWidth;
        cameraOverlay.height = cHeight;
      }

      drawLiveOverlay(cameraOverlay, upscaled);
    }, 200); // Increased frequency for better responsiveness
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
    const beta = event.beta; // -180 to 180 (tilt forward/backward)
    const gamma = event.gamma; // -90 to 90 (tilt left/right)
    if (beta === null || gamma === null) return;

    levelIndicator.classList.remove('opacity-0');

    // Calculate tilt based on orientation
    // We want to show how far the device is from being "flat" (parallel to ground)
    // or "upright" depending on use case. For document scanning, usually flat.

    let xTilt = gamma;
    let yTilt = beta;

    // Adjust for portrait/landscape
    if (!isPortrait) {
      xTilt = beta;
      yTilt = -gamma;
    }

    const maxTilt = 20;
    const xPerc = Math.max(-maxTilt, Math.min(maxTilt, xTilt)) / maxTilt;
    const yPerc = Math.max(-maxTilt, Math.min(maxTilt, yTilt)) / maxTilt;

    // 40px is half the container width (80px / 2)
    const xPos = xPerc * 40;
    const yPos = yPerc * 40;

    levelDot.style.transform = `translate(${xPos}px, ${yPos}px)`;

    if (Math.abs(xTilt) < 2 && Math.abs(yTilt) < 2) {
      levelDot.classList.replace('bg-success', 'bg-primary');
      levelDot.classList.add('scale-125');
    } else {
      levelDot.classList.replace('bg-primary', 'bg-success');
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

    // Capture the full video frame
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = vWidth;
    tempCanvas.height = vHeight;
    const tCtx = tempCanvas.getContext('2d')!;
    tCtx.drawImage(video, 0, 0, vWidth, vHeight);

    const img = new Image();
    img.src = tempCanvas.toDataURL('image/png');
    img.onload = () => {
      loadCapturedImage(img, lastDetectedCorners);
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

  // --- Image Loading ---

  function loadCapturedImage(img: HTMLImageElement, detectedCorners: Point[] | null = null) {
    originalImage = img;
    stopCamera();
    captureContainer.classList.add('hidden');
    editorContainer.classList.remove('hidden');
    const dropzone = document.getElementById('dropzone');
    if (dropzone) dropzone.classList.add('hidden');
    const divider = document.querySelector('.divider');
    if (divider) (divider as HTMLElement).style.display = 'none';

    if (detectedCorners) {
      corners = detectedCorners;
    } else {
      // Initial corners (rectangle with margin)
      const margin = 0.1;
      const defaultCorners = [
        { x: img.width * margin, y: img.height * margin },
        { x: img.width * (1 - margin), y: img.height * margin },
        { x: img.width * (1 - margin), y: img.height * (1 - margin) },
        { x: img.width * margin, y: img.height * (1 - margin) },
      ];

      // Try auto-detection if not provided from live
      const tempCanvas = document.createElement('canvas');
      const scale = Math.min(1, 800 / Math.max(img.width, img.height));
      tempCanvas.width = img.width * scale;
      tempCanvas.height = img.height * scale;
      const tCtx = tempCanvas.getContext('2d')!;
      tCtx.drawImage(img, 0, 0, tempCanvas.width, tempCanvas.height);
      const detected = detectDocumentCorners(tempCanvas);
      corners = detected?.map(p => ({ x: p.x / scale, y: p.y / scale })) || defaultCorners;
    }

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
