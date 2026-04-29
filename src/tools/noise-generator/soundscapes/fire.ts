import { NoiseEngine } from '../noise-engine';

export const playFire = async (engine: NoiseEngine, checkActive: () => boolean): Promise<void> => {
  if (!engine.ctx || !engine.masterGain) return;

  const layer = await engine.createNoiseLayer({
    type: 'brown',
    filter: { type: 'lowpass', freq: 400 },
    gain: 0.5,
  });

  if (layer) {
    engine.addMicroLFO(layer.gain.gain, 0.2, 0.15);
  }

  const playCrackle = () => {
    if (!engine.ctx || !engine.masterGain || !checkActive()) return;

    const t = engine.ctx.currentTime;
    const source = engine.ctx.createBufferSource();
    source.buffer = engine.createNoiseBuffer('white')!;

    const filter = engine.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1000 + Math.random() * 3000;
    filter.Q.value = 0.5 + Math.random();

    const panner = engine.ctx.createStereoPanner();
    panner.pan.value = Math.random() * 0.6 - 0.3;

    const gain = engine.ctx.createGain();
    const duration = 0.005 + Math.random() * 0.03;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.4 + Math.random() * 0.6, t + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    source.connect(filter);
    filter.connect(panner);
    panner.connect(gain);
    gain.connect(engine.masterGain!);

    source.start(t, Math.random() * 9);
    source.stop(t + duration + 0.05);

    setTimeout(
      () => {
        source.disconnect();
        filter.disconnect();
        panner.disconnect();
        gain.disconnect();
      },
      (duration + 0.1) * 1000
    );
  };

  await engine.createNoiseLayer({
    type: 'pink',
    filter: { type: 'bandpass', freq: 1500, Q: 0.5 },
    gain: 0.05,
  });

  const scheduleCrackle = () => {
    if (!checkActive()) return;
    const delay = Math.random() * 200;
    const id = window.setTimeout(() => {
      if (Math.random() > 0.3) playCrackle();
      scheduleCrackle();
    }, delay);
    engine.activeIntervals.push(id);
  };
  scheduleCrackle();
};
