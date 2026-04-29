import { NoiseEngine } from '../noise-engine';

export const playSpace = async (engine: NoiseEngine): Promise<void> => {
  if (!engine.ctx || !engine.masterGain) return;
  await engine.createNoiseLayer({
    type: 'brown',
    filter: { type: 'lowpass', freq: 100 },
    gain: 0.5,
  });
  await engine.createNoiseLayer({
    type: 'pink',
    filter: { type: 'bandpass', freq: 500, Q: 10 },
    gain: 0.05,
  });
};
