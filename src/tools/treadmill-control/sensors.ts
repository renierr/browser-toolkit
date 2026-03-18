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
  const simulate = Boolean(opts?.simulate) || false;

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
    // Additional optional metrics
    let averageSpeed = speed; // km/h
    let elevationGainPositive = 0; // m
    let elevationGainNegative = 0; // m
    let instantaneousPace = speed > 0 ? 60 / speed : 0; // min/km
    let averagePace = instantaneousPace; // min/km
    let metabolicEquivalent = Math.max(1, Math.round((1 + speed * 0.6) * 10) / 10); // METs (approx)
    let remainingTime: number | null = 30 * 60; // seconds, optional session target (default 30min)
    let cadence = Math.round(80 + speed * 10); // steps per minute
    let cumulativeStrideCount = 0; // total strides
    let proprietarySteps = 0; // steps/proprietary counter
    let status = speed > 0 ? 'Running' : 'Stopped';
    const isMetric = true;

    // Helper to compute derived metrics and emit a full update
    const emitCurrent = () => {
      // averageSpeed derived from distance and elapsed (avoid division by zero)
      if (elapsed > 0) {
        averageSpeed = distance / (elapsed / 3600.0);
      } else {
        averageSpeed = speed;
      }

      instantaneousPace = speed > 0 ? 60 / speed : 0; // min/km
      averagePace = averageSpeed > 0 ? 60 / averageSpeed : 0; // min/km
      metabolicEquivalent = Math.max(1, Math.round((1 + speed * 0.6) * 10) / 10);
      cadence = speed > 0 ? Math.round(80 + speed * 10) : 0;
      // increment stride counters based on cadence (steps per minute -> per second)
      const strideIncrement = cadence / 60.0;
      cumulativeStrideCount += strideIncrement;
      proprietarySteps += strideIncrement;
      // Round counters to integers when emitting
      status = speed > 0 ? 'Running' : 'Stopped';
      if (remainingTime !== null) {
        remainingTime = Math.max(0, Math.round(remainingTime - 1));
      }

      // Small elevation gain simulation: increase positive gain when incline increases
      if (incline > 0 && speed > 0) {
        elevationGainPositive += Math.max(0, incline / 10.0 * (speed / 6.0));
      } else if (incline < 0 && speed > 0) {
        elevationGainNegative += Math.abs(incline) / 10.0 * (speed / 6.0);
      }

      // Build partial payload with all optional fields
      mergeAndEmit({
        speed: Number(speed.toFixed(2)),
        averageSpeed: Number(averageSpeed.toFixed(2)),
        distance: Number(distance.toFixed(3)),
        inclination: Number(incline.toFixed(1)),
        elevationGainPositive: Number(elevationGainPositive.toFixed(1)),
        elevationGainNegative: Number(elevationGainNegative.toFixed(1)),
        instantaneousPace: Number(instantaneousPace.toFixed(2)),
        averagePace: Number(averagePace.toFixed(2)),
        calories,
        heartRate: hr,
        metabolicEquivalent,
        elapsedTime: elapsed,
        remainingTime: remainingTime === null ? undefined : remainingTime,
        cadence,
        cumulativeStrideCount: Math.floor(cumulativeStrideCount),
        steps: Math.floor(proprietarySteps),
        status,
        isMetric,
      });
    };

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

    // Emit initial state (with extended optional fields)
    emitCurrent();

    const simulateData = () => {
      if (elapsed < 20) {
        speed += 0.1; // ramp up
      }
      // clamp
      speed = Math.max(0, Math.min(12, speed));
      // distance in km: speed (km/h) * (1/3600) per second
      distance += speed / 3600.0;
      elapsed += 1;
      // small incline wander
      incline = Math.max(-3, Math.min(15, incline + (Math.random() - 0.5) * 0.2));
      // calories roughly proportional to speed and incline
      calories += Math.round((speed / 6.0) * (1 + Math.abs(incline) / 10.0));
      hr = Math.round(70 + speed * 6 + Math.random() * 6);

      emitCurrent();
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
          // emit a final stopped state
          emitCurrent();
        },
        changeSpeed: (delta: number) => {
          speed = Math.max(0, Math.min(12, speed + delta));
          emitCurrent();
        },
        setSpeed: (s: number) => {
          speed = Math.max(0, Math.min(12, s));
          emitCurrent();
        },
        changeIncline: (delta: number) => {
          incline = Math.max(-3, Math.min(15, incline + delta));
          emitCurrent();
        },
        setIncline: (n: number) => {
          incline = Math.max(-3, Math.min(15, n));
          emitCurrent();
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

