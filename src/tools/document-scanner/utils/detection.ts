import type { Point } from './perspective';
import {
  detectDocumentCorners,
  smoothCorners as smoothCornersDirect,
  resetHistory as resetHistoryDirect,
  freeBuffers,
  type DebugBuffers,
} from './detection-kernels';
import DetectionWorker from './detection.worker?worker';

// --- Debug rendering (main thread only — needs DOM) ---

function drawToDebugCanvas(pixels: Uint8Array, width: number, height: number, canvasId: string) {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
  if (!canvas) return;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const imgData = ctx.createImageData(width, height);
  for (let i = 0; i < pixels.length; i++) {
    const i4 = i << 2;
    const v = pixels[i];
    imgData.data[i4] = v;
    imgData.data[i4 + 1] = v;
    imgData.data[i4 + 2] = v;
    imgData.data[i4 + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
}

function renderDebugBuffers(debug: DebugBuffers) {
  drawToDebugCanvas(debug.grayscale, debug.width, debug.height, 'debug-grayscale');
  drawToDebugCanvas(debug.blur, debug.width, debug.height, 'debug-blur');
  drawToDebugCanvas(debug.edges, debug.width, debug.height, 'debug-edges');
  drawToDebugCanvas(debug.morph, debug.width, debug.height, 'debug-morph');
}

/** Reconstruct DebugBuffers from transferred ArrayBuffers received from the worker. */
function deserializeDebug(raw: { grayscale: ArrayBuffer; blur: ArrayBuffer; edges: ArrayBuffer; morph: ArrayBuffer; width: number; height: number }): DebugBuffers {
  return {
    grayscale: new Uint8Array(raw.grayscale),
    blur: new Uint8Array(raw.blur),
    edges: new Uint8Array(raw.edges),
    morph: new Uint8Array(raw.morph),
    width: raw.width,
    height: raw.height,
  };
}

// --- Web Worker management ---

let worker: Worker | null = null;

interface WorkerResult {
  corners: Point[] | null;
  debug?: DebugBuffers;
}

let pendingRequests = new Map<string, {
  resolve: (result: WorkerResult) => void;
  reject: (err: Error) => void;
}>();
let requestIdCounter = 0;

function getWorker(): Worker {
  if (!worker) {
    worker = new DetectionWorker();
    worker.addEventListener('message', (event: MessageEvent) => {
      const { type, id, corners, debug: rawDebug } = event.data;
      if (type === 'detect-result' || type === 'detect-image-result') {
        const pending = pendingRequests.get(id);
        if (pending) {
          pendingRequests.delete(id);
          const debug = rawDebug ? deserializeDebug(rawDebug) : undefined;
          pending.resolve({ corners, debug });
        }
      }
    });
    worker.addEventListener('error', () => {
      for (const [, req] of pendingRequests) {
        req.reject(new Error('Worker error'));
      }
      pendingRequests.clear();
    });
  }
  return worker;
}

function sendToWorker(
  type: string,
  pixels: ArrayBuffer,
  width: number,
  height: number,
  debug: boolean
): Promise<WorkerResult> {
  return new Promise((resolve, reject) => {
    const id = `det-${requestIdCounter++}`;
    pendingRequests.set(id, { resolve, reject });

    try {
      const w = getWorker();
      // Transfer the pixel buffer for zero-copy performance
      w.postMessage({ type, id, pixels, width, height, debug }, [pixels]);
    } catch (e) {
      pendingRequests.delete(id);
      reject(e);
    }
  });
}

// --- Public API ---


export function isStable(
  oldPts: Point[] | null,
  newPts: Point[] | null,
  threshold = 0.02
): boolean {
  if (!oldPts || !newPts) return false;
  const dist =
    oldPts.reduce((acc, p, i) => acc + Math.hypot(p.x - newPts[i].x, p.y - newPts[i].y), 0) / 4;
  return dist < threshold;
}

export function releaseBuffers() {
  if (worker) {
    worker.postMessage({ type: 'release' });
    worker.terminate();
    worker = null;
  }
  freeBuffers();
  pendingRequests.clear();
}

/**
 * Detect corners on a static image (for captured photos).
 * Uses Web Worker if possible, falls back to main thread.
 */
export async function detectCornersOnImage(
  img: HTMLImageElement | HTMLCanvasElement,
  maxDim = 800
): Promise<Point[] | null> {
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.floor(img.width * scale);
  const h = Math.floor(img.height * scale);

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = w;
  tempCanvas.height = h;
  const tCtx = tempCanvas.getContext('2d', { willReadFrequently: true })!;
  tCtx.drawImage(img, 0, 0, w, h);
  const imgData = tCtx.getImageData(0, 0, w, h);

  let detected: Point[] | null;

  try {
    const result = await sendToWorker('detect-image', imgData.data.buffer, w, h, false);
    detected = result.corners;
  } catch {
    detected = detectDocumentCorners(imgData.data, w, h).corners;
  }

  return (
    detected?.map((p) => ({
      x: p.x * img.width,
      y: p.y * img.height,
    })) || null
  );
}

// Track in-flight worker detection to avoid piling up requests
let workerDetectionInFlight = false;

/**
 * Live detection from video feed. Sends pixel data to Web Worker for processing.
 * Returns null if a previous detection is still in flight (non-blocking).
 */
export async function calculateLiveDetection(
  video: HTMLVideoElement,
  detectionCanvas: HTMLCanvasElement,
  dCtx: CanvasRenderingContext2D,
  cameraOverlay: HTMLCanvasElement,
  debug = false
): Promise<{ lastDetectedCorners: Point[] | null; upscaled: Point[] | null } | null> {
  const vWidth = video.videoWidth;
  const vHeight = video.videoHeight;
  const cWidth = video.clientWidth;
  const cHeight = video.clientHeight;

  if (!vWidth || !vHeight || !cWidth || !cHeight) return null;

  const scale = Math.min(1, 300 / Math.max(vWidth, vHeight));
  const dWidth = Math.floor(vWidth * scale);
  const dHeight = Math.floor(vHeight * scale);

  if (detectionCanvas.width !== dWidth || detectionCanvas.height !== dHeight) {
    detectionCanvas.width = dWidth;
    detectionCanvas.height = dHeight;
  }

  dCtx.drawImage(video, 0, 0, vWidth, vHeight, 0, 0, dWidth, dHeight);
  const imgData = dCtx.getImageData(0, 0, dWidth, dHeight);

  let detected: Point[] | null;

  if (!workerDetectionInFlight) {
    try {
      workerDetectionInFlight = true;
      const result = await sendToWorker('detect', imgData.data.buffer, dWidth, dHeight, debug);
      workerDetectionInFlight = false;
      detected = result.corners;
      if (result.debug) renderDebugBuffers(result.debug);
    } catch {
      workerDetectionInFlight = false;
      const result = detectDocumentCorners(imgData.data, dWidth, dHeight, debug);
      detected = smoothCornersDirect(result.corners);
      if (result.debug) renderDebugBuffers(result.debug);
    }
  } else {
    // Worker detection already in flight, skip this frame
    return null;
  }

  const lastDetectedCorners = detected;

  const vAspect = vWidth / vHeight;
  const cAspect = cWidth / cHeight;

  const upscaled =
    detected?.map((p) => {
      const nx = p.x;
      const ny = p.y;
      if (vAspect > cAspect) {
        const visibleWidthAtVideoScale = vHeight * cAspect;
        const cropX = (vWidth - visibleWidthAtVideoScale) / 2;
        const vx = nx * vWidth;
        return {
          x: ((vx - cropX) / visibleWidthAtVideoScale) * cWidth,
          y: ny * cHeight,
        };
      } else {
        const visibleHeightAtVideoScale = vWidth / cAspect;
        const cropY = (vHeight - visibleHeightAtVideoScale) / 2;
        const vy = ny * vHeight;
        return {
          x: nx * cWidth,
          y: ((vy - cropY) / visibleHeightAtVideoScale) * cHeight,
        };
      }
    }) || null;

  if (cameraOverlay.width !== cWidth || cameraOverlay.height !== cHeight) {
    cameraOverlay.width = cWidth;
    cameraOverlay.height = cHeight;
  }

  return { lastDetectedCorners, upscaled };
}

/**
 * Reset the smoothing history in the worker.
 */
export function resetDetectionHistory() {
  if (worker) {
    worker.postMessage({ type: 'reset-history' });
  }
  resetHistoryDirect();
}
