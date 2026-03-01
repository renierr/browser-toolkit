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
 */
export function formatAscii(byte: number): string {
  // Printable ASCII range is 32-126
  return byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.';
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
   * @param pattern The sequence of bytes to find.
   * @param startOffset Where to start searching.
   * @param onProgress Optional callback for progress.
   * @returns The offset of the first match, or -1 if not found.
   */
  async find(pattern: Uint8Array, startOffset: number = 0, onProgress?: (percent: number) => void): Promise<number> {
    if (!this.originalFile || pattern.length === 0) return -1;

    let currentOffset = startOffset;
    const searchChunkSize = 256 * 1024; // 256KB chunks for searching
    const totalSize = this.totalSize;

    // Pattern search logic (naive but effective for most cases)
    while (currentOffset < totalSize) {
      const readSize = Math.min(searchChunkSize, totalSize - currentOffset);
      const chunk = await this.getRange(currentOffset, readSize);

      if (onProgress) onProgress((currentOffset / totalSize) * 100);

      // Search within the chunk
      for (let i = 0; i <= chunk.length - pattern.length; i++) {
        let match = true;
        for (let j = 0; j < pattern.length; j++) {
          if (chunk[i + j] !== pattern[j]) {
            match = false;
            break;
          }
        }
        if (match) return currentOffset + i;
      }

      // Move forward by chunk size minus pattern length to avoid missing matches across boundaries
      currentOffset += (readSize - pattern.length + 1);

      // Safety break for invalid states
      if (readSize <= pattern.length && currentOffset < totalSize) {
        currentOffset = totalSize;
      }
    }

    return -1;
  }

  hasModifications(): boolean {
    return this.modifications.size > 0;
  }
}
