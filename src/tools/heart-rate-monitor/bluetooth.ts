export interface HeartRateUpdate {
  heartRate: number;
  batteryLevel?: number;
}

export async function connectHeartRate(
  onUpdate: (data: HeartRateUpdate) => void
): Promise<BluetoothDevice> {
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ services: ['heart_rate'] }],
    optionalServices: ['battery_service'],
  });

  const server = await device.gatt?.connect();
  if (!server || !device.gatt) throw new Error('Could not connect to GATT server');

  // Heart Rate Service
  const hrService = await server.getPrimaryService('heart_rate');
  const hrChar = await hrService.getCharacteristic('heart_rate_measurement');
  await hrChar.startNotifications();

  hrChar.addEventListener('characteristicvaluechanged', (event: Event) => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
    if (!value) return;

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

  // Battery Service (Optional)
  try {
    const batteryService = await server.getPrimaryService('battery_service');
    const batteryChar = await batteryService.getCharacteristic('battery_level');

    const handleBatteryValue = (value: DataView) => {
      const batteryLevel = value.getUint8(0);
      onUpdate({ heartRate: -1, batteryLevel }); // heartRate: -1 to indicate only battery update
    };

    batteryChar.addEventListener('characteristicvaluechanged', (event: Event) => {
      const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
      if (value) handleBatteryValue(value);
    });

    await batteryChar.startNotifications();
    const initialValue = await batteryChar.readValue();
    handleBatteryValue(initialValue);
  } catch (e) {
    console.warn('Battery service not available', e);
  }

  return device;
}
