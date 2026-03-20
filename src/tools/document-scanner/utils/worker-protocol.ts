/**
 * Type-safe message protocol for the detection Web Worker.
 * Shared between detection.ts (main thread) and detection.worker.ts.
 */
import type { PerformanceTiming } from './detection-kernels';

// --- Incoming messages (main thread → worker) ---

export interface DetectMessage {
  type: 'detect';
  id: string;
  pixels: ArrayBuffer;
  width: number;
  height: number;
  debug: boolean;
}

export interface DetectImageMessage {
  type: 'detect-image';
  id: string;
  pixels: ArrayBuffer;
  width: number;
  height: number;
  debug: boolean;
}

export interface ResetHistoryMessage {
  type: 'reset-history';
}

export interface ReleaseMessage {
  type: 'release';
}

export type WorkerInMessage =
  | DetectMessage
  | DetectImageMessage
  | ResetHistoryMessage
  | ReleaseMessage;

// --- Outgoing messages (worker → main thread) ---

export interface SerializedDebug {
  grayscale: ArrayBuffer;
  blur: ArrayBuffer;
  edges: ArrayBuffer;
  morph: ArrayBuffer;
  width: number;
  height: number;
}

export interface DetectResultMessage {
  type: 'detect-result';
  id: string;
  corners: { x: number; y: number }[] | null;
  debug?: SerializedDebug;
  timing?: PerformanceTiming;
}

export interface DetectImageResultMessage {
  type: 'detect-image-result';
  id: string;
  corners: { x: number; y: number }[] | null;
  debug?: SerializedDebug;
  timing?: PerformanceTiming;
}

export type WorkerOutMessage = DetectResultMessage | DetectImageResultMessage;
