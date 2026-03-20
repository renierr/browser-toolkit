import { NoiseEngine } from '../noise-engine';

export const playAirplane = (engine: NoiseEngine, checkActive: () => boolean) => {
  if (!engine.ctx || !engine.masterGain) return;

  engine.createNoiseLayer({
    type: 'brown',
    filter: { type: 'lowpass', freq: 160 },
    pan: 0,
    gain: 0.6,
  });

  engine.createNoiseLayer({
    type: 'pink',
    filter: { type: 'bandpass', freq: 1200, Q: 0.3 },
    pan: 0,
    gain: 0.08,
  });

  engine.createOscillatorLayer({
    type: 'sine',
    freq: 240,
    gain: 0.02,
  });

  const playAmbiance = () => {
    if (!checkActive() || !engine.ctx || !engine.masterGain) return;

    if (Math.random() > 0.6) {
      // Seatbelt tone
      const osc1 = engine.ctx.createOscillator();
      const osc2 = engine.ctx.createOscillator();
      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.value = 523.25;
      osc2.frequency.value = 659.25;

      const g = engine.ctx.createGain();
      const t = engine.ctx.currentTime;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.02, t + 0.1);
      g.gain.setValueAtTime(0.02, t + 0.4);
      g.gain.linearRampToValueAtTime(0, t + 0.8);

      osc1.connect(g);
      osc2.connect(g);
      g.connect(engine.masterGain);

      osc1.start(t);
      osc2.start(t);
      osc1.stop(t + 0.9);
      osc2.stop(t + 0.9);

      engine.activeNodes.push(osc1, osc2, g);
    } else {
      // Slight turbulence rumble
      const brownBuf = engine.createNoiseBuffer('brown');
      if (brownBuf) {
        const src = engine.ctx.createBufferSource();
        src.buffer = brownBuf;
        const lp = engine.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 90;
        const g = engine.ctx.createGain();
        const t = engine.ctx.currentTime;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.3, t + 1);
        g.gain.linearRampToValueAtTime(0, t + 3);

        src.connect(lp);
        lp.connect(g);
        g.connect(engine.masterGain);

        src.start(t);
        src.stop(t + 3.1);

        engine.activeNodes.push(src, lp, g);
      }
    }

    engine.activeIntervals.push(window.setTimeout(playAmbiance, (15 + Math.random() * 45) * 1000));
  };

  engine.activeIntervals.push(window.setTimeout(playAmbiance, (5 + Math.random() * 15) * 1000));
};
