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
