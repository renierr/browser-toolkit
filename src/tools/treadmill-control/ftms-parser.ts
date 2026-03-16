export interface TreadmillData {
  speed?: number; // km/h
  distance?: number; // km
  inclination?: number; // %
  calories?: number; // kcal
  elapsedTime?: number; // seconds
}

/**
 * Parses the Treadmill Data characteristic (0x2ACD) from an FTMS device.
 * Based on the Bluetooth Fitness Machine Service specification.
 * @param value The DataView containing the characteristic value.
 */
export function parseTreadmillData(value: DataView): TreadmillData {
  const data: TreadmillData = {};
  if (value.byteLength < 2) return data;

  const flags = value.getUint16(0, true);
  let offset = 2;

  // Instantaneous Speed (Mandatory unless bit 0 is set for "More Data", 
  // but usually it's at the start of the first packet)
  // Flags bit 0: More Data (0=No, 1=Yes)
  // If data is in separate packets, speed might not be in every one, 
  // but for simple implementation we assume it is.
  data.speed = value.getUint16(offset, true) / 100.0;
  offset += 2;

  // Average Speed (bit 1) - skipping for now

  // Total Distance (bit 2)
  if (flags & (1 << 2)) {
    // uint24 (3 bytes)
    const d1 = value.getUint8(offset);
    const d2 = value.getUint8(offset + 1);
    const d3 = value.getUint8(offset + 2);
    data.distance = (d1 | (d2 << 8) | (d3 << 16)) / 1000.0; // converting m to km
    offset += 3;
  }

  // Inclination and Degree of Suspension (bit 3)
  if (flags & (1 << 3)) {
    // Inclination is sint16, Degree of Suspension is sint16
    data.inclination = value.getInt16(offset, true) / 10.0;
    offset += 2;
    // Skip Degree of Suspension for now
    offset += 2;
  }

  // Elevation Gain (bit 4) - skipping

  // Instantaneous Pace (bit 5) - skipping

  // Average Pace (bit 6) - skipping

  // Expended Energy (bit 7)
  if (flags & (1 << 7)) {
    data.calories = value.getUint16(offset, true); // Total Energy
    offset += 2;
    // Energy per Hour (uint16) - skip
    offset += 2;
    // Energy per Minute (uint8) - skip
    offset += 1;
  }

  // Heart Rate (bit 8) - skipping

  // Metabolic Equivalent (bit 9) - skipping

  // Elapsed Time (bit 10)
  if (flags & (1 << 10)) {
    data.elapsedTime = value.getUint16(offset, true);
    offset += 2;
  }

  // Remaining Time (bit 11) - skipping

  return data;
}
