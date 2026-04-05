import { BLEScanner, isBluetoothSupported } from './scanner';
import { renderDeviceGroups } from './ui';
import type { DeviceFilter, DeviceHistoryEntry } from './ui';
import type { ParsedDevice } from './parser';
import { showMessage } from '@js/ui';

const HISTORY_STORAGE_KEY = 'ble-scanner.history.v1';

const FILTER_BUTTONS: Array<{ id: string; filter: DeviceFilter }> = [
  { id: 'filter-high-confidence', filter: 'high-confidence' },
  { id: 'filter-beacons', filter: 'beacons' },
  { id: 'filter-unknown', filter: 'unknown' },
  { id: 'filter-recent', filter: 'recent' },
  { id: 'filter-strong-signal', filter: 'strong-signal' },
];

interface ScannerState {
  scanner: BLEScanner | null;
  isScanning: boolean;
  devices: Map<string, ParsedDevice>;
  historyByFingerprint: Map<string, DeviceHistoryEntry>;
  activeFilters: Set<DeviceFilter>;
  collapsedCategories: Set<string>;
  updateInterval: number | null;
}

export default function init() {
  const scanBtn = document.getElementById('scan-btn') as HTMLButtonElement;
  const stopBtn = document.getElementById('stop-btn') as HTMLButtonElement;
  const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
  const deviceList = document.getElementById('device-list') as HTMLDivElement;
  const deviceCount = document.getElementById('device-count') as HTMLSpanElement;
  const scanStatus = document.getElementById('scan-status') as HTMLSpanElement;
  const noBluetooth = document.getElementById('no-bluetooth') as HTMLDivElement;
  const filterButtons = FILTER_BUTTONS
    .map(({ id, filter }) => {
      const button = document.getElementById(id) as HTMLButtonElement | null;
      return button ? { button, filter } : null;
    })
    .filter((entry): entry is { button: HTMLButtonElement; filter: DeviceFilter } => entry !== null);

  if (!isBluetoothSupported()) {
    noBluetooth.classList.remove('hidden');
    scanBtn.disabled = true;
    return;
  }

  const state: ScannerState = {
    scanner: null,
    isScanning: false,
    devices: new Map(),
    historyByFingerprint: loadLocalHistory(),
    activeFilters: new Set(),
    collapsedCategories: new Set(),
    updateInterval: null,
  };

  const renderAllGroups = () => {
    deviceList.innerHTML = renderDeviceGroups(state.devices, state.collapsedCategories, {
      historyByFingerprint: state.historyByFingerprint,
      activeFilters: state.activeFilters,
      now: Date.now(),
    });
  };

  renderAllGroups();

  const handleDeviceFound = (device: ParsedDevice) => {
    updateLocalHistory(state.historyByFingerprint, device);
    persistLocalHistory(state.historyByFingerprint);
    state.devices.set(device.id, device);
    updateDeviceCount();
    renderAllGroups();
  };

  const handleError = (error: Error) => {
    showMessage(error.message, { type: 'alert' });
    stopScanning();
  };

  const stopScanning = () => {
    if (state.scanner) {
      state.scanner.stopScan();
      state.scanner = null;
    }
    if (state.updateInterval !== null) {
      clearInterval(state.updateInterval);
      state.updateInterval = null;
    }
    state.isScanning = false;
    updateUI();
  };

  const startScanning = async () => {
    if (state.isScanning) return;

    state.scanner = new BLEScanner({
      onDeviceFound: handleDeviceFound,
      onError: handleError,
    });

    state.isScanning = true;
    updateUI();

    try {
      await state.scanner.startScan();
    } catch (error) {
      handleError(error instanceof Error ? error : new Error(String(error)));
    }

    state.updateInterval = window.setInterval(() => {
      renderAllGroups();
    }, 5000);
  };

  const clearDevices = () => {
    if (state.scanner) {
      state.scanner.clearDevices();
    }
    state.devices.clear();
    state.collapsedCategories.clear();
    deviceList.innerHTML = renderDeviceGroups(state.devices, state.collapsedCategories, {
      historyByFingerprint: state.historyByFingerprint,
      activeFilters: state.activeFilters,
      now: Date.now(),
    });
    updateDeviceCount();
  };

  const updateFilterButtonStates = () => {
    for (const { button, filter } of filterButtons) {
      const isActive = state.activeFilters.has(filter);
      button.dataset.active = isActive ? 'true' : 'false';
      button.classList.toggle('btn-primary', isActive);
      button.classList.toggle('btn-ghost', !isActive);
    }
  };

  const handleFilterButtonClick = (event: Event) => {
    const button = event.currentTarget as HTMLButtonElement;
    const filter = button.dataset.filter as DeviceFilter | undefined;
    if (!filter) {
      return;
    }

    if (state.activeFilters.has(filter)) {
      state.activeFilters.delete(filter);
    } else {
      state.activeFilters.add(filter);
    }

    updateFilterButtonStates();
    renderAllGroups();
  };

  const updateUI = () => {
    if (state.isScanning) {
      scanBtn.classList.add('hidden');
      stopBtn.classList.remove('hidden');
      scanStatus.classList.remove('hidden');
    } else {
      scanBtn.classList.remove('hidden');
      stopBtn.classList.add('hidden');
      scanStatus.classList.add('hidden');
    }
  };

  const updateDeviceCount = () => {
    deviceCount.textContent = `${state.devices.size} device${state.devices.size !== 1 ? 's' : ''}`;
  };

  const handleCollapseToggle = (event: Event) => {
    const target = event.target as HTMLElement;
    const collapse = target.closest('.collapse');
    if (!collapse) return;

    const category = collapse.getAttribute('data-category');
    if (!category) return;

    const checkbox = collapse.querySelector('input[type="checkbox"]') as HTMLInputElement;
    if (checkbox?.checked) {
      state.collapsedCategories.delete(category);
    } else {
      state.collapsedCategories.add(category);
    }
  };

  scanBtn.addEventListener('click', startScanning);
  stopBtn.addEventListener('click', stopScanning);
  clearBtn.addEventListener('click', clearDevices);
  deviceList.addEventListener('click', handleCollapseToggle);
  for (const { button, filter } of filterButtons) {
    button.dataset.filter = filter;
    button.addEventListener('click', handleFilterButtonClick);
  }
  updateFilterButtonStates();

  return () => {
    stopScanning();
    scanBtn.removeEventListener('click', startScanning);
    stopBtn.removeEventListener('click', stopScanning);
    clearBtn.removeEventListener('click', clearDevices);
    deviceList.removeEventListener('click', handleCollapseToggle);
    for (const { button } of filterButtons) {
      button.removeEventListener('click', handleFilterButtonClick);
    }
  };
}

function loadLocalHistory(): Map<string, DeviceHistoryEntry> {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) {
      return new Map();
    }

    const parsed = JSON.parse(raw) as Record<string, DeviceHistoryEntry>;
    return new Map(Object.entries(parsed));
  } catch (error) {
    console.error('[BLEScanner] Failed to load local history', error);
    return new Map();
  }
}

function persistLocalHistory(historyByFingerprint: Map<string, DeviceHistoryEntry>): void {
  try {
    const payload = Object.fromEntries(historyByFingerprint.entries());
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.error('[BLEScanner] Failed to persist local history', error);
  }
}

function updateLocalHistory(
  historyByFingerprint: Map<string, DeviceHistoryEntry>,
  device: ParsedDevice
): void {
  const now = Date.now();
  const current = historyByFingerprint.get(device.localFingerprint);

  if (!current) {
    historyByFingerprint.set(device.localFingerprint, {
      firstSeen: now,
      lastSeen: now,
      sightings: 1,
      strongestRssi: device.rssi,
      averageRssi: device.rssi,
    });
    return;
  }

  current.lastSeen = now;
  current.sightings += 1;

  if (device.rssi !== null) {
    if (current.strongestRssi === null || device.rssi > current.strongestRssi) {
      current.strongestRssi = device.rssi;
    }

    if (current.averageRssi === null) {
      current.averageRssi = device.rssi;
    } else {
      current.averageRssi =
        (current.averageRssi * (current.sightings - 1) + device.rssi) / current.sightings;
    }
  }
}

