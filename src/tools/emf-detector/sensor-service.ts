import { magnitude } from './math';
import type { MagnetometerReading, SensorStatus } from './types';

type PermissionState = 'granted' | 'denied' | 'prompt';

type PermissionStatusLike = {
  state: PermissionState;
};

type PermissionDescriptorLike = {
  name: string;
};

type PermissionsLike = {
  query(permissionDesc: PermissionDescriptorLike): Promise<PermissionStatusLike>;
};

type ExtendedNavigator = Navigator & {
  permissions?: PermissionsLike;
};

type MagnetometerLike = {
  x: number | null;
  y: number | null;
  z: number | null;
  start: () => void;
  stop: () => void;
  addEventListener: (type: 'reading' | 'error', listener: EventListener) => void;
  removeEventListener: (type: 'reading' | 'error', listener: EventListener) => void;
};

type MagnetometerCtor = new (options?: { frequency?: number }) => MagnetometerLike;

type StartResult = {
  status: SensorStatus;
  stop: () => void;
};

type SensorErrorKind = 'permission-denied' | 'not-readable' | 'not-supported' | 'unknown';

type SensorErrorPayload = {
  kind: SensorErrorKind;
  message: string;
};

export class SensorService {
  private stopListener: (() => void) | null = null;

  public isSecureContext(): boolean {
    return window.isSecureContext;
  }

  public isSupported(): boolean {
    return this.getCtor() !== null;
  }

  public async getPermissionState(): Promise<PermissionState | null> {
    const nav = navigator as ExtendedNavigator;
    if (!nav.permissions || typeof nav.permissions.query !== 'function') {
      return null;
    }

    try {
      const status = await nav.permissions.query({ name: 'magnetometer' });
      return status.state;
    } catch (error) {
      console.error('[EmfDetector] Failed to query magnetometer permission', error);
      return null;
    }
  }

  public async canStartWithoutPrompt(): Promise<boolean> {
    const state = await this.getPermissionState();
    if (state === null) {
      return true;
    }
    return state !== 'denied';
  }

  public start(
    onReading: (reading: MagnetometerReading) => void,
    onError?: (error: SensorErrorPayload) => void
  ): StartResult {
    if (!this.isSecureContext()) {
      return { status: 'insecure-context', stop: () => undefined };
    }

    const ctor = this.getCtor();
    if (!ctor) {
      return { status: 'unsupported', stop: () => undefined };
    }

    try {
      const sensor = new ctor({ frequency: 30 });

      const onSensorReading = (): void => {
        const x = sensor.x;
        const y = sensor.y;
        const z = sensor.z;

        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
          return;
        }

        const nx = Number(x);
        const ny = Number(y);
        const nz = Number(z);

        onReading({
          x: nx,
          y: ny,
          z: nz,
          magnitude: magnitude(nx, ny, nz),
        });
      };

      const onSensorError = (event: Event): void => {
        const errorEvent = event as Event & {
          error?: {
            name?: string;
            message?: string;
          };
        };
        const name = errorEvent.error?.name ?? 'UnknownError';
        const message = errorEvent.error?.message ?? 'Magnetometer runtime error';

        let kind: SensorErrorKind = 'unknown';
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          kind = 'permission-denied';
        } else if (name === 'NotReadableError') {
          kind = 'not-readable';
        } else if (name === 'NotSupportedError') {
          kind = 'not-supported';
        }

        console.error('[EmfDetector] Magnetometer error event', { name, message, event });
        onError?.({ kind, message });
      };

      sensor.addEventListener('reading', onSensorReading as EventListener);
      sensor.addEventListener('error', onSensorError as EventListener);
      sensor.start();

      this.stopListener = () => {
        sensor.removeEventListener('reading', onSensorReading as EventListener);
        sensor.removeEventListener('error', onSensorError as EventListener);
        sensor.stop();
        this.stopListener = null;
      };

      return {
        status: 'ready',
        stop: () => {
          this.stopListener?.();
        },
      };
    } catch (error) {
      console.error('[EmfDetector] Failed to start magnetometer', error);
      return { status: 'error', stop: () => undefined };
    }
  }

  public stop(): void {
    this.stopListener?.();
  }

  private getCtor(): MagnetometerCtor | null {
    type MagnetometerWindow = Window & {
      Magnetometer?: MagnetometerCtor;
    };

    const magnetometer = (window as MagnetometerWindow).Magnetometer;
    return typeof magnetometer === 'function' ? magnetometer : null;
  }
}
