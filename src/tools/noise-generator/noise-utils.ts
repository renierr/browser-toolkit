export class NoiseGenerator {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffers: Map<string, AudioBuffer> = new Map();
  private activeNodes: AudioNode[] = [];
  private activeIntervals: number[] = [];
  private currentNoiseType: string | null = null;
  private isPlaying = false;
  private volume: number = 0.5;

  constructor(initialVolume: number = 0.5) {
    this.volume = initialVolume;
  }

  private initContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      this.masterGain.gain.value = this.volume;
    }
  }

  private createNoiseBuffer(type: 'white' | 'pink' | 'brown'): AudioBuffer | null {
    if (!this.ctx) return null;

    const cacheKey = `${type}-${this.ctx.sampleRate}`;
    if (this.noiseBuffers.has(cacheKey)) {
      return this.noiseBuffers.get(cacheKey)!;
    }

    const bufferSize = 10 * this.ctx.sampleRate; // 10 seconds buffer for better quality
    const buffer = this.ctx.createBuffer(2, bufferSize, this.ctx.sampleRate); // Stereo buffer

    for (let channel = 0; channel < 2; channel++) {
      const output = buffer.getChannelData(channel);

      if (type === 'white') {
        for (let i = 0; i < bufferSize; i++) {
          output[i] = Math.random() * 2 - 1;
        }
      } else if (type === 'pink') {
        let b0, b1, b2, b3, b4, b5, b6;
        b0 = b1 = b2 = b3 = b4 = b5 = b6 = 0.0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.969 * b2 + white * 0.153852;
          b3 = 0.8665 * b3 + white * 0.3104856;
          b4 = 0.55 * b4 + white * 0.5329522;
          b5 = -0.7616 * b5 - white * 0.016898;
          output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
          output[i] *= 0.11; // (roughly) compensate for gain
          b6 = white * 0.115926;
        }
      } else if (type === 'brown') {
        let lastOut = 0.0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          output[i] = (lastOut + 0.02 * white) / 1.02;
          lastOut = output[i];
          output[i] *= 3.5; // (roughly) compensate for gain
        }
      }

      // Apply cross-fade at the end of the buffer to avoid clicks
      const fadeSize = Math.floor(0.1 * this.ctx.sampleRate); // 100ms fade
      for (let i = 0; i < fadeSize; i++) {
        const alpha = i / fadeSize;
        output[i] = output[i] * alpha + output[bufferSize - fadeSize + i] * (1 - alpha);
      }
    }

    this.noiseBuffers.set(cacheKey, buffer);
    return buffer;
  }

  private playNoiseSource(
    type: 'white' | 'pink' | 'brown',
    gainVal: number = 1.0
  ): AudioNode | null {
    if (!this.ctx || !this.masterGain) return null;
    const buffer = this.createNoiseBuffer(type);
    if (!buffer) return null;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const gain = this.ctx.createGain();
    gain.gain.value = gainVal;

    source.connect(gain);
    gain.connect(this.masterGain);
    source.start();

    this.activeNodes.push(source, gain);
    return gain; // Return the gain node so we can connect filters to it if needed
  }

  // --- Specific Soundscapes ---

  private playRain() {
    if (!this.ctx || !this.masterGain) return;

    // Layer 1: Pink noise (Moderate Hiss/Patter)
    const pinkBuffer = this.createNoiseBuffer('pink');
    if (pinkBuffer) {
      const source = this.ctx.createBufferSource();
      source.buffer = pinkBuffer;
      source.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1200;

      const panner = this.ctx.createStereoPanner();
      panner.pan.value = -0.2;

      const gain = this.ctx.createGain();
      gain.gain.value = 0.4;

      source.connect(filter);
      filter.connect(panner);
      panner.connect(gain);
      gain.connect(this.masterGain);
      source.start();
      this.activeNodes.push(source, filter, panner, gain);
    }

    // Layer 2: Brown noise (Deep Rumble)
    const brownBuffer = this.createNoiseBuffer('brown');
    if (brownBuffer) {
      const source = this.ctx.createBufferSource();
      source.buffer = brownBuffer;
      source.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 400;

      const panner = this.ctx.createStereoPanner();
      panner.pan.value = 0.2;

      const gain = this.ctx.createGain();
      gain.gain.value = 0.2;

      source.connect(filter);
      filter.connect(panner);
      panner.connect(gain);
      gain.connect(this.masterGain);
      source.start();
      this.activeNodes.push(source, filter, panner, gain);
    }

    // Layer 3: High-frequency "patter" (Filtered White Noise)
    const whiteBuffer = this.createNoiseBuffer('white');
    if (whiteBuffer) {
      const source = this.ctx.createBufferSource();
      source.buffer = whiteBuffer;
      source.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 3000;
      filter.Q.value = 1.0;

      const gain = this.ctx.createGain();
      gain.gain.value = 0.05;

      // Modulate the patter slightly
      const lfo = this.ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.5;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 0.02;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      lfo.start();

      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      source.start();
      this.activeNodes.push(source, filter, gain, lfo, lfoGain);
    }
  }

  private playWaves() {
    if (!this.ctx || !this.masterGain) return;

    const buffer = this.createNoiseBuffer('brown');
    if (!buffer) return;

    // We'll create two layers for stereo width
    [-0.5, 0.5].forEach((pan) => {
      const source = this.ctx!.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const filter = this.ctx!.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 800;

      const waveGain = this.ctx!.createGain();
      waveGain.gain.value = 0.3;

      const panner = this.ctx!.createStereoPanner();
      panner.pan.value = pan;

      // LFO for the wave cycle
      const lfo = this.ctx!.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.12 + Math.random() * 0.04; // Slightly different for each side

      const lfoGain = this.ctx!.createGain();
      lfoGain.gain.value = 0.25;

      lfo.connect(lfoGain);
      lfoGain.connect(waveGain.gain);

      source.connect(filter);
      filter.connect(panner);
      panner.connect(waveGain);
      waveGain.connect(this.masterGain!);

      source.start(0, Math.random() * 10); // Start at random offset
      lfo.start();

      this.activeNodes.push(source, filter, panner, waveGain, lfo, lfoGain);
    });

    // Add a high-frequency "hiss" for the foam/spray
    const pinkBuffer = this.createNoiseBuffer('pink');
    if (pinkBuffer) {
      const source = this.ctx.createBufferSource();
      source.buffer = pinkBuffer;
      source.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 2000;

      const foamGain = this.ctx.createGain();
      foamGain.gain.value = 0.05;

      // Modulate foam with wave LFO but inverted or shifted
      const lfo = this.ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.14;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 0.04;
      lfo.connect(lfoGain);
      lfoGain.connect(foamGain.gain);

      source.connect(filter);
      filter.connect(foamGain);
      foamGain.connect(this.masterGain);
      source.start();
      lfo.start();
      this.activeNodes.push(source, filter, foamGain, lfo, lfoGain);
    }
  }

  private playForest() {
    if (!this.ctx || !this.masterGain) return;

    // 1. Wind (Filtered Pink Noise)
    const buffer = this.createNoiseBuffer('pink');
    if (buffer) {
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 400; // Low rumble wind

      const gain = this.ctx.createGain();
      gain.gain.value = 0.15;

      // Modulate wind volume for gusts
      const lfo = this.ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.07;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 0.1;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      lfo.start();

      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      source.start();
      this.activeNodes.push(source, filter, gain, lfo, lfoGain);
    }

    // 2. Birds (Random Chirps)
    const playChirp = () => {
      if (!this.ctx || !this.masterGain || !this.isPlaying) return;

      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const panner = this.ctx.createStereoPanner();

      // Randomize bird properties
      const isHigh = Math.random() > 0.5;
      const startFreq = isHigh ? 2000 + Math.random() * 2000 : 1000 + Math.random() * 1000;
      const endFreq = startFreq + (Math.random() * 1000 - 500);
      const duration = 0.05 + Math.random() * 0.2;

      osc.type = Math.random() > 0.3 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(startFreq, t);
      osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration);

      panner.pan.value = Math.random() * 1.6 - 0.8;

      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.05 + Math.random() * 0.05, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, t + duration);

      osc.connect(panner);
      panner.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(t);
      osc.stop(t + duration + 0.1);

      setTimeout(
        () => {
          osc.disconnect();
          panner.disconnect();
          gain.disconnect();
        },
        (duration + 0.2) * 1000
      );
    };

    // Schedule random chirps
    const scheduleNextChirp = () => {
      if (!this.isPlaying) return;
      const delay = 1000 + Math.random() * 4000; // 1s to 5s
      const id = window.setTimeout(() => {
        playChirp();
        scheduleNextChirp();
      }, delay);
      this.activeIntervals.push(id);
    };

    scheduleNextChirp();
  }

  private playFire() {
    if (!this.ctx || !this.masterGain) return;

    // 1. Rumble (Brown Noise)
    const brownBuffer = this.createNoiseBuffer('brown');
    if (brownBuffer) {
      const source = this.ctx.createBufferSource();
      source.buffer = brownBuffer;
      source.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 400;

      const gain = this.ctx.createGain();
      gain.gain.value = 0.5;

      // Subtle LFO for the roar of the fire
      const lfo = this.ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.2;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 0.15;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      lfo.start();

      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      source.start();
      this.activeNodes.push(source, filter, gain, lfo, lfoGain);
    }

    // 2. Crackling (Random clicks)
    const playCrackle = () => {
      if (!this.ctx || !this.masterGain || !this.isPlaying) return;

      const t = this.ctx.currentTime;
      const buffer = this.createNoiseBuffer('white');
      if (!buffer) return;

      const source = this.ctx.createBufferSource();
      source.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 800 + Math.random() * 1200;

      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.random() * 0.6 - 0.3;

      const gain = this.ctx.createGain();
      const duration = 0.01 + Math.random() * 0.04;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.3 + Math.random() * 0.4, t + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.01, t + duration);

      source.connect(filter);
      filter.connect(panner);
      panner.connect(gain);
      gain.connect(this.masterGain!);

      source.start(t, Math.random() * 9);
      source.stop(t + duration + 0.05);

      setTimeout(
        () => {
          source.disconnect();
          filter.disconnect();
          panner.disconnect();
          gain.disconnect();
        },
        (duration + 0.1) * 1000
      );
    };

    // 3. Hissing (Filtered Pink Noise)
    const pinkBuffer = this.createNoiseBuffer('pink');
    if (pinkBuffer) {
      const source = this.ctx.createBufferSource();
      source.buffer = pinkBuffer;
      source.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1500;
      filter.Q.value = 0.5;

      const gain = this.ctx.createGain();
      gain.gain.value = 0.05;

      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      source.start();
      this.activeNodes.push(source, filter, gain);
    }

    const scheduleCrackle = () => {
      if (!this.isPlaying) return;
      // Random interval between crackles
      const delay = Math.random() * 200; // Frequent crackles
      const id = window.setTimeout(() => {
        if (Math.random() > 0.3) playCrackle(); // 70% chance
        scheduleCrackle();
      }, delay);
      this.activeIntervals.push(id);
    };
    scheduleCrackle();
  }

  private playNight() {
    if (!this.ctx || !this.masterGain) return;

    // 1. Background Wind (Highpass Pink Noise)
    const pinkBuffer = this.createNoiseBuffer('pink');
    if (pinkBuffer) {
      const source = this.ctx.createBufferSource();
      source.buffer = pinkBuffer;
      source.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 800;

      const gain = this.ctx.createGain();
      gain.gain.value = 0.08;

      // Modulate with slow LFO for a gentle night breeze
      const lfo = this.ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.05;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 0.03;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      lfo.start();

      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      source.start();
      this.activeNodes.push(source, filter, gain, lfo, lfoGain);
    }

    // 2. Crickets
    const playCricket = () => {
      if (!this.ctx || !this.masterGain || !this.isPlaying) return;
      const t = this.ctx.currentTime;

      const carrier = this.ctx.createOscillator();
      carrier.type = 'sine';
      carrier.frequency.value = 4000 + Math.random() * 500;

      const modulator = this.ctx.createOscillator();
      modulator.type = 'square';
      modulator.frequency.value = 25 + Math.random() * 10;

      const modGain = this.ctx.createGain();
      modGain.gain.value = 500;

      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.random() * 1.8 - 0.9;

      const mainGain = this.ctx.createGain();
      const duration = 0.1 + Math.random() * 0.1;
      mainGain.gain.setValueAtTime(0, t);
      mainGain.gain.linearRampToValueAtTime(0.05, t + 0.01);
      mainGain.gain.linearRampToValueAtTime(0, t + duration);

      modulator.connect(modGain);
      modGain.connect(carrier.frequency);
      carrier.connect(panner);
      panner.connect(mainGain);
      mainGain.connect(this.masterGain!);

      carrier.start(t);
      modulator.start(t);
      carrier.stop(t + duration + 0.1);
      modulator.stop(t + duration + 0.1);

      setTimeout(
        () => {
          carrier.disconnect();
          modulator.disconnect();
          modGain.disconnect();
          panner.disconnect();
          mainGain.disconnect();
        },
        (duration + 0.2) * 1000
      );
    };

    const scheduleCricket = () => {
      if (!this.isPlaying) return;
      const delay = 500 + Math.random() * 1500;
      const id = window.setTimeout(() => {
        // Play a few chirps in a row
        const chirps = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < chirps; i++) {
          setTimeout(playCricket, i * 200);
        }
        scheduleCricket();
      }, delay);
      this.activeIntervals.push(id);
    };
    scheduleCricket();
  }

  private playFan() {
    if (!this.ctx || !this.masterGain) return;

    // 1. Air flow (Brown + Lowpass)
    const brownBuffer = this.createNoiseBuffer('brown');
    if (brownBuffer) {
      const source = this.ctx.createBufferSource();
      source.buffer = brownBuffer;
      source.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 600;

      const gain = this.ctx.createGain();
      gain.gain.value = 0.5;

      // Slow LFO to simulate the oscillating fan movement
      const oscillationLfo = this.ctx.createOscillator();
      oscillationLfo.type = 'sine';
      oscillationLfo.frequency.value = 0.2; // 5 seconds per oscillation

      const panner = this.ctx.createStereoPanner();
      oscillationLfo.connect(panner.pan);

      source.connect(filter);
      filter.connect(panner);
      panner.connect(gain);
      gain.connect(this.masterGain);
      source.start();
      oscillationLfo.start();
      this.activeNodes.push(source, filter, panner, gain, oscillationLfo);
    }

    // 2. Motor hum (Oscillators)
    const frequencies = [60, 120, 180]; // Fundamental and harmonics
    frequencies.forEach((freq) => {
      const osc = this.ctx!.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;

      const gain = this.ctx!.createGain();
      gain.gain.value = 0.05 / (freq / 60); // Quieter for higher harmonics

      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start();
      this.activeNodes.push(osc, gain);
    });

    // 3. Higher frequency air "whir" (Pink Noise)
    const pinkBuffer = this.createNoiseBuffer('pink');
    if (pinkBuffer) {
      const source = this.ctx.createBufferSource();
      source.buffer = pinkBuffer;
      source.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1500;

      const gain = this.ctx.createGain();
      gain.gain.value = 0.15;

      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      source.start();
      this.activeNodes.push(source, filter, gain);
    }
  }

  // --- Main Control ---

  play(type: string) {
    this.initContext();
    if (!this.ctx || !this.masterGain) return;

    if (this.isPlaying) {
      this.stop();
    }

    this.isPlaying = true;
    this.currentNoiseType = type;

    switch (type) {
      case 'white':
      case 'pink':
      case 'brown':
        this.playNoiseSource(type as 'white' | 'pink' | 'brown');
        break;
      case 'rain':
        this.playRain();
        break;
      case 'forest':
        this.playForest();
        break;
      case 'waves':
        this.playWaves();
        break;
      case 'fire':
        this.playFire();
        break;
      case 'night':
        this.playNight();
        break;
      case 'fan':
        this.playFan();
        break;
      default:
        this.playNoiseSource('white');
    }
  }

  stop() {
    // Stop all audio nodes
    this.activeNodes.forEach((node) => {
      try {
        if ((node as any).stop) {
          (node as any).stop();
        }
        node.disconnect();
      } catch (e) {
        // Ignore errors if already stopped
      }
    });
    this.activeNodes = [];

    // Clear all intervals/timeouts
    this.activeIntervals.forEach((id) => clearTimeout(id));
    this.activeIntervals = [];

    this.isPlaying = false;
  }

  setVolume(value: number) {
    this.volume = value;
    if (this.masterGain) {
      this.masterGain.gain.value = this.volume;
    }
  }

  getIsPlaying() {
    return this.isPlaying;
  }

  getCurrentType() {
    return this.currentNoiseType;
  }

  cleanup() {
    this.stop();
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
  }
}
