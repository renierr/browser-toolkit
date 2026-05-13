export type SensorStatus =
  | 'initializing'
  | 'ready'
  | 'permission-needed'
  | 'unsupported'
  | 'insecure-context'
  | 'error';

export type MagnetometerReading = {
  x: number;
  y: number;
  z: number;
  magnitude: number;
};

export type Baseline = {
  x: number;
  y: number;
  z: number;
  magnitude: number;
};

export type ViewRange = 'auto' | '100' | '500' | '2000';
