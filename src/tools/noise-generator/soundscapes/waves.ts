import { NoiseEngine } from '../noise-engine';

export const playWaves = async (engine: NoiseEngine): Promise<void> => {
  if (!engine.ctx || !engine.masterGain) return;

  for (const pan of [-0.5, 0.5]) {
    const layer = await engine.createNoiseLayer({
      type: 'brown',
      filter: { type: 'lowpass', freq: 400 },
      pan: pan,
      gain: 0.2,
    });

    if (layer) {
      const rate = 0.08 + Math.random() * 0.04;
      engine.addMicroLFO(layer.gain.gain, rate, 0.3);
      if (layer.filter) {
        engine.addMicroLFO(layer.filter.frequency, rate, 600);
      }
    }
  }

  const foam = await engine.createNoiseLayer({
    type: 'pink',
    filter: { type: 'bandpass', freq: 1200, Q: 0.5 },
    gain: 0.03,
  });

  if (foam) {
    engine.addMicroLFO(foam.gain.gain, 0.06, 0.05);
    if (foam.filter) {
      engine.addMicroLFO(foam.filter.frequency, 0.06, 500);
    }
  }
};
