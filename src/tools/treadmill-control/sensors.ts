import { connectTreadmill, type TreadmillDeviceType } from './bluetooth';
import { subscribeToRSC } from './rsc';
import type { TreadmillData } from './ftms-parser';

export type StepsMode = 'cumulative' | 'session' | 'raw';

export interface SensorsResult {
  device: BluetoothDevice;
  type: TreadmillDeviceType;
  support?: any;
  writeChar?: BluetoothRemoteGATTCharacteristic;
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
  opts?: { stepsMode?: StepsMode }
): Promise<SensorsResult> {
  const stepsMode = opts?.stepsMode ?? 'session';

  // current merged state
  const current: TreadmillData = {};
  let initialStride: number | null = null;
  let initialPitSteps: number | null = null;

  const mergeAndEmit = (partial: Partial<TreadmillData>) => {
    // Merge fields
    Object.assign(current, partial as any);

    // Handle cumulativeStrideCount session/ cumulative modes
    if (partial.cumulativeStrideCount !== undefined) {
      if (stepsMode === 'session') {
        if (initialStride === null) initialStride = partial.cumulativeStrideCount as number;
        current.cumulativeStrideCount = (partial.cumulativeStrideCount as number) - (initialStride || 0);
      } else {
        current.cumulativeStrideCount = partial.cumulativeStrideCount;
      }
      // reflect into steps if no proprietary steps provided
      if ((current as any).steps === undefined) {
        (current as any).steps = current.cumulativeStrideCount;
      }
    }

    // PitPat steps handling
    if ((partial as any).steps !== undefined) {
      const pit = (partial as any).steps as number;
      if (stepsMode === 'session') {
        if (initialPitSteps === null) initialPitSteps = pit;
        (current as any).steps = pit - (initialPitSteps || 0);
      } else {
        (current as any).steps = pit;
      }
    }

    // Emit a shallow copy to avoid accidental external mutation
    onUpdate({ ...current });
  };

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

