/**
 * Camera gesture handlers: tap-to-focus and pinch-to-zoom.
 * Extracted from index.ts for readability.
 */
import {
  getZoomCapabilities,
  setZoom,
  tapToFocus,
} from './camera';

export interface CameraGestureOptions {
  video: HTMLVideoElement;
  cameraView: HTMLElement;
  focusRing: HTMLElement;
  zoomIndicator: HTMLElement;
  getStream: () => MediaStream | null;
  getZoom: () => number;
  setCurrentZoom: (zoom: number) => void;
}

/**
 * Convert a client-space click position on an `object-contain` video element
 * to normalized (0..1) video-frame coordinates, accounting for letterboxing/pillarboxing.
 * Returns null if the click is outside the displayed video area.
 */
export function videoClickToNormalized(
  video: HTMLVideoElement,
  clientX: number,
  clientY: number
): { normX: number; normY: number } | null {
  const rect = video.getBoundingClientRect();
  const videoW = video.videoWidth;
  const videoH = video.videoHeight;
  if (!videoW || !videoH) return null;

  const elemAspect = rect.width / rect.height;
  const vidAspect = videoW / videoH;

  let displayX: number, displayY: number;
  let displayW: number, displayH: number;

  if (vidAspect > elemAspect) {
    displayW = rect.width;
    displayH = rect.width / vidAspect;
    displayX = 0;
    displayY = (rect.height - displayH) / 2;
  } else {
    displayH = rect.height;
    displayW = rect.height * vidAspect;
    displayX = (rect.width - displayW) / 2;
    displayY = 0;
  }

  const relX = clientX - rect.left - displayX;
  const relY = clientY - rect.top - displayY;

  if (relX < 0 || relX > displayW || relY < 0 || relY > displayH) return null;

  return { normX: relX / displayW, normY: relY / displayH };
}

export function createCameraGestures(opts: CameraGestureOptions) {
  const { video, cameraView, focusRing, zoomIndicator, getStream, getZoom, setCurrentZoom } = opts;

  // --- Focus ring visual feedback ---

  let focusRingTimer: ReturnType<typeof setTimeout> | null = null;

  function showFocusRing(clientX: number, clientY: number) {
    const viewRect = cameraView.getBoundingClientRect();
    focusRing.style.left = `${clientX - viewRect.left - 32}px`;
    focusRing.style.top = `${clientY - viewRect.top - 32}px`;
    focusRing.classList.remove('hidden');

    // Re-trigger animation by cloning the inner div
    const inner = focusRing.firstElementChild as HTMLElement;
    if (inner) {
      const clone = inner.cloneNode(true) as HTMLElement;
      inner.replaceWith(clone);
    }

    if (focusRingTimer) clearTimeout(focusRingTimer);
    focusRingTimer = setTimeout(() => focusRing.classList.add('hidden'), 700);
  }

  // --- Zoom level indicator ---

  let zoomHideTimer: ReturnType<typeof setTimeout> | null = null;

  function showZoomLevel(zoom: number) {
    zoomIndicator.textContent = `${zoom.toFixed(1)}×`;
    zoomIndicator.classList.remove('hidden');
    if (zoomHideTimer) clearTimeout(zoomHideTimer);
    zoomHideTimer = setTimeout(() => zoomIndicator.classList.add('hidden'), 1500);
  }

  // --- Tap-to-focus handler ---

  async function onVideoClick(e: MouseEvent) {
    const stream = getStream();
    if (!stream) return;

    const norm = videoClickToNormalized(video, e.clientX, e.clientY);
    if (!norm) return;

    showFocusRing(e.clientX, e.clientY);
    await tapToFocus(stream, norm.normX, norm.normY);
  }

  // --- Pinch-to-zoom handlers ---

  let pinchStartDist = 0;
  let pinchStartZoom = 1;

  function getPinchDistance(touches: TouchList): number {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function onTouchStart(e: TouchEvent) {
    if (e.touches.length === 2) {
      e.preventDefault();
      pinchStartDist = getPinchDistance(e.touches);
      pinchStartZoom = getZoom();
    }
  }

  async function onTouchMove(e: TouchEvent) {
    const stream = getStream();
    if (e.touches.length === 2 && stream) {
      e.preventDefault();
      const dist = getPinchDistance(e.touches);
      const scale = dist / pinchStartDist;
      const zoomCaps = getZoomCapabilities(stream);
      if (!zoomCaps.supported) return;

      const newZoom = Math.max(zoomCaps.min, Math.min(zoomCaps.max, pinchStartZoom * scale));
      const actualZoom = await setZoom(stream, newZoom);
      setCurrentZoom(actualZoom);
      showZoomLevel(actualZoom);
    }
  }

  // --- Attach listeners ---

  video.addEventListener('click', onVideoClick);
  video.addEventListener('touchstart', onTouchStart, { passive: false });
  video.addEventListener('touchmove', onTouchMove, { passive: false });

  // --- Cleanup ---

  return {
    destroy() {
      video.removeEventListener('click', onVideoClick);
      video.removeEventListener('touchstart', onTouchStart);
      video.removeEventListener('touchmove', onTouchMove);
      if (focusRingTimer) clearTimeout(focusRingTimer);
      if (zoomHideTimer) clearTimeout(zoomHideTimer);
    },
  };
}

