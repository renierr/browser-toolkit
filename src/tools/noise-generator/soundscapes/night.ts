import { NoiseEngine } from '../noise-engine';
import { playPassingCar } from './helpers';

export const playNight = async (engine: NoiseEngine, checkActive: () => boolean): Promise<void> => {
  if (!engine.ctx || !engine.masterGain) return;

  const layer = await engine.createNoiseLayer({
    type: 'pink',
    filter: { type: 'lowpass', freq: 400 },
    gain: 0.1,
  });

  if (layer) {
    engine.addMicroLFO(layer.gain.gain, 0.05, 0.08);
  }

  const playCricket = () => {
    if (!engine.ctx || !engine.masterGain || !checkActive()) return;

    const t = engine.ctx.currentTime;
    const osc = engine.ctx.createOscillator();
    osc.type = 'square';
    const freq = 3500 + Math.random() * 500;
    osc.frequency.setValueAtTime(freq, t);

    const filter = engine.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(freq, t);
    filter.Q.value = 10;

    const amp = engine.ctx.createGain();
    const lfo = engine.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 15 + Math.random() * 10;
    const lfoGain = engine.ctx.createGain();
    lfoGain.gain.value = 0.5;

    const pan = engine.ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;

    const masterG = engine.ctx.createGain();
    const duration = 0.5 + Math.random() * 0.5;

    amp.gain.value = 0.5;
    lfo.connect(lfoGain);
    lfoGain.connect(amp.gain);

    osc.connect(filter);
    filter.connect(amp);
    amp.connect(pan);
    pan.connect(masterG);
    masterG.connect(engine.masterGain!);

    masterG.gain.setValueAtTime(0, t);
    masterG.gain.linearRampToValueAtTime(0.04 + Math.random() * 0.02, t + 0.1);
    masterG.gain.setValueAtTime(0.04 + Math.random() * 0.02, t + duration - 0.1);
    masterG.gain.linearRampToValueAtTime(0, t + duration);

    osc.start(t);
    lfo.start(t);
    osc.stop(t + duration);
    lfo.stop(t + duration);

    setTimeout(
      () => {
        osc.disconnect();
        filter.disconnect();
        amp.disconnect();
        lfo.disconnect();
        lfoGain.disconnect();
        pan.disconnect();
        masterG.disconnect();
      },
      (duration + 0.1) * 1000
    );
  };

  const scheduleNextCricket = () => {
    if (!checkActive()) return;
    const delay = 500 + Math.random() * 2000;
    const id = window.setTimeout(() => {
      playCricket();
      scheduleNextCricket();
    }, delay);
    engine.activeIntervals.push(id);
  };
  scheduleNextCricket();

  const playOwl = () => {
    if (!engine.ctx || !engine.masterGain || !checkActive()) return;

    const t = engine.ctx.currentTime;
    const freq = 360 + Math.random() * 30;

    const owlSource = engine.ctx.createOscillator();
    owlSource.type = 'sine';

    owlSource.frequency.setValueAtTime(freq, t);
    owlSource.frequency.exponentialRampToValueAtTime(freq * 0.85, t + 0.8);

    const owlGain = engine.ctx.createGain();
    owlGain.gain.setValueAtTime(0, t);

    const peakVol = 0.05 + Math.random() * 0.03;
    owlGain.gain.linearRampToValueAtTime(peakVol, t + 0.3);
    owlGain.gain.setValueAtTime(peakVol, t + 0.5);
    owlGain.gain.linearRampToValueAtTime(0, t + 0.8);

    const panner = engine.ctx.createStereoPanner();
    panner.pan.value = (Math.random() > 0.5 ? 1 : -1) * (0.5 + Math.random() * 0.3);

    owlSource.connect(owlGain);
    owlGain.connect(panner);
    panner.connect(engine.masterGain!);

    owlSource.start(t);
    owlSource.stop(t + 0.9);

    engine.activeNodes.push(owlSource, owlGain, panner);

    if (Math.random() > 0.5) {
      setTimeout(() => {
        if (checkActive()) playOwl();
      }, 1000);
    } else {
      const id = window.setTimeout(
        () => {
          if (checkActive()) playOwl();
        },
        (15 + Math.random() * 25) * 1000
      );
      engine.activeIntervals.push(id);
    }
  };

  engine.activeIntervals.push(
    window.setTimeout(
      () => {
        if (checkActive()) playOwl();
      },
      (2 + Math.random() * 3) * 1000
    )
  );

  const scheduleCar = () => {
    if (!checkActive()) return;

    const delay = (30 + Math.random() * 30) * 1000;
    const id = window.setTimeout(() => {
      playPassingCar(engine, 0.4);
      scheduleCar();
    }, delay);
    engine.activeIntervals.push(id);
  };

  engine.activeIntervals.push(
    window.setTimeout(
      () => {
        if (checkActive()) scheduleCar();
      },
      (10 + Math.random() * 15) * 1000
    )
  );
};
