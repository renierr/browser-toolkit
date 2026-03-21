import { getDeviceInfo, getManufacturerName, getServiceName, getServiceCategory } from './data';

export interface ParsedDevice {
  id: string;
  name: string;
  identifiedType: string;
  identifiedCategory: string;
  manufacturer: string | null;
  advertisedServices: string[];
  manufacturerData: Array<{ id: number; name: string; data: string }> | null;
  txPower: number | null;
  rssi: number | null;
  timestamp: number;
}

function uuidToString(uuid: BluetoothServiceUUID): string {
  if (typeof uuid === 'string') {
    return uuid;
  }
  return uuid.toString(16).padStart(4, '0');
}

export function parseAdvertisingEvent(event: BluetoothAdvertisingEvent): ParsedDevice {
  const name = event.name || event.device.name || 'Unknown Device';

  const deviceInfo = getDeviceInfo(name);

  const advertisedServices: string[] = [];
  for (const uuid of event.uuids) {
    const uuidStr = uuidToString(uuid);
    const serviceName = getServiceName(uuidStr);
    if (serviceName) {
      advertisedServices.push(serviceName);
    } else {
      advertisedServices.push(formatUUID(uuidStr));
    }
  }

  const manufacturer = deviceInfo?.manufacturer || null;

  let manufacturerData: Array<{ id: number; name: string; data: string }> | null = null;
  if (event.manufacturerData.size > 0) {
    manufacturerData = [];
    event.manufacturerData.forEach((dataView, id) => {
      manufacturerData!.push({
        id,
        name: getManufacturerName(id) || `Unknown (0x${id.toString(16)})`,
        data: formatManufacturerData(dataView),
      });
    });
  }

  return {
    id: event.device.id,
    name,
    identifiedType: deviceInfo?.type || 'Unknown',
    identifiedCategory: deviceInfo?.category || 'Unknown',
    manufacturer,
    advertisedServices,
    manufacturerData,
    txPower: event.txPower ?? null,
    rssi: event.rssi ?? null,
    timestamp: Date.now(),
  };
}

export function formatUUID(uuid: string): string {
  const normalized = uuid.toLowerCase().replace(/-/g, '');
  if (normalized.length === 4) {
    return `0x${normalized}`;
  }
  if (normalized.length === 32) {
    const parts = [
      normalized.slice(0, 8),
      normalized.slice(8, 12),
      normalized.slice(12, 16),
      normalized.slice(16, 20),
      normalized.slice(20, 32),
    ];
    return parts.join('-');
  }
  return uuid;
}

export function getServiceCategories(uuids: string[]): string[] {
  const categories = new Set<string>();
  for (const uuid of uuids) {
    const category = getServiceCategory(uuid);
    if (category) {
      categories.add(category);
    }
  }
  return Array.from(categories);
}

export function formatManufacturerData(data: DataView): string {
  const bytes: string[] = [];
  for (let i = 0; i < Math.min(data.byteLength, 20); i++) {
    bytes.push(data.getUint8(i).toString(16).padStart(2, '0').toUpperCase());
  }
  let result = bytes.join(' ');
  if (data.byteLength > 20) {
    result += '...';
  }
  return result;
}
