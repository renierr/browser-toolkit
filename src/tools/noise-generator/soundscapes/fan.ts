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

  const harmonics = [
    { freq: 60, pan: -0.15, gain: 0.05 },
    { freq: 60.6, pan: 0.15, gain: 0.05 },
    { freq: 120.4, pan: 0.1, gain: 0.025 },
    { freq: 180.7, pan: -0.1, gain: 0.017 },
  ];

  harmonics.forEach((h) => {
    const result = engine.createOscillatorLayer({
      type: 'sine',
      freq: h.freq,
      pan: h.pan,
      gain: h.gain,
    });
    if (result) {
      engine.addMicroLFO(result.gain.gain, 0.3 + Math.random() * 0.3, 0.3);
      engine.addMicroLFO(result.source.frequency, 0.15, 0.3);
    }
  });

  await engine.createNoiseLayer({
    type: 'pink',
    filter: { type: 'lowpass', freq: 1500 },
    gain: 0.15,
  });
};
