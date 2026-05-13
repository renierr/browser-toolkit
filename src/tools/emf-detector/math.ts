import type { Baseline, MagnetometerReading } from './types';

export function lowPass(previous: number, next: number, alpha: number): number {
  return previous + (next - previous) * alpha;
}

export function magnitude(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalize(value: number, range: number): number {
  if (range <= 0) {
    return 0;
  }
  return clamp(value / range, -1, 1);
}

export function deltaFromBaseline(reading: MagnetometerReading, baseline: Baseline): number {
  return Math.sqrt(
    (reading.x - baseline.x) * (reading.x - baseline.x) +
      (reading.y - baseline.y) * (reading.y - baseline.y) +
      (reading.z - baseline.z) * (reading.z - baseline.z)
  );
}
