import { NoiseEngine } from '../noise-engine';

export const playTrain = async (engine: NoiseEngine, checkActive: () => boolean): Promise<void> => {
  if (!engine.ctx || !engine.masterGain) return;

  const layer = await engine.createNoiseLayer({
    type: 'brown',
    filter: { type: 'lowpass', freq: 150 },
    gain: 0.3,
  });

  if (layer && layer.filter) {
    engine.addMicroLFO(layer.filter.frequency, 0.3, 100);
  }

  const wind = await engine.createNoiseLayer({
    type: 'pink',
    filter: { type: 'bandpass', freq: 800, Q: 0.4 },
    gain: 0.05,
  });

  if (wind && wind.filter) {
    engine.addMicroLFO(wind.gain.gain, 0.1, 0.04);
    engine.addMicroLFO(wind.filter.frequency, 0.07, 400);
  }

  const playPulse = (delay: number, volume: number, freq: number) => {
    if (!engine.ctx || !engine.masterGain || !checkActive()) return;

    const t = engine.ctx.currentTime + delay;
    const buffer = engine.createNoiseBuffer('pink');
    if (!buffer) return;

    const source = engine.ctx.createBufferSource();
    source.buffer = buffer;

    const filter = engine.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = 0.8;

    const panner = engine.ctx.createStereoPanner();
    panner.pan.value = Math.random() * 0.4 - 0.2;

    const gain = engine.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

    source.connect(filter);
    filter.connect(panner);
    panner.connect(gain);
    gain.connect(engine.masterGain!);
    source.start(t, Math.random() * 9);
    source.stop(t + 0.3);

    setTimeout(
      () => {
        source.disconnect();
        filter.disconnect();
        panner.disconnect();
        gain.disconnect();
      },
      (delay + 0.4) * 1000
    );
  };

  const scheduleClack = () => {
    if (!checkActive()) return;
    const baseTempo = 1.6;
    const jitter = (Math.random() - 0.5) * 0.2 * baseTempo;
    const tempo = baseTempo + jitter;
    const id = window.setTimeout(() => {
      if (!checkActive()) return;
      playPulse(0, 0.12, 1000);
      playPulse(0.18 + Math.random() * 0.04, 0.08, 1200);
      playPulse(0.45 + Math.random() * 0.05, 0.1, 900);
      playPulse(0.63 + Math.random() * 0.04, 0.07, 1100);
      scheduleClack();
    }, tempo * 1000);
    engine.activeIntervals.push(id);
  };
  scheduleClack();

  const playHorn = () => {
    if (!engine.ctx || !engine.masterGain || !checkActive()) return;
    const t = engine.ctx.currentTime;

    const o1 = engine.ctx.createOscillator();
    const o2 = engine.ctx.createOscillator();
    o1.type = 'sawtooth';
    o2.type = 'sawtooth';
    const base = 220 + Math.random() * 30;
    o1.frequency.value = base;
    o2.frequency.value = base * 1.5;

    const vibrato = engine.ctx.createOscillator();
    vibrato.type = 'sine';
    vibrato.frequency.value = 5;
    const vibratoGain = engine.ctx.createGain();
    vibratoGain.gain.value = 4;
    vibrato.connect(vibratoGain);
    vibratoGain.connect(o1.frequency);
    vibratoGain.connect(o2.frequency);

    const lp = engine.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1200;

    const panner = engine.ctx.createStereoPanner();
    panner.pan.value = (Math.random() - 0.5) * 1.4;

    const g = engine.ctx.createGain();
    const dur = 1.2 + Math.random() * 0.8;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.04, t + 0.15);
    g.gain.setValueAtTime(0.04, t + dur - 0.3);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);

    o1.connect(lp);
    o2.connect(lp);
    lp.connect(panner);
    panner.connect(g);
    g.connect(engine.masterGain);
    engine.connectToReverb(g, 0.3);

    o1.start(t);
    o2.start(t);
    vibrato.start(t);
    o1.stop(t + dur);
    o2.stop(t + dur);
    vibrato.stop(t + dur);
    engine.activeNodes.push(o1, o2, vibrato, vibratoGain, lp, panner, g);
  };

  const scheduleHorn = () => {
    if (!checkActive()) return;
    const id = window.setTimeout(
      () => {
        playHorn();
        scheduleHorn();
      },
      (25 + Math.random() * 45) * 1000
    );
    engine.activeIntervals.push(id);
  };
  scheduleHorn();
};
