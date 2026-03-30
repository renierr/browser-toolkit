export interface BuiltinSample {
  name: string;
  data: Float32Array;
  volume: number;
}

function generateKick(): Float32Array {
  const sampleRate = 44100;
  const duration = 0.15;
  const samples = Math.floor(sampleRate * duration);
  const data = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const freq = 150 * Math.exp(-t * 30);
    const env = Math.exp(-t * 20);
    data[i] = Math.sin(2 * Math.PI * freq * t) * env * 0.8;
  }
  return data;
}

function generateSnare(): Float32Array {
  const sampleRate = 44100;
  const duration = 0.15;
  const samples = Math.floor(sampleRate * duration);
  const data = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-t * 15);
    const tone = Math.sin(2 * Math.PI * 200 * t) * 0.3;
    const noise = (Math.random() * 2 - 1) * 0.7;
    data[i] = (tone + noise) * env;
  }
  return data;
}

function generateHihat(): Float32Array {
  const sampleRate = 44100;
  const duration = 0.1;
  const samples = Math.floor(sampleRate * duration);
  const data = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-t * 40);
    data[i] = (Math.random() * 2 - 1) * env * 0.5;
  }
  return data;
}

function generateOpenHihat(): Float32Array {
  const sampleRate = 44100;
  const duration = 0.3;
  const samples = Math.floor(sampleRate * duration);
  const data = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-t * 8);
    data[i] = (Math.random() * 2 - 1) * env * 0.5;
  }
  return data;
}

function generateTom(): Float32Array {
  const sampleRate = 44100;
  const duration = 0.2;
  const samples = Math.floor(sampleRate * duration);
  const data = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const freq = 120 * Math.exp(-t * 15);
    const env = Math.exp(-t * 12);
    data[i] = Math.sin(2 * Math.PI * freq * t) * env * 0.7;
  }
  return data;
}

function generateClap(): Float32Array {
  const sampleRate = 44100;
  const duration = 0.15;
  const samples = Math.floor(sampleRate * duration);
  const data = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-t * 20);
    data[i] = (Math.random() * 2 - 1) * env * 0.6;
  }
  return data;
}

function generateCrash(): Float32Array {
  const sampleRate = 44100;
  const duration = 0.5;
  const samples = Math.floor(sampleRate * duration);
  const data = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-t * 4);
    data[i] = (Math.random() * 2 - 1) * env * 0.5;
  }
  return data;
}

function generateRim(): Float32Array {
  const sampleRate = 44100;
  const duration = 0.05;
  const samples = Math.floor(sampleRate * duration);
  const data = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-t * 50);
    const tone = Math.sin(2 * Math.PI * 800 * t);
    const noise = Math.random() * 2 - 1;
    data[i] = (tone * 0.7 + noise * 0.3) * env * 0.6;
  }
  return data;
}

export const BUILTIN_SAMPLES: BuiltinSample[] = [
  { name: 'Kick', data: generateKick(), volume: 64 },
  { name: 'Snare', data: generateSnare(), volume: 48 },
  { name: 'HiHat', data: generateHihat(), volume: 40 },
  { name: 'OpenHat', data: generateOpenHihat(), volume: 40 },
  { name: 'Tom', data: generateTom(), volume: 56 },
  { name: 'Clap', data: generateClap(), volume: 48 },
  { name: 'Crash', data: generateCrash(), volume: 48 },
  { name: 'Rim', data: generateRim(), volume: 48 },
];
