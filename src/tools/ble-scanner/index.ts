import { BLEScanner, isBluetoothSupported } from './scanner';
import { renderDeviceCard, renderEmptyState, updateDeviceCard } from './ui';
import type { ParsedDevice } from './parser';
import { showMessage } from '../../js/ui';

interface ScannerState {
  scanner: BLEScanner | null;
  isScanning: boolean;
  devices: Map<string, ParsedDevice>;
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

  deviceList.innerHTML = renderEmptyState();

  const state: ScannerState = {
    scanner: null,
    isScanning: false,
    devices: new Map(),
    updateInterval: null,
  };

  const handleDeviceFound = (device: ParsedDevice) => {
    state.devices.set(device.id, device);
    updateDeviceCount();

    const existingCard = deviceList.querySelector(`[data-device-id="${device.id}"]`);
    if (existingCard) {
      updateDeviceCard(device);
    } else {
      const card = renderDeviceCard(device);
      const emptyState = deviceList.querySelector('.col-span-full');
      if (emptyState) {
        emptyState.outerHTML = card;
      } else {
        deviceList.insertAdjacentHTML('beforeend', card);
      }
    }
  };

  const handleError = (error: Error) => {
    console.error('BLE Scanner Error:', error);
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
      if (state.devices.size > 0) {
        deviceList.innerHTML = '';
        state.devices.forEach((device) => {
          deviceList.insertAdjacentHTML('beforeend', renderDeviceCard(device));
        });
      }
    }, 5000);
  };

  const clearDevices = () => {
    if (state.scanner) {
      state.scanner.clearDevices();
    }
    state.devices.clear();
    deviceList.innerHTML = renderEmptyState();
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

  scanBtn.addEventListener('click', startScanning);
  stopBtn.addEventListener('click', stopScanning);
  clearBtn.addEventListener('click', clearDevices);

  return () => {
    stopScanning();
    scanBtn.removeEventListener('click', startScanning);
    stopBtn.removeEventListener('click', stopScanning);
    clearBtn.removeEventListener('click', clearDevices);
  };
}
