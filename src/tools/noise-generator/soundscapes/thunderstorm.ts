import { NoiseEngine } from '../noise-engine';
import { playRain } from './rain';

export const playThunderstorm = async (
  engine: NoiseEngine,
  checkActive: () => boolean
): Promise<void> => {
  if (!engine.ctx || !engine.masterGain) return;

  await playRain(engine, false, checkActive);

  const playThunder = () => {
    if (!engine.ctx || !engine.masterGain || !checkActive()) return;

    const t = engine.ctx.currentTime;
    const brownBuffer = engine.createNoiseBuffer('brown');
    const whiteBuffer = engine.createNoiseBuffer('white');
    if (!brownBuffer || !whiteBuffer) return;

    const rumblePan = Math.random() * 1.6 - 0.8;
    const crackPan = Math.max(-1, Math.min(1, rumblePan + (Math.random() - 0.5) * 0.8));
    const duration = 20 + Math.random() * 25;

    // 0. Distant pre-rumble (sometimes)
    if (Math.random() < 0.5) {
      const preBuffer = engine.createNoiseBuffer('brown');
      if (preBuffer) {
        const preSrc = engine.ctx.createBufferSource();
        preSrc.buffer = preBuffer;
        const preLp = engine.ctx.createBiquadFilter();
        preLp.type = 'lowpass';
        preLp.frequency.value = 60;
        const prePanner = engine.ctx.createStereoPanner();
        prePanner.pan.value = -crackPan * 0.6;
        const preGain = engine.ctx.createGain();
        const preStart = t - 2.5;
        preGain.gain.setValueAtTime(0, preStart);
        preGain.gain.linearRampToValueAtTime(0.3, preStart + 1.5);
        preGain.gain.exponentialRampToValueAtTime(0.001, preStart + 3.0);

        preSrc.connect(preLp);
        preLp.connect(prePanner);
        prePanner.connect(preGain);
        preGain.connect(engine.masterGain!);
        engine.connectToReverb(preGain, 0.4);

        preSrc.start(Math.max(t - 2.5, engine.ctx.currentTime), Math.random() * 5);
        preSrc.stop(t + 0.5);
        engine.activeNodes.push(preSrc, preLp, prePanner, preGain);
      }
    }

    // 1. Initial Crack/Strike
    if (Math.random() > 0.4) {
      const pinkBuffer = engine.createNoiseBuffer('pink');
      if (pinkBuffer) {
        const crackSource = engine.ctx.createBufferSource();
        crackSource.buffer = pinkBuffer;

        const crackFilter = engine.ctx.createBiquadFilter();
        crackFilter.type = 'lowpass';
        crackFilter.frequency.setValueAtTime(400, t);
        crackFilter.frequency.exponentialRampToValueAtTime(100, t + 0.3);

        const crackGain = engine.ctx.createGain();
        crackGain.gain.setValueAtTime(0, t);
        crackGain.gain.linearRampToValueAtTime(2.5, t + 0.05);
        crackGain.gain.exponentialRampToValueAtTime(0.4, t + 0.5);
        crackGain.gain.exponentialRampToValueAtTime(0.001, t + 2.5);

        const crackPanner = engine.ctx.createStereoPanner();
        crackPanner.pan.value = crackPan;

        crackSource.connect(crackFilter);
        crackFilter.connect(crackPanner);
        crackPanner.connect(crackGain);
        crackGain.connect(engine.masterGain!);
        engine.connectToReverb(crackGain, 0.5);

        crackSource.start(t, Math.random() * 5);
        crackSource.stop(t + 3.0);

        engine.activeNodes.push(crackSource, crackFilter, crackPanner, crackGain);
      }
    }

    // 2. Main Rumble
    for (let i = 0; i < 5; i++) {
      const rumbleSource = engine.ctx.createBufferSource();
      rumbleSource.buffer = brownBuffer;

      const rumbleFilter = engine.ctx.createBiquadFilter();
      rumbleFilter.type = 'lowpass';
      const baseFreq = 80 + Math.random() * 100;
      rumbleFilter.frequency.setValueAtTime(baseFreq, t);
      rumbleFilter.frequency.exponentialRampToValueAtTime(20 + Math.random() * 10, t + duration);

      const rumblePanner = engine.ctx.createStereoPanner();
      rumblePanner.pan.value = rumblePan + (Math.random() * 1.0 - 0.5);

      const rumbleGain = engine.ctx.createGain();
      const layerDelay = i * (0.5 + Math.random() * 1.5);
      rumbleGain.gain.setValueAtTime(0, t + layerDelay);
      rumbleGain.gain.linearRampToValueAtTime(
        2.0 / (i + 1),
        t + layerDelay + 2.0 + Math.random() * 2.0
      );

      engine.addMicroLFO(rumbleGain.gain, 0.1 + i * 0.1, 0.8);
      engine.addMicroLFO(rumbleFilter.frequency, 0.05 + i * 0.05, 120);

      rumbleGain.gain.exponentialRampToValueAtTime(0.001, t + duration);

      rumbleSource.connect(rumbleFilter);
      rumbleFilter.connect(rumblePanner);
      rumblePanner.connect(rumbleGain);
      rumbleGain.connect(engine.masterGain!);
      if (i === 0) engine.connectToReverb(rumbleGain, 0.35);

      rumbleSource.start(t + layerDelay, Math.random() * 5);
      rumbleSource.stop(t + duration + 0.1);

      engine.activeNodes.push(rumbleSource, rumbleFilter, rumblePanner, rumbleGain);
    }
  };

  const scheduleThunder = () => {
    if (!checkActive()) return;
    const delay = 10000 + Math.random() * 20000;
    const id = window.setTimeout(() => {
      playThunder();
      scheduleThunder();
    }, delay);
    engine.activeIntervals.push(id);
  };

  scheduleThunder();
};
