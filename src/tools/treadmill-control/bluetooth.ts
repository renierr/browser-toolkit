import { parseTreadmillData, parseTreadmillPayload, type TreadmillData } from './ftms-parser';

export const FTMS_SERVICE_UUID = 0x1826;
export const TREADMILL_DATA_CHAR_UUID = 0x2ACD;
export const FITNESS_MACHINE_FEATURE_CHAR_UUID = 0x2ACC;
export const FITNESS_MACHINE_CONTROL_POINT_CHAR_UUID = 0x2AD9;

// PitPat (proprietary) UUIDs (string form)
export const PITPAT_SERVICE_UUID = '0000fba0-0000-1000-8000-00805f9b34fb';
export const PITPAT_NOTIFY_CHAR_UUID = '0000fba2-0000-1000-8000-00805f9b34fb';
export const PITPAT_WRITE_CHAR_UUID = '0000fba1-0000-1000-8000-00805f9b34fb';

export interface MachineSupport {
  controlSupported: boolean;
  speedControlSupported: boolean;
  inclineControlSupported: boolean;
}

export type TreadmillDeviceType = 'FTMS' | 'PITPAT';

/**
 * Connect to either an FTMS or a PitPat treadmill. The function will try to
 * detect which type is available and wire up notifications accordingly.
 *
 * onUpdate receives parsed TreadmillData (using the unified parser).
 */
export async function connectTreadmill(
  onUpdate: (data: TreadmillData) => void
): Promise<{
  device: BluetoothDevice;
  support?: MachineSupport;
  type: TreadmillDeviceType;
  writeChar?: BluetoothRemoteGATTCharacteristic;
}> {
  console.log('Treadmill: Starting device request...');

  // Allow devices that expose either FTMS or PitPat services
  const device = await navigator.bluetooth.requestDevice({
    filters: [
      { services: [FTMS_SERVICE_UUID as unknown as BluetoothServiceUUID] },
      { services: [PITPAT_SERVICE_UUID] },
    ],
    optionalServices: ['battery_service', PITPAT_SERVICE_UUID, FTMS_SERVICE_UUID as unknown as BluetoothServiceUUID],
  });

  console.log('Treadmill: Connecting to GATT server...');
  const server = await device.gatt?.connect();
  if (!server) throw new Error('Could not connect to GATT server');

  // Discover services and decide type
  const services = await server.getPrimaryServices();
  const hasPitPat = services.some(s => s.uuid.toLowerCase() === PITPAT_SERVICE_UUID.toLowerCase());
  const hasFTMS = services.some(s => Number(s.uuid) === FTMS_SERVICE_UUID || s.uuid.toLowerCase().includes('1826'));
  const isPitPat = hasPitPat && !hasFTMS;
  const type: TreadmillDeviceType = isPitPat ? 'PITPAT' : 'FTMS';

  console.log('Treadmill: Detected type', type);

  if (type === 'PITPAT') {
    const service = await server.getPrimaryService(PITPAT_SERVICE_UUID);
    const notifyChar = await service.getCharacteristic(PITPAT_NOTIFY_CHAR_UUID);
    const writeChar = await service.getCharacteristic(PITPAT_WRITE_CHAR_UUID);

    await notifyChar.startNotifications();
    notifyChar.addEventListener('characteristicvaluechanged', (event: Event) => {
      const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
      if (value) {
        // Use the unified parser directly (no require / node-specific code)
        const out = parseTreadmillPayload(value as DataView, true);
        onUpdate(out);
      }
    });

    return { device, type, writeChar };
  }

  // FTMS path
  console.log('Treadmill: Getting Fitness Machine Service...');
  const service = await server.getPrimaryService(FTMS_SERVICE_UUID as unknown as BluetoothServiceUUID);

  // Set up Treadmill Data characteristic (Mandatory - Priority 1)
  console.log('Treadmill: Getting Data Characteristic...');
  const dataChar = await service.getCharacteristic(TREADMILL_DATA_CHAR_UUID as unknown as BluetoothCharacteristicUUID);

  console.log('Treadmill: Starting notifications...');
  await dataChar.startNotifications();
  dataChar.addEventListener('characteristicvaluechanged', (event: Event) => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
    if (value) {
      const parsed = parseTreadmillData(value);
      onUpdate(parsed);
    }
  });

  // Read Features (Optional - Priority 2)
  let support: MachineSupport = {
    controlSupported: false,
    speedControlSupported: false,
    inclineControlSupported: false,
  };

  try {
    console.log('Treadmill: Attempting to read machine features...');
    // Small delay before next GATT operation
    await new Promise(r => setTimeout(r, 200));

    const featureChar = await service.getCharacteristic(FITNESS_MACHINE_FEATURE_CHAR_UUID as unknown as BluetoothCharacteristicUUID);
    const featureValue = await featureChar.readValue();
    console.log('Treadmill: Feature value read successfully');

    const machineFeatures = featureValue.getUint32(0, true);
    if (machineFeatures & (1 << 14)) {
      support.controlSupported = true;
      if (featureValue.byteLength >= 8) {
        const targetFeatures = featureValue.getUint32(4, true);
        support.speedControlSupported = (targetFeatures & (1 << 0)) !== 0;
        support.inclineControlSupported = (targetFeatures & (1 << 1)) !== 0;
      }
    }
    console.log('Treadmill: Control support detected:', support);
  } catch (e) {
    console.warn('Treadmill: Could not read machine features (hardware might not support it)', e);
  }

  return { device, support, type };
}

let isControlRequested = false;

/**
 * Sends a command to the Fitness Machine Control Point.
 * Automatically requests control (0x00) if not already done.
 */
export async function sendControlCommand(
  device: BluetoothDevice,
  command: number,
  params?: number[]
): Promise<void> {
  if (!device.gatt?.connected) throw new Error('Device not connected');

  const server = await device.gatt.connect();

  // Try to detect if device exposes PitPat service
  const services = await server.getPrimaryServices();
  const hasPitPat = services.some(s => s.uuid.toLowerCase() === PITPAT_SERVICE_UUID.toLowerCase());

  if (hasPitPat) {
    // PitPat expects proprietary 23-byte packets via its writing characteristic
    const service = await server.getPrimaryService(PITPAT_SERVICE_UUID);
    const cpChar = await service.getCharacteristic(PITPAT_WRITE_CHAR_UUID);
    // command parameter here is the raw first command byte from makePitPatPacket building
    const payload = new Uint8Array([command, ...(params || [])]);
    cpChar.writeValue(payload);
    return;
  }

  // Default FTMS path
  const service = await server.getPrimaryService(FTMS_SERVICE_UUID as unknown as BluetoothServiceUUID);
  const cpChar = await service.getCharacteristic(FITNESS_MACHINE_CONTROL_POINT_CHAR_UUID as unknown as BluetoothCharacteristicUUID);

  // 1. Request Control if not already done
  if (!isControlRequested) {
    // 0x00: Request Control
    await cpChar.writeValueWithResponse(new Uint8Array([0x00]));
    isControlRequested = true;
    // Note: In a full implementation, we should wait for the response/notification
    // on this characteristic to confirm success.
  }

  // 2. Send the actual command
  const data = new Uint8Array([command, ...(params || [])]);
  await cpChar.writeValueWithResponse(data);
}

/**
 * Reset control state (call on disconnect)
 */
export function resetControlState() {
  isControlRequested = false;
}

// Heartbeat timer management for PitPat
let heartbeatTimer: number | null = null;

/**
 * Start PitPat heartbeat. Caller must provide a valid writing characteristic for PitPat.
 */
export function startPitPatHeartbeat(device: BluetoothDevice, writeChar: BluetoothRemoteGATTCharacteristic) {
  if (heartbeatTimer) stopPitPatHeartbeat();
  const heartbeatPacket = new Uint8Array([0x6a, 0x05, 0xfd, 0xf8, 0x43]);
  heartbeatTimer = window.setInterval(async () => {
    if (device.gatt?.connected) {
      try {
        await writeChar.writeValueWithoutResponse(heartbeatPacket);
      } catch (e) {
        console.warn('Treadmill: Heartbeat write failed', e);
      }
    } else {
      stopPitPatHeartbeat();
    }
  }, 500);
}

export function stopPitPatHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

