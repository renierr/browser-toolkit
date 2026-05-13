import { normalizeByScreenAngle } from './math';
import type { OrientationReading, SensorStatus } from './types';

type MotionPermissionEvent = {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

type StartResult = {
  status: SensorStatus;
  stop: () => void;
};

export class SensorService {
  private stopListener: (() => void) | null = null;

  public canRequestPermission(): boolean {
    if (typeof DeviceOrientationEvent === 'undefined') {
      return false;
    }
    const permissionCarrier = DeviceOrientationEvent as unknown as MotionPermissionEvent;
    return typeof permissionCarrier.requestPermission === 'function';
  }

  public async requestPermissionIfNeeded(): Promise<boolean> {
    if (!this.canRequestPermission()) {
      return true;
    }

    try {
      const permissionCarrier = DeviceOrientationEvent as unknown as MotionPermissionEvent;
      const response = await permissionCarrier.requestPermission?.();
      return response === 'granted';
    } catch (error) {
      console.error('[BubbleLevel] Motion permission request failed', error);
      return false;
    }
  }

  public start(onReading: (reading: OrientationReading) => void): StartResult {
    if (typeof DeviceOrientationEvent === 'undefined') {
      return { status: 'unsupported', stop: () => undefined };
    }

    const handler = (event: DeviceOrientationEvent): void => {
      const beta = event.beta;
      const gamma = event.gamma;
      if (beta === null || gamma === null) {
        return;
      }

      const rawAngle =
        screen.orientation?.angle ?? (window as Window & { orientation?: number }).orientation;
      const angle = Number.isFinite(rawAngle) ? Number(rawAngle) : 0;
      onReading(normalizeByScreenAngle(beta, gamma, angle));
    };

    window.addEventListener('deviceorientation', handler);
    this.stopListener = () => {
      window.removeEventListener('deviceorientation', handler);
      this.stopListener = null;
    };

    return {
      status: 'ready',
      stop: () => {
        this.stopListener?.();
      },
    };
  }

  public stop(): void {
    this.stopListener?.();
  }
}
