import { NoiseEngine } from '../noise-engine';

export const playForest = async (
  engine: NoiseEngine,
  checkActive: () => boolean
): Promise<void> => {
  if (!engine.ctx || !engine.masterGain) return;

  const layer = await engine.createNoiseLayer({
    type: 'pink',
    filter: { type: 'lowpass', freq: 400 },
    gain: 0.15,
  });

  if (layer) {
    engine.addMicroLFO(layer.gain.gain, 0.07, 0.1);
  }

  for (const pan of [-0.4, 0.4]) {
    const rustle = await engine.createNoiseLayer({
      type: 'pink',
      filter: { type: 'bandpass', freq: 2500, Q: 0.5 },
      pan: pan,
      gain: 0.04,
    });
    if (rustle && rustle.filter) {
      engine.addMicroLFO(rustle.gain.gain, 0.12 + Math.random() * 0.06, 0.6);
      engine.addMicroLFO(rustle.filter.frequency, 0.09, 800);
    }
  }

  const playChirp = () => {
    if (!engine.ctx || !engine.masterGain || !checkActive()) return;

    const t = engine.ctx.currentTime;
    const carrier = engine.ctx.createOscillator();
    const modulator = engine.ctx.createOscillator();
    const modGain = engine.ctx.createGain();
    const gain = engine.ctx.createGain();
    const panner = engine.ctx.createStereoPanner();

    const isHigh = Math.random() > 0.5;
    const startFreq = isHigh ? 2000 + Math.random() * 1500 : 1000 + Math.random() * 1000;
    const endFreq = startFreq + (Math.random() * 1000 - 500);
    const duration = 0.1 + Math.random() * 0.2;

    carrier.type = 'sine';
    carrier.frequency.setValueAtTime(startFreq, t);
    carrier.frequency.exponentialRampToValueAtTime(endFreq, t + duration);

    modulator.type = 'sine';
    modulator.frequency.value = 10 + Math.random() * 30;

    modGain.gain.setValueAtTime(0, t);
    modGain.gain.linearRampToValueAtTime(400, t + duration / 2);
    modGain.gain.linearRampToValueAtTime(0, t + duration);

    modulator.connect(modGain);
    modGain.connect(carrier.frequency);

    panner.pan.value = Math.random() * 1.6 - 0.8;

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.06 + Math.random() * 0.04, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.01, t + duration);

    carrier.connect(panner);
    panner.connect(gain);
    gain.connect(engine.masterGain!);

    carrier.start(t);
    modulator.start(t);
    carrier.stop(t + duration + 0.1);
    modulator.stop(t + duration + 0.1);

    setTimeout(
      () => {
        carrier.disconnect();
        modulator.disconnect();
        modGain.disconnect();
        panner.disconnect();
        gain.disconnect();
      },
      (duration + 0.2) * 1000
    );
  };

  const scheduleNextChirp = () => {
    if (!checkActive()) return;
    const delay = 1000 + Math.random() * 4000;
    const id = window.setTimeout(() => {
      playChirp();
      scheduleNextChirp();
    }, delay);
    engine.activeIntervals.push(id);
  };

  scheduleNextChirp();
};
