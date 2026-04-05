import type { ParsedDevice } from './parser';
import { parseAdvertisingEvent } from './parser';

export type ScanCallback = (device: ParsedDevice) => void;
export type ErrorCallback = (error: Error) => void;

export interface ScanOptions {
  onDeviceFound: ScanCallback;
  onError: ErrorCallback;
}

export class BLEScanner {
  private activeDevices: Map<string, ParsedDevice> = new Map();
  private currentScan: BluetoothLEScan | null = null;
  private advertisementHandler: ((event: BluetoothAdvertisingEvent) => void) | null = null;
  private onDeviceFound: ScanCallback;
  private onError: ErrorCallback;

  constructor(options: ScanOptions) {
    this.onDeviceFound = options.onDeviceFound;
    this.onError = options.onError;
  }

  async startScan(): Promise<void> {
    if (!navigator.bluetooth) {
      this.onError(new Error('Web Bluetooth API is not supported in this browser'));
      return;
    }

    const isAvailable = await navigator.bluetooth.getAvailability();
    if (!isAvailable) {
      this.onError(new Error('Bluetooth is not available'));
      return;
    }

    try {
      this.currentScan = await navigator.bluetooth.requestLEScan({
        acceptAllAdvertisements: true,
        keepRepeatedDevices: true,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'NotAllowedError') {
        return;
      }
      this.onError(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    this.removeAdvertisementListener();

    this.advertisementHandler = (event: BluetoothAdvertisingEvent) => {
      const parsedDevice = parseAdvertisingEvent(event);
      this.activeDevices.set(parsedDevice.id, parsedDevice);
      this.onDeviceFound(parsedDevice);
    };

    navigator.bluetooth.addEventListener(
      'advertisementreceived',
      this.advertisementHandler as EventListener
    );
  }

  stopScan(): void {
    if (this.currentScan) {
      this.currentScan.stop();
      this.currentScan = null;
    }
    this.removeAdvertisementListener();
    this.activeDevices.clear();
  }

  private removeAdvertisementListener(): void {
    if (!this.advertisementHandler || !navigator.bluetooth) {
      return;
    }

    navigator.bluetooth.removeEventListener(
      'advertisementreceived',
      this.advertisementHandler as EventListener
    );
    this.advertisementHandler = null;
  }


  clearDevices(): void {
    this.activeDevices.clear();
  }
}

export function isBluetoothSupported(): boolean {
  return !!navigator.bluetooth;
}
