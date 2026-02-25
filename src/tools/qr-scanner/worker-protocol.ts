/**
 * Type-safe message protocol for the QR scan Web Worker.
 * Shared between index.ts (main thread) and scan.worker.ts.
 */

// --- Incoming messages (main thread → worker) ---

/** Scan image */
export interface ScanImageMessage {
  type: 'scan-image';
  id: number;
  bitmap: ImageBitmap;
}

export type WorkerInMessage = ScanImageMessage;

// --- Outgoing messages (worker → main thread) ---

export interface ScanResultMessage {
  type: 'scan-result';
  id: number;
  data: string | null;
  format: string;
  provider?: string; // 'native' | 'wasm'
}

export type WorkerOutMessage = ScanResultMessage;
