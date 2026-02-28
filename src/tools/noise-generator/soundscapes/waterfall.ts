import { NoiseEngine } from '../noise-engine';

export const playWaterfall = (engine: NoiseEngine) => {
  if (!engine.ctx || !engine.masterGain) return;

  const brown = engine.createNoiseLayer({
    type: 'brown',
    filter: { type: 'lowpass', freq: 400 },
    gain: 0.4
  });

  if (brown) {
    engine.addMicroLFO(brown.gain.gain, 0.1, 0.1);
  }

  const pink = engine.createNoiseLayer({
    type: 'pink',
    filter: { type: 'bandpass', freq: 1200, Q: 0.8 },
    gain: 0.15
  });

  if (pink && pink.filter) {
    engine.addMicroLFO(pink.filter.frequency, 0.15, 200);
  }
};
