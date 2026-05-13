export type LevelMode = '2d' | '1d';

export type OrientationReading = {
  pitch: number;
  roll: number;
};

export type CalibrationOffset = {
  pitch: number;
  roll: number;
};

export type SensorStatus = 'initializing' | 'ready' | 'permission-needed' | 'unsupported' | 'error';
