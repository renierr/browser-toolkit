// IT (Impulse Tracker) sample decompression
// Based on ITTECH.TXT and the canonical ITSEX.C source by Jeffrey Lim.
//
// Key difference between IT 2.14 and IT 2.15:
// - IT 2.14: Single integration (d1 += delta; output = d1)
// - IT 2.15: Double integration (d1 += delta; d2 += d1; output = d2)
// At max bit width, IT 2.14 uses the sentinel for width change,
// while IT 2.15 uses it for a raw sample value injection.

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

function signExtend(value: number, bits: number): number {
  const signBit = 1 << (bits - 1);
  const fullRange = 1 << bits;
  return value & signBit ? value - fullRange : value;
}

function decodeMethod2WidthChange8(value: number, bitWidth: number): number | null {
  if (bitWidth < 7) {
    if (value === 1 << (bitWidth - 1)) {
      return 0; // marker: caller must read 3 extra bits
    }
    return null;
  }

  if (bitWidth < 9) {
    // IT method-2 width change for widths 7-8 uses a reserved value range.
    const border = (0xff >> (9 - bitWidth)) - 4;
    if (value > border && value <= border + 8) {
      // Encoded width domain is 1..8 (not 0..7).
      const packedWidth = value - border;
      return packedWidth < bitWidth ? packedWidth : packedWidth + 1;
    }
  }

  return null;
}

function decodeMethod2WidthChange16(value: number, bitWidth: number): number | null {
  if (bitWidth < 7) {
    if (value === 1 << (bitWidth - 1)) {
      return 0; // marker: caller must read 4 extra bits
    }
    return null;
  }

  if (bitWidth < 17) {
    // IT method-2 width change for widths 7-16 uses a reserved value range.
    const border = (0xffff >> (17 - bitWidth)) - 8;
    if (value > border && value <= border + 16) {
      // Encoded width domain is 1..16 (not 0..15).
      const packedWidth = value - border;
      return packedWidth < bitWidth ? packedWidth : packedWidth + 1;
    }
  }

  return null;
}

/**
 * Decompress 8-bit IT compressed samples.
 * @param isIT215 - true = IT 2.15 double-integration mode, false = IT 2.14 single-integration
 */
export function decompressIT8(
  inData: Uint8Array,
  offset: number,
  outLen: number,
  isIT215: boolean,
  isSigned: boolean
): Float32Array {
  let pos = offset;
  let outPos = 0;
  const out = new Float32Array(outLen);

  while (outPos < outLen) {
    if (pos + 2 > inData.length) break;
    const blockSize = inData[pos] | (inData[pos + 1] << 8);
    pos += 2;

    if (blockSize === 0 || pos + blockSize > inData.length) break;

    const br = new BitReader(inData, pos);
    pos += blockSize;

    let bitWidth = 9;
    let d1 = 0;
    let d2 = 0;
    const blockSamples = Math.min(0x8000, outLen - outPos);
    const blockEnd = outPos + blockSamples;

    while (outPos < blockEnd) {
      const v = br.readBits(bitWidth);

      const method2Width = decodeMethod2WidthChange8(v, bitWidth);
      if (method2Width !== null) {
        if (method2Width === 0) {
          const nw = br.readBits(3) + 1;
          bitWidth = nw < bitWidth ? nw : nw + 1;
        } else {
          bitWidth = method2Width;
        }
        if (bitWidth > 9) bitWidth = 9;
        if (bitWidth < 1) bitWidth = 1;
        continue;
      }

      if (bitWidth === 9) {
        // bitWidth == 9
        if (v & 0x100) {
          if (isIT215) {
            // IT 2.15: lower 8 bits = raw sample value injected into d1
            d1 = v & 0xff;
            if (d1 >= 128) d1 -= 256;
            d2 += d1;
            const wrapped = d2 & 0xff;
            if (isSigned) {
              let finalVal = wrapped;
              if (finalVal >= 128) finalVal -= 256;
              out[outPos++] = finalVal / 128;
            } else {
              out[outPos++] = (wrapped - 128) / 128;
            }
            continue;
          } else {
            // IT 2.14: width change
            const nw = (v & 0xff) + 1;
            if (nw >= 1 && nw <= 9) bitWidth = nw;
            continue;
          }
        }
      }

      // Sign-extend value from bitWidth bits
      const signedVal = signExtend(v, bitWidth);

      // IT 2.14: single integration; IT 2.15: double integration
      d1 += signedVal;
      if (isIT215) {
        d2 += d1;
        const wrapped = d2 & 0xff;
        if (isSigned) {
          let finalVal = wrapped;
          if (finalVal >= 128) finalVal -= 256;
          out[outPos++] = finalVal / 128;
        } else {
          out[outPos++] = (wrapped - 128) / 128;
        }
      } else {
        const wrapped = d1 & 0xff;
        if (isSigned) {
          let finalVal = wrapped;
          if (finalVal >= 128) finalVal -= 256;
          out[outPos++] = finalVal / 128;
        } else {
          out[outPos++] = (wrapped - 128) / 128;
        }
      }
    }
  }

  return out;
}

/**
 * Decompress 16-bit IT compressed samples.
 * @param isIT215 - true = IT 2.15 double-integration mode, false = IT 2.14 single-integration
 */
export function decompressIT16(
  inData: Uint8Array,
  offset: number,
  outLen: number,
  isIT215: boolean,
  isSigned: boolean
): Float32Array {
  let pos = offset;
  let outPos = 0;
  const out = new Float32Array(outLen);

  while (outPos < outLen) {
    if (pos + 2 > inData.length) break;
    const blockSize = inData[pos] | (inData[pos + 1] << 8);
    pos += 2;

    if (blockSize === 0 || pos + blockSize > inData.length) break;

    const br = new BitReader(inData, pos);
    pos += blockSize;

    let bitWidth = 17;
    let d1 = 0;
    let d2 = 0;
    const blockSamples = Math.min(0x4000, outLen - outPos);
    const blockEnd = outPos + blockSamples;

    while (outPos < blockEnd) {
      const v = br.readBits(bitWidth);

      const method2Width = decodeMethod2WidthChange16(v, bitWidth);
      if (method2Width !== null) {
        if (method2Width === 0) {
          const nw = br.readBits(4) + 1;
          bitWidth = nw < bitWidth ? nw : nw + 1;
        } else {
          bitWidth = method2Width;
        }
        if (bitWidth > 17) bitWidth = 17;
        if (bitWidth < 1) bitWidth = 1;
        continue;
      }

      if (bitWidth === 17) {
        // bitWidth == 17
        if (v & 0x10000) {
          if (isIT215) {
            // IT 2.15: lower 16 bits = raw sample value
            d1 = v & 0xffff;
            if (d1 >= 32768) d1 -= 65536;
            d2 += d1;
            const wrapped = d2 & 0xffff;
            if (isSigned) {
              let finalVal = wrapped;
              if (finalVal >= 32768) finalVal -= 65536;
              out[outPos++] = finalVal / 32768;
            } else {
              out[outPos++] = (wrapped - 32768) / 32768;
            }
            continue;
          } else {
            // IT 2.14: width change
            const nw = (v & 0xffff) + 1;
            if (nw >= 1 && nw <= 17) bitWidth = nw;
            continue;
          }
        }
      }

      // Sign-extend value from bitWidth bits
      const signedVal = signExtend(v, bitWidth);

      // IT 2.14: single integration; IT 2.15: double integration
      d1 += signedVal;
      if (isIT215) {
        d2 += d1;
        const wrapped = d2 & 0xffff;
        if (isSigned) {
          let finalVal = wrapped;
          if (finalVal >= 32768) finalVal -= 65536;
          out[outPos++] = finalVal / 32768;
        } else {
          out[outPos++] = (wrapped - 32768) / 32768;
        }
      } else {
        const wrapped = d1 & 0xffff;
        if (isSigned) {
          let finalVal = wrapped;
          if (finalVal >= 32768) finalVal -= 65536;
          out[outPos++] = finalVal / 32768;
        } else {
          out[outPos++] = (wrapped - 32768) / 32768;
        }
      }
    }
  }

  return out;
}
