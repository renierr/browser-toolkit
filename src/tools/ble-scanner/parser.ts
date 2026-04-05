import {
  detectBeaconTypes,
  getDeviceInfo,
  getManufacturerName,
  getMatchingServiceFilters,
  getServiceName,
} from './data';
import type { BeaconType } from './data';

export interface ParsedDevice {
  id: string;
  name: string;
  identifiedType: string;
  identifiedCategory: string;
  manufacturer: string | null;
  advertisedServices: string[];
  matchedServiceFilters: string[];
  beaconTypes: BeaconType[];
  manufacturerData: Array<{ id: number; name: string; data: string }> | null;
  txPower: number | null;
  rssi: number | null;
  timestamp: number;
}

function uuidToString(uuid: BluetoothServiceUUID): string {
  return uuid.toString(16).padStart(4, '0');
}

export function parseAdvertisingEvent(event: BluetoothAdvertisingEvent): ParsedDevice {
  const name = event.name || event.device.name || 'Unknown Device';

  const deviceInfo = getDeviceInfo(name);

  const advertisedServices: string[] = [];
  const advertisedServiceUuids: string[] = [];
  for (const uuid of event.uuids) {
    const uuidStr = uuidToString(uuid);
    advertisedServiceUuids.push(uuidStr);
    const serviceName = getServiceName(uuidStr);
    if (serviceName) {
      advertisedServices.push(serviceName);
    } else {
      advertisedServices.push(formatUUID(uuidStr));
    }
  }

  const matchedServiceFilters = getMatchingServiceFilters(advertisedServiceUuids);
  const manufacturerDataRaw: Array<{ id: number; data: DataView }> = [];
  const serviceDataRaw: DataView[] = [];

  if (event.serviceData && event.serviceData.size > 0) {
    event.serviceData.forEach((dataView) => {
      serviceDataRaw.push(dataView);
    });
  }

  let manufacturerData: Array<{ id: number; name: string; data: string }> | null = null;
  if (event.manufacturerData.size > 0) {
    manufacturerData = [];
    event.manufacturerData.forEach((dataView, id) => {
      manufacturerDataRaw.push({ id, data: dataView });
      manufacturerData!.push({
        id,
        name: getManufacturerName(id) || `Unknown (0x${id.toString(16)})`,
        data: formatManufacturerData(dataView),
      });
    });
  }

  const beaconTypes = detectBeaconTypes({
    serviceUuids: advertisedServiceUuids,
    serviceData: serviceDataRaw,
    manufacturerData: manufacturerDataRaw,
  });

  const derivedManufacturer = manufacturerData?.find((entry) => !/^unknown\b/i.test(entry.name))?.name;
  const manufacturer = deviceInfo?.manufacturer || derivedManufacturer || null;
  const identifiedType = deviceInfo?.type || beaconTypes[0]?.type || 'Unknown';
  const identifiedCategory = deviceInfo?.category || (beaconTypes.length > 0 ? 'Beacon' : 'Unknown');

  return {
    id: event.device.id,
    name,
    identifiedType,
    identifiedCategory,
    manufacturer,
    advertisedServices,
    matchedServiceFilters,
    beaconTypes,
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
