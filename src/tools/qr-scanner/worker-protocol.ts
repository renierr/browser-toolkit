/**
 * Type-safe message protocol for the QR scan Web Worker.
 * Shared between index.ts (main thread) and scan.worker.ts.
 */

// --- Incoming messages (main thread → worker) ---

/** Scan a single frame (camera live loop). */
export interface ScanFrameMessage {
  type: 'scan-frame';
  id: number;
  pixels: ArrayBuffer;
  width: number;
  height: number;
  useEnhanced: boolean;
}

/** Scan an uploaded/pasted image at multiple scales. */
export interface ScanImageMessage {
  type: 'scan-image';
  id: number;
  pixels: ArrayBuffer;
  width: number;
  height: number;
  /** Target sizes to try (largest first). */
  targetSizes: number[];
}

export type WorkerInMessage = ScanFrameMessage | ScanImageMessage;

// --- Outgoing messages (worker → main thread) ---

export interface ScanResultMessage {
  type: 'scan-result';
  id: number;
  data: string | null;
  format: string;
}

export type WorkerOutMessage = ScanResultMessage;
