export interface HeartRateUpdate {
  heartRate: number;
}

export async function connectHeartRate(
  onUpdate: (data: HeartRateUpdate) => void
): Promise<BluetoothDevice> {
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ services: ['heart_rate'] }],
  });

  const server = await device.gatt?.connect();
  if (!server) throw new Error('Could not connect to GATT server');

  const service = await server.getPrimaryService('heart_rate');
  const characteristic = await service.getCharacteristic('heart_rate_measurement');

  await characteristic.startNotifications();

  characteristic.addEventListener('characteristicvaluechanged', (event: Event) => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
    if (!value) return;

    // Heart Rate Measurement flags
    const flags = value.getUint8(0);
    const rate16Bits = flags & 0x01;
    let heartRate: number;

    if (rate16Bits) {
      heartRate = value.getUint16(1, true);
    } else {
      heartRate = value.getUint8(1);
    }

    onUpdate({ heartRate });
  });

  return device;
}
