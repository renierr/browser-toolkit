export type RingtoneType = 'classic' | 'modern' | 'silent' | 'old-bell';

export interface RingtoneControl {
  stop(): void;
  setVibrate(on: boolean): void;
}

const OLD_BELL_RING_DUR = 1.5;
const OLD_BELL_GAP = 0.3;
const OLD_BELL_LOOP_MS = (OLD_BELL_RING_DUR + OLD_BELL_GAP + OLD_BELL_RING_DUR + 2) * 1000;

function scheduleClassicRing(ctx: AudioContext, output: AudioNode): void {
  const now = ctx.currentTime;

  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(440, now);

  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(480, now);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.25, now + 0.04);
  gain.gain.setValueAtTime(0.25, now + 1.9);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 2.3);

  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(output);

  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + 2.5);
  osc2.stop(now + 2.5);
}

function scheduleModernChime(ctx: AudioContext, output: AudioNode): void {
  const now = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  const noteLen = 0.18;
  const gap = 0.12;

  notes.forEach((freq, i) => {
    const start = now + i * (noteLen + gap);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, start);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.2, start + 0.02);
    gain.gain.setValueAtTime(0.2, start + noteLen * 0.6);
    gain.gain.exponentialRampToValueAtTime(0.001, start + noteLen);

    osc.connect(gain);
    gain.connect(output);

    osc.start(start);
    osc.stop(start + noteLen + 0.05);
  });
}

function scheduleOldBell(ctx: AudioContext, output: AudioNode): void {
  const now = ctx.currentTime;

  const scheduleRing = (start: number) => {
    const dur = OLD_BELL_RING_DUR;

    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(440, start);

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(480, start);

    const osc3 = ctx.createOscillator();
    osc3.type = 'triangle';
    osc3.frequency.setValueAtTime(440, start);

    const osc4 = ctx.createOscillator();
    osc4.type = 'sine';
    osc4.frequency.setValueAtTime(880, start);

    const bellMix = ctx.createGain();
    bellMix.gain.setValueAtTime(0.5, start);
    osc1.connect(bellMix);
    osc2.connect(bellMix);
    osc3.connect(bellMix);
    osc4.connect(bellMix);

    const lfo = ctx.createOscillator();
    lfo.type = 'triangle';
    lfo.frequency.setValueAtTime(20, start);

    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(0.4, start);

    const tremoloGain = ctx.createGain();
    tremoloGain.gain.setValueAtTime(0.5, start);
    lfo.connect(lfoGain);
    lfoGain.connect(tremoloGain.gain);

    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(1, start + 0.03);
    envelope.gain.setValueAtTime(0.9, start + dur - 0.1);
    envelope.gain.exponentialRampToValueAtTime(0.001, start + dur);

    bellMix.connect(tremoloGain);
    tremoloGain.connect(envelope);
    envelope.connect(output);

    const stopT = start + dur + 0.05;
    lfo.start(start);
    osc1.start(start);
    osc2.start(start);
    osc3.start(start);
    osc4.start(start);
    lfo.stop(stopT);
    osc1.stop(stopT);
    osc2.stop(stopT);
    osc3.stop(stopT);
    osc4.stop(stopT);
  };

  scheduleRing(now);
  scheduleRing(now + OLD_BELL_RING_DUR + OLD_BELL_GAP);
}

export function playRingtone(ctx: AudioContext, type: RingtoneType): RingtoneControl {
  let stopped = false;
  let vibrateOn = false;
  let vibrateInterval: number | undefined;

  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.35, ctx.currentTime);
  masterGain.connect(ctx.destination);

  let patternInterval: number | undefined;

  if (type === 'classic') {
    scheduleClassicRing(ctx, masterGain);
    patternInterval = window.setInterval(() => {
      if (!stopped) scheduleClassicRing(ctx, masterGain);
    }, 5000);
  } else if (type === 'modern') {
    scheduleModernChime(ctx, masterGain);
    patternInterval = window.setInterval(() => {
      if (!stopped) scheduleModernChime(ctx, masterGain);
    }, 4000);
  } else if (type === 'old-bell') {
    scheduleOldBell(ctx, masterGain);
    patternInterval = window.setInterval(() => {
      if (!stopped) scheduleOldBell(ctx, masterGain);
    }, OLD_BELL_LOOP_MS);
  }

  function startVibration(): void {
    if (!vibrateOn || !navigator.vibrate) return;
    const pattern =
      type === 'classic'
        ? [250, 100, 250, 100, 600]
        : type === 'modern'
          ? [150, 100, 150, 100, 300]
          : [400, 100, 400, 1200];
    const loopMs = type === 'classic' ? 5000 : type === 'modern' ? 4000 : OLD_BELL_LOOP_MS;

    const fire = () => {
      if (!stopped && vibrateOn) navigator.vibrate(pattern);
    };
    fire();
    vibrateInterval = window.setInterval(fire, loopMs);
  }

  function stopVibration(): void {
    if (vibrateInterval !== undefined) {
      clearInterval(vibrateInterval);
      vibrateInterval = undefined;
    }
    navigator.vibrate(0);
  }

  return {
    stop: () => {
      stopped = true;
      if (patternInterval !== undefined) clearInterval(patternInterval);
      stopVibration();
      masterGain.disconnect();
    },
    setVibrate: (on: boolean) => {
      vibrateOn = on;
      if (on && !stopped) {
        startVibration();
      } else {
        stopVibration();
      }
    },
  };
}
