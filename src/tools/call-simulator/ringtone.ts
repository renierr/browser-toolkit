export type RingtoneType = 'classic' | 'modern' | 'silent';

export interface RingtoneControl {
  stop(): void;
  setVibrate(on: boolean): void;
}

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
  }

  function startVibration(): void {
    if (!vibrateOn || !navigator.vibrate) return;
    const pattern = type === 'classic' ? [250, 100, 250, 100, 600] : [150, 100, 150, 100, 300];
    const loopMs = type === 'classic' ? 5000 : 4000;

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
