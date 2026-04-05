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
  knownDeviceName: string | null;
  identifiedType: string;
  identifiedCategory: string;
  likelyRole: string;
  localFingerprint: string;
  confidence: 'low' | 'medium' | 'high';
  confidenceReasons: string[];
  manufacturer: string | null;
  advertisedServices: string[];
  matchedServiceFilters: string[];
  beaconTypes: BeaconType[];
  identificationHints: string[];
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
  const serviceDataRaw: Array<{ uuid: string; data: DataView }> = [];

  if (event.serviceData && event.serviceData.size > 0) {
    event.serviceData.forEach((dataView, uuid) => {
      serviceDataRaw.push({
        uuid: uuidToString(uuid),
        data: dataView,
      });
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
  const knownDeviceName = deviceInfo?.name || null;
  const identifiedType = deviceInfo?.type || beaconTypes[0]?.type || 'Unknown';
  const identifiedCategory = beaconTypes.length > 0 ? 'Beacon' : deviceInfo?.category || 'Unknown';
  const likelyRole = deriveLikelyRole({ identifiedCategory, matchedServiceFilters, beaconTypes });
  const confidenceResult = calculateConfidence({
    hasKnownDeviceMatch: Boolean(deviceInfo),
    hasManufacturer: Boolean(manufacturer),
    hasManufacturerData: Boolean(manufacturerData && manufacturerData.length > 0),
    matchedServiceFilterCount: matchedServiceFilters.length,
    advertisedServiceCount: advertisedServices.length,
    beaconCount: beaconTypes.length,
  });
  const localFingerprint = createLocalFingerprint({
    manufacturer,
    identifiedCategory,
    identifiedType,
    beaconTypes,
    matchedServiceFilters,
    manufacturerData,
  });
  const identificationHints = buildIdentificationHints({
    manufacturer,
    matchedServiceFilters,
    beaconTypes,
    advertisedServices,
  });

  return {
    id: event.device.id,
    name,
    knownDeviceName,
    identifiedType,
    identifiedCategory,
    likelyRole,
    localFingerprint,
    confidence: confidenceResult.level,
    confidenceReasons: confidenceResult.reasons,
    manufacturer,
    advertisedServices,
    matchedServiceFilters,
    beaconTypes,
    identificationHints,
    manufacturerData,
    txPower: event.txPower ?? null,
    rssi: event.rssi ?? null,
    timestamp: Date.now(),
  };
}

function deriveLikelyRole(input: {
  identifiedCategory: string;
  matchedServiceFilters: string[];
  beaconTypes: BeaconType[];
}): string {
  if (input.beaconTypes.length > 0) {
    return 'Beacon';
  }

  if (input.matchedServiceFilters.includes('heart_rate')) {
    return 'Health Sensor';
  }

  if (input.matchedServiceFilters.includes('audio')) {
    return 'Audio Device';
  }

  if (input.identifiedCategory === 'Wearables') {
    return 'Wearable';
  }

  if (input.identifiedCategory === 'IoT') {
    return 'IoT Device';
  }

  if (input.identifiedCategory === 'Unknown') {
    return 'Unclassified Device';
  }

  return input.identifiedCategory;
}

function calculateConfidence(input: {
  hasKnownDeviceMatch: boolean;
  hasManufacturer: boolean;
  hasManufacturerData: boolean;
  matchedServiceFilterCount: number;
  advertisedServiceCount: number;
  beaconCount: number;
}): { level: 'low' | 'medium' | 'high'; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  if (input.hasKnownDeviceMatch) {
    score += 4;
    reasons.push('Known device pattern');
  }
  if (input.hasManufacturer) {
    score += 2;
    reasons.push('Known manufacturer');
  }
  if (input.hasManufacturerData) {
    score += 1;
    reasons.push('Manufacturer payload');
  }
  if (input.matchedServiceFilterCount > 0) {
    score += 1;
    reasons.push('Service profile match');
  }
  if (input.advertisedServiceCount > 0) {
    score += 1;
    reasons.push('Advertised service');
  }
  if (input.beaconCount > 0) {
    score += 3;
    reasons.push('Beacon signature parsed');
  }

  if (score >= 6) return { level: 'high', reasons };
  if (score >= 3) return { level: 'medium', reasons };
  return { level: 'low', reasons };
}

function createLocalFingerprint(input: {
  manufacturer: string | null;
  identifiedCategory: string;
  identifiedType: string;
  beaconTypes: BeaconType[];
  matchedServiceFilters: string[];
  manufacturerData: Array<{ id: number; name: string; data: string }> | null;
}): string {
  const parts = [
    input.manufacturer ?? 'unknown-manufacturer',
    input.identifiedCategory,
    input.identifiedType,
    input.beaconTypes.map((beacon) => beacon.type).sort().join('|') || 'no-beacon',
    input.matchedServiceFilters.slice().sort().join('|') || 'no-filters',
    input.manufacturerData?.map((entry) => entry.id.toString(16)).sort().join('|') || 'no-mfg-data',
  ];

  return `fp-${hashString(parts.join('::'))}`;
}

function hashString(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

function buildIdentificationHints(input: {
  manufacturer: string | null;
  matchedServiceFilters: string[];
  beaconTypes: BeaconType[];
  advertisedServices: string[];
}): string[] {
  const hints: string[] = [];

  if (input.manufacturer) {
    hints.push(`Manufacturer ${input.manufacturer}`);
  }

  for (const beacon of input.beaconTypes) {
    hints.push(`Beacon ${beacon.type}`);
  }

  for (const filter of input.matchedServiceFilters.slice(0, 2)) {
    hints.push(`Service profile ${filter.replace(/_/g, ' ')}`);
  }

  if (input.advertisedServices.length > 0) {
    hints.push(`Advertises ${input.advertisedServices[0]}`);
  }

  return Array.from(new Set(hints));
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
