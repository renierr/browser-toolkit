import { NoiseEngine } from '../noise-engine';

export const playFan = async (engine: NoiseEngine): Promise<void> => {
  if (!engine.ctx || !engine.masterGain) return;

  const layer = await engine.createNoiseLayer({
    type: 'brown',
    filter: { type: 'lowpass', freq: 600 },
    pan: 0,
    gain: 0.5,
  });

  if (layer && layer.panner) {
    engine.addMicroLFO(layer.panner.pan, 0.2, 0.8);
  }

  const frequencies = [60, 120, 180];
  frequencies.forEach((freq) => {
    engine.createOscillatorLayer({
      type: 'sine',
      freq: freq,
      gain: 0.05 / (freq / 60),
    });
  });

  await engine.createNoiseLayer({
    type: 'pink',
    filter: { type: 'lowpass', freq: 1500 },
    gain: 0.15,
  });
};
