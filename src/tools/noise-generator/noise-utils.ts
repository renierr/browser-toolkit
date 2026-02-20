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

      // Slow modulation for intensity shifts
      const intensityLfo = this.ctx.createOscillator();
      intensityLfo.type = 'sine';
      intensityLfo.frequency.value = 0.05;
      const intensityGain = this.ctx.createGain();
      intensityGain.gain.value = 0.15;
      intensityLfo.connect(intensityGain);
      intensityGain.connect(gain.gain);
      intensityLfo.start();

      source.connect(filter);
      filter.connect(panner);
      panner.connect(gain);
      gain.connect(this.masterGain);
      source.start();
      this.activeNodes.push(source, filter, panner, gain, intensityLfo, intensityGain);
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

    // Layer 3: Discrete Droplets (Simulated with short noise bursts)
    const playDroplet = () => {
      if (
        !this.ctx ||
        !this.masterGain ||
        !this.isPlaying ||
        (this.currentNoiseType !== 'rain' && this.currentNoiseType !== 'thunder')
      )
        return;

      const t = this.ctx.currentTime;
      const whiteBuffer = this.createNoiseBuffer('white');
      if (!whiteBuffer) return;

      const source = this.ctx.createBufferSource();
      source.buffer = whiteBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2000 + Math.random() * 3000, t);
      filter.Q.value = 2.0;

      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.random() * 1.8 - 0.9;

      const gain = this.ctx.createGain();
      const duration = 0.01 + Math.random() * 0.03;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.05 + Math.random() * 0.1, t + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

      source.connect(filter);
      filter.connect(panner);
      panner.connect(gain);
      gain.connect(this.masterGain!);

      source.start(t, Math.random() * 9);
      source.stop(t + duration + 0.1);

      setTimeout(
        () => {
          source.disconnect();
          filter.disconnect();
          panner.disconnect();
          gain.disconnect();
        },
        (duration + 0.2) * 1000
      );
    };

    const scheduleDroplets = () => {
      if (
        !this.isPlaying ||
        (this.currentNoiseType !== 'rain' && this.currentNoiseType !== 'thunder')
      )
        return;
      const delay = 50 + Math.random() * 150;
      const id = window.setTimeout(() => {
        playDroplet();
        scheduleDroplets();
      }, delay);
      this.activeIntervals.push(id);
    };
    scheduleDroplets();
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

  private playThunderstorm() {
    if (!this.ctx || !this.masterGain) return;

    // 1. Rain (Base Layer)
    this.playRain();

    // 2. Thunder (Improved with Crack and Rumble)
    const playThunder = () => {
      if (!this.ctx || !this.masterGain || !this.isPlaying) return;

      const t = this.ctx.currentTime;
      const brownBuffer = this.createNoiseBuffer('brown');
      const whiteBuffer = this.createNoiseBuffer('white');
      if (!brownBuffer || !whiteBuffer) return;

      const panValue = Math.random() * 1.6 - 0.8;
      const duration = 6 + Math.random() * 8;

      // Crack (Sharp initial burst)
      if (Math.random() > 0.4) {
        const crackSource = this.ctx.createBufferSource();
        crackSource.buffer = whiteBuffer;
        const crackFilter = this.ctx.createBiquadFilter();
        crackFilter.type = 'bandpass';
        crackFilter.frequency.setValueAtTime(800, t);
        crackFilter.Q.value = 0.5;

        const crackGain = this.ctx.createGain();
        crackGain.gain.setValueAtTime(0, t);
        crackGain.gain.linearRampToValueAtTime(0.3 + Math.random() * 0.3, t + 0.01);
        crackGain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);

        const crackPanner = this.ctx.createStereoPanner();
        crackPanner.pan.value = panValue;

        crackSource.connect(crackFilter);
        crackFilter.connect(crackPanner);
        crackPanner.connect(crackGain);
        crackGain.connect(this.masterGain!);
        crackSource.start(t, Math.random() * 5);
        crackSource.stop(t + 0.6);
      }

      // Rumble (Deep rolling sound)
      const rumbleSource = this.ctx.createBufferSource();
      rumbleSource.buffer = brownBuffer;

      const rumbleFilter = this.ctx.createBiquadFilter();
      rumbleFilter.type = 'lowpass';
      rumbleFilter.frequency.setValueAtTime(400, t);
      rumbleFilter.frequency.exponentialRampToValueAtTime(80, t + duration);

      const rumblePanner = this.ctx.createStereoPanner();
      rumblePanner.pan.value = panValue;

      const rumbleGain = this.ctx.createGain();
      rumbleGain.gain.setValueAtTime(0, t);
      rumbleGain.gain.linearRampToValueAtTime(0.5 + Math.random() * 0.5, t + 1.5);
      rumbleGain.gain.exponentialRampToValueAtTime(0.001, t + duration);

      rumbleSource.connect(rumbleFilter);
      rumbleFilter.connect(rumblePanner);
      rumblePanner.connect(rumbleGain);
      rumbleGain.connect(this.masterGain!);

      rumbleSource.start(t, Math.random() * 5);
      rumbleSource.stop(t + duration + 0.1);

      setTimeout(
        () => {
          rumbleSource.disconnect();
          rumbleFilter.disconnect();
          rumblePanner.disconnect();
          rumbleGain.disconnect();
        },
        (duration + 1) * 1000
      );
    };

    const scheduleThunder = () => {
      if (!this.isPlaying) return;
      const delay = 12000 + Math.random() * 25000;
      const id = window.setTimeout(() => {
        playThunder();
        scheduleThunder();
      }, delay);
      this.activeIntervals.push(id);
    };

    scheduleThunder();
  }

  private playCafe() {
    if (!this.ctx || !this.masterGain) return;

    // 1. Background Murmur (Simulated with multiple filtered noise layers)
    const pinkBuffer = this.createNoiseBuffer('pink');
    if (pinkBuffer) {
      // Create 5 layers of murmur with different formant-like filters
      for (let i = 0; i < 5; i++) {
        const source = this.ctx.createBufferSource();
        source.buffer = pinkBuffer;
        source.loop = true;

        const filter1 = this.ctx.createBiquadFilter();
        filter1.type = 'bandpass';
        filter1.frequency.value = 400 + Math.random() * 300;
        filter1.Q.value = 2.0;

        const filter2 = this.ctx.createBiquadFilter();
        filter2.type = 'bandpass';
        filter2.frequency.value = 1000 + Math.random() * 1000;
        filter2.Q.value = 3.0;

        const panner = this.ctx.createStereoPanner();
        panner.pan.value = Math.random() * 1.6 - 0.8;

        const gain = this.ctx.createGain();
        gain.gain.value = 0.03;

        // More complex modulation for each voice layer
        const lfo1 = this.ctx.createOscillator();
        lfo1.type = 'sine';
        lfo1.frequency.value = 0.2 + Math.random() * 0.5;
        const lfo2 = this.ctx.createOscillator();
        lfo2.type = 'sine';
        lfo2.frequency.value = 1.0 + Math.random() * 2.0;

        const lfoGain1 = this.ctx.createGain();
        lfoGain1.gain.value = 0.02;
        const lfoGain2 = this.ctx.createGain();
        lfoGain2.gain.value = 0.01;

        lfo1.connect(lfoGain1);
        lfoGain1.connect(gain.gain);
        lfo2.connect(lfoGain2);
        lfoGain2.connect(gain.gain);

        lfo1.start();
        lfo2.start();

        source.connect(filter1);
        filter1.connect(filter2);
        filter2.connect(panner);
        panner.connect(gain);
        gain.connect(this.masterGain);
        source.start(0, Math.random() * 10);
        this.activeNodes.push(
          source,
          filter1,
          filter2,
          panner,
          gain,
          lfo1,
          lfo2,
          lfoGain1,
          lfoGain2
        );
      }
    }

    // 2. Clinking sounds (Random oscillators + noise)
    const playClink = () => {
      if (!this.ctx || !this.masterGain || !this.isPlaying || this.currentNoiseType !== 'cafe')
        return;

      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(2500 + Math.random() * 4000, t);

      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.random() * 1.6 - 0.8;

      const gain = this.ctx.createGain();
      const duration = 0.03 + Math.random() * 0.07;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.01 + Math.random() * 0.02, t + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

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

    // 3. Muffled thuds/chair moves (Brown noise)
    const playThud = () => {
      if (!this.ctx || !this.masterGain || !this.isPlaying || this.currentNoiseType !== 'cafe')
        return;
      const t = this.ctx.currentTime;
      const brownBuffer = this.createNoiseBuffer('brown');
      if (!brownBuffer) return;

      const source = this.ctx.createBufferSource();
      source.buffer = brownBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 200 + Math.random() * 300;

      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.random() * 1.4 - 0.7;

      const gain = this.ctx.createGain();
      const duration = 0.2 + Math.random() * 0.4;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.05 + Math.random() * 0.05, t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

      source.connect(filter);
      filter.connect(panner);
      panner.connect(gain);
      gain.connect(this.masterGain!);

      source.start(t, Math.random() * 5);
      source.stop(t + duration + 0.1);

      setTimeout(
        () => {
          source.disconnect();
          filter.disconnect();
          panner.disconnect();
          gain.disconnect();
        },
        (duration + 0.5) * 1000
      );
    };

    const scheduleCafeEvents = () => {
      if (!this.isPlaying || this.currentNoiseType !== 'cafe') return;
      const delay = 1000 + Math.random() * 5000;
      const id = window.setTimeout(() => {
        if (Math.random() > 0.4) playClink();
        if (Math.random() > 0.7) playThud();
        scheduleCafeEvents();
      }, delay);
      this.activeIntervals.push(id);
    };
    scheduleCafeEvents();
  }

  private playUnderwater() {
    if (!this.ctx || !this.masterGain) return;

    // 1. Deep Rumble (Brown Noise + Steep Lowpass)
    const brownBuffer = this.createNoiseBuffer('brown');
    if (brownBuffer) {
      const source = this.ctx.createBufferSource();
      source.buffer = brownBuffer;
      source.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 150;

      const gain = this.ctx.createGain();
      gain.gain.value = 0.6;

      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      source.start();
      this.activeNodes.push(source, filter, gain);
    }

    // 2. Bubbles (Resonant filters on white noise)
    const playBubble = () => {
      if (!this.ctx || !this.masterGain || !this.isPlaying) return;

      const t = this.ctx.currentTime;
      const buffer = this.createNoiseBuffer('white');
      if (!buffer) return;

      const source = this.ctx.createBufferSource();
      source.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      const startFreq = 400 + Math.random() * 400;
      filter.frequency.setValueAtTime(startFreq, t);
      filter.frequency.exponentialRampToValueAtTime(startFreq * 1.5, t + 0.2);
      filter.Q.value = 10;

      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.random() * 1.2 - 0.6;

      const gain = this.ctx.createGain();
      const duration = 0.2 + Math.random() * 0.3;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.05, t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

      source.connect(filter);
      filter.connect(panner);
      panner.connect(gain);
      gain.connect(this.masterGain!);

      source.start(t, Math.random() * 9);
      source.stop(t + duration + 0.1);

      setTimeout(
        () => {
          source.disconnect();
          filter.disconnect();
          panner.disconnect();
          gain.disconnect();
        },
        (duration + 0.2) * 1000
      );
    };

    const scheduleBubble = () => {
      if (!this.isPlaying) return;
      const delay = 500 + Math.random() * 2000;
      const id = window.setTimeout(() => {
        playBubble();
        scheduleBubble();
      }, delay);
      this.activeIntervals.push(id);
    };
    scheduleBubble();
  }

  private playTrain() {
    if (!this.ctx || !this.masterGain) return;

    // 1. Low hum (Filtered Brown Noise)
    const brownBuffer = this.createNoiseBuffer('brown');
    if (brownBuffer) {
      const source = this.ctx.createBufferSource();
      source.buffer = brownBuffer;
      source.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 100;

      const gain = this.ctx.createGain();
      gain.gain.value = 0.3;

      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      source.start();
      this.activeNodes.push(source, filter, gain);
    }

    // 2. Rhythmic track sounds (Filtered Pink Noise pulses)
    const scheduleClack = () => {
      if (!this.ctx || !this.masterGain || !this.isPlaying) return;

      const playPulse = (delay: number, volume: number) => {
        const t = this.ctx!.currentTime + delay;
        const buffer = this.createNoiseBuffer('pink');
        if (!buffer) return;

        const source = this.ctx!.createBufferSource();
        source.buffer = buffer;

        const filter = this.ctx!.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1000;

        const gain = this.ctx!.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(volume, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain!);
        source.start(t, Math.random() * 9);
        source.stop(t + 0.2);

        setTimeout(
          () => {
            source.disconnect();
            filter.disconnect();
            gain.disconnect();
          },
          (delay + 0.3) * 1000
        );
      };

      // Rhythm: "clack-clack ... clack-clack"
      const tempo = 1.5; // seconds per cycle
      const id = window.setInterval(() => {
        playPulse(0, 0.1);
        playPulse(0.15, 0.07);
        playPulse(0.4, 0.1);
        playPulse(0.55, 0.07);
      }, tempo * 1000);

      this.activeIntervals.push(id);
    };

    scheduleClack();
  }

  private playWindChimes() {
    if (!this.ctx || !this.masterGain) return;

    const notes = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98]; // Pentatonic scale (C5-G6)

    const playChime = () => {
      if (!this.ctx || !this.masterGain || !this.isPlaying) return;

      const t = this.ctx.currentTime;
      const freq = notes[Math.floor(Math.random() * notes.length)];
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      // Add a slight frequency wobble
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 2 + Math.random() * 3;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = freq * 0.005;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start();

      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.random() * 1.8 - 0.9;

      const gain = this.ctx.createGain();
      const duration = 2 + Math.random() * 3;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.05, t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

      osc.connect(panner);
      panner.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(t);
      osc.stop(t + duration + 0.1);
      lfo.stop(t + duration + 0.1);

      setTimeout(
        () => {
          osc.disconnect();
          lfo.disconnect();
          lfoGain.disconnect();
          panner.disconnect();
          gain.disconnect();
        },
        (duration + 0.2) * 1000
      );
    };

    const scheduleChime = () => {
      if (!this.isPlaying) return;
      const delay = 1000 + Math.random() * 4000;
      const id = window.setTimeout(() => {
        playChime();
        scheduleChime();
      }, delay);
      this.activeIntervals.push(id);
    };
    scheduleChime();
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
      case 'thunder':
        this.playThunderstorm();
        break;
      case 'cafe':
        this.playCafe();
        break;
      case 'underwater':
        this.playUnderwater();
        break;
      case 'train':
        this.playTrain();
        break;
      case 'chimes':
        this.playWindChimes();
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
