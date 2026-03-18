import { connectTreadmill, type TreadmillDeviceType } from './bluetooth';
import { subscribeToRSC } from './rsc';
import type { TreadmillData } from './ftms-parser';

export type StepsMode = 'cumulative' | 'session' | 'raw';

export interface SensorsResult {
  device: BluetoothDevice;
  type: TreadmillDeviceType;
  support?: any;
  writeChar?: BluetoothRemoteGATTCharacteristic;
  simulator?: {
    start: () => void;
    stop: () => void;
    changeSpeed: (delta: number) => void;
    setSpeed: (s: number) => void;
    changeIncline: (delta: number) => void;
    setIncline: (n: number) => void;
  };
  cleanup: () => Promise<void>;
}

/**
 * Start sensors: connect to treadmill (FTMS or PitPat) and subscribe to RSC if available.
 * Merges partial updates from multiple sources and calls `onUpdate` with a unified
 * TreadmillData object. By default steps are reported in 'session' mode (delta from
 * first seen cumulative value).
 */
export async function startSensors(
  onUpdate: (d: TreadmillData) => void,
  opts?: { stepsMode?: StepsMode; simulate?: boolean }
): Promise<SensorsResult> {
  const stepsMode = opts?.stepsMode ?? 'session';
  const simulateParam = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('simulate_treadmill') === '1';
  const simulate = Boolean(opts?.simulate) || simulateParam;

  // current merged state
  const current: TreadmillData = {};
  let initialStride: number | null = null;
  let initialPitSteps: number | null = null;

  const mergeAndEmit = (partial: Partial<TreadmillData>) => {
    // Merge fields
    Object.assign(current, partial);

    // Handle cumulativeStrideCount session/ cumulative modes
    if (partial.cumulativeStrideCount !== undefined) {
      if (stepsMode === 'session') {
        if (initialStride === null) initialStride = partial.cumulativeStrideCount as number;
        current.cumulativeStrideCount = (partial.cumulativeStrideCount as number) - (initialStride || 0);
      } else {
        current.cumulativeStrideCount = partial.cumulativeStrideCount;
      }
      // reflect into steps if no proprietary steps provided
      if (current.steps === undefined) {
        current.steps = current.cumulativeStrideCount;
      }
    }

    // PitPat steps handling
    if (partial.steps !== undefined) {
      const pit = partial.steps as number;
      if (stepsMode === 'session') {
        if (initialPitSteps === null) initialPitSteps = pit;
        current.steps = pit - (initialPitSteps || 0);
      } else {
        current.steps = pit;
      }
    }

    // Emit a shallow copy to avoid accidental external mutation
    onUpdate({ ...current });
  };

  if (simulate) {
    // Create a simulated device that emits treadmill data periodically
    let intervalId: number | null = null;
    let elapsed = 0; // seconds
    let speed = 3.0; // km/h
    let distance = 0; // km
    let incline = 0.0;
    let calories = 0;
    let hr = 80;

    const fakeDevice: any = {
      name: 'Simulated Treadmill',
      gatt: { connected: true },
      _listeners: new Map<string, Function[]>(),
      addEventListener(ev: string, cb: Function) {
        const arr = (this._listeners.get(ev) as Function[]) || [];
        arr.push(cb);
        this._listeners.set(ev, arr);
      },
      removeEventListener(ev: string, cb: Function) {
        const arr = (this._listeners.get(ev) as Function[]) || [];
        const idx = arr.indexOf(cb);
        if (idx >= 0) arr.splice(idx, 1);
        this._listeners.set(ev, arr);
      },
      _emit(ev: string) {
        const arr = (this._listeners.get(ev) as Function[]) || [];
        arr.forEach((cb: any) => {
          try { cb.call(this); } catch (_) {}
        });
      }
    };

    // Emit initial state
    mergeAndEmit({ speed, distance, inclination: incline, elapsedTime: elapsed, calories, heartRate: hr });

    const simulateData = () => {
      if (elapsed < 20) {
        speed += 0.1; // ramp up
      }
      // clamp
      speed = Math.max(0, Math.min(12, speed));
      // distance in km: speed (km/h) * (1/3600) per second
      distance += speed / 3600.0;
      elapsed += 1;
      incline = Math.max(0, Math.min(5, incline + (Math.random() - 0.5) * 0.1));
      calories += Math.round((speed / 6.0) * 0.1);
      hr = Math.round(70 + speed * 6 + Math.random() * 5);

      mergeAndEmit({
        speed: Number(speed.toFixed(2)),
        distance: Number(distance.toFixed(3)),
        inclination: Number(incline.toFixed(1)),
        elapsedTime: elapsed,
        calories,
        heartRate: hr,
      });
    };

    return {
      device: fakeDevice as unknown as BluetoothDevice,
      type: 'FTMS' as TreadmillDeviceType,
      support: { controlSupported: true, speedControlSupported: true, inclineControlSupported: true },
      writeChar: undefined,
      simulator: {
        start: () => {
          // start treadmill simulation: if stopped, start ramp
          if (intervalId === null) {
            // restart interval
            intervalId = window.setInterval(simulateData, 1000);
          }
        },
        stop: () => {
          if (intervalId !== null) {
            clearInterval(intervalId);
            intervalId = null;
          }
          speed = 0;
          mergeAndEmit({ speed, distance, inclination: incline, elapsedTime: elapsed, calories, heartRate: hr });
        },
        changeSpeed: (delta: number) => {
          speed = Math.max(0, Math.min(12, speed + delta));
          mergeAndEmit({ speed: Number(speed.toFixed(2)), distance: Number(distance.toFixed(3)), inclination: Number(incline.toFixed(1)), elapsedTime: elapsed, calories, heartRate: hr });
        },
        setSpeed: (s: number) => {
          speed = Math.max(0, Math.min(12, s));
          mergeAndEmit({ speed: Number(speed.toFixed(2)), distance: Number(distance.toFixed(3)), inclination: Number(incline.toFixed(1)), elapsedTime: elapsed, calories, heartRate: hr });
        },
        changeIncline: (delta: number) => {
          incline = Math.max(0, Math.min(15, incline + delta));
          mergeAndEmit({ speed: Number(speed.toFixed(2)), distance: Number(distance.toFixed(3)), inclination: Number(incline.toFixed(1)), elapsedTime: elapsed, calories, heartRate: hr });
        },
        setIncline: (n: number) => {
          incline = Math.max(0, Math.min(15, n));
          mergeAndEmit({ speed: Number(speed.toFixed(2)), distance: Number(distance.toFixed(3)), inclination: Number(incline.toFixed(1)), elapsedTime: elapsed, calories, heartRate: hr });
        }
      },
      cleanup: async () => {
        if (intervalId !== null) {
          clearInterval(intervalId);
          intervalId = null;
        }
        // mark disconnected and notify listeners
        fakeDevice.gatt.connected = false;
        fakeDevice._emit && fakeDevice._emit('gattserverdisconnected');
      }
    };
  }

  // Use connectTreadmill to establish FTMS / PitPat notifications which will call mergeAndEmit
  const result = await connectTreadmill((d) => mergeAndEmit(d));

  // Subscribe to RSC if possible
  let rscCleanup: (() => Promise<void>) | null = null;
  try {
    rscCleanup = await subscribeToRSC(result.device, (p) => mergeAndEmit(p as Partial<TreadmillData>));
  } catch (e) {
    rscCleanup = null;
  }

  // Ensure we cleanup RSC on device disconnect
  const onDisconnect = async () => {
    if (rscCleanup) {
      try {
        await rscCleanup();
      } catch (_) {
        // ignore
      }
      rscCleanup = null;
    }
  };

  result.device.addEventListener('gattserverdisconnected', onDisconnect);

  return {
    device: result.device,
    type: result.type,
    support: result.support,
    writeChar: result.writeChar,
    cleanup: async () => {
      // remove disconnect listener
      try {
        result.device.removeEventListener('gattserverdisconnected', onDisconnect);
      } catch (_) {}
      if (rscCleanup) {
        try {
          await rscCleanup();
        } catch (_) {}
        rscCleanup = null;
      }
      // leave device connection management to caller (they may want to disconnect explicitly)
    }
  };
}

