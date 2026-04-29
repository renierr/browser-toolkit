import { NoiseEngine } from '../noise-engine';

export const playWaterfall = async (engine: NoiseEngine): Promise<void> => {
  if (!engine.ctx || !engine.masterGain) return;

  const subBass = await engine.createNoiseLayer({
    type: 'brown',
    filter: { type: 'lowpass', freq: 80 },
    gain: 0.5,
  });
  if (subBass) {
    engine.addMicroLFO(subBass.gain.gain, 0.05, 0.1);
  }

  const brown = await engine.createNoiseLayer({
    type: 'brown',
    filter: { type: 'lowpass', freq: 400 },
    gain: 0.35,
  });

  if (brown) {
    engine.addMicroLFO(brown.gain.gain, 0.1, 0.1);
  }

  const pink = await engine.createNoiseLayer({
    type: 'pink',
    filter: { type: 'bandpass', freq: 1200, Q: 0.8 },
    gain: 0.12,
  });

  if (pink && pink.filter) {
    engine.addMicroLFO(pink.filter.frequency, 0.15, 200);
  }

  for (const pan of [-0.5, 0.5]) {
    const spray = await engine.createNoiseLayer({
      type: 'white',
      filter: { type: 'highpass', freq: 5000 },
      pan: pan,
      gain: 0.04,
    });
    if (spray) {
      engine.addMicroLFO(spray.gain.gain, 0.2 + Math.random() * 0.1, 0.3);
    }
  }
};
