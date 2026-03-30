export interface BuiltinSample {
  name: string;
  data: Float32Array;
  volume: number;
  fixedPitch?: boolean;
}

function makeKick(): Float32Array {
  const samples = 2205;
  const data = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const t = i / 44100;
    const freq = 80 * Math.exp(-t * 30);
    const env = Math.exp(-t * 20);
    data[i] = Math.sin(2 * Math.PI * freq * t) * env;
  }
  return data;
}

function makeSnare(): Float32Array {
  const samples = 2205;
  const data = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const t = i / 44100;
    const env = Math.exp(-t * 15);
    const tone = Math.sin(2 * Math.PI * 200 * t) * 0.3;
    const noise = (Math.random() * 2 - 1) * 0.7;
    data[i] = (tone + noise) * env;
  }
  return data;
}

function makeHihat(): Float32Array {
  const samples = 1102;
  const data = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const t = i / 44100;
    const env = Math.exp(-t * 60);
    data[i] = (Math.random() * 2 - 1) * env * 0.5;
  }
  return data;
}

function makeOpenHat(): Float32Array {
  const samples = 6610;
  const data = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const t = i / 44100;
    const env = Math.exp(-t * 8);
    data[i] = (Math.random() * 2 - 1) * env * 0.5;
  }
  return data;
}

function makeTom(): Float32Array {
  const samples = 3305;
  const data = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const t = i / 44100;
    const freq = 100 * Math.exp(-t * 15);
    const env = Math.exp(-t * 12);
    data[i] = Math.sin(2 * Math.PI * freq * t) * env;
  }
  return data;
}

function makeClap(): Float32Array {
  const samples = 2205;
  const data = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const t = i / 44100;
    const env = Math.exp(-t * 20);
    data[i] = (Math.random() * 2 - 1) * env * 0.6;
  }
  return data;
}

function makeCrash(): Float32Array {
  const samples = 13230;
  const data = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const t = i / 44100;
    const env = Math.exp(-t * 4);
    data[i] = (Math.random() * 2 - 1) * env * 0.5;
  }
  return data;
}

function makeRim(): Float32Array {
  const samples = 735;
  const data = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const t = i / 44100;
    const env = Math.exp(-t * 80);
    const tone = Math.sin(2 * Math.PI * 600 * t);
    data[i] = (tone * 0.7 + (Math.random() * 2 - 1) * 0.3) * env;
  }
  return data;
}

export const BUILTIN_SAMPLES: BuiltinSample[] = [
  { name: 'Kick', data: makeKick(), volume: 64, fixedPitch: true },
  { name: 'Snare', data: makeSnare(), volume: 56, fixedPitch: true },
  { name: 'HiHat', data: makeHihat(), volume: 48, fixedPitch: true },
  { name: 'OpenHat', data: makeOpenHat(), volume: 48, fixedPitch: true },
  { name: 'Tom', data: makeTom(), volume: 56, fixedPitch: true },
  { name: 'Clap', data: makeClap(), volume: 52, fixedPitch: true },
  { name: 'Crash', data: makeCrash(), volume: 48, fixedPitch: true },
  { name: 'Rim', data: makeRim(), volume: 48, fixedPitch: true },
];
