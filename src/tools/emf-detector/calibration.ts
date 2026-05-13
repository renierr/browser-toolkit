import type { Baseline, MagnetometerReading } from './types';

const STORAGE_KEY = 'emf-detector-baseline-v1';

const EMPTY_BASELINE: Baseline = {
  x: 0,
  y: 0,
  z: 0,
  magnitude: 0,
};

export class BaselineStore {
  public load(): Baseline {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return { ...EMPTY_BASELINE };
      }
      const parsed = JSON.parse(raw) as Partial<Baseline>;
      return {
        x: Number.isFinite(parsed.x) ? Number(parsed.x) : 0,
        y: Number.isFinite(parsed.y) ? Number(parsed.y) : 0,
        z: Number.isFinite(parsed.z) ? Number(parsed.z) : 0,
        magnitude: Number.isFinite(parsed.magnitude) ? Number(parsed.magnitude) : 0,
      };
    } catch (error) {
      console.error('[EmfDetector] Failed to load baseline', error);
      return { ...EMPTY_BASELINE };
    }
  }

  public save(reading: MagnetometerReading): Baseline {
    const baseline: Baseline = {
      x: reading.x,
      y: reading.y,
      z: reading.z,
      magnitude: reading.magnitude,
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(baseline));
    } catch (error) {
      console.error('[EmfDetector] Failed to save baseline', error);
    }

    return baseline;
  }

  public reset(): Baseline {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('[EmfDetector] Failed to reset baseline', error);
    }
    return { ...EMPTY_BASELINE };
  }
}
