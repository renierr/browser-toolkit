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
//   { type: 'detect',       id: string, pixels: ArrayBuffer, width: number, height: number, debug?: boolean }
//   { type: 'detect-image', id: string, pixels: ArrayBuffer, width: number, height: number, debug?: boolean }
//   { type: 'reset-history' }
//   { type: 'release' }
// Outgoing:
//   { type: 'detect-result',       id, corners, debug? }
//   { type: 'detect-image-result', id, corners, debug? }

self.addEventListener('message', (event: MessageEvent) => {
  const { type, id, pixels, width, height, debug } = event.data;

  switch (type) {
    case 'detect': {
      const data = new Uint8ClampedArray(pixels);
      const result = detectDocumentCorners(data, width, height, debug);
      const smoothed = smoothCorners(result.corners);
      const msg: Record<string, unknown> = { type: 'detect-result', id, corners: smoothed };
      const transfers: ArrayBuffer[] = [];
      if (result.debug) {
        const d = result.debug;
        const gBuf = d.grayscale.buffer as ArrayBuffer;
        const bBuf = d.blur.buffer as ArrayBuffer;
        const eBuf = d.edges.buffer as ArrayBuffer;
        const mBuf = d.morph.buffer as ArrayBuffer;
        msg.debug = {
          grayscale: gBuf, blur: bBuf, edges: eBuf, morph: mBuf,
          width: d.width, height: d.height,
        };
        transfers.push(gBuf, bBuf, eBuf, mBuf);
      }
      if (result.timing) msg.timing = result.timing;
      (self as unknown as Worker).postMessage(msg, transfers);
      break;
    }

    case 'detect-image': {
      const data = new Uint8ClampedArray(pixels);
      const result = detectDocumentCorners(data, width, height, debug);
      const msg: Record<string, unknown> = { type: 'detect-image-result', id, corners: result.corners };
      const transfers: ArrayBuffer[] = [];
      if (result.debug) {
        const d = result.debug;
        const gBuf = d.grayscale.buffer as ArrayBuffer;
        const bBuf = d.blur.buffer as ArrayBuffer;
        const eBuf = d.edges.buffer as ArrayBuffer;
        const mBuf = d.morph.buffer as ArrayBuffer;
        msg.debug = {
          grayscale: gBuf, blur: bBuf, edges: eBuf, morph: mBuf,
          width: d.width, height: d.height,
        };
        transfers.push(gBuf, bBuf, eBuf, mBuf);
      }
      if (result.timing) msg.timing = result.timing;
      (self as unknown as Worker).postMessage(msg, transfers);
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

