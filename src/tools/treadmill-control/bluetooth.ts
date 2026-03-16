import { parseTreadmillData, type TreadmillData } from './ftms-parser';

export const FTMS_SERVICE_UUID = 0x1826;
export const TREADMILL_DATA_CHAR_UUID = 0x2ACD;
export const FITNESS_MACHINE_CONTROL_POINT_CHAR_UUID = 0x2AD9;

export async function connectTreadmill(
  onUpdate: (data: TreadmillData) => void
): Promise<BluetoothDevice> {
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ services: [FTMS_SERVICE_UUID] }],
    optionalServices: ['battery_service'],
  });

  const server = await device.gatt?.connect();
  if (!server) throw new Error('Could not connect to GATT server');

  const service = await server.getPrimaryService(FTMS_SERVICE_UUID);

  // Set up Treadmill Data characteristic (notifications)
  const dataChar = await service.getCharacteristic(TREADMILL_DATA_CHAR_UUID);
  await dataChar.startNotifications();

  dataChar.addEventListener('characteristicvaluechanged', (event: Event) => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
    if (value) {
      const parsed = parseTreadmillData(value);
      onUpdate(parsed);
    }
  });

  return device;
}

/**
 * Sends a command to the Fitness Machine Control Point.
 * 0x01: Speed control
 * 0x02: Incline control
 * 0x07: Start or Resume
 * 0x08: Stop or Pause
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

  // Before sending commands, we usually need to request control (opcode 0x00)
  // Simple devices might not require it, but spec says so.
  
  const data = new Uint8Array([command, ...(params || [])]);
  await cpChar.writeValueWithResponse(data);
}
