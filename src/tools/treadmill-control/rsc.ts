import type { TreadmillData } from './ftms-parser';

/**
 * Parse an RSC Measurement (0x2A53) DataView and return partial treadmill data.
 * According to the Bluetooth spec:
 * Flags (8) | Instantaneous Speed (uint16, 1/256 m/s) | Instantaneous Cadence (uint8, RPM)
 * Optionally: Stride Length (uint16, 1/100 m) | Total Distance (uint32, 1/100 m)
 * Some manufacturers append proprietary fields (e.g. cumulative stride count).
 */
export function parseRSCMeasurement(value: DataView): Partial<TreadmillData> {
  const parsed: Partial<TreadmillData> = {};
  if (!value || value.byteLength < 3) return parsed;
  try {
    let offset = 0;
    const flags = value.getUint8(offset);
    offset += 1;

    // Instantaneous Speed (uint16) - units 1/256 m/s
    value.getUint16(offset, true); // consumed but not used here
    offset += 2;

    // Instantaneous Cadence (uint8) - in steps per minute (spm)
    const instCadence = value.getUint8(offset);
    offset += 1;
    parsed.cadence = instCadence;

    // Optional Stride Length (uint16, 1/100 m)
    if (flags & 0x01) {
      value.getUint16(offset, true);
      offset += 2;
    }

    // Optional Total Distance (uint32, 1/100 m)
    if (flags & 0x02) {
      const totDistRaw = value.getUint32(offset, true);
      offset += 4;
      parsed.distance = totDistRaw / 1000.0; // km
    }

    // If manufacturer appended a cumulative stride/step counter, try to parse it
    const remaining = value.byteLength - offset;
    if (remaining >= 4) {
      parsed.cumulativeStrideCount = value.getUint32(offset, true);
    } else if (remaining >= 2) {
      parsed.cumulativeStrideCount = value.getUint16(offset, true);
    }
  } catch (e) {
    // ignore parse errors; return whatever we managed to parse
    console.warn('RSC parse error', e);
  }
  return parsed;
}

/**
 * Subscribe to RSC Measurement characteristic and call `onData` when parsed values arrive.
 * Returns a cleanup function that stops notifications and removes listeners.
 */
export async function subscribeToRSC(device: BluetoothDevice | null, onData: (d: Partial<TreadmillData>) => void): Promise<() => Promise<void>> {
  if (!device || !device.gatt) return async () => {};
  try {
    const service = await device.gatt.getPrimaryService(0x1814);
    if (!service) return async () => {};
    const char = await service.getCharacteristic(0x2A53);
    if (!char) return async () => {};

    const listener = (ev: Event) => {
      const target = ev.target as BluetoothRemoteGATTCharacteristic;
      const value = target.value;
      if (!value) return;
      const parsed = parseRSCMeasurement(value);
      onData(parsed);
    };

    await char.startNotifications();
    char.addEventListener('characteristicvaluechanged', listener);

    // Try initial read if available
    try {
      const val = await char.readValue();
      if (val) onData(parseRSCMeasurement(val));
    } catch (_) {
      // ignore read errors
    }

    return async () => {
      try {
        char.removeEventListener('characteristicvaluechanged', listener);
        await char.stopNotifications();
      } catch (_) {
        // ignore
      }
    };
  } catch (e) {
    // service/char not found or error — return noop cleanup
    return async () => {};
  }
}

