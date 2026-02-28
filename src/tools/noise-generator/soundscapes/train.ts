import { NoiseEngine } from '../noise-engine';

export const playTrain = (engine: NoiseEngine, checkActive: () => boolean) => {
  if (!engine.ctx || !engine.masterGain) return;

  const layer = engine.createNoiseLayer({
    type: 'brown',
    filter: { type: 'lowpass', freq: 150 },
    gain: 0.3
  });

  if (layer && layer.filter) {
    engine.addMicroLFO(layer.filter.frequency, 0.3, 100);
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

    const tempo = 1.6;
    const id = window.setInterval(() => {
      if (!checkActive()) {
        clearInterval(id);
        return;
      }
      playPulse(0, 0.12, 1000);
      playPulse(0.18, 0.08, 1200);
      playPulse(0.45, 0.1, 900);
      playPulse(0.63, 0.07, 1100);
    }, tempo * 1000);

    engine.activeIntervals.push(id);
  };

  scheduleClack();
};
