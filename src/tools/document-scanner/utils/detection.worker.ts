/**
 * Dedicated Web Worker for document corner detection.
 */
import {
  detectDocumentCorners,
  smoothCorners,
  resetHistory,
  freeBuffers,
  type DebugBuffers,
  type PerformanceTiming,
} from './detection-kernels';
import type { WorkerInMessage, WorkerOutMessage, SerializedDebug } from './worker-protocol';

/** Build a detection result message with optional debug buffers for transfer. */
function buildResultMessage(
  type: WorkerOutMessage['type'],
  id: string,
  corners: { x: number; y: number }[] | null,
  debug: DebugBuffers | undefined,
  timing: PerformanceTiming | undefined
): { msg: WorkerOutMessage; transfers: ArrayBuffer[] } {
  const transfers: ArrayBuffer[] = [];
  let serializedDebug: SerializedDebug | undefined;

  if (debug) {
    const gBuf = debug.grayscale.buffer as ArrayBuffer;
    const bBuf = debug.blur.buffer as ArrayBuffer;
    const eBuf = debug.edges.buffer as ArrayBuffer;
    const mBuf = debug.morph.buffer as ArrayBuffer;
    serializedDebug = {
      grayscale: gBuf, blur: bBuf, edges: eBuf, morph: mBuf,
      width: debug.width, height: debug.height,
    };
    transfers.push(gBuf, bBuf, eBuf, mBuf);
  }

  const msg = { type, id, corners, debug: serializedDebug, timing } as WorkerOutMessage;
  return { msg, transfers };
}

self.addEventListener('message', (event: MessageEvent<WorkerInMessage>) => {
  const data = event.data;

  switch (data.type) {
    case 'detect': {
      const pixels = new Uint8ClampedArray(data.pixels);
      const result = detectDocumentCorners(pixels, data.width, data.height, data.debug);
      const smoothed = smoothCorners(result.corners);
      const { msg, transfers } = buildResultMessage('detect-result', data.id, smoothed, result.debug, result.timing);
      (self as unknown as Worker).postMessage(msg, transfers);
      break;
    }

    case 'detect-image': {
      const pixels = new Uint8ClampedArray(data.pixels);
      const result = detectDocumentCorners(pixels, data.width, data.height, data.debug);
      const { msg, transfers } = buildResultMessage('detect-image-result', data.id, result.corners, result.debug, result.timing);
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

