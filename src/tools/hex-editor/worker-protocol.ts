/**
 * Protocol for messages between Hex Editor main thread and worker
 */

export interface HexLine {
  lineIndex: number;
  offset: string;
  hex: string[];
  ascii: string;
}

export type FormatLinesMessage = {
  type: 'format-lines';
  buffer: Uint8Array;
  startLine: number;
  bytesPerLine: number;
};

export type WorkerInMessage = FormatLinesMessage;

export type FormatResultMessage = {
  type: 'format-result';
  lines: HexLine[];
};

export type WorkerOutMessage = FormatResultMessage;
