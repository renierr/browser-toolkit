export interface TreadmillData {
  speed?: number; // km/h
  averageSpeed?: number; // km/h
  distance?: number; // km
  inclination?: number; // %
  elevationGainPositive?: number; // m
  elevationGainNegative?: number; // m
  instantaneousPace?: number; // min/km
  averagePace?: number; // min/km
  calories?: number; // kcal
  heartRate?: number; // bpm
  metabolicEquivalent?: number; // METs
  elapsedTime?: number; // seconds
  remainingTime?: number; // seconds
  // PitPat / proprietary fields
  steps?: number;
  status?: string; // e.g. 'Running' | 'Stopped'
  isMetric?: boolean;
}

/**
 * Parses the Treadmill Data characteristic (0x2ACD) from an FTMS device.
 * Based on the Bluetooth Fitness Machine Service specification.
 */
export function parseTreadmillData(value: DataView): TreadmillData {
  const data: TreadmillData = {};
  if (value.byteLength < 2) return data;

  const flags = value.getUint16(0, true);
  let offset = 2;

  // Instantaneous Speed (Mandatory)
  data.speed = value.getUint16(offset, true) / 100.0;
  offset += 2;

  // Average Speed (bit 1)
  if (flags & (1 << 1)) {
    data.averageSpeed = value.getUint16(offset, true) / 100.0;
    offset += 2;
  }

  // Total Distance (bit 2)
  if (flags & (1 << 2)) {
    const d1 = value.getUint8(offset);
    const d2 = value.getUint8(offset + 1);
    const d3 = value.getUint8(offset + 2);
    data.distance = (d1 | (d2 << 8) | (d3 << 16)) / 1000.0;
    offset += 3;
  }

  // Inclination and Degree of Suspension (bit 3)
  if (flags & (1 << 3)) {
    data.inclination = value.getInt16(offset, true) / 10.0;
    offset += 2;
    // Skip Degree of Suspension
    offset += 2;
  }

  // Elevation Gain (bit 4)
  if (flags & (1 << 4)) {
    data.elevationGainPositive = value.getUint16(offset, true) / 10.0;
    offset += 2;
    data.elevationGainNegative = value.getUint16(offset, true) / 10.0;
    offset += 2;
  }

  // Instantaneous Pace (bit 5)
  if (flags & (1 << 5)) {
    data.instantaneousPace = value.getUint8(offset) / 10.0; // 0.1 min/km
    offset += 1;
  }

  // Average Pace (bit 6)
  if (flags & (1 << 6)) {
    data.averagePace = value.getUint8(offset) / 10.0; // 0.1 min/km
    offset += 1;
  }

  // Expended Energy (bit 7)
  if (flags & (1 << 7)) {
    data.calories = value.getUint16(offset, true);
    offset += 2; // Total Energy
    offset += 2; // Energy per Hour
    offset += 1; // Energy per Minute
  }

  // Heart Rate (bit 8)
  if (flags & (1 << 8)) {
    data.heartRate = value.getUint8(offset);
    offset += 1;
  }

  // Metabolic Equivalent (bit 9)
  if (flags & (1 << 9)) {
    data.metabolicEquivalent = value.getUint8(offset) / 10.0;
    offset += 1;
  }

  // Elapsed Time (bit 10)
  if (flags & (1 << 10)) {
    data.elapsedTime = value.getUint16(offset, true);
    offset += 2;
  }

  // Remaining Time (bit 11)
  if (flags & (1 << 11)) {
    data.remainingTime = value.getUint16(offset, true);
    offset += 2;
  }

  return data;
}

/**
 * Parser for PitPat proprietary treadmill payloads.
 */
export function parsePitPatData(value: DataView): TreadmillData {
  const data: TreadmillData = {};
  if (value.byteLength < 31) return data;

  // Read current speed (2 bytes) at offset 3 (big-endian)
  const rawSpeed = (value.getUint8(3) << 8) | value.getUint8(4);
  // Distance (4 bytes) at offset 7 (big-endian)
  const rawDist = (value.getUint8(7) << 24) | (value.getUint8(8) << 16) | (value.getUint8(9) << 8) | value.getUint8(10);
  // Steps (4 bytes) at offset 14
  const steps = (value.getUint8(14) << 24) | (value.getUint8(15) << 16) | (value.getUint8(16) << 8) | value.getUint8(17);
  // Calories (2 bytes) at offset 18 (big-endian)
  const calories = (value.getUint8(18) << 8) | value.getUint8(19);
  // Duration (4 bytes) at offset 20 (milliseconds)
  const durationMs = (value.getUint8(20) << 24) | (value.getUint8(21) << 16) | (value.getUint8(22) << 8) | value.getUint8(23);

  const flags = value.getUint8(26);
  const unitMode = (flags & 128) === 128 ? 1 : 0; // 1 = imperial (mph/mi), 0 = metric
  const runningStateBits = flags & 24; // bits 3-4

  let status: string | undefined;
  if (runningStateBits === 24) status = 'Starting';
  else if (runningStateBits === 8) status = 'Running';
  else if (runningStateBits === 16) status = 'Paused';
  else status = 'Stopped';

  data.speed = rawSpeed / 1000.0; // PitPat uses 1000 == 1.00 kph
  data.distance = rawDist / 1000.0; // raw in meters -> km
  data.calories = calories;
  (data as any).steps = steps;
  data.elapsedTime = Math.round(durationMs / 1000);
  (data as any).status = status;
  // Provide unit hint
  (data as any).isMetric = unitMode === 0;

  return data;
}

/**
 * Unified parser wrapper. If isPitPat is true, the PitPat parser is used,
 * otherwise the standard FTMS parser (`parseTreadmillData`) is used.
 */
export function parseTreadmillPayload(value: DataView, isPitPat: boolean = false): TreadmillData {
  return isPitPat ? parsePitPatData(value) : parseTreadmillData(value);
}

