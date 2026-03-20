/**
 * PitPat packet builder helpers.
 * Builds 23-byte command packets used by PitPat proprietary treadmills.
 */
export type PitPatAction = 'START' | 'STOP' | 'PAUSE' | 'SPEED';

export function makePitPatPacket(action: PitPatAction, speed: number = 1.0): Uint8Array {
  const arr = new Uint8Array(23);

  // Header
  arr[0] = 0x6a; // START_BYTE
  arr[1] = 0x17; // LENGTH (23 bytes)

  // arr[2-5] reserved zero by default

  // Speed: PitPat expects speed as integer where 1000 == 1.00 kph
  const speedUnit = Math.round(speed * 1000);
  arr[6] = (speedUnit >> 8) & 0xff;
  arr[7] = speedUnit & 0xff;

  // Mode byte: 5 for set_speed, 1 for others
  arr[8] = action === 'SPEED' ? 0x05 : 0x01;
  arr[9] = 0x00; // incline placeholder
  arr[10] = 80; // default weight
  arr[11] = 0x00; // reserved

  // Command byte: 4 = start/set, 2 = pause, 0 = stop
  let cmd = action === 'PAUSE' ? 2 : action === 'STOP' ? 0 : 4;
  arr[12] = cmd & 0xf7; // kph mode (bit 3 = 0)

  // User ID (8 bytes) - placeholder constant
  const userId = 58965456623n;
  for (let i = 0; i < 8; ++i) {
    arr[13 + i] = Number((userId >> BigInt(56 - i * 8)) & 0xffn);
  }

  // Checksum: XOR of bytes 1 to 20
  let checksum = 0;
  for (let i = 1; i <= 20; ++i) {
    checksum ^= arr[i];
  }
  arr[21] = checksum;
  arr[22] = 0x43; // END_BYTE

  return arr;
}
