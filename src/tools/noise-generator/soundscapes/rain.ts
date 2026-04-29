import { NoiseEngine } from '../noise-engine';

export const playRain = async (
  engine: NoiseEngine,
  isCity: boolean = false,
  checkActive: () => boolean
): Promise<void> => {
  if (!engine.ctx || !engine.masterGain) return;

  // Layer 1: Pink noise (Rain hiss)
  await engine.createNoiseLayer({
    type: 'pink',
    filter: { type: 'highpass', freq: isCity ? 1200 : 1600 },
    pan: -0.2,
    gain: 0.04,
  });

  // Layer 2: Brown noise (Rain rumble)
  await engine.createNoiseLayer({
    type: 'brown',
    filter: { type: 'lowpass', freq: isCity ? 150 : 200 },
    pan: 0.2,
    gain: 0.05,
  });

  // Layer 3: Discrete Droplets
  const playDroplet = () => {
    if (!engine.ctx || !engine.masterGain || !checkActive()) return;

    const t = engine.ctx.currentTime;
    const pinkBuffer = engine.createNoiseBuffer('pink');
    if (!pinkBuffer) return;

    const source = engine.ctx.createBufferSource();
    source.buffer = pinkBuffer;

    const filter = engine.ctx.createBiquadFilter();
    filter.type = 'bandpass';

    const baseFreq = isCity ? 1000 + Math.random() * 800 : 1500 + Math.random() * 1200;
    filter.frequency.setValueAtTime(baseFreq, t);
    filter.frequency.exponentialRampToValueAtTime(baseFreq * 0.8, t + 0.05);

    filter.Q.value = 8 + Math.random() * 10;

    const panner = engine.ctx.createStereoPanner();
    panner.pan.value = Math.random() * 1.6 - 0.8;

    const gain = engine.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.2 + Math.random() * 0.3, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);

    source.connect(filter);
    filter.connect(panner);
    panner.connect(gain);
    gain.connect(engine.masterGain!);

    source.start(t, Math.random() * 9);
    source.stop(t + 0.1);

    setTimeout(() => {
      source.disconnect();
      filter.disconnect();
      panner.disconnect();
      gain.disconnect();
    }, 200);
  };

  const scheduleNextDroplet = () => {
    if (!checkActive()) return;
    const delay = isCity ? 100 + Math.random() * 400 : 50 + Math.random() * 150;
    const id = window.setTimeout(() => {
      playDroplet();
      scheduleNextDroplet();
    }, delay);
    engine.activeIntervals.push(id);
  };

  scheduleNextDroplet();
};
