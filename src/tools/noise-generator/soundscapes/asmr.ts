import { NoiseEngine } from '../noise-engine';

export const playASMR = (engine: NoiseEngine, checkActive: () => boolean) => {
  if (!engine.ctx || !engine.masterGain) return;

  engine.createNoiseLayer({
    type: 'pink',
    filter: { type: 'lowpass', freq: 400 },
    gain: 0.05
  });

  const sweep = engine.createNoiseLayer({
    type: 'pink',
    filter: { type: 'bandpass', freq: 3000, Q: 0.5 },
    pan: 0,
    gain: 0.15
  });

  if (sweep && sweep.panner && sweep.gain) {
    engine.addMicroLFO(sweep.panner.pan, 0.05, 0.8);
    engine.addMicroLFO(sweep.gain.gain, 0.1, 0.05);
  }

  const playScratch = () => {
    if (!engine.ctx || !checkActive()) return;
    const t = engine.ctx.currentTime;
    const src = engine.ctx.createBufferSource();
    src.buffer = engine.createNoiseBuffer('white')!;

    const hp = engine.ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 5000 + Math.random() * 2000;
    hp.Q.value = 0.5;

    const panner = engine.ctx.createStereoPanner();
    panner.pan.value = (Math.random() > 0.5 ? 1 : -1) * (0.6 + Math.random() * 0.4);

    const g = engine.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    const duration = 0.2 + Math.random() * 0.3;
    g.gain.linearRampToValueAtTime(0.08 + Math.random() * 0.04, t + duration * 0.2);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);

    src.connect(hp);
    hp.connect(panner);
    panner.connect(g);
    g.connect(engine.masterGain!);

    src.start(t, Math.random() * 9);
    src.stop(t + duration);

    setTimeout(() => {
      src.disconnect();
      hp.disconnect();
      panner.disconnect();
      g.disconnect();
    }, (duration + 0.1) * 1000);
  };

  const playTap = () => {
    if (!engine.ctx || !checkActive()) return;
    const t = engine.ctx.currentTime;
    const src = engine.ctx.createBufferSource();
    src.buffer = engine.createNoiseBuffer('pink')!;

    const bp = engine.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 600 + Math.random() * 400;
    bp.Q.value = 2.0;

    const panner = engine.ctx.createStereoPanner();
    panner.pan.value = (Math.random() > 0.5 ? 1 : -1) * (0.4 + Math.random() * 0.6);

    const g = engine.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.2, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    src.connect(bp);
    bp.connect(panner);
    panner.connect(g);
    g.connect(engine.masterGain!);

    src.start(t, Math.random() * 9);
    src.stop(t + 0.1);

    setTimeout(() => {
      src.disconnect();
      bp.disconnect();
      panner.disconnect();
      g.disconnect();
    }, 150);
  };

  const scheduleTriggers = () => {
    if (!checkActive()) return;

    const rand = Math.random();
    if (rand < 0.3) {
      playScratch();
    } else if (rand < 0.6) {
      playTap();
    } else {
      let delay = 0;
      const count = 3 + Math.floor(Math.random() * 4);
      for (let i = 0; i < count; i++) {
        setTimeout(() => { if (checkActive()) playTap(); }, delay);
        delay += 100 + Math.random() * 150;
      }
    }

    const id = window.setTimeout(
      scheduleTriggers,
      1500 + Math.random() * 3000
    );
    engine.activeIntervals.push(id);
  };

  scheduleTriggers();
};
