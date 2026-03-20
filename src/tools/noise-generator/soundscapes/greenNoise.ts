import { NoiseEngine } from '../noise-engine';

export const playGreenNoise = (engine: NoiseEngine) => {
  if (!engine.ctx || !engine.masterGain) return;

  engine.createNoiseLayer({
    type: 'pink',
    filter: { type: 'bandpass', freq: 1000, Q: 1.0 },
    gain: 0.6,
  });
};
