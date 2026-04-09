import { showMessage } from '@js/ui';

type ClimateReading = {
  temperatureC?: number;
  humidityPercent?: number;
  batteryPercent?: number;
  pressureHpa?: number;
  voltageV?: number;
  timestamp: number;
};

type RememberedDevice = {
  id: string;
  name: string;
  profileId?: string;
  lastSeen: number;
};

type ActiveConnection = {
  profileId: string;
  profileName: string;
  refresh: () => Promise<void>;
  cleanup: () => Promise<void>;
};

type SensorProfile = {
  id: string;
  name: string;
  connect: (
    server: BluetoothRemoteGATTServer,
    onReading: (reading: Partial<ClimateReading>) => void
  ) => Promise<ActiveConnection>;
};

type ConnectOptions = {
  silent?: boolean;
};

const STORAGE_KEY = 'ble-climate-monitor.trusted-devices.v1';
const LAST_DEVICE_STORAGE_KEY = 'ble-climate-monitor.last-device-id.v1';
const ENVIRONMENTAL_SERVICE_UUID: BluetoothServiceUUID = 0x181a;
const BATTERY_SERVICE_UUID: BluetoothServiceUUID = 0x180f;
const XIAOMI_ENV_SERVICE_UUID: BluetoothServiceUUID = 'ebe0ccb0-7a0a-4b0c-8a1a-6ff2997da3a6';
const XIAOMI_ENV_DATA_CHAR_UUID: BluetoothCharacteristicUUID =
  'ebe0ccc1-7a0a-4b0c-8a1a-6ff2997da3a6';
const MJ_HT_V1_TEXT_SERVICE_UUID: BluetoothServiceUUID = '226c0000-6476-4566-7562-66734470666d';
const MJ_HT_V1_TEXT_CHAR_UUID: BluetoothCharacteristicUUID = '226caa55-6476-4566-7562-66734470666d';

export default function init(): void | (() => void) {
  const pairBtn = document.getElementById('pair-btn') as HTMLButtonElement;
  const reconnectLastBtn = document.getElementById('reconnect-last-btn') as HTMLButtonElement;
  const disconnectBtn = document.getElementById('disconnect-btn') as HTMLButtonElement;
  const refreshBtn = document.getElementById('refresh-btn') as HTMLButtonElement;
  const connectSelectedBtn = document.getElementById('connect-selected-btn') as HTMLButtonElement;
  const clearTrustedBtn = document.getElementById('clear-trusted-btn') as HTMLButtonElement;

  const trustedDeviceSelect = document.getElementById('trusted-device-select') as HTMLSelectElement;
  const trustedHint = document.getElementById('trusted-hint') as HTMLParagraphElement;
  const unsupportedAlert = document.getElementById('unsupported-alert') as HTMLDivElement;
  const connectionChip = document.getElementById('connection-chip') as HTMLDivElement;
  const profileLabel = document.getElementById('profile-label') as HTMLDivElement;
  const deviceLabel = document.getElementById('device-label') as HTMLDivElement;

  if (!navigator.bluetooth) {
    unsupportedAlert.classList.remove('hidden');
    pairBtn.disabled = true;
    reconnectLastBtn.disabled = true;
    connectSelectedBtn.disabled = true;
    clearTrustedBtn.disabled = true;
    return;
  }

  const state = {
    device: null as BluetoothDevice | null,
    activeConnection: null as ActiveConnection | null,
    reading: { timestamp: Date.now() } as ClimateReading,
    trustedDevices: loadTrustedDevices(),
    grantedDevices: [] as BluetoothDevice[],
    isBusy: false,
    isDisconnecting: false,
    connectAttemptToken: 0,
    autoReconnectTimer: null as number | null,
    lastConnectedDeviceId: null as string | null,
    lastConnectedDeviceRef: null as BluetoothDevice | null,
    lastConnectedProfileId: null as string | null,
    connectedAtMs: 0,
    mjReconnectAttempts: 0,
  };

  const profileCandidates: SensorProfile[] = [
    buildMjHtV1TextProfile(),
    buildXiaomiProfile(),
    buildEnvironmentalSensingProfile(),
  ];

  const clearAutoReconnectTimer = (): void => {
    if (state.autoReconnectTimer !== null) {
      clearTimeout(state.autoReconnectTimer);
      state.autoReconnectTimer = null;
    }
  };

  const handleDeviceDisconnected = (reason: 'manual' | 'remote' = 'remote'): void => {
    state.device = null;
    state.activeConnection = null;
    connectionChip.textContent = 'Disconnected';
    connectionChip.className = 'badge badge-outline';
    profileLabel.textContent = '-';
    deviceLabel.textContent = 'No active device';
    disconnectBtn.classList.add('hidden');
    refreshBtn.classList.add('hidden');
    pairBtn.disabled = false;
    reconnectLastBtn.disabled = false;
    connectSelectedBtn.disabled = false;

    if (reason === 'manual') {
      return;
    }

    const shouldRetryMj = state.lastConnectedProfileId === 'mj-ht-v1-text';
    if (shouldRetryMj) {
      scheduleMjReconnect();
      return;
    }

    showMessage('Sensor disconnected.', { type: 'warning' });
  };

  const onGattDisconnected = (): void => {
    handleDeviceDisconnected('remote');
  };

  const scheduleMjReconnect = (): void => {
    clearAutoReconnectTimer();
    if (state.isDisconnecting || state.isBusy) {
      return;
    }
    if (!state.lastConnectedDeviceId || state.lastConnectedProfileId !== 'mj-ht-v1-text') {
      return;
    }
    const delayMs = Math.min(10000, 1200 + state.mjReconnectAttempts * 1400);
    state.autoReconnectTimer = window.setTimeout(() => {
      void attemptMjReconnect();
    }, delayMs);
  };

  const attemptMjReconnect = async (): Promise<void> => {
    clearAutoReconnectTimer();
    state.mjReconnectAttempts += 1;

    const cachedDevice = state.lastConnectedDeviceRef;
    if (cachedDevice) {
      connectionChip.textContent = 'Reconnecting';
      connectionChip.className = 'badge badge-warning';
      const connectedFromCache = await connectToDevice(cachedDevice, { silent: true });
      if (connectedFromCache) {
        return;
      }
    }

    await refreshGrantedDevices();
    const deviceId = state.lastConnectedDeviceId;
    const device = deviceId
      ? state.grantedDevices.find((candidate) => candidate.id === deviceId)
      : undefined;

    if (!device) {
      scheduleMjReconnect();
      return;
    }

    connectionChip.textContent = 'Reconnecting';
    connectionChip.className = 'badge badge-warning';
    const connected = await connectToDevice(device, { silent: true });
    if (!connected) {
      scheduleMjReconnect();
    }
  };

  const mergeReading = (patch: Partial<ClimateReading>): void => {
    state.reading = {
      ...state.reading,
      ...patch,
      timestamp: Date.now(),
    };
    renderReading(state.reading);
  };

  const setBusy = (isBusy: boolean): void => {
    state.isBusy = isBusy;
    pairBtn.disabled = isBusy;
    reconnectLastBtn.disabled = isBusy;
    connectSelectedBtn.disabled = isBusy;
  };

  const renderTrustedOptions = (): void => {
    const options = state.trustedDevices
      .map((device) => {
        const granted = state.grantedDevices.some((entry) => entry.id === device.id);
        const suffix = granted ? 'ready' : 'pair required';
        return `<option value="${device.id}">${escapeHtml(device.name || 'Unnamed sensor')} (${suffix})</option>`;
      })
      .join('');

    trustedDeviceSelect.innerHTML =
      options || '<option value="">No trusted devices yet. Pair a sensor first.</option>';

    const hasTrustedDevices = state.trustedDevices.length > 0;
    trustedHint.textContent = hasTrustedDevices
      ? 'Sensors marked as ready can reconnect instantly.'
      : 'Trusted devices are remembered and can reconnect without pairing again.';
    clearTrustedBtn.disabled = !hasTrustedDevices;
  };

  const refreshGrantedDevices = async (): Promise<void> => {
    const bluetoothWithGetDevices = navigator.bluetooth as Bluetooth & {
      getDevices?: () => Promise<BluetoothDevice[]>;
    };

    if (!bluetoothWithGetDevices.getDevices) {
      state.grantedDevices = [];
      renderTrustedOptions();
      return;
    }

    try {
      state.grantedDevices = await bluetoothWithGetDevices.getDevices();
      renderTrustedOptions();
    } catch (error) {
      console.error('[BLEClimateMonitor] Failed to load granted devices', error);
      renderTrustedOptions();
    }
  };

  const updateRememberedDevice = (device: BluetoothDevice, profileId: string): void => {
    const next: RememberedDevice = {
      id: device.id,
      name: device.name || 'Unnamed sensor',
      profileId,
      lastSeen: Date.now(),
    };

    const withoutCurrent = state.trustedDevices.filter((entry) => entry.id !== next.id);
    state.trustedDevices = [next, ...withoutCurrent].slice(0, 20);
    persistTrustedDevices(state.trustedDevices);
    localStorage.setItem(LAST_DEVICE_STORAGE_KEY, next.id);
    renderTrustedOptions();
  };

  const connectToDevice = async (
    device: BluetoothDevice,
    options: ConnectOptions = {}
  ): Promise<boolean> => {
    clearAutoReconnectTimer();
    const attemptToken = ++state.connectAttemptToken;
    setBusy(true);

    try {
      if (state.device?.gatt?.connected) {
        await disconnectCurrentDevice();
      }

      connectionChip.textContent = 'Connecting';
      connectionChip.className = 'badge badge-primary';

      const server = await device.gatt?.connect();
      if (!server) {
        throw new Error('Could not connect to GATT server.');
      }

      if (attemptToken !== state.connectAttemptToken) {
        if (device.gatt?.connected) {
          device.gatt.disconnect();
        }
        return false;
      }

      let activeConnection: ActiveConnection | null = null;
      let lastProfileError: unknown = null;

      for (const profile of profileCandidates) {
        try {
          activeConnection = await profile.connect(server, mergeReading);
          break;
        } catch (error) {
          lastProfileError = error;
        }
      }

      if (!activeConnection) {
        throw new Error(
          lastProfileError instanceof Error
            ? lastProfileError.message
            : 'No supported climate profile found for this sensor.'
        );
      }

      state.device = device;
      state.activeConnection = activeConnection;
      device.removeEventListener('gattserverdisconnected', onGattDisconnected);
      device.addEventListener('gattserverdisconnected', onGattDisconnected);
      state.connectedAtMs = Date.now();
      state.lastConnectedDeviceId = device.id;
      state.lastConnectedDeviceRef = device;
      state.lastConnectedProfileId = activeConnection.profileId;
      state.mjReconnectAttempts = 0;

      connectionChip.textContent = 'Connected';
      connectionChip.className = 'badge badge-success';
      profileLabel.textContent = activeConnection.profileName;
      deviceLabel.textContent = `${device.name || 'Unnamed sensor'} (${device.id.slice(0, 8)})`;
      disconnectBtn.classList.remove('hidden');
      refreshBtn.classList.remove('hidden');
      updateRememberedDevice(device, activeConnection.profileId);

      await activeConnection.refresh();
      if (!options.silent) {
        showMessage(`Connected to ${device.name || 'sensor'}.`, { type: 'info' });
      }
      return true;
    } catch (error) {
      console.error('[BLEClimateMonitor] Connection failed', error);
      if (device.gatt?.connected) {
        device.gatt.disconnect();
      }
      connectionChip.textContent = 'Disconnected';
      connectionChip.className = 'badge badge-outline';
      if (!options.silent) {
        showMessage(error instanceof Error ? error.message : 'Failed to connect sensor.', {
          type: 'alert',
        });
      }
      return false;
    } finally {
      if (attemptToken === state.connectAttemptToken) {
        setBusy(false);
      }
    }
  };

  const requestAndConnect = async (): Promise<void> => {
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: [MJ_HT_V1_TEXT_SERVICE_UUID] },
          { namePrefix: 'MJ_HT_V1' },
          { namePrefix: 'LYWSD' },
          { namePrefix: 'Qingping' },
          { services: [ENVIRONMENTAL_SERVICE_UUID] },
        ],
        optionalServices: [
          MJ_HT_V1_TEXT_SERVICE_UUID,
          ENVIRONMENTAL_SERVICE_UUID,
          BATTERY_SERVICE_UUID,
          XIAOMI_ENV_SERVICE_UUID,
        ],
      });

      await connectToDevice(device);
      await refreshGrantedDevices();
    } catch (error) {
      if (error instanceof Error && error.name === 'NotFoundError') {
        return;
      }
      console.error('[BLEClimateMonitor] Pairing failed', error);
      showMessage('Could not pair sensor.', { type: 'alert' });
    }
  };

  const connectSelectedDevice = async (): Promise<void> => {
    const selectedDeviceId = trustedDeviceSelect.value;
    if (!selectedDeviceId) return;

    const grantedDevice = state.grantedDevices.find((device) => device.id === selectedDeviceId);
    if (!grantedDevice) {
      showMessage('This trusted device is not ready yet. Pair it again once.', { type: 'warning' });
      return;
    }

    await connectToDevice(grantedDevice);
  };

  const reconnectLastDevice = async (): Promise<void> => {
    const lastDeviceId = localStorage.getItem(LAST_DEVICE_STORAGE_KEY);
    if (!lastDeviceId) {
      showMessage('No previous sensor found. Pair one first.', { type: 'warning' });
      return;
    }

    const lastDevice = state.grantedDevices.find((device) => device.id === lastDeviceId);
    if (!lastDevice) {
      showMessage('Last sensor is not currently available. Use Pair Sensor.', { type: 'warning' });
      return;
    }

    await connectToDevice(lastDevice);
  };

  const disconnectCurrentDevice = async (): Promise<void> => {
    state.isDisconnecting = true;
    clearAutoReconnectTimer();
    const hadActiveDevice = Boolean(state.device || state.activeConnection);

    if (state.device) {
      state.device.removeEventListener('gattserverdisconnected', onGattDisconnected);
    }

    if (state.activeConnection) {
      await state.activeConnection.cleanup();
      state.activeConnection = null;
    }

    if (state.device?.gatt?.connected) {
      state.device.gatt.disconnect();
    }

    if (hadActiveDevice) {
      handleDeviceDisconnected('manual');
    }
    state.isDisconnecting = false;
  };

  const clearTrustedDevices = (): void => {
    state.trustedDevices = [];
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LAST_DEVICE_STORAGE_KEY);
    renderTrustedOptions();
    showMessage('Trusted device list cleared.', { type: 'info' });
  };

  const onDisconnectClick = (): void => {
    void disconnectCurrentDevice();
  };
  const onRefreshClick = (): void => {
    void state.activeConnection?.refresh();
  };
  const onConnectSelectedClick = (): void => {
    void connectSelectedDevice();
  };

  pairBtn.addEventListener('click', requestAndConnect);
  reconnectLastBtn.addEventListener('click', reconnectLastDevice);
  disconnectBtn.addEventListener('click', onDisconnectClick);
  refreshBtn.addEventListener('click', onRefreshClick);
  connectSelectedBtn.addEventListener('click', onConnectSelectedClick);
  clearTrustedBtn.addEventListener('click', clearTrustedDevices);

  renderTrustedOptions();
  renderReading(state.reading);
  void refreshGrantedDevices().then(() => {
    const lastDeviceId = localStorage.getItem(LAST_DEVICE_STORAGE_KEY);
    if (!lastDeviceId) return;
    const lastDevice = state.grantedDevices.find((device) => device.id === lastDeviceId);
    if (!lastDevice) return;

    // Auto reconnect only for trusted devices that are already granted.
    void connectToDevice(lastDevice, { silent: true });
  });

  return () => {
    pairBtn.removeEventListener('click', requestAndConnect);
    reconnectLastBtn.removeEventListener('click', reconnectLastDevice);
    disconnectBtn.removeEventListener('click', onDisconnectClick);
    refreshBtn.removeEventListener('click', onRefreshClick);
    connectSelectedBtn.removeEventListener('click', onConnectSelectedClick);
    clearTrustedBtn.removeEventListener('click', clearTrustedDevices);
    clearAutoReconnectTimer();
    void disconnectCurrentDevice();
  };
}

function renderReading(reading: ClimateReading): void {
  setText(
    'temperature-value',
    reading.temperatureC !== undefined ? `${reading.temperatureC.toFixed(1)}` : '--'
  );
  setText(
    'humidity-value',
    reading.humidityPercent !== undefined ? `${reading.humidityPercent.toFixed(1)}` : '--'
  );
  setText(
    'battery-value',
    reading.batteryPercent !== undefined ? `${Math.round(reading.batteryPercent)}` : '--'
  );
  setText(
    'pressure-value',
    reading.pressureHpa !== undefined ? `${reading.pressureHpa.toFixed(1)}` : '--'
  );
  setText(
    'voltage-value',
    reading.voltageV !== undefined ? `${reading.voltageV.toFixed(3)}` : '--'
  );
  setText('updated-at', `Last update: ${new Date(reading.timestamp).toLocaleTimeString()}`);

  const batteryProgress = document.getElementById('battery-progress') as HTMLProgressElement;
  batteryProgress.value = Math.max(0, Math.min(100, reading.batteryPercent ?? 0));

  const dewpoint = calculateDewPoint(reading.temperatureC, reading.humidityPercent);
  const comfort = getComfortLabel(reading.temperatureC, reading.humidityPercent);
  setText('comfort-value', comfort);
  setText(
    'dewpoint-value',
    dewpoint === null ? 'Dew point: --' : `Dew point: ${dewpoint.toFixed(1)} deg C`
  );
}

function setText(elementId: string, value: string): void {
  const element = document.getElementById(elementId);
  if (element) {
    element.textContent = value;
  }
}

function calculateDewPoint(temperatureC?: number, humidityPercent?: number): number | null {
  if (temperatureC === undefined || humidityPercent === undefined || humidityPercent <= 0) {
    return null;
  }

  const gamma = Math.log(humidityPercent / 100) + (17.62 * temperatureC) / (243.12 + temperatureC);
  return (243.12 * gamma) / (17.62 - gamma);
}

function getComfortLabel(temperatureC?: number, humidityPercent?: number): string {
  if (temperatureC === undefined || humidityPercent === undefined) {
    return 'Waiting for data';
  }

  if (humidityPercent > 70) return 'Humid';
  if (humidityPercent < 30) return 'Dry';
  if (temperatureC >= 18 && temperatureC <= 26 && humidityPercent >= 35 && humidityPercent <= 60) {
    return 'Comfortable';
  }
  if (temperatureC > 30) return 'Hot';
  if (temperatureC < 14) return 'Cold';
  return 'Moderate';
}

function loadTrustedDevices(): RememberedDevice[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as RememberedDevice[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => typeof entry.id === 'string').slice(0, 20);
  } catch (error) {
    console.error('[BLEClimateMonitor] Failed to load trusted devices', error);
    return [];
  }
}

function persistTrustedDevices(devices: RememberedDevice[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(devices));
  } catch (error) {
    console.error('[BLEClimateMonitor] Failed to persist trusted devices', error);
  }
}

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildXiaomiProfile(): SensorProfile {
  return {
    id: 'xiaomi-custom',
    name: 'Xiaomi/Mijia custom service',
    connect: async (
      server: BluetoothRemoteGATTServer,
      onReading: (reading: Partial<ClimateReading>) => void
    ): Promise<ActiveConnection> => {
      const service = await server.getPrimaryService(XIAOMI_ENV_SERVICE_UUID);
      const dataChar = await service.getCharacteristic(XIAOMI_ENV_DATA_CHAR_UUID);
      const listeners: Array<() => void> = [];

      const applyValue = (value: DataView): void => {
        const patch: Partial<ClimateReading> = {};
        if (value.byteLength >= 2) {
          patch.temperatureC = value.getInt16(0, true) / 100;
        }
        if (value.byteLength >= 3) {
          patch.humidityPercent = value.getUint8(2);
        }
        if (value.byteLength >= 4) {
          patch.batteryPercent = value.getUint8(3);
        }
        if (value.byteLength >= 6) {
          patch.voltageV = value.getUint16(4, true) / 1000;
        }
        onReading(patch);
      };

      const onChanged = (event: Event): void => {
        const target = event.target as BluetoothRemoteGATTCharacteristic;
        if (!target.value) return;
        applyValue(target.value);
      };

      await dataChar.startNotifications();
      dataChar.addEventListener('characteristicvaluechanged', onChanged);
      listeners.push(() => dataChar.removeEventListener('characteristicvaluechanged', onChanged));

      const refresh = async (): Promise<void> => {
        try {
          const value = await dataChar.readValue();
          applyValue(value);
        } catch (error) {
          console.error('[BLEClimateMonitor] Failed reading Xiaomi climate characteristic', error);
        }
      };

      await refresh();

      return {
        profileId: 'xiaomi-custom',
        profileName: 'Xiaomi/Mijia custom service',
        refresh,
        cleanup: async () => {
          listeners.forEach((unsubscribe) => unsubscribe());
          try {
            await dataChar.stopNotifications();
          } catch {
            // Ignore devices that do not support explicit stop notifications.
          }
        },
      };
    },
  };
}

function buildMjHtV1TextProfile(): SensorProfile {
  return {
    id: 'mj-ht-v1-text',
    name: 'MJ_HT_V1 text profile',
    connect: async (
      server: BluetoothRemoteGATTServer,
      onReading: (reading: Partial<ClimateReading>) => void
    ): Promise<ActiveConnection> => {
      const service = await server.getPrimaryService(MJ_HT_V1_TEXT_SERVICE_UUID);
      const characteristic = await service.getCharacteristic(MJ_HT_V1_TEXT_CHAR_UUID);
      let pollingTimer: number | null = null;
      let notificationsStarted = false;

      const parseAndApply = (value: DataView): void => {
        const text = new TextDecoder('utf-8').decode(value).trim();
        const temperatureMatch = text.match(/T\s*=\s*([+-]?\d+(?:\.\d+)?)/i);
        const humidityMatch = text.match(/H\s*=\s*([+-]?\d+(?:\.\d+)?)/i);

        const patch: Partial<ClimateReading> = {};
        if (temperatureMatch) {
          patch.temperatureC = Number.parseFloat(temperatureMatch[1]);
        }
        if (humidityMatch) {
          patch.humidityPercent = Number.parseFloat(humidityMatch[1]);
        }

        if (Object.keys(patch).length > 0) {
          onReading(patch);
        }
      };

      const onChanged = (event: Event): void => {
        const target = event.target as BluetoothRemoteGATTCharacteristic;
        if (!target.value) {
          return;
        }
        parseAndApply(target.value);
      };

      try {
        await characteristic.startNotifications();
        characteristic.addEventListener('characteristicvaluechanged', onChanged);
        notificationsStarted = true;
      } catch (error) {
        console.warn(
          '[BLEClimateMonitor] MJ_HT_V1 notifications unavailable, falling back to read',
          error
        );
      }

      const refresh = async (): Promise<void> => {
        try {
          const value = await characteristic.readValue();
          parseAndApply(value);
        } catch (error) {
          console.error('[BLEClimateMonitor] Failed reading MJ_HT_V1 text characteristic', error);
        }
      };

      await refresh();

      if (!notificationsStarted) {
        pollingTimer = window.setInterval(() => {
          void refresh();
        }, 10000);
      }

      return {
        profileId: 'mj-ht-v1-text',
        profileName: 'MJ_HT_V1 text profile',
        refresh,
        cleanup: async () => {
          if (pollingTimer !== null) {
            clearInterval(pollingTimer);
            pollingTimer = null;
          }
          characteristic.removeEventListener('characteristicvaluechanged', onChanged);
          try {
            if (notificationsStarted) {
              await characteristic.stopNotifications();
            }
          } catch {
            // Ignore devices that do not support explicit stop notifications.
          }
        },
      };
    },
  };
}

function buildEnvironmentalSensingProfile(): SensorProfile {
  const parserByUuid: Record<string, (value: DataView) => number> = {
    '00002a6e-0000-1000-8000-00805f9b34fb': (value) => value.getInt16(0, true) / 100,
    '00002a6f-0000-1000-8000-00805f9b34fb': (value) => value.getUint16(0, true) / 100,
    '00002a6d-0000-1000-8000-00805f9b34fb': (value) => value.getUint32(0, true) / 10,
    '00002a19-0000-1000-8000-00805f9b34fb': (value) => value.getUint8(0),
  };

  return {
    id: 'environmental-sensing',
    name: 'Environmental Sensing (standard BLE)',
    connect: async (
      server: BluetoothRemoteGATTServer,
      onReading: (reading: Partial<ClimateReading>) => void
    ): Promise<ActiveConnection> => {
      const environmentalService = await server.getPrimaryService(ENVIRONMENTAL_SERVICE_UUID);
      const listeners: Array<() => void> = [];
      const refreshers: Array<() => Promise<void>> = [];

      const bindCharacteristic = async (
        service: BluetoothRemoteGATTService,
        uuid: BluetoothCharacteristicUUID,
        assign: (parsed: number) => Partial<ClimateReading>
      ): Promise<void> => {
        const characteristic = await service.getCharacteristic(uuid);
        const parser = parserByUuid[characteristic.uuid.toLowerCase()];

        if (!parser) return;

        const apply = (value: DataView): void => {
          onReading(assign(parser(value)));
        };

        refreshers.push(async () => {
          const value = await characteristic.readValue();
          apply(value);
        });

        try {
          await characteristic.startNotifications();
          const onChanged = (event: Event): void => {
            const target = event.target as BluetoothRemoteGATTCharacteristic;
            if (target.value) {
              apply(target.value);
            }
          };
          characteristic.addEventListener('characteristicvaluechanged', onChanged);
          listeners.push(() =>
            characteristic.removeEventListener('characteristicvaluechanged', onChanged)
          );
          listeners.push(() => void characteristic.stopNotifications().catch(() => undefined));
        } catch {
          // Notification support is optional; readValue still works.
        }
      };

      await bindCharacteristic(environmentalService, 0x2a6e, (temperatureC) => ({ temperatureC }));
      await bindCharacteristic(environmentalService, 0x2a6f, (humidityPercent) => ({
        humidityPercent,
      }));

      try {
        await bindCharacteristic(environmentalService, 0x2a6d, (pressureHpa) => ({ pressureHpa }));
      } catch {
        // Pressure is optional.
      }

      try {
        const batteryService = await server.getPrimaryService(BATTERY_SERVICE_UUID);
        await bindCharacteristic(batteryService, 0x2a19, (batteryPercent) => ({ batteryPercent }));
      } catch {
        // Battery service is optional.
      }

      const refresh = async (): Promise<void> => {
        for (const refreshValue of refreshers) {
          try {
            await refreshValue();
          } catch (error) {
            console.error('[BLEClimateMonitor] Failed reading environmental characteristic', error);
          }
        }
      };

      await refresh();

      return {
        profileId: 'environmental-sensing',
        profileName: 'Environmental Sensing (standard BLE)',
        refresh,
        cleanup: async () => {
          listeners.forEach((unsubscribe) => unsubscribe());
        },
      };
    },
  };
}
