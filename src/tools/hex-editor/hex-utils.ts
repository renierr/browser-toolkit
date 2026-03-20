import { yieldToUI } from '../../js/ui';

/**
 * Utility functions for hex formatting and processing
 */

export const BYTES_PER_LINE = 16;

/**
 * Formats a single byte as a 2-character hex string.
 */
export function formatHex(byte: number): string {
  return byte.toString(16).padStart(2, '0').toUpperCase();
}

/**
 * Formats an offset as an 8-character hex string.
 */
export function formatOffset(offset: number): string {
  return offset.toString(16).padStart(8, '0').toUpperCase();
}

/**
 * Formats a byte as an ASCII character or a dot if non-printable.
 * Escapes HTML entities to prevent breaking the viewer.
 */
export function formatAscii(byte: number): string {
  // Printable ASCII range is 32-126
  if (byte < 32 || byte > 126) return '.';

  const char = String.fromCharCode(byte);
  switch (char) {
    case '<':
      return '&lt;';
    case '>':
      return '&gt;';
    case '&':
      return '&amp;';
    default:
      return char;
  }
}

/**
 * Reads a chunk from a File or Blob.
 */
export async function readChunk(
  file: File | Blob,
  offset: number,
  length: number
): Promise<Uint8Array> {
  const blob = file.slice(offset, offset + length);
  const buffer = await blob.arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Manages a mutable buffer for editing.
 * For very large files, we only keep the modified chunks in memory.
 */
export class HexBufferManager {
  private originalFile: File | null = null;
  private modifications: Map<number, number> = new Map();
  private cache: Map<number, Uint8Array> = new Map();
  private chunkSize = 4096; // 4KB chunks for caching

  constructor(file: File) {
    this.originalFile = file;
  }

  async getByte(offset: number): Promise<number> {
    if (this.modifications.has(offset)) {
      return this.modifications.get(offset)!;
    }

    const chunkIndex = Math.floor(offset / this.chunkSize);
    const chunkOffset = chunkIndex * this.chunkSize;

    let chunk = this.cache.get(chunkIndex);
    if (!chunk) {
      chunk = await readChunk(this.originalFile!, chunkOffset, this.chunkSize);
      this.cache.set(chunkIndex, chunk);
    }

    const localOffset = offset % this.chunkSize;
    return chunk[localOffset];
  }

  setByte(offset: number, value: number) {
    this.modifications.set(offset, value);
  }

  async getRange(offset: number, length: number): Promise<Uint8Array> {
    if (!this.originalFile) return new Uint8Array(0);

    // Fetch the raw data from the file
    const result = await readChunk(this.originalFile, offset, length);

    // Overlay modifications
    // We only iterate over modifications that fall within this range
    for (const [modOffset, value] of this.modifications.entries()) {
      if (modOffset >= offset && modOffset < offset + length) {
        result[modOffset - offset] = value;
      }
    }

    return result;
  }

  get totalSize(): number {
    return this.originalFile ? this.originalFile.size : 0;
  }

  /**
   * Generates the final full buffer for download.
   * WARNING: This loads the entire file into memory.
   * Only use for download or if file is small.
   */
  async getFullBuffer(): Promise<Uint8Array> {
    const buffer = await readChunk(this.originalFile!, 0, this.originalFile!.size);
    for (const [offset, value] of this.modifications.entries()) {
      if (offset < buffer.length) {
        buffer[offset] = value;
      }
    }
    return buffer;
  }

  /**
   * Searches for a pattern (byte array) in the file.
   * Streams through the file in chunks to keep memory usage low.
   */
  async find(
    pattern: Uint8Array,
    startOffset: number = 0,
    options: { ignoreCase?: boolean } = {}
  ): Promise<number> {
    if (!this.originalFile || pattern.length === 0 || startOffset >= this.totalSize) return -1;

    let currentOffset = startOffset;
    const searchChunkSize = 256 * 1024; // 256KB
    const totalSize = this.totalSize;
    let iterations = 0;
    const ignoreCase = options.ignoreCase;

    // Pre-calculate common case targets if ignoreCase is on to save time in inner loop
    // However, since we iterate through the file, we compare pattern[j] to chunk[i+j]

    while (currentOffset < totalSize) {
      if (++iterations % 4 === 0) {
        await yieldToUI(false);
      }

      const readSize = Math.min(searchChunkSize, totalSize - currentOffset);
      const chunk = await this.getRange(currentOffset, readSize);

      // Search within the chunk
      for (let i = 0; i <= chunk.length - pattern.length; i++) {
        let match = true;
        for (let j = 0; j < pattern.length; j++) {
          const b1 = chunk[i + j];
          const b2 = pattern[j];

          if (b1 === b2) continue;

          if (ignoreCase) {
            // Check if both are ASCII letters and match case-insensitively
            // 'A' is 65, 'Z' is 90; 'a' is 97, 'z' is 122
            const isAlpha1 = (b1 >= 65 && b1 <= 90) || (b1 >= 97 && b1 <= 122);
            const isAlpha2 = (b2 >= 65 && b2 <= 90) || (b2 >= 97 && b2 <= 122);

            if (isAlpha1 && isAlpha2 && (b1 ^ 32) === b2) {
              continue;
            }
          }

          match = false;
          break;
        }
        if (match) return currentOffset + i;
      }

      // Move forward, but overlap by pattern length - 1
      const advance = readSize - pattern.length + 1;
      if (advance <= 0) break;
      currentOffset += advance;
    }

    return -1;
  }

  hasModifications(): boolean {
    return this.modifications.size > 0;
  }
}

export type StringResult = { offset: number; text: string };

/**
 * Scan a file (via HexBufferManager) for printable ASCII strings.
 * Streams through the file in chunks to keep memory usage low.
 *
 * Options:
 * - onProgress: called with scanned/total periodically
 * - onResult: called each time a string meeting minLen is found (useful for incremental UI)
 * - signal: optional AbortSignal to cancel the scan
 */
export async function scanForStrings(
  bufferManager: HexBufferManager,
  minLen: number,
  options: {
    onProgress?: (progress: { scanned: number; total: number }) => void;
    onResult?: (res: StringResult) => void;
    signal?: AbortSignal | null;
  } = {}
): Promise<StringResult[]> {
  const { onProgress, onResult, signal } = options;
  const results: StringResult[] = [];

  if (!bufferManager || minLen <= 0) return results;

  const total = bufferManager.totalSize;
  const chunkSize = 256 * 1024; // 256KB
  let offset = 0;

  // carry holds bytes that may be part of a string that spans chunk boundary
  let carry: Uint8Array = new Uint8Array(0);
  const decoder = new TextDecoder('ascii');

  const isPrintable = (b: number) => (b >= 32 && b <= 126) || b === 9;

  while (offset < total) {
    if (signal?.aborted) break;

    const readSize = Math.min(chunkSize, total - offset);
    const chunk = await bufferManager.getRange(offset, readSize);

    // combine carry + chunk
    const bytes = new Uint8Array(carry.length + chunk.length);
    bytes.set(carry);
    bytes.set(chunk, carry.length);

    let seqStart = -1;
    let i = 0;
    for (; i < bytes.length; i++) {
      const b = bytes[i];
      if (isPrintable(b)) {
        if (seqStart === -1) seqStart = i;
      } else {
        if (seqStart !== -1) {
          const len = i - seqStart;
          if (len >= minLen) {
            const slice = bytes.subarray(seqStart, i);
            const s = decoder.decode(slice);
            const globalOffset = offset - carry.length + seqStart;
            const r = { offset: globalOffset, text: s };
            results.push(r);
            if (onResult) onResult(r);
          }
        }
        seqStart = -1;
      }
    }

    // After the loop, if seqStart is NOT -1, it means we are in the middle of a printable sequence
    // that reached the end of the chunk. We carry it over to the next chunk.
    if (seqStart !== -1) {
      // If carry is getting too large, we must flush some of it to avoid OOM
      // while ensuring we don't break a potential string.
      // But for a string search, we really want the whole string.
      // Most files won't have 100MB+ of continuous printable ASCII.
      // We'll limit carry to 1MB. If it exceeds that, we flush the first part.
      const MAX_CARRY = 1024 * 1024;
      if (bytes.length - seqStart > MAX_CARRY) {
        const flushEnd = bytes.length - MAX_CARRY;
        const slice = bytes.subarray(seqStart, flushEnd);
        const s = decoder.decode(slice);
        const r = { offset: offset - carry.length + seqStart, text: s };
        results.push(r);
        if (onResult) onResult(r);
        seqStart = flushEnd;
      }
      carry = bytes.slice(seqStart);
    } else {
      carry = new Uint8Array(0);
    }

    offset += readSize;
    if (onProgress) onProgress({ scanned: Math.min(offset, total), total });

    // Yield occasionally to keep UI responsive
    await yieldToUI(false);
  }

  // At end, flush any remaining carry
  if (!signal?.aborted && carry.length >= minLen) {
    const s = decoder.decode(carry);
    const r = { offset: total - carry.length, text: s };
    results.push(r);
    if (onResult) onResult(r);
  }

  return results;
}
