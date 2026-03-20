import { NoiseEngine } from '../noise-engine';

export const playCatPurr = (engine: NoiseEngine, checkActive: () => boolean) => {
  if (!engine.ctx || !engine.masterGain) return;

  const motorFreq = 25 + Math.random() * 2;
  const oscVoice1 = engine.ctx.createOscillator();
  oscVoice1.type = 'sawtooth';
  oscVoice1.frequency.value = motorFreq;

  const oscVoice2 = engine.ctx.createOscillator();
  oscVoice2.type = 'sawtooth';
  oscVoice2.frequency.value = motorFreq * 1.02;

  const throatFilter = engine.ctx.createBiquadFilter();
  throatFilter.type = 'lowpass';
  throatFilter.frequency.value = 160;
  throatFilter.Q.value = 1.0;

  const breathRate = 0.35 + Math.random() * 0.05;
  const breathLfo = engine.ctx.createOscillator();
  breathLfo.type = 'sine';
  breathLfo.frequency.value = breathRate;

  const masterPurrGain = engine.ctx.createGain();
  masterPurrGain.gain.value = 0.4;

  const breathVolMod = engine.ctx.createGain();
  breathVolMod.gain.value = 0.25;
  breathLfo.connect(breathVolMod);
  breathVolMod.connect(masterPurrGain.gain);

  const pitchMod = engine.ctx.createGain();
  pitchMod.gain.value = 1.5;
  breathLfo.connect(pitchMod);
  pitchMod.connect(oscVoice1.frequency);
  pitchMod.connect(oscVoice2.frequency);

  // Audio path
  oscVoice1.connect(throatFilter);
  oscVoice2.connect(throatFilter);
  throatFilter.connect(masterPurrGain);
  masterPurrGain.connect(engine.masterGain);

  oscVoice1.start();
  oscVoice2.start();
  breathLfo.start();

  engine.activeNodes.push(
    oscVoice1,
    oscVoice2,
    throatFilter,
    breathLfo,
    breathVolMod,
    masterPurrGain,
    pitchMod
  );

  // Subtle Organic Meows
  const playMeow = () => {
    if (!engine.ctx || !engine.masterGain || !checkActive()) return;

    const t = engine.ctx.currentTime;
    const duration = 0.5 + Math.random() * 0.4;

    const osc1 = engine.ctx.createOscillator();
    const osc2 = engine.ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc2.type = 'square';

    const baseFreq = 400 + Math.random() * 80;

    [osc1.frequency, osc2.frequency].forEach((freqParam, i) => {
      const offset = i === 1 ? 1.01 : 1.0;
      freqParam.setValueAtTime(baseFreq * offset, t);
      freqParam.exponentialRampToValueAtTime((baseFreq + 100) * offset, t + duration * 0.3);
      freqParam.exponentialRampToValueAtTime(baseFreq * 0.8 * offset, t + duration);
    });

    const formant1 = engine.ctx.createBiquadFilter();
    formant1.type = 'bandpass';
    formant1.frequency.value = 800;
    formant1.Q.value = 4.0;

    const formant2 = engine.ctx.createBiquadFilter();
    formant2.type = 'bandpass';
    formant2.frequency.value = 1300;
    formant2.Q.value = 3.0;

    const meowGain = engine.ctx.createGain();
    meowGain.gain.setValueAtTime(0, t);

    const peakVolume = 0.005 + Math.random() * 0.005;
    meowGain.gain.linearRampToValueAtTime(peakVolume, t + duration * 0.2);
    meowGain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    // Split the oscillators into both formants, sum them, then out
    osc1.connect(formant1);
    osc2.connect(formant1);
    osc1.connect(formant2);
    osc2.connect(formant2);

    formant1.connect(meowGain);
    formant2.connect(meowGain);
    meowGain.connect(engine.masterGain!);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + duration);
    osc2.stop(t + duration);

    engine.activeNodes.push(osc1, osc2, formant1, formant2, meowGain);

    engine.activeIntervals.push(
      window.setTimeout(
        () => {
          if (checkActive()) playMeow();
        },
        (8 + Math.random() * 12) * 1000
      )
    );
  };

  // First meow happens very quickly (0.5 to 2.5 seconds)
  engine.activeIntervals.push(
    window.setTimeout(
      () => {
        if (checkActive()) playMeow();
      },
      (0.5 + Math.random() * 2) * 1000
    )
  );
};
