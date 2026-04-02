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

/**
 * Decompress 8-bit IT compressed samples.
 * @param isIT215 - true = IT 2.15 double-integration mode, false = IT 2.14 single-integration
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

      // Sentinel / width-change detection
      if (bitWidth < 7) {
        if (v === 1 << (bitWidth - 1)) {
          const nw = br.readBits(3) + 1;
          bitWidth = nw < bitWidth ? nw : nw + 1;
          if (bitWidth > 9) bitWidth = 9;
          continue;
        }
      } else if (bitWidth < 9) {
        // widths 7-8
        if (v === 1 << (bitWidth - 1)) {
          const nw = br.readBits(3) + 1;
          bitWidth = nw < bitWidth ? nw : nw + 1;
          if (bitWidth > 9) bitWidth = 9;
          continue;
        }
      } else {
        // bitWidth == 9
        if (v & 0x100) {
          if (isIT215) {
            // IT 2.15: lower 8 bits = raw sample value injected into d1
            d1 = v & 0xff;
            if (d1 >= 128) d1 -= 256;
            d2 += d1;
            let finalVal = d2 & 0xff;
            if (finalVal >= 128) finalVal -= 256;
            out[outPos++] = finalVal / 128;
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
      let signedVal: number;
      if (bitWidth < 9) {
        signedVal = v & (1 << (bitWidth - 1)) ? v - (1 << bitWidth) : v;
      } else {
        signedVal = v & 0x100 ? v - 0x200 : v;
      }

      // IT 2.14: single integration; IT 2.15: double integration
      d1 += signedVal;
      if (isIT215) {
        d2 += d1;
        let finalVal = d2 & 0xff;
        if (finalVal >= 128) finalVal -= 256;
        out[outPos++] = finalVal / 128;
      } else {
        let finalVal = d1 & 0xff;
        if (finalVal >= 128) finalVal -= 256;
        out[outPos++] = finalVal / 128;
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
  isIT215: boolean
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

      if (bitWidth < 7) {
        if (v === 1 << (bitWidth - 1)) {
          const nw = br.readBits(4) + 1;
          bitWidth = nw < bitWidth ? nw : nw + 1;
          if (bitWidth > 17) bitWidth = 17;
          continue;
        }
      } else if (bitWidth < 17) {
        if (v === 1 << (bitWidth - 1)) {
          const nw = br.readBits(4) + 1;
          bitWidth = nw < bitWidth ? nw : nw + 1;
          if (bitWidth > 17) bitWidth = 17;
          continue;
        }
      } else {
        // bitWidth == 17
        if (v & 0x10000) {
          if (isIT215) {
            // IT 2.15: lower 16 bits = raw sample value
            d1 = v & 0xffff;
            if (d1 >= 32768) d1 -= 65536;
            d2 += d1;
            const fv = d2 & 0xffff;
            let finalVal = fv >= 32768 ? fv - 65536 : fv;
            out[outPos++] = finalVal / 32768;
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
      let signedVal: number;
      if (bitWidth < 17) {
        signedVal = v & (1 << (bitWidth - 1)) ? v - (1 << bitWidth) : v;
      } else {
        signedVal = v & 0x10000 ? v - 0x20000 : v;
      }

      // IT 2.14: single integration; IT 2.15: double integration
      d1 += signedVal;
      if (isIT215) {
        d2 += d1;
        let finalVal = d2 & 0xffff;
        if (finalVal >= 32768) finalVal -= 65536;
        out[outPos++] = finalVal / 32768;
      } else {
        let finalVal = d1 & 0xffff;
        if (finalVal >= 32768) finalVal -= 65536;
        out[outPos++] = finalVal / 32768;
      }
    }
  }

  return out;
}
