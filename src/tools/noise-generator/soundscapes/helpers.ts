import { NoiseEngine } from '../noise-engine';

export const playPassingCar = (engine: NoiseEngine, volumeOverride: number = 0.2) => {
  if (!engine.ctx || !engine.masterGain) return;

  const t = engine.ctx.currentTime;
  const duration = 4.0 + Math.random() * 2.5;

  const pinkBuffer = engine.createNoiseBuffer('pink');
  if (!pinkBuffer) return;

  const src = engine.ctx.createBufferSource();
  src.buffer = pinkBuffer;

  const filter = engine.ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(300, t);
  filter.frequency.exponentialRampToValueAtTime(1500, t + duration / 2);
  filter.frequency.exponentialRampToValueAtTime(200, t + duration);

  const bp = engine.ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1000;
  bp.Q.value = 0.8;

  const panner = engine.ctx.createStereoPanner();
  const startPan = Math.random() > 0.5 ? 1 : -1;
  panner.pan.setValueAtTime(startPan, t);
  panner.pan.linearRampToValueAtTime(-startPan, t + duration);

  const gain = engine.ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(volumeOverride, t + duration / 2);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

  src.connect(filter);
  filter.connect(bp);
  bp.connect(panner);
  panner.connect(gain);
  gain.connect(engine.masterGain);

  src.start(t);
  src.stop(t + duration);

  engine.activeNodes.push(src, filter, bp, panner, gain);
};
