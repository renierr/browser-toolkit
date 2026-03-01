import type { WorkerInMessage, WorkerOutMessage, HexLine } from './worker-protocol';

/**
 * Web Worker for hex and ASCII formatting
 */



function formatHex(byte: number): string {
  return byte.toString(16).padStart(2, '0').toUpperCase();
}

function formatAscii(byte: number): string {
  return byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.';
}

self.addEventListener('message', (e: MessageEvent<WorkerInMessage>) => {
  const msg = e.data;
  if (msg.type !== 'format-lines') return;

  const { buffer, startLine, bytesPerLine } = msg;
  const lines: HexLine[] = [];

  for (let i = 0; i < buffer.length; i += bytesPerLine) {
    const lineIndex = startLine + Math.floor(i / bytesPerLine);
    const lineOffset = lineIndex * bytesPerLine;
    const chunk = buffer.slice(i, i + bytesPerLine);

    const hex = [];
    let ascii = '';

    for (let j = 0; j < bytesPerLine; j++) {
      if (j < chunk.length) {
        hex.push(formatHex(chunk[j]));
        ascii += formatAscii(chunk[j]);
      } else {
        hex.push('  ');
        ascii += ' ';
      }
    }

    lines.push({
      lineIndex,
      offset: lineOffset.toString(16).padStart(8, '0').toUpperCase(),
      hex,
      ascii
    });
  }

  const out: WorkerOutMessage = { type: 'format-result', lines };
  self.postMessage(out);
});
