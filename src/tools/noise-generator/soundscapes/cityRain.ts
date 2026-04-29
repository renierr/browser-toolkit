import { NoiseEngine } from '../noise-engine';
import { playRain } from './rain';

export const playCityRain = async (
  engine: NoiseEngine,
  checkActive: () => boolean
): Promise<void> => {
  if (!engine.ctx || !engine.masterGain) return;

  await playRain(engine, true, checkActive);

  // Distant traffic whoosh
  const playWhoosh = () => {
    if (!engine.ctx || !checkActive()) return;
    const t = engine.ctx.currentTime;
    const brown = engine.createNoiseBuffer('brown');
    if (!brown) return;

    const src = engine.ctx.createBufferSource();
    src.buffer = brown;
    const lp = engine.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 200;
    const pan = engine.ctx.createStereoPanner();
    const g = engine.ctx.createGain();
    const dur = 4 + Math.random() * 6;

    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.1, t + dur / 2);
    g.gain.linearRampToValueAtTime(0, t + dur);

    const startPan = Math.random() > 0.5 ? -1 : 1;
    pan.pan.setValueAtTime(startPan, t);
    pan.pan.linearRampToValueAtTime(-startPan, t + dur);

    src.connect(lp);
    lp.connect(pan);
    pan.connect(g);
    g.connect(engine.masterGain!);
    src.start(t, Math.random() * 5);
    src.stop(t + dur);

    setTimeout(
      () => {
        src.disconnect();
        lp.disconnect();
        pan.disconnect();
        g.disconnect();
      },
      (dur + 0.5) * 1000
    );
  };

  const scheduleWhoosh = () => {
    if (!checkActive()) return;
    const id = window.setTimeout(
      () => {
        playWhoosh();
        scheduleWhoosh();
      },
      5000 + Math.random() * 10000
    );
    engine.activeIntervals.push(id);
  };
  scheduleWhoosh();
};
