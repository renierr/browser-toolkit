export const PREAMBLE_BYTES = 4;
export const SYNC_BYTES = 2;
export const LENGTH_BYTES = 2;
export const CRC_BYTES = 2;

export const PREAMBLE = 0xaa;
export const SYNC_WORD = 0x3c5a;

export const HEADER_SIZE = PREAMBLE_BYTES + SYNC_BYTES + LENGTH_BYTES + CRC_BYTES;

function crc16(data: Uint8Array): number {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i] << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc <<= 1;
      }
      crc &= 0xffff;
    }
  }
  return crc;
}

export function encodeFrame(payload: Uint8Array): Uint8Array {
  const len = payload.length;
  if (len > 0xffff) throw new Error('Payload too large');

  const frame = new Uint8Array(HEADER_SIZE + len);

  let off = 0;
  frame.fill(PREAMBLE, off, off + PREAMBLE_BYTES);
  off += PREAMBLE_BYTES;

  frame[off++] = (SYNC_WORD >> 8) & 0xff;
  frame[off++] = SYNC_WORD & 0xff;

  frame[off++] = (len >> 8) & 0xff;
  frame[off++] = len & 0xff;

  frame.set(payload, off);
  off += len;

  const crcVal = crc16(frame.slice(PREAMBLE_BYTES, off));
  frame[off++] = (crcVal >> 8) & 0xff;
  frame[off++] = crcVal & 0xff;

  return frame;
}

export interface DecodeResult {
  payload: Uint8Array;
  frameLength: number;
}

export function decodeFrame(frame: Uint8Array): DecodeResult | null {
  let idx = 0;

  while (idx < frame.length - HEADER_SIZE) {
    let preambleFound = true;
    for (let i = 0; i < PREAMBLE_BYTES; i++) {
      if (frame[idx + i] !== PREAMBLE) {
        preambleFound = false;
        break;
      }
    }
    if (!preambleFound) {
      idx++;
      continue;
    }
    idx += PREAMBLE_BYTES;

    const syncHi = frame[idx++];
    const syncLo = frame[idx++];
    const syncWord = (syncHi << 8) | syncLo;
    if (syncWord !== SYNC_WORD) {
      idx -= PREAMBLE_BYTES - 1;
      continue;
    }

    const lenHi = frame[idx++];
    const lenLo = frame[idx++];
    const payloadLen = (lenHi << 8) | lenLo;

    if (idx + payloadLen + CRC_BYTES > frame.length) {
      return null;
    }

    const payload = frame.slice(idx, idx + payloadLen);
    idx += payloadLen;

    const crcHi = frame[idx++];
    const crcLo = frame[idx++];
    const crcStored = (crcHi << 8) | crcLo;

    const dataForCrc = frame.slice(idx - payloadLen - CRC_BYTES - LENGTH_BYTES, idx - CRC_BYTES);
    const crcCalc = crc16(dataForCrc);

    if (crcCalc === crcStored) {
      return { payload, frameLength: idx };
    }
  }

  return null;
}

export function dataToBits(data: Uint8Array): number[] {
  const bits: number[] = [];
  for (let i = 0; i < data.length; i++) {
    for (let b = 7; b >= 0; b--) {
      bits.push((data[i] >> b) & 1);
    }
  }
  return bits;
}

export function bitsToData(bits: number[]): Uint8Array {
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    let val = 0;
    for (let b = 0; b < 8; b++) {
      const bitIdx = i * 8 + b;
      if (bitIdx < bits.length && bits[bitIdx]) {
        val |= 1 << (7 - b);
      }
    }
    bytes[i] = val;
  }
  return bytes;
}

export function frameSize(payloadLength: number): number {
  return HEADER_SIZE + payloadLength;
}

export interface TransferStats {
  totalBits: number;
  totalBytes: number;
  bitTimeMs: number;
  repeats: number;
  estimatedMs: number;
}

export function estimateTransfer(
  payloadBytes: number,
  bitTimeMs: number,
  repeats: number
): TransferStats {
  const payloadBits = payloadBytes * 8;
  const overheadBits = HEADER_SIZE * 8;
  const totalBits = (payloadBits + overheadBits) * repeats;
  const estimatedMs = totalBits * bitTimeMs;
  return {
    totalBits,
    totalBytes: payloadBytes,
    bitTimeMs,
    repeats,
    estimatedMs,
  };
}
