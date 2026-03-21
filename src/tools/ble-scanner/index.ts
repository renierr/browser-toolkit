import { BLEScanner, isBluetoothSupported } from './scanner';
import { renderDeviceGroups } from './ui';
import type { ParsedDevice } from './parser';
import { showMessage } from '../../js/ui';

interface ScannerState {
  scanner: BLEScanner | null;
  isScanning: boolean;
  devices: Map<string, ParsedDevice>;
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

  if (!isBluetoothSupported()) {
    noBluetooth.classList.remove('hidden');
    scanBtn.disabled = true;
    return;
  }

  const state: ScannerState = {
    scanner: null,
    isScanning: false,
    devices: new Map(),
    collapsedCategories: new Set(),
    updateInterval: null,
  };

  const renderAllGroups = () => {
    deviceList.innerHTML = renderDeviceGroups(state.devices, state.collapsedCategories);
  };

  renderAllGroups();

  const handleDeviceFound = (device: ParsedDevice) => {
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
    deviceList.innerHTML = renderDeviceGroups(state.devices, state.collapsedCategories);
    updateDeviceCount();
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

  return () => {
    stopScanning();
    scanBtn.removeEventListener('click', startScanning);
    stopBtn.removeEventListener('click', stopScanning);
    clearBtn.removeEventListener('click', clearDevices);
    deviceList.removeEventListener('click', handleCollapseToggle);
  };
}
