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
  debug?: boolean;
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
  debug?: boolean;
}

export type WorkerInMessage = ScanFrameMessage | ScanImageMessage;

// --- Outgoing messages (worker → main thread) ---

export interface DebugImage {
  name: string;
  data: ArrayBuffer; // RGBA pixels
  width: number;
  height: number;
}

export interface ScanResultMessage {
  type: 'scan-result';
  id: number;
  data: string | null;
  format: string;
  provider?: string; // 'native' | 'wasm' | 'jsQR'
  debugImages?: DebugImage[];
}

export type WorkerOutMessage = ScanResultMessage;
