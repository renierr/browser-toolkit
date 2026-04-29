import { NoiseEngine } from '../noise-engine';

export const playUnderwater = async (
  engine: NoiseEngine,
  checkActive: () => boolean
): Promise<void> => {
  if (!engine.ctx || !engine.masterGain) return;

  await engine.createNoiseLayer({
    type: 'brown',
    filter: { type: 'lowpass', freq: 150 },
    gain: 0.6,
  });

  const playBubble = () => {
    if (!engine.ctx || !engine.masterGain || !checkActive()) return;

    const t = engine.ctx.currentTime;
    const buffer = engine.createNoiseBuffer('white');
    if (!buffer) return;

    const source = engine.ctx.createBufferSource();
    source.buffer = buffer;

    const filter = engine.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    const startFreq = 400 + Math.random() * 400;
    filter.frequency.setValueAtTime(startFreq, t);
    filter.frequency.exponentialRampToValueAtTime(startFreq * 1.5, t + 0.1);
    filter.Q.value = 15;

    const panner = engine.ctx.createStereoPanner();
    panner.pan.value = Math.random() * 1.6 - 0.8;

    const gain = engine.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.05 + Math.random() * 0.05, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

    source.connect(filter);
    filter.connect(panner);
    panner.connect(gain);
    gain.connect(engine.masterGain!);

    source.start(t, Math.random() * 9);
    source.stop(t + 0.2);

    setTimeout(() => {
      source.disconnect();
      filter.disconnect();
      panner.disconnect();
      gain.disconnect();
    }, 300);
  };

  const scheduleBubble = () => {
    if (!checkActive()) return;
    const id = window.setTimeout(
      () => {
        playBubble();
        scheduleBubble();
      },
      200 + Math.random() * 1500
    );
    engine.activeIntervals.push(id);
  };
  scheduleBubble();

  const playWhale = () => {
    if (!engine.ctx || !engine.masterGain || !checkActive()) return;
    const t = engine.ctx.currentTime;

    const osc = engine.ctx.createOscillator();
    osc.type = 'sine';
    const base = 60 + Math.random() * 50;
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.exponentialRampToValueAtTime(base * 1.4, t + 1.2);
    osc.frequency.exponentialRampToValueAtTime(base * 0.7, t + 3.5);
    osc.frequency.exponentialRampToValueAtTime(base * 0.5, t + 5.5);

    const vibrato = engine.ctx.createOscillator();
    vibrato.type = 'sine';
    vibrato.frequency.value = 4;
    const vibratoGain = engine.ctx.createGain();
    vibratoGain.gain.value = 2;
    vibrato.connect(vibratoGain);
    vibratoGain.connect(osc.frequency);

    const lp = engine.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 250;

    const panner = engine.ctx.createStereoPanner();
    panner.pan.value = (Math.random() - 0.5) * 1.6;

    const g = engine.ctx.createGain();
    const dur = 5 + Math.random() * 2;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.12, t + 1.0);
    g.gain.setValueAtTime(0.12, t + dur - 1.5);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);

    osc.connect(lp);
    lp.connect(panner);
    panner.connect(g);
    g.connect(engine.masterGain);
    engine.connectToReverb(g, 0.5);

    osc.start(t);
    vibrato.start(t);
    osc.stop(t + dur);
    vibrato.stop(t + dur);

    engine.activeNodes.push(osc, vibrato, vibratoGain, lp, panner, g);
  };

  const scheduleWhale = () => {
    if (!checkActive()) return;
    const id = window.setTimeout(
      () => {
        playWhale();
        scheduleWhale();
      },
      (20 + Math.random() * 40) * 1000
    );
    engine.activeIntervals.push(id);
  };
  scheduleWhale();
};
