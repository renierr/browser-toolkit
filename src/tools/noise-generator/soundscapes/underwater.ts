import { NoiseEngine } from '../noise-engine';

export const playUnderwater = (engine: NoiseEngine, checkActive: () => boolean) => {
  if (!engine.ctx || !engine.masterGain) return;

  engine.createNoiseLayer({
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
};
