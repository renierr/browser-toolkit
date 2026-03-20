import { NoiseEngine } from '../noise-engine';

export const playWindChimes = (engine: NoiseEngine, checkActive: () => boolean) => {
  if (!engine.ctx || !engine.masterGain) return;

  const notes = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98];

  const playChime = () => {
    if (!engine.ctx || !engine.masterGain || !checkActive()) return;

    const t = engine.ctx.currentTime;
    const rootFreq = notes[Math.floor(Math.random() * notes.length)];

    const panner = engine.ctx.createStereoPanner();
    panner.pan.value = Math.random() * 1.8 - 0.9;
    const mainGain = engine.ctx.createGain();

    const duration = 3 + Math.random() * 4;
    mainGain.gain.setValueAtTime(0, t);
    mainGain.gain.linearRampToValueAtTime(0.04, t + 0.02);
    mainGain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    panner.connect(mainGain);
    mainGain.connect(engine.masterGain!);

    const partials = [
      { ratio: 1, gain: 1, decayMax: duration },
      { ratio: 2.76, gain: 0.6, decayMax: duration * 0.5 },
      { ratio: 5.4, gain: 0.4, decayMax: duration * 0.2 },
      { ratio: 8.93, gain: 0.25, decayMax: duration * 0.1 },
    ];

    const nodesToCleanup: AudioNode[] = [panner, mainGain];

    partials.forEach((p) => {
      const osc = engine.ctx!.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(rootFreq * p.ratio, t);

      const oscGain = engine.ctx!.createGain();
      oscGain.gain.setValueAtTime(p.gain, t);
      oscGain.gain.exponentialRampToValueAtTime(0.001, t + p.decayMax);

      osc.connect(oscGain);
      oscGain.connect(panner);

      osc.start(t);
      osc.stop(t + p.decayMax + 0.1);

      nodesToCleanup.push(osc, oscGain);
    });

    setTimeout(
      () => {
        nodesToCleanup.forEach((n) => n.disconnect());
      },
      (duration + 0.2) * 1000
    );
  };

  const scheduleChime = () => {
    if (!checkActive()) return;
    const delay = 1000 + Math.random() * 4000;
    const id = window.setTimeout(() => {
      playChime();
      scheduleChime();
    }, delay);
    engine.activeIntervals.push(id);
  };
  scheduleChime();
};
