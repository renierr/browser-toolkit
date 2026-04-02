// IT (Impulse Tracker) sample decompression
// Based on ITTECH.TXT and reference implementations (SchismTracker, libxmp, OpenMPT)

export class BitReader {
  private data: Uint8Array;
  private pos: number;
  private bitPos: number;

  constructor(data: Uint8Array, offset: number) {
    this.data = data;
    this.pos = offset;
    this.bitPos = 0;
  }

  readBits(numBits: number): number {
    let value = 0;
    let bitsRead = 0;

    while (bitsRead < numBits) {
      if (this.pos >= this.data.length) return value;
      const bitsAvailable = 8 - this.bitPos;
      const bitsToRead = Math.min(numBits - bitsRead, bitsAvailable);
      const mask = (1 << bitsToRead) - 1;
      value |= ((this.data[this.pos] >> this.bitPos) & mask) << bitsRead;

      this.bitPos += bitsToRead;
      bitsRead += bitsToRead;

      if (this.bitPos >= 8) {
        this.bitPos = 0;
        this.pos++;
      }
    }
    return value;
  }
}

/**
 * Decompress 8-bit IT compressed samples.
 * IT uses a variable-width delta encoding with in-stream width change commands.
 * The `isIT215` flag controls whether IT 2.15 compression is used (raw value mode).
 */
export function decompressIT8(
  inData: Uint8Array,
  offset: number,
  outLen: number,
  isIT215: boolean
): Float32Array {
  let pos = offset;
  let outPos = 0;
  const out = new Float32Array(outLen);

  while (outPos < outLen) {
    if (pos + 2 > inData.length) break;
    // Read compressed block size (number of bytes of compressed data)
    const blockSize = inData[pos] | (inData[pos + 1] << 8);
    pos += 2;

    const br = new BitReader(inData, pos);
    pos += blockSize;

    let bitWidth = 9;
    let d1 = 0; // delta accumulator 1 (IT 2.15 uses two integrators)
    let d2 = 0; // delta accumulator 2
    const blockSamples = Math.min(0x8000, outLen - outPos);
    const blockEnd = outPos + blockSamples;

    while (outPos < blockEnd) {
      const v = br.readBits(bitWidth);

      // Check for width change sentinel values
      if (bitWidth <= 6) {
        // For widths 1-6: sentinel is the value with only the sign bit set
        if (v === 1 << (bitWidth - 1)) {
          const newWidth = br.readBits(3) + 1;
          bitWidth = newWidth < bitWidth ? newWidth : newWidth + 1;
          continue;
        }
      } else if (bitWidth < 9) {
        // For widths 7-8: sentinel is sign bit only
        if (v === 1 << (bitWidth - 1)) {
          const newWidth = br.readBits(3) + 1;
          bitWidth = newWidth < bitWidth ? newWidth : newWidth + 1;
          continue;
        }
      } else {
        // bitWidth == 9: the 9th bit indicates special mode
        if (v & 0x100) {
          if (isIT215) {
            // IT 2.15: lower 8 bits are a raw sample value (not a delta)
            d1 = v & 0xff;
            d2 += d1;
            let finalVal = d2 & 0xff;
            if (finalVal >= 128) finalVal -= 256;
            out[outPos++] = finalVal / 128;
            continue;
          } else {
            // IT 2.14: change width
            const newWidth = (v & 0xff) + 1;
            if (newWidth < 1 || newWidth > 9) continue;
            bitWidth = newWidth;
            continue;
          }
        }
      }

      // Sign-extend the value from bitWidth bits to a signed integer
      let signedVal: number;
      if (bitWidth < 9) {
        if (v & (1 << (bitWidth - 1))) {
          signedVal = v - (1 << bitWidth);
        } else {
          signedVal = v;
        }
      } else {
        signedVal = v & (1 << 8) ? v - (1 << 9) : v;
      }

      // Accumulate deltas
      d1 += signedVal;
      d2 += d1;
      let finalVal = d2 & 0xff;
      if (finalVal >= 128) finalVal -= 256;
      out[outPos++] = finalVal / 128;
    }
  }

  return out;
}

/**
 * Decompress 16-bit IT compressed samples.
 * Same algorithm as 8-bit but with wider values and different block size.
 */
export function decompressIT16(
  inData: Uint8Array,
  offset: number,
  outLen: number,
  isIT215: boolean
): Float32Array {
  let pos = offset;
  let outPos = 0;
  const out = new Float32Array(outLen);

  while (outPos < outLen) {
    if (pos + 2 > inData.length) break;
    const blockSize = inData[pos] | (inData[pos + 1] << 8);
    pos += 2;

    const br = new BitReader(inData, pos);
    pos += blockSize;

    let bitWidth = 17;
    let d1 = 0;
    let d2 = 0;
    const blockSamples = Math.min(0x4000, outLen - outPos);
    const blockEnd = outPos + blockSamples;

    while (outPos < blockEnd) {
      const v = br.readBits(bitWidth);

      if (bitWidth <= 6) {
        if (v === 1 << (bitWidth - 1)) {
          const newWidth = br.readBits(4) + 1;
          bitWidth = newWidth < bitWidth ? newWidth : newWidth + 1;
          continue;
        }
      } else if (bitWidth < 17) {
        if (v === 1 << (bitWidth - 1)) {
          const newWidth = br.readBits(4) + 1;
          bitWidth = newWidth < bitWidth ? newWidth : newWidth + 1;
          continue;
        }
      } else {
        // bitWidth == 17: the 17th bit indicates special mode
        if (v & 0x10000) {
          if (isIT215) {
            // IT 2.15: lower 16 bits are a raw sample value
            d1 = v & 0xffff;
            d2 += d1;
            let finalVal = d2 & 0xffff;
            if (finalVal >= 32768) finalVal -= 65536;
            out[outPos++] = finalVal / 32768;
            continue;
          } else {
            const newWidth = (v & 0xffff) + 1;
            if (newWidth < 1 || newWidth > 17) continue;
            bitWidth = newWidth;
            continue;
          }
        }
      }

      // Sign-extend value
      let signedVal: number;
      if (bitWidth < 17) {
        if (v & (1 << (bitWidth - 1))) {
          signedVal = v - (1 << bitWidth);
        } else {
          signedVal = v;
        }
      } else {
        signedVal = v & (1 << 16) ? v - (1 << 17) : v;
      }

      d1 += signedVal;
      d2 += d1;
      let finalVal = d2 & 0xffff;
      if (finalVal >= 32768) finalVal -= 65536;
      out[outPos++] = finalVal / 32768;
    }
  }

  return out;
}
