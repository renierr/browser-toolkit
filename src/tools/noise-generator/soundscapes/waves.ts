import { NoiseEngine } from '../noise-engine';

export const playWaves = async (engine: NoiseEngine, checkActive: () => boolean): Promise<void> => {
  if (!engine.ctx || !engine.masterGain) return;

  for (const pan of [-0.5, 0.5]) {
    const layer = await engine.createNoiseLayer({
      type: 'brown',
      filter: { type: 'lowpass', freq: 400 },
      pan: pan,
      gain: 0.15,
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

  const playCrash = () => {
    if (!engine.ctx || !engine.masterGain || !checkActive()) return;

    const t = engine.ctx.currentTime;
    const buffer = engine.createNoiseBuffer('white');
    if (!buffer) return;

    const src = engine.ctx.createBufferSource();
    src.buffer = buffer;

    const hp = engine.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 600;

    const lp = engine.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(4000, t);
    lp.frequency.exponentialRampToValueAtTime(800, t + 3.5);

    const panner = engine.ctx.createStereoPanner();
    panner.pan.value = (Math.random() - 0.5) * 1.4;

    const g = engine.ctx.createGain();
    const peak = 0.18 + Math.random() * 0.12;
    const dur = 3.0 + Math.random() * 2.0;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);

    src.connect(hp);
    hp.connect(lp);
    lp.connect(panner);
    panner.connect(g);
    g.connect(engine.masterGain);
    engine.connectToReverb(g, 0.25);

    src.start(t, Math.random() * 9);
    src.stop(t + dur + 0.1);

    setTimeout(
      () => {
        src.disconnect();
        hp.disconnect();
        lp.disconnect();
        panner.disconnect();
        g.disconnect();
      },
      (dur + 0.3) * 1000
    );
  };

  const scheduleCrash = () => {
    if (!checkActive()) return;
    const delay = 5000 + Math.random() * 8000;
    const id = window.setTimeout(() => {
      playCrash();
      scheduleCrash();
    }, delay);
    engine.activeIntervals.push(id);
  };

  scheduleCrash();
};
