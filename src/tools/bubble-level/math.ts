import type { OrientationReading } from './types';

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function lowPass(previous: number, next: number, alpha: number): number {
  return previous + (next - previous) * alpha;
}

export function normalizeByScreenAngle(
  beta: number,
  gamma: number,
  angle: number
): OrientationReading {
  switch (angle) {
    case 90:
      return { pitch: -gamma, roll: beta };
    case -90:
    case 270:
      return { pitch: gamma, roll: -beta };
    case 180:
      return { pitch: -beta, roll: -gamma };
    default:
      return { pitch: beta, roll: gamma };
  }
}

export function roundToOne(value: number): number {
  return Math.round(value * 10) / 10;
}

export function isLevel(pitch: number, roll: number, tolerance: number): boolean {
  return Math.abs(pitch) <= tolerance && Math.abs(roll) <= tolerance;
}
