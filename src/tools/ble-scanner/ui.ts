import type { ParsedDevice } from './parser';

export function renderDeviceCard(device: ParsedDevice): string {
  const signalBars = getSignalBars(device.rssi);
  const timeSinceUpdate = getTimeSinceUpdate(device.timestamp);
  const categoryBadgeClass = getCategoryBadgeClass(device.identifiedCategory);

  return `
    <div class="card bg-base-100 shadow-sm hover:shadow-md transition-shadow border" data-device-id="${device.id}">
      <div class="card-body p-4">
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="avatar placeholder">
              <div class="bg-neutral text-neutral-content rounded-full w-10">
                <i data-lucide="${getCategoryIcon(device.identifiedCategory)}" class="w-5 h-5"></i>
              </div>
            </div>
            <div>
              <h3 class="font-semibold truncate max-w-[180px]" title="${device.name}">${device.name}</h3>
              <p class="text-sm text-base-content/60">
                ${device.manufacturer ? device.manufacturer : device.identifiedType}
              </p>
            </div>
          </div>
          <div class="flex flex-col items-end gap-1">
            <span class="badge ${categoryBadgeClass}">${device.identifiedCategory}</span>
            ${signalBars}
          </div>
        </div>

        <div class="divider my-2"></div>

        <div class="space-y-2 text-sm">
          ${
            device.advertisedServices.length > 0
              ? `
            <div>
              <p class="text-base-content/50 text-xs mb-1">Services</p>
              <div class="flex flex-wrap gap-1">
                ${device.advertisedServices
                  .slice(0, 6)
                  .map((service) => `<span class="badge badge-sm badge-outline">${service}</span>`)
                  .join('')}
                ${
                  device.advertisedServices.length > 6
                    ? `<span class="badge badge-sm badge-ghost">+${device.advertisedServices.length - 6}</span>`
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
            <div>
              <p class="text-base-content/50 text-xs mb-1">Manufacturer</p>
              <div class="font-mono text-xs bg-base-200 rounded px-2 py-1 truncate" title="${device.manufacturerData.map((m) => `${m.name}: ${m.data}`).join(', ')}">
                ${device.manufacturerData[0].name}
                ${device.manufacturerData[0].data ? `: ${device.manufacturerData[0].data}` : ''}
              </div>
            </div>
          `
              : ''
          }
        </div>

        <div class="flex items-center justify-between mt-3 pt-2 border-t border-base-200 text-xs text-base-content/40">
          <span class="font-mono" title="MAC">${formatDeviceId(device.id)}</span>
          ${device.rssi !== null ? `<span>${device.rssi} dBm</span>` : ''}
          <span>${timeSinceUpdate}</span>
        </div>
      </div>
    </div>
  `;
}

export function updateDeviceCard(device: ParsedDevice): void {
  const existingCard = document.querySelector(`[data-device-id="${device.id}"]`);
  if (existingCard) {
    existingCard.outerHTML = renderDeviceCard(device);
  }
}

export function renderEmptyState(): string {
  return `
    <div class="col-span-full flex flex-col items-center justify-center py-16 text-center">
      <div class="avatar placeholder mb-4">
        <div class="bg-base-200 text-base-content/30 rounded-full w-16">
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
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
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
    Generic: 'badge-neutral',
  };
  return classes[category] || 'badge-neutral';
}
