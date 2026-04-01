// IT (Impulse Tracker) sample decompression
// Based on the official IT 2.04 format documentation

export class BitReader {
  private data: Uint8Array;
  private pos: number;
  private bitBit: number;

  constructor(data: Uint8Array, offset: number) {
    this.data = data;
    this.pos = offset;
    this.bitBit = 0;
  }

  readBits(numBits: number): number {
    let value = 0;
    let bitsRead = 0;

    while (bitsRead < numBits) {
      if (this.pos >= this.data.length) return 0;
      let bitsAvailable = 8 - this.bitBit;
      let bitsToRead = Math.min(numBits - bitsRead, bitsAvailable);

      let mask = (1 << bitsToRead) - 1;
      value |= ((this.data[this.pos] >> this.bitBit) & mask) << bitsRead;

      this.bitBit += bitsToRead;
      bitsRead += bitsToRead;

      if (this.bitBit === 8) {
        this.bitBit = 0;
        this.pos++;
      }
    }
    return value;
  }
}

export function decompressIT8(
  inData: Uint8Array,
  offset: number,
  outLen: number,
  isSigned: boolean
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

    let bitWidth = 9;
    let d1 = 0;
    let d2 = 0;
    let blockSamples = Math.min(0x8000, outLen - outPos);
    let blockEnd = outPos + blockSamples;

    while (outPos < blockEnd) {
      let v = br.readBits(bitWidth);

      if (bitWidth < 7) {
        if (v === 1 << (bitWidth - 1)) {
          let v2 = br.readBits(3) + 1;
          bitWidth = v2 < bitWidth ? v2 : v2 + 1;
          continue;
        }
      } else if (bitWidth > 7) {
        if (v === (1 << (bitWidth - 1)) + (1 << (bitWidth - 2)) || v === (1 << bitWidth) - 1) {
          let v2 = br.readBits(3) + 1;
          bitWidth = v2 < bitWidth ? v2 : v2 + 1;
          continue;
        }
      } else {
        if (v === 128) {
          let v2 = br.readBits(3) + 1;
          bitWidth = v2 < bitWidth ? v2 : v2 + 1;
          continue;
        }
      }

      if (bitWidth <= 8) {
        let shift = 8 - bitWidth;
        v = ((v << shift) << 24) >> (24 + shift);
      } else {
        v = (v << 23) >> 23;
      }

      d1 += v;
      d2 += d1;
      let finalVal = d2 & 0xff;

      if (isSigned) {
        if (finalVal >= 128) finalVal -= 256;
      } else {
        finalVal -= 128;
      }

      out[outPos++] = finalVal / 128;
    }
  }

  return out;
}

export function decompressIT16(
  inData: Uint8Array,
  offset: number,
  outLen: number,
  isSigned: boolean
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
    let blockSamples = Math.min(0x8000, outLen - outPos);
    let blockEnd = outPos + blockSamples;

    while (outPos < blockEnd) {
      let v = br.readBits(bitWidth);

      if (bitWidth < 7) {
        if (v === 1 << (bitWidth - 1)) {
          let v2 = br.readBits(4) + 1;
          bitWidth = v2 < bitWidth ? v2 : v2 + 1;
          continue;
        }
      } else if (bitWidth > 7) {
        if (v === (1 << (bitWidth - 1)) + (1 << (bitWidth - 2))) {
          let v2 = br.readBits(4) + 1;
          bitWidth = v2 < bitWidth ? v2 : v2 + 1;
          continue;
        } else if (v === (1 << bitWidth) - 1) {
          break;
        }
      } else {
        if (v === 128) {
          let v2 = br.readBits(4) + 1;
          bitWidth = v2 < bitWidth ? v2 : v2 + 1;
          continue;
        }
      }

      if (bitWidth <= 16) {
        let shift = 16 - bitWidth;
        v = ((v << shift) << 16) >> (16 + shift);
      } else {
        v = (v << 15) >> 15;
      }

      d1 += v;
      d2 += d1;
      let finalVal = d2 & 0xffff;

      if (isSigned) {
        if (finalVal >= 32768) finalVal -= 65536;
      } else {
        finalVal -= 32768;
      }

      out[outPos++] = finalVal / 32768;
    }
  }

  return out;
}
