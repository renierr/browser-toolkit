import { NoiseEngine } from '../noise-engine';

export const playSpace = async (engine: NoiseEngine, checkActive: () => boolean): Promise<void> => {
  if (!engine.ctx || !engine.masterGain) return;

  const sub = await engine.createNoiseLayer({
    type: 'brown',
    filter: { type: 'lowpass', freq: 100 },
    gain: 0.5,
  });
  if (sub) {
    engine.addMicroLFO(sub.gain.gain, 0.04, 0.15);
  }

  const sweep = await engine.createNoiseLayer({
    type: 'pink',
    filter: { type: 'bandpass', freq: 500, Q: 10 },
    gain: 0.05,
  });
  if (sweep && sweep.filter) {
    engine.addMicroLFO(sweep.filter.frequency, 0.03, 600);
    engine.addMicroLFO(sweep.gain.gain, 0.05, 0.04);
  }

  const air = await engine.createNoiseLayer({
    type: 'pink',
    filter: { type: 'bandpass', freq: 2000, Q: 0.4 },
    pan: 0,
    gain: 0.025,
  });
  if (air && air.panner) {
    engine.addMicroLFO(air.panner.pan, 0.04, 0.9);
  }

  const playPing = () => {
    if (!engine.ctx || !engine.masterGain || !checkActive()) return;
    const t = engine.ctx.currentTime;

    const osc = engine.ctx.createOscillator();
    osc.type = 'sine';
    const base = 600 + Math.random() * 1200;
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.exponentialRampToValueAtTime(base * 0.6, t + 2.5);

    const panner = engine.ctx.createStereoPanner();
    panner.pan.value = (Math.random() - 0.5) * 1.8;

    const g = engine.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + 2.5);

    osc.connect(panner);
    panner.connect(g);
    g.connect(engine.masterGain);
    engine.connectToReverb(g, 0.6);

    osc.start(t);
    osc.stop(t + 2.6);
    engine.activeNodes.push(osc, panner, g);
  };

  const schedulePing = () => {
    if (!checkActive()) return;
    const id = window.setTimeout(
      () => {
        playPing();
        schedulePing();
      },
      (8 + Math.random() * 22) * 1000
    );
    engine.activeIntervals.push(id);
  };
  schedulePing();
};
