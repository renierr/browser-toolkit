/**
 * Dedicated Web Worker for document corner detection.
 */
import {
  detectDocumentCorners,
  smoothCorners,
  resetHistory,
  freeBuffers,
} from './detection-kernels';

// --- Message protocol ---
// Incoming:
//   { type: 'detect',       id: string, pixels: ArrayBuffer, width: number, height: number }
//   { type: 'detect-image', id: string, pixels: ArrayBuffer, width: number, height: number }
//   { type: 'reset-history' }
//   { type: 'release' }
// Outgoing:
//   { type: 'detect-result',       id: string, corners: SimplePoint[] | null }
//   { type: 'detect-image-result', id: string, corners: SimplePoint[] | null }

self.addEventListener('message', (event: MessageEvent) => {
  const { type, id, pixels, width, height } = event.data;

  switch (type) {
    case 'detect': {
      // Live detection with smoothing
      const data = new Uint8ClampedArray(pixels);
      const detected = detectDocumentCorners(data, width, height);
      const smoothed = smoothCorners(detected);
      (self as unknown as Worker).postMessage({ type: 'detect-result', id, corners: smoothed });
      break;
    }

    case 'detect-image': {
      // Static image detection (no smoothing)
      const data = new Uint8ClampedArray(pixels);
      const detected = detectDocumentCorners(data, width, height);
      (self as unknown as Worker).postMessage({ type: 'detect-image-result', id, corners: detected });
      break;
    }

    case 'reset-history': {
      resetHistory();
      break;
    }

    case 'release': {
      freeBuffers();
      resetHistory();
      break;
    }
  }
});

