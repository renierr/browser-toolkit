import { parseTreadmillData, type TreadmillData } from './ftms-parser';

export const FTMS_SERVICE_UUID = 0x1826;
export const TREADMILL_DATA_CHAR_UUID = 0x2ACD;
export const FITNESS_MACHINE_FEATURE_CHAR_UUID = 0x2ACC;
export const FITNESS_MACHINE_CONTROL_POINT_CHAR_UUID = 0x2AD9;

export interface MachineSupport {
  controlSupported: boolean;
  speedControlSupported: boolean;
  inclineControlSupported: boolean;
}

export async function connectTreadmill(
  onUpdate: (data: TreadmillData) => void
): Promise<{ device: BluetoothDevice; support: MachineSupport }> {
  console.log('Treadmill: Starting device request...');
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ services: [FTMS_SERVICE_UUID] }],
    optionalServices: ['battery_service'],
  });

  console.log('Treadmill: Connecting to GATT server...');
  const server = await device.gatt?.connect();
  if (!server) throw new Error('Could not connect to GATT server');

  console.log('Treadmill: Getting Fitness Machine Service...');
  const service = await server.getPrimaryService(FTMS_SERVICE_UUID);

  // Set up Treadmill Data characteristic (Mandatory - Priority 1)
  console.log('Treadmill: Getting Data Characteristic...');
  const dataChar = await service.getCharacteristic(TREADMILL_DATA_CHAR_UUID);
  
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
    
    const featureChar = await service.getCharacteristic(FITNESS_MACHINE_FEATURE_CHAR_UUID);
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

  return { device, support };
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
  const service = await server.getPrimaryService(FTMS_SERVICE_UUID);
  const cpChar = await service.getCharacteristic(FITNESS_MACHINE_CONTROL_POINT_CHAR_UUID);

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
