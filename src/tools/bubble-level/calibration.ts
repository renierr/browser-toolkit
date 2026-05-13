import type { CalibrationOffset } from './types';

const STORAGE_KEY = 'bubble-level-calibration-v1';

export class CalibrationStore {
  public load(): CalibrationOffset {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return { pitch: 0, roll: 0 };
      }
      const parsed = JSON.parse(raw) as Partial<CalibrationOffset>;
      return {
        pitch: Number.isFinite(parsed.pitch) ? Number(parsed.pitch) : 0,
        roll: Number.isFinite(parsed.roll) ? Number(parsed.roll) : 0,
      };
    } catch (error) {
      console.error('[BubbleLevel] Failed to load calibration', error);
      return { pitch: 0, roll: 0 };
    }
  }

  public save(offset: CalibrationOffset): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(offset));
    } catch (error) {
      console.error('[BubbleLevel] Failed to save calibration', error);
    }
  }

  public reset(): CalibrationOffset {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('[BubbleLevel] Failed to reset calibration', error);
    }
    return { pitch: 0, roll: 0 };
  }
}
