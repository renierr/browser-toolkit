import type { ParsedDevice } from './parser';

const UNKNOWN_CATEGORY = 'Unknown';
const UNKNOWN_MANUFACTURER_GROUP_MIN = 3;
const RECENT_THRESHOLD_MS = 5 * 60 * 1000;

export type DeviceFilter =
  | 'high-confidence'
  | 'beacons'
  | 'unknown'
  | 'recent'
  | 'strong-signal';

export type DeviceHistoryEntry = {
  firstSeen: number;
  lastSeen: number;
  sightings: number;
  strongestRssi: number | null;
  averageRssi: number | null;
};

type RenderOptions = {
  activeFilters?: Set<DeviceFilter>;
  historyByFingerprint?: Map<string, DeviceHistoryEntry>;
  now?: number;
};

export function renderDeviceGroups(
  devices: Map<string, ParsedDevice>,
  collapsedCategories: Set<string>,
  options: RenderOptions = {}
): string {
  const grouped = groupByCategory(devices, options);

  if (grouped.size === 0) {
    return renderEmptyState();
  }

  const sortedCategories = Array.from(grouped.keys()).sort(compareCategoryNames);

  return sortedCategories
    .map((category) => {
      const categoryDevices = grouped.get(category)!;
      const isCollapsed = collapsedCategories.has(category);
      const categoryBadgeClass = getCategoryBadgeClass(category);
      const icon = getCategoryIcon(category);

      const deviceCards = categoryDevices
        .map((device) => {
          const historyEntry = options.historyByFingerprint?.get(device.localFingerprint) ?? null;
          return renderDeviceCard(device, historyEntry);
        })
        .join('');

      return `
        <div class="collapse collapse-arrow bg-base-200 mb-2" data-category="${category}">
          <input type="checkbox" class="peer" ${isCollapsed ? '' : 'checked'} />
          <div class="collapse-title cursor-pointer flex items-center gap-2 min-h-0 py-2">
            <i data-lucide="${icon}" class="w-5 h-5"></i>
            <span class="font-semibold">${category}</span>
            <span class="badge badge-sm ${categoryBadgeClass} ml-auto">${categoryDevices.length}</span>
          </div>
          <div class="collapse-content p-0">
            <div class="grid gap-3 p-2 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
              ${deviceCards}
            </div>
          </div>
        </div>
      `;
    })
    .join('');
}

function groupByCategory(devices: Map<string, ParsedDevice>, options: RenderOptions): Map<string, ParsedDevice[]> {
  const grouped = new Map<string, ParsedDevice[]>();
  const unknownDevices: ParsedDevice[] = [];
  const now = options.now ?? Date.now();
  const activeFilters = options.activeFilters ?? new Set<DeviceFilter>();
  const historyByFingerprint = options.historyByFingerprint;

  for (const device of devices.values()) {
    const historyEntry = historyByFingerprint?.get(device.localFingerprint);
    if (!matchesActiveFilters(device, activeFilters, historyEntry, now)) {
      continue;
    }

    const category = device.beaconTypes.length > 0 ? 'Beacon' : device.identifiedCategory;
    if (category === UNKNOWN_CATEGORY) {
      unknownDevices.push(device);
      continue;
    }

    if (!grouped.has(category)) {
      grouped.set(category, []);
    }
    grouped.get(category)!.push(device);
  }

  if (unknownDevices.length === 0) {
    return grouped;
  }

  const unknownByManufacturer = new Map<string, ParsedDevice[]>();
  const genericUnknown: ParsedDevice[] = [];

  for (const device of unknownDevices) {
    const manufacturer = getKnownManufacturerForUnknownGroup(device);
    if (!manufacturer) {
      genericUnknown.push(device);
      continue;
    }

    if (!unknownByManufacturer.has(manufacturer)) {
      unknownByManufacturer.set(manufacturer, []);
    }
    unknownByManufacturer.get(manufacturer)!.push(device);
  }

  for (const [manufacturer, manufacturerDevices] of unknownByManufacturer) {
    if (manufacturerDevices.length >= UNKNOWN_MANUFACTURER_GROUP_MIN) {
      grouped.set(`${UNKNOWN_CATEGORY} - ${manufacturer}`, manufacturerDevices);
      continue;
    }

    genericUnknown.push(...manufacturerDevices);
  }

  if (genericUnknown.length > 0) {
    grouped.set(UNKNOWN_CATEGORY, genericUnknown);
  }

  return grouped;
}

function getKnownManufacturerForUnknownGroup(device: ParsedDevice): string | null {
  if (device.manufacturerData && device.manufacturerData.length > 0) {
    for (const entry of device.manufacturerData) {
      const normalized = normalizeManufacturerName(entry.name);
      if (normalized) {
        return normalized;
      }
    }
  }

  return normalizeManufacturerName(device.manufacturer);
}

function normalizeManufacturerName(name: string | null): string | null {
  if (!name) {
    return null;
  }

  const cleaned = name
    .replace(/,\s*inc\.?$/i, '')
    .replace(/\binc\.?$/i, '')
    .trim();

  if (!cleaned || /^(unknown|generic)\b/i.test(cleaned)) {
    return null;
  }

  return cleaned;
}

function compareCategoryNames(left: string, right: string): number {
  const unknownGroupPrefix = `${UNKNOWN_CATEGORY} - `;

  if (left === UNKNOWN_CATEGORY && right !== UNKNOWN_CATEGORY) {
    return -1;
  }

  if (right === UNKNOWN_CATEGORY && left !== UNKNOWN_CATEGORY) {
    return 1;
  }

  const leftIsUnknownSubgroup = left.startsWith(unknownGroupPrefix);
  const rightIsUnknownSubgroup = right.startsWith(unknownGroupPrefix);

  if (leftIsUnknownSubgroup && !rightIsUnknownSubgroup) {
    return -1;
  }

  if (rightIsUnknownSubgroup && !leftIsUnknownSubgroup) {
    return 1;
  }

  return left.localeCompare(right);
}

function formatServiceFilterLabel(filterName: string): string {
  return filterName
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function renderDeviceCard(device: ParsedDevice, historyEntry: DeviceHistoryEntry | null = null): string {
  const signalBars = getSignalBars(device.rssi);
  const timeSinceUpdate = getTimeSinceUpdate(device.timestamp);
  const confidenceLabel = getConfidenceLabel(device.confidence);
  const confidenceBadgeClass = getConfidenceBadgeClass(device.confidence);
  const effectiveCategory = device.beaconTypes.length > 0 ? 'Beacon' : device.identifiedCategory;
  const primaryIdentity = device.knownDeviceName || device.identifiedType;
  const historyDetails = historyEntry ? renderHistoryDetails(historyEntry, Date.now()) : '';

  return `
    <div class="card bg-base-100 shadow-sm hover:shadow-md transition-shadow" data-device-id="${device.id}">
      <div class="card-body p-3 sm:p-4">
        <div class="flex items-start justify-between gap-2 min-w-0">
          <div class="flex items-center gap-2 min-w-0 flex-1">
            <div class="avatar placeholder items-center justify-center">
              <div class="bg-neutral text-neutral-content rounded-full w-8 sm:w-10 flex items-center justify-center">
                <i data-lucide="${getCategoryIcon(effectiveCategory)}" class="w-4 h-4 sm:w-5 sm:h-5"></i>
              </div>
            </div>
            <div class="min-w-0 flex-1">
              <h3 class="font-semibold truncate text-sm sm:text-base" title="${device.name}">${device.name}</h3>
              <p class="text-xs sm:text-sm text-base-content/60 truncate" title="${primaryIdentity}">
                ${primaryIdentity}
              </p>
              <div class="mt-1 flex flex-wrap gap-1">
                <span class="badge badge-xs ${confidenceBadgeClass}">${confidenceLabel}</span>
                <span class="badge badge-xs badge-outline">${effectiveCategory}</span>
                <span class="badge badge-xs badge-ghost truncate max-w-40" title="Role: ${device.likelyRole}">${device.likelyRole}</span>
                ${device.manufacturer ? `<span class="badge badge-xs badge-ghost truncate max-w-40" title="${device.manufacturer}">${device.manufacturer}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="flex flex-col items-end gap-1 shrink-0">
            ${signalBars}
          </div>
        </div>

        <div class="divider my-1 sm:my-2"></div>

        <div class="space-y-1 sm:space-y-2 text-xs sm:text-sm min-w-0">
          <div>
            <p class="text-base-content/50 text-xs mb-1">Identification</p>
            <div class="flex flex-wrap gap-1 overflow-hidden">
              ${device.knownDeviceName ? `<span class="badge badge-sm badge-primary truncate max-w-40" title="Known device: ${device.knownDeviceName}">${device.knownDeviceName}</span>` : ''}
              <span class="badge badge-sm badge-outline truncate max-w-40" title="Type: ${device.identifiedType}">${device.identifiedType}</span>
              <span class="badge badge-sm badge-ghost truncate max-w-40" title="Category: ${effectiveCategory}">${effectiveCategory}</span>
              ${device.localFingerprint ? `<span class="badge badge-sm badge-ghost truncate max-w-40" title="Local fingerprint: ${device.localFingerprint}">${device.localFingerprint}</span>` : ''}
            </div>
          </div>

          ${
            device.confidenceReasons.length > 0
              ? `
            <div>
              <p class="text-base-content/50 text-xs mb-1">Confidence factors</p>
              <div class="flex flex-wrap gap-1 overflow-hidden">
                ${device.confidenceReasons
                  .slice(0, 4)
                  .map(
                    (reason) =>
                      `<span class="badge badge-sm badge-ghost truncate max-w-42" title="${reason}">${reason}</span>`
                  )
                  .join('')}
              </div>
            </div>
          `
              : ''
          }

          ${
            device.advertisedServices.length > 0
              ? `
            <div>
              <p class="text-base-content/50 text-xs mb-1">Services</p>
              <div class="flex flex-wrap gap-1 overflow-hidden">
                ${device.advertisedServices
                  .slice(0, 4)
                  .map(
                    (service) =>
                      `<span class="badge badge-sm badge-outline truncate max-w-30" title="${service}">${service}</span>`
                  )
                  .join('')}
                ${
                  device.advertisedServices.length > 4
                    ? `<span class="badge badge-sm badge-ghost">+${device.advertisedServices.length - 4}</span>`
                    : ''
                }
              </div>
            </div>
          `
              : ''
          }

          ${
            device.matchedServiceFilters.length > 0
              ? `
            <div>
              <p class="text-base-content/50 text-xs mb-1">Matches</p>
              <div class="flex flex-wrap gap-1 overflow-hidden">
                ${device.matchedServiceFilters
                  .slice(0, 4)
                  .map(
                    (filter) =>
                      `<span class="badge badge-sm badge-secondary truncate max-w-35" title="${formatServiceFilterLabel(filter)}">${formatServiceFilterLabel(filter)}</span>`
                  )
                  .join('')}
                ${
                  device.matchedServiceFilters.length > 4
                    ? `<span class="badge badge-sm badge-ghost">+${device.matchedServiceFilters.length - 4}</span>`
                    : ''
                }
              </div>
            </div>
          `
              : ''
          }

          ${
            device.beaconTypes.length > 0
              ? `
            <div>
              <p class="text-base-content/50 text-xs mb-1">Beacon</p>
              <div class="flex flex-wrap gap-1 overflow-hidden">
                ${device.beaconTypes
                  .map(
                    (beacon) =>
                      `<span class="badge badge-sm badge-info truncate max-w-37.5" title="${beacon.format}">${beacon.type}</span>`
                  )
                  .join('')}
              </div>
              <div class="mt-1 space-y-1">
                ${device.beaconTypes
                  .flatMap((beacon) => (beacon.details && beacon.details.length > 0 ? beacon.details : []))
                  .slice(0, 4)
                  .map((detail) => `<p class="text-[11px] text-base-content/55 truncate" title="${detail}">${detail}</p>`)
                  .join('')}
              </div>
            </div>
          `
              : ''
          }

          ${
            device.identificationHints.length > 0
              ? `
            <div>
              <p class="text-base-content/50 text-xs mb-1">Local hints</p>
              <div class="flex flex-wrap gap-1 overflow-hidden">
                ${device.identificationHints
                  .slice(0, 4)
                  .map(
                    (hint) =>
                      `<span class="badge badge-sm badge-ghost truncate max-w-42" title="${hint}">${hint}</span>`
                  )
                  .join('')}
                ${
                  device.identificationHints.length > 4
                    ? `<span class="badge badge-sm badge-ghost">+${device.identificationHints.length - 4}</span>`
                    : ''
                }
              </div>
            </div>
          `
              : ''
          }

          ${
            device.manufacturerData && device.manufacturerData.length > 0
              ? `
            <div class="min-w-0">
              <p class="text-base-content/50 text-xs mb-1">Manufacturer</p>
              <div class="text-xs bg-base-200 rounded px-2 py-1 truncate" title="${device.manufacturerData[0].name}${device.manufacturerData[0].data ? ': ' + device.manufacturerData[0].data : ''}">
                ${device.manufacturerData[0].name}
              </div>
            </div>
          `
              : ''
          }

          ${historyDetails}
        </div>

        <div class="flex items-center justify-between mt-2 pt-2 border-t border-base-200 text-xs text-base-content/40 min-w-0 gap-2">
          <span class="truncate" title="MAC: ${device.id}">${formatDeviceId(device.id)}</span>
          ${device.rssi !== null ? `<span class="shrink-0">${device.rssi} dBm</span>` : ''}
          <span class="shrink-0">${timeSinceUpdate}</span>
        </div>
      </div>
    </div>
  `;
}

function matchesActiveFilters(
  device: ParsedDevice,
  activeFilters: Set<DeviceFilter>,
  historyEntry: DeviceHistoryEntry | undefined,
  now: number
): boolean {
  if (activeFilters.size === 0) {
    return true;
  }

  for (const filter of activeFilters) {
    if (filter === 'high-confidence' && device.confidence !== 'high') {
      return false;
    }

    if (filter === 'beacons' && device.beaconTypes.length === 0) {
      return false;
    }

    if (filter === 'unknown' && device.identifiedCategory !== UNKNOWN_CATEGORY) {
      return false;
    }

    if (filter === 'recent') {
      const recentAt = historyEntry?.lastSeen ?? device.timestamp;
      if (now - recentAt > RECENT_THRESHOLD_MS) {
        return false;
      }
    }

    if (filter === 'strong-signal' && (device.rssi === null || device.rssi < -70)) {
      return false;
    }
  }

  return true;
}

function renderHistoryDetails(historyEntry: DeviceHistoryEntry, now: number): string {
  const age = now - historyEntry.firstSeen;
  const minsSeen = Math.max(1, Math.round(age / 60000));
  const strongest = historyEntry.strongestRssi !== null ? `${historyEntry.strongestRssi} dBm` : 'n/a';
  const avg = historyEntry.averageRssi !== null ? `${Math.round(historyEntry.averageRssi)} dBm` : 'n/a';

  return `
    <div>
      <p class="text-base-content/50 text-xs mb-1">Local history</p>
      <div class="flex flex-wrap gap-1 overflow-hidden">
        <span class="badge badge-sm badge-outline">Seen ${historyEntry.sightings}x</span>
        <span class="badge badge-sm badge-ghost">First ${minsSeen}m ago</span>
        <span class="badge badge-sm badge-ghost">Strongest ${strongest}</span>
        <span class="badge badge-sm badge-ghost">Avg ${avg}</span>
      </div>
    </div>
  `;
}


export function renderEmptyState(): string {
  return `
    <div class="col-span-full flex flex-col items-center justify-center py-16 text-center">
      <div class="avatar placeholder mb-4">
        <div class="bg-base-200 text-base-content/30 rounded-full w-16 flex items-center justify-center">
          <i data-lucide="bluetooth" class="w-8 h-8"></i>
        </div>
      </div>
      <h3 class="text-lg font-medium text-base-content/60 mb-2">No devices found</h3>
      <p class="text-sm text-base-content/40 max-w-xs">
        Click Scan to search for nearby Bluetooth Low Energy devices
      </p>
    </div>
  `;
}

function getSignalBars(rssi: number | null): string {
  let bars = 0;
  if (rssi !== null) {
    if (rssi >= -50) bars = 4;
    else if (rssi >= -60) bars = 3;
    else if (rssi >= -70) bars = 2;
    else if (rssi >= -80) bars = 1;
  }

  const fillColor =
    bars > 0 ? 'fill-current text-success' : 'fill-base-content/20 text-base-content/20';

  return `
    <div class="flex items-end gap-0.5 h-4">
      <div class="w-1 ${bars >= 1 ? fillColor : 'fill-base-content/20 text-base-content/20'} rounded-sm h-1"></div>
      <div class="w-1 ${bars >= 2 ? fillColor : 'fill-base-content/20 text-base-content/20'} rounded-sm h-2"></div>
      <div class="w-1 ${bars >= 3 ? fillColor : 'fill-base-content/20 text-base-content/20'} rounded-sm h-3"></div>
      <div class="w-1 ${bars >= 4 ? fillColor : 'fill-base-content/20 text-base-content/20'} rounded-sm h-4"></div>
    </div>
  `;
}

function getTimeSinceUpdate(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 5) return 'now';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

function formatDeviceId(id: string): string {
  if (id.length > 17) {
    return id.substring(0, 17) + '...';
  }
  return id;
}

function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    Audio: 'headphones',
    Wearables: 'watch',
    IoT: 'cpu',
    Health: 'heart-pulse',
    Fitness: 'dumbbell',
    Input: 'keyboard',
    Entertainment: 'tv',
    Gaming: 'gamepad-2',
    VR: 'glasses',
    Computing: 'laptop',
    Vehicle: 'car',
    Beacon: 'radio',
    Generic: 'bluetooth',
  };
  return icons[category] || icons['Generic'];
}

function getCategoryBadgeClass(category: string): string {
  const classes: Record<string, string> = {
    Audio: 'badge-info',
    Wearables: 'badge-secondary',
    IoT: 'badge-accent',
    Health: 'badge-error',
    Fitness: 'badge-success',
    Input: 'badge-warning',
    Entertainment: 'badge-primary',
    Gaming: 'badge-secondary',
    VR: 'badge-accent',
    Computing: 'badge-ghost',
    Beacon: 'badge-info',
    Generic: 'badge-neutral',
  };
  return classes[category] || 'badge-neutral';
}

function getConfidenceLabel(confidence: ParsedDevice['confidence']): string {
  if (confidence === 'high') return 'High confidence';
  if (confidence === 'medium') return 'Medium confidence';
  return 'Low confidence';
}

function getConfidenceBadgeClass(confidence: ParsedDevice['confidence']): string {
  if (confidence === 'high') return 'badge-success';
  if (confidence === 'medium') return 'badge-warning';
  return 'badge-ghost';
}

