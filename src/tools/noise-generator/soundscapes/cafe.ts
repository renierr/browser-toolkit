import { NoiseEngine } from '../noise-engine';

export const playCafe = (engine: NoiseEngine, checkActive: () => boolean) => {
  if (!engine.ctx || !engine.masterGain) return;

  const pink = engine.createNoiseBuffer('pink');
  if (pink) {
    for (let i = 0; i < 4; i++) {
      const src = engine.ctx.createBufferSource();
      src.buffer = pink;
      src.loop = true;
      src.playbackRate.value = 0.96 + Math.random() * 0.08;

      const lp = engine.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1800 + Math.random() * 1400;

      const bp = engine.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 300 + Math.random() * 900;
      bp.Q.value = 1.2 + Math.random() * 1.5;

      const pan = engine.ctx.createStereoPanner();
      pan.pan.value = Math.random() * 1.4 - 0.7;

      const g = engine.ctx.createGain();
      g.gain.value = 0.035 + Math.random() * 0.015;

      src.connect(lp);
      lp.connect(bp);
      bp.connect(pan);
      pan.connect(g);
      g.connect(engine.masterGain);
      src.start(0, Math.random() * 10);

      engine.addMicroLFO(g.gain, 0.15 + Math.random() * 0.4, 0.06);
      engine.activeNodes.push(src, lp, bp, pan, g);
    }
  }

  const brown = engine.createNoiseBuffer('brown');
  if (brown) {
    const src = engine.ctx.createBufferSource();
    src.buffer = brown;
    src.loop = true;
    const lp = engine.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 350;
    const g = engine.ctx.createGain();
    g.gain.value = 0.18;
    src.connect(lp);
    lp.connect(g);
    g.connect(engine.masterGain);
    src.start();
    engine.addMicroLFO(lp.frequency, 0.08, 80);
    engine.addMicroLFO(g.gain, 0.3, 0.1);
    engine.activeNodes.push(src, lp, g);
  }

  const playClink = () => {
    if (!engine.ctx || !engine.masterGain || !checkActive()) return;

    const t = engine.ctx.currentTime;
    const panner = engine.ctx.createStereoPanner();
    panner.pan.value = Math.random() * 1.6 - 0.8;

    const mainGain = engine.ctx.createGain();
    const duration = 0.06 + Math.random() * 0.15;
    mainGain.gain.setValueAtTime(0, t);
    mainGain.gain.linearRampToValueAtTime(0.02 + Math.random() * 0.015, t + 0.005);
    mainGain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    panner.connect(mainGain);
    mainGain.connect(engine.masterGain!);

    const baseFreq = 2000 + Math.random() * 4000;
    const partials = [1, 2.3 + Math.random() * 0.2, 3.8 + Math.random() * 0.4];
    const nodesToDisconnect: AudioNode[] = [panner, mainGain];

    partials.forEach(ratio => {
      const osc = engine.ctx!.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq * ratio, t);
      osc.connect(panner);
      osc.start(t);
      osc.stop(t + duration + 0.1);
      nodesToDisconnect.push(osc);
    });

    setTimeout(
      () => {
        nodesToDisconnect.forEach(n => n.disconnect());
      },
      (duration + 0.2) * 1000
    );
  };

  const playThud = () => {
    if (!engine.ctx || !engine.masterGain || !checkActive()) return;
    const t = engine.ctx.currentTime;
    const brownBuffer = engine.createNoiseBuffer('brown');
    if (!brownBuffer) return;

    const source = engine.ctx.createBufferSource();
    source.buffer = brownBuffer;
    const filter = engine.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 180 + Math.random() * 220;

    const panner = engine.ctx.createStereoPanner();
    panner.pan.value = Math.random() * 1.2 - 0.6;

    const gain = engine.ctx.createGain();
    const duration = 0.4 + Math.random() * 0.9;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.03 + Math.random() * 0.04, t + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    source.connect(filter);
    filter.connect(panner);
    panner.connect(gain);
    gain.connect(engine.masterGain!);

    source.start(t, Math.random() * 9);
    source.stop(t + duration + 0.2);

    setTimeout(
      () => {
        source.disconnect();
        filter.disconnect();
        panner.disconnect();
        gain.disconnect();
      },
      (duration + 0.4) * 1000
    );
  };

  const scheduleCafeEvents = () => {
    if (!checkActive()) return;
    const delay = 1200 + Math.random() * 9000;
    const id = window.setTimeout(() => {
      const roll = Math.random();
      if (roll < 0.45) playClink();
      else if (roll < 0.7) playThud();
      scheduleCafeEvents();
    }, delay);
    engine.activeIntervals.push(id);
  };
  scheduleCafeEvents();
};
