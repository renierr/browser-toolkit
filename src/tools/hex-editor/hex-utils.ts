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
 * Formats a byte as an ASCII character, or a dot if non-printable.
 * Escapes HTML entities to prevent breaking the viewer.
 */
export function formatAscii(byte: number): string {
  // Printable ASCII range is 32-126
  if (byte < 32 || byte > 126) return '.';

  const char = String.fromCharCode(byte);
  switch (char) {
    case '<': return '&lt;';
    case '>': return '&gt;';
    case '&': return '&amp;';
    default: return char;
  }
}

/**
 * Reads a chunk from a File or Blob.
 */
export async function readChunk(file: File | Blob, offset: number, length: number): Promise<Uint8Array> {
  const blob = file.slice(offset, offset + length);
  const buffer = await blob.arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Generates a line of hex and ASCII representation.
 */
export function generateLine(offset: number, bytes: Uint8Array): {
  offset: string;
  hex: string[];
  ascii: string;
} {
  const hex: string[] = [];
  let ascii = '';

  for (let i = 0; i < BYTES_PER_LINE; i++) {
    if (i < bytes.length) {
      hex.push(formatHex(bytes[i]));
      ascii += formatAscii(bytes[i]);
    } else {
      hex.push('');
      ascii += ' ';
    }
  }

  return {
    offset: formatOffset(offset),
    hex,
    ascii
  };
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
