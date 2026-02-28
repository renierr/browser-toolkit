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

    const bufferSize = 10 * this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(2, bufferSize, this.ctx.sampleRate);

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
          output[i] *= 0.11;
          b6 = white * 0.115926;
        }
      } else if (type === 'brown') {
        let lastOut = 0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          output[i] = (lastOut + 0.02 * white) / 1.02;
          lastOut = output[i];
          output[i] *= 3.5;
        }
      }
      const fadeSize = Math.floor(0.1 * this.ctx.sampleRate);
      for (let i = 0; i < fadeSize; i++) {
        const alpha = i / fadeSize;
        output[i] = output[i] * alpha + output[bufferSize - fadeSize + i] * (1 - alpha);
      }
    }
    this.noiseBuffers.set(cacheKey, buffer);
    return buffer;
  }

  private addMicroLFO(target: AudioParam, baseRate = 0.08, depth = 0.12) {
    if (!this.ctx) return;
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = baseRate + Math.random() * 0.25;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = depth * (0.7 + Math.random() * 0.6);
    lfo.connect(lfoGain);
    lfoGain.connect(target);
    lfo.start();
    this.activeNodes.push(lfo, lfoGain);
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
    return gain;
  }

  // --- Specific Soundscapes ---

  private playRain(isCity: boolean = false) {
    if (!this.ctx || !this.masterGain) return;

    // Layer 1: Pink noise
    const pinkBuffer = this.createNoiseBuffer('pink');
    if (pinkBuffer) {
      const source = this.ctx.createBufferSource();
      source.buffer = pinkBuffer;
      source.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = isCity ? 1200 : 1600;

      const panner = this.ctx.createStereoPanner();
      panner.pan.value = -0.2;

      const gain = this.ctx.createGain();
      gain.gain.value = 0.04;

      source.connect(filter);
      filter.connect(panner);
      panner.connect(gain);
      gain.connect(this.masterGain);
      source.start();

      this.activeNodes.push(source, filter, panner, gain);
    }

    // Layer 2: Brown noise
    const brownBuffer = this.createNoiseBuffer('brown');
    if (brownBuffer) {
      const source = this.ctx.createBufferSource();
      source.buffer = brownBuffer;
      source.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = isCity ? 150 : 200;

      const panner = this.ctx.createStereoPanner();
      panner.pan.value = 0.2;

      const gain = this.ctx.createGain();
      gain.gain.value = 0.05;

      source.connect(filter);
      filter.connect(panner);
      panner.connect(gain);
      gain.connect(this.masterGain);
      source.start();

      this.activeNodes.push(source, filter, panner, gain);
    }

    // Layer 3: Discrete Droplets
    const playDroplet = () => {
      if (
        !this.ctx ||
        !this.masterGain ||
        !this.isPlaying ||
        !['rain', 'thunder', 'cityRain'].includes(this.currentNoiseType!)
      )
        return;

      const t = this.ctx.currentTime;
      const pinkBuffer = this.createNoiseBuffer('pink');
      if (!pinkBuffer) return;

      const source = this.ctx.createBufferSource();
      source.buffer = pinkBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';

      const baseFreq = isCity ? 1000 + Math.random() * 800 : 1500 + Math.random() * 1200;
      filter.frequency.setValueAtTime(baseFreq, t);
      filter.frequency.exponentialRampToValueAtTime(baseFreq * 0.8, t + 0.05);

      filter.Q.value = 8 + Math.random() * 10;

      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.random() * 1.8 - 0.9;

      const gain = this.ctx.createGain();
      const peak = 0.2 + Math.random() * 0.3;
      const duration = 0.04 + Math.random() * 0.06;

      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(peak, t + 0.005);
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
      if (!this.isPlaying || !['rain', 'thunder', 'cityRain'].includes(this.currentNoiseType!))
        return;
      const delay = isCity ? 40 + Math.random() * 100 : 50 + Math.random() * 150;
      const id = window.setTimeout(() => {
        playDroplet();
        scheduleDroplets();
      }, delay);
      this.activeIntervals.push(id);
    };

    // Layer 4 & 5: City Elements
    if (isCity) {
      // Background Traffic Wash
      const playTrafficWash = () => {
        if (!this.ctx || !this.masterGain || !this.isPlaying || this.currentNoiseType !== 'cityRain') return;

        const t = this.ctx.currentTime;
        const pinkBuffer = this.createNoiseBuffer('pink');
        if (!pinkBuffer) return;

        const source = this.ctx.createBufferSource();
        source.buffer = pinkBuffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 400 + Math.random() * 200;
        filter.Q.value = 1.0;

        const panner = this.ctx.createStereoPanner();
        const startPan = Math.random() * 1.6 - 0.8;
        const endPan = startPan + (Math.random() > 0.5 ? 0.4 : -0.4);
        panner.pan.setValueAtTime(startPan, t);

        const washDuration = 6 + Math.random() * 8;
        panner.pan.linearRampToValueAtTime(endPan, t + washDuration);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, t);

        const peakGain = 0.04 + Math.random() * 0.04;
        gain.gain.linearRampToValueAtTime(Math.max(0.01, peakGain - 0.02), t + washDuration / 2);
        gain.gain.exponentialRampToValueAtTime(0.001, t + washDuration);

        source.connect(filter);
        filter.connect(panner);
        panner.connect(gain);
        gain.connect(this.masterGain!);

        source.start(t);
        source.stop(t + washDuration + 0.1);

        this.activeNodes.push(source, filter, panner, gain);

        this.activeIntervals.push(
          window.setTimeout(() => {
            if (this.isPlaying && this.currentNoiseType === 'cityRain') {
              playTrafficWash();
            }
          }, (washDuration + (5 + Math.random() * 15)) * 1000)
        );
      };

      // Distant Siren
      const playSiren = () => {
        if (!this.ctx || !this.masterGain || !this.isPlaying || this.currentNoiseType !== 'cityRain') return;

        const t = this.ctx.currentTime;
        const duration = 5 + Math.random() * 5;

        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 600;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, t);

        const peak = 0.01 + Math.random() * 0.01;
        gain.gain.linearRampToValueAtTime(peak, t + duration / 3);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

        const panner = this.ctx.createStereoPanner();

        const startPan = Math.random() > 0.5 ? -1 : 1;
        panner.pan.setValueAtTime(startPan, t);
        panner.pan.linearRampToValueAtTime(-startPan, t + duration);

        osc.connect(filter);
        filter.connect(panner);
        panner.connect(gain);
        gain.connect(this.masterGain!);

        const lfo = this.ctx.createOscillator();
        lfo.type = 'square';
        lfo.frequency.value = 0.8;

        const lfoGain = this.ctx.createGain();

        osc.frequency.value = 800;
        lfoGain.gain.value = 100;

        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);

        osc.start(t);
        lfo.start(t);
        osc.stop(t + duration);
        lfo.stop(t + duration);

        this.activeNodes.push(osc, filter, gain, panner, lfo, lfoGain);

        this.activeIntervals.push(
          window.setTimeout(() => {
            if (this.isPlaying && this.currentNoiseType === 'cityRain') {
              playSiren();
            }
          }, (duration + (45 + Math.random() * 60)) * 1000)
        );
      };

      // Passing By Car
      const playPassingCar = () => {
        if (!this.ctx || !this.masterGain || !this.isPlaying || this.currentNoiseType !== 'cityRain') return;

        const t = this.ctx.currentTime;

        const pinkBuffer = this.createNoiseBuffer('pink');
        if (!pinkBuffer) return;

        const source = this.ctx.createBufferSource();
        source.buffer = pinkBuffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 800 + Math.random() * 400;

        const panner = this.ctx.createStereoPanner();
        const dir = Math.random() > 0.5 ? 1 : -1;
        panner.pan.setValueAtTime(dir, t);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, t);

        const duration = 2.5 + Math.random() * 2.0;
        const vol = 0.08 + Math.random() * 0.04;

        gain.gain.linearRampToValueAtTime(vol, t + duration * 0.4);
        gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

        panner.pan.linearRampToValueAtTime(-dir, t + duration);

        source.connect(filter);
        filter.connect(panner);
        panner.connect(gain);
        gain.connect(this.masterGain!);

        source.start(t);
        source.stop(t + duration + 0.1);

        this.activeNodes.push(source, filter, panner, gain);

        this.activeIntervals.push(
          window.setTimeout(() => {
            if (this.isPlaying && this.currentNoiseType === 'cityRain') {
              playPassingCar();
            }
          }, (20 + Math.random() * 30) * 1000)
        );
      };

      playTrafficWash();
      this.activeIntervals.push(window.setTimeout(playSiren, (10 + Math.random() * 20) * 1000));
      this.activeIntervals.push(window.setTimeout(playPassingCar, (5 + Math.random() * 10) * 1000));
    }

    scheduleDroplets();
  }

  private playWaves() {
    if (!this.ctx || !this.masterGain) return;

    const brownBuffer = this.createNoiseBuffer('brown');
    const pinkBuffer = this.createNoiseBuffer('pink');
    if (!brownBuffer || !pinkBuffer) return;

    [-0.5, 0.5].forEach((pan) => {
      const source = this.ctx!.createBufferSource();
      source.buffer = brownBuffer;
      source.loop = true;

      const filter = this.ctx!.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 400; // Lower base frequency

      const waveGain = this.ctx!.createGain();
      waveGain.gain.value = 0.2;

      const panner = this.ctx!.createStereoPanner();
      panner.pan.value = pan;

      source.connect(filter);
      filter.connect(panner);
      panner.connect(waveGain);
      waveGain.connect(this.masterGain!);

      source.start(0, Math.random() * 10);

      // LFO for both volume and filter frequency (rolling wave)
      const rate = 0.08 + Math.random() * 0.04;
      this.addMicroLFO(waveGain.gain, rate, 0.3);
      this.addMicroLFO(filter.frequency, rate, 600); // Sweep filter up and down

      this.activeNodes.push(source, filter, panner, waveGain);
    });

    if (pinkBuffer) {
      const source = this.ctx.createBufferSource();
      source.buffer = pinkBuffer;
      source.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1200;
      filter.Q.value = 0.5;

      const foamGain = this.ctx.createGain();
      foamGain.gain.value = 0.03;

      source.connect(filter);
      filter.connect(foamGain);
      foamGain.connect(this.masterGain);
      source.start();

      this.addMicroLFO(foamGain.gain, 0.06, 0.05);
      this.addMicroLFO(filter.frequency, 0.06, 500); // Filter sweep for foam
      this.activeNodes.push(source, filter, foamGain);
    }
  }

  private playForest() {
    if (!this.ctx || !this.masterGain) return;

    const buffer = this.createNoiseBuffer('pink');
    if (buffer) {
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 400;

      const gain = this.ctx.createGain();
      gain.gain.value = 0.15;

      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      source.start();

      this.addMicroLFO(gain.gain, 0.07, 0.1);
      this.activeNodes.push(source, filter, gain);
    }

    const playChirp = () => {
      if (!this.ctx || !this.masterGain || !this.isPlaying || this.currentNoiseType !== 'forest') return;

      const t = this.ctx.currentTime;
      // FM Synthesis for realistic birds
      const carrier = this.ctx.createOscillator();
      const modulator = this.ctx.createOscillator();
      const modGain = this.ctx.createGain();
      const gain = this.ctx.createGain();
      const panner = this.ctx.createStereoPanner();

      const isHigh = Math.random() > 0.5;
      const startFreq = isHigh ? 2000 + Math.random() * 1500 : 1000 + Math.random() * 1000;
      const endFreq = startFreq + (Math.random() * 1000 - 500);
      const duration = 0.1 + Math.random() * 0.2;

      carrier.type = 'sine';
      carrier.frequency.setValueAtTime(startFreq, t);
      carrier.frequency.exponentialRampToValueAtTime(endFreq, t + duration);

      modulator.type = 'sine';
      modulator.frequency.value = 10 + Math.random() * 30; // Trill frequency

      modGain.gain.setValueAtTime(0, t);
      modGain.gain.linearRampToValueAtTime(400, t + duration / 2); // Depth of FM
      modGain.gain.linearRampToValueAtTime(0, t + duration);

      modulator.connect(modGain);
      modGain.connect(carrier.frequency);

      panner.pan.value = Math.random() * 1.6 - 0.8;

      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.06 + Math.random() * 0.04, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, t + duration);

      carrier.connect(panner);
      panner.connect(gain);
      gain.connect(this.masterGain!);

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
          gain.disconnect();
        },
        (duration + 0.2) * 1000
      );
    };

    const scheduleNextChirp = () => {
      if (!this.isPlaying || this.currentNoiseType !== 'forest') return;
      const delay = 1000 + Math.random() * 4000;
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

      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      source.start();

      this.addMicroLFO(gain.gain, 0.2, 0.15);
      this.activeNodes.push(source, filter, gain);
    }

    const playCrackle = () => {
      if (!this.ctx || !this.masterGain || !this.isPlaying || this.currentNoiseType !== 'fire') return;

      const t = this.ctx.currentTime;
      const buffer = this.createNoiseBuffer('white');
      if (!buffer) return;

      const source = this.ctx.createBufferSource();
      source.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      // Bandpass for wooden pop sound
      filter.type = 'bandpass';
      filter.frequency.value = 1000 + Math.random() * 3000;
      filter.Q.value = 0.5 + Math.random();

      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.random() * 0.6 - 0.3;

      const gain = this.ctx.createGain();
      // Snappier duration and attack
      const duration = 0.005 + Math.random() * 0.03;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.4 + Math.random() * 0.6, t + 0.001);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

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
      if (!this.isPlaying || this.currentNoiseType !== 'fire') return;
      const delay = Math.random() * 200;
      const id = window.setTimeout(() => {
        if (Math.random() > 0.3) playCrackle();
        scheduleCrackle();
      }, delay);
      this.activeIntervals.push(id);
    };
    scheduleCrackle();
  }

  private playNight() {
    if (!this.ctx || !this.masterGain) return;

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

      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      source.start();

      this.addMicroLFO(gain.gain, 0.05, 0.03);
      this.activeNodes.push(source, filter, gain);
    }

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
      if (!this.isPlaying || this.currentNoiseType !== 'night') return;
      const delay = 500 + Math.random() * 1500;
      const id = window.setTimeout(() => {
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

      const panner = this.ctx.createStereoPanner();

      source.connect(filter);
      filter.connect(panner);
      panner.connect(gain);
      gain.connect(this.masterGain);
      source.start();

      this.addMicroLFO(panner.pan, 0.2, 0.8);
      this.activeNodes.push(source, filter, panner, gain);
    }

    const frequencies = [60, 120, 180];
    frequencies.forEach((freq) => {
      const osc = this.ctx!.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;

      const gain = this.ctx!.createGain();
      gain.gain.value = 0.05 / (freq / 60);

      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start();
      this.activeNodes.push(osc, gain);
    });

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

    this.playRain();

    const playThunder = () => {
      if (!this.ctx || !this.masterGain || !this.isPlaying || this.currentNoiseType !== 'thunder') return;

      const t = this.ctx.currentTime;
      const brownBuffer = this.createNoiseBuffer('brown');
      const whiteBuffer = this.createNoiseBuffer('white');
      if (!brownBuffer || !whiteBuffer) return;

      const panValue = Math.random() * 1.6 - 0.8;
      const duration = 20 + Math.random() * 25;

      // 1. Initial Crack/Strike
      if (Math.random() > 0.4) {
        const pinkBuffer = this.createNoiseBuffer('pink');
        if (pinkBuffer) {
          const crackSource = this.ctx.createBufferSource();
          crackSource.buffer = pinkBuffer;

          const crackFilter = this.ctx.createBiquadFilter();
          crackFilter.type = 'lowpass';
          crackFilter.frequency.setValueAtTime(400, t);
          crackFilter.frequency.exponentialRampToValueAtTime(100, t + 0.3);

          const crackGain = this.ctx.createGain();
          crackGain.gain.setValueAtTime(0, t);
          crackGain.gain.linearRampToValueAtTime(2.5, t + 0.05);
          crackGain.gain.exponentialRampToValueAtTime(0.4, t + 0.5);
          crackGain.gain.exponentialRampToValueAtTime(0.001, t + 2.5);

          const crackPanner = this.ctx.createStereoPanner();
          crackPanner.pan.value = panValue;

          crackSource.connect(crackFilter);
          crackFilter.connect(crackPanner);
          crackPanner.connect(crackGain);
          crackGain.connect(this.masterGain!);

          crackSource.start(t, Math.random() * 5);
          crackSource.stop(t + 3.0);

          this.activeNodes.push(crackSource, crackFilter, crackPanner, crackGain);
        }
      }

      // 2. Main Rumble
      for (let i = 0; i < 5; i++) {
        const rumbleSource = this.ctx.createBufferSource();
        rumbleSource.buffer = brownBuffer;

        const rumbleFilter = this.ctx.createBiquadFilter();
        rumbleFilter.type = 'lowpass';
        const baseFreq = 80 + Math.random() * 100;
        rumbleFilter.frequency.setValueAtTime(baseFreq, t);
        rumbleFilter.frequency.exponentialRampToValueAtTime(20 + Math.random() * 10, t + duration);

        const rumblePanner = this.ctx.createStereoPanner();
        rumblePanner.pan.value = panValue + (Math.random() * 1.0 - 0.5);

        const rumbleGain = this.ctx.createGain();
        const layerDelay = i * (0.5 + Math.random() * 1.5);
        rumbleGain.gain.setValueAtTime(0, t + layerDelay);
        rumbleGain.gain.linearRampToValueAtTime(2.0 / (i + 1), t + layerDelay + 2.0 + Math.random() * 2.0);

        this.addMicroLFO(rumbleGain.gain, 0.1 + i * 0.1, 0.8);
        this.addMicroLFO(rumbleFilter.frequency, 0.05 + i * 0.05, 120);

        rumbleGain.gain.exponentialRampToValueAtTime(0.001, t + duration);

        rumbleSource.connect(rumbleFilter);
        rumbleFilter.connect(rumblePanner);
        rumblePanner.connect(rumbleGain);
        rumbleGain.connect(this.masterGain!);

        rumbleSource.start(t + layerDelay, Math.random() * 5);
        rumbleSource.stop(t + duration + 0.1);

        this.activeNodes.push(rumbleSource, rumbleFilter, rumblePanner, rumbleGain);
      }
    };

    const scheduleThunder = () => {
      if (!this.isPlaying || this.currentNoiseType !== 'thunder') return;
      const delay = 10000 + Math.random() * 20000;
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

    const pink = this.createNoiseBuffer('pink');
    if (pink) {
      for (let i = 0; i < 4; i++) {
        const src = this.ctx.createBufferSource();
        src.buffer = pink;
        src.loop = true;
        src.playbackRate.value = 0.96 + Math.random() * 0.08;

        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1800 + Math.random() * 1400;

        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 300 + Math.random() * 900;
        bp.Q.value = 1.2 + Math.random() * 1.5;

        const pan = this.ctx.createStereoPanner();
        pan.pan.value = Math.random() * 1.4 - 0.7;

        const g = this.ctx.createGain();
        g.gain.value = 0.035 + Math.random() * 0.015;

        src.connect(lp);
        lp.connect(bp);
        bp.connect(pan);
        pan.connect(g);
        g.connect(this.masterGain);
        src.start(0, Math.random() * 10);

        this.addMicroLFO(g.gain, 0.15 + Math.random() * 0.4, 0.06);
        this.activeNodes.push(src, lp, bp, pan, g);
      }
    }

    const brown = this.createNoiseBuffer('brown');
    if (brown) {
      const src = this.ctx.createBufferSource();
      src.buffer = brown;
      src.loop = true;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 350;
      const g = this.ctx.createGain();
      g.gain.value = 0.18;
      src.connect(lp);
      lp.connect(g);
      g.connect(this.masterGain);
      src.start();
      this.addMicroLFO(lp.frequency, 0.08, 80);
      this.addMicroLFO(g.gain, 0.3, 0.1);
      this.activeNodes.push(src, lp, g);
    }

    const playClink = () => {
      if (!this.ctx || !this.masterGain || !this.isPlaying || this.currentNoiseType !== 'cafe')
        return;

      const t = this.ctx.currentTime;

      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.random() * 1.6 - 0.8;

      const mainGain = this.ctx.createGain();
      const duration = 0.06 + Math.random() * 0.15;
      mainGain.gain.setValueAtTime(0, t);
      mainGain.gain.linearRampToValueAtTime(0.02 + Math.random() * 0.015, t + 0.005);
      mainGain.gain.exponentialRampToValueAtTime(0.001, t + duration);

      panner.connect(mainGain);
      mainGain.connect(this.masterGain!);

      const baseFreq = 2000 + Math.random() * 4000;
      const partials = [1, 2.3 + Math.random() * 0.2, 3.8 + Math.random() * 0.4];
      const nodesToDisconnect: AudioNode[] = [panner, mainGain];

      partials.forEach(ratio => {
        const osc = this.ctx!.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(baseFreq * ratio, t);
        osc.connect(panner);
        osc.start(t);
        osc.stop(t + duration + 0.1);
        nodesToDisconnect.push(osc);
      });

      setTimeout(
        () => {
          nodesToDisconnect.forEach(n => n.disconnect());
        },
        (duration + 0.2) * 1000
      );
    };

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
      filter.frequency.value = 180 + Math.random() * 220;

      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.random() * 1.2 - 0.6;

      const gain = this.ctx.createGain();
      const duration = 0.4 + Math.random() * 0.9;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.03 + Math.random() * 0.04, t + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

      source.connect(filter);
      filter.connect(panner);
      panner.connect(gain);
      gain.connect(this.masterGain!);

      source.start(t, Math.random() * 9);
      source.stop(t + duration + 0.2);

      setTimeout(
        () => {
          source.disconnect();
          filter.disconnect();
          panner.disconnect();
          gain.disconnect();
        },
        (duration + 0.4) * 1000
      );
    };

    const scheduleCafeEvents = () => {
      if (!this.isPlaying || this.currentNoiseType !== 'cafe') return;
      const delay = 1200 + Math.random() * 9000;
      const id = window.setTimeout(() => {
        const roll = Math.random();
        if (roll < 0.45) playClink();
        else if (roll < 0.7) playThud();
        scheduleCafeEvents();
      }, delay);
      this.activeIntervals.push(id);
    };
    scheduleCafeEvents();
  }

  private playUnderwater() {
    if (!this.ctx || !this.masterGain) return;

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
      if (!this.isPlaying || this.currentNoiseType !== 'underwater') return;
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

    const brownBuffer = this.createNoiseBuffer('brown');
    if (brownBuffer) {
      const source = this.ctx.createBufferSource();
      source.buffer = brownBuffer;
      source.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 150;

      const gain = this.ctx.createGain();
      gain.gain.value = 0.3;

      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      source.start();

      // Undulating lowpass filter to simulate movement/wind context
      this.addMicroLFO(filter.frequency, 0.3, 100);
      this.activeNodes.push(source, filter, gain);
    }

    const scheduleClack = () => {
      if (!this.ctx || !this.masterGain || !this.isPlaying || this.currentNoiseType !== 'train') return;

      const playPulse = (delay: number, volume: number, freq: number) => {
        const t = this.ctx!.currentTime + delay;
        const buffer = this.createNoiseBuffer('pink');
        if (!buffer) return;

        const source = this.ctx!.createBufferSource();
        source.buffer = buffer;

        const filter = this.ctx!.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = freq;
        filter.Q.value = 0.8;

        const panner = this.ctx!.createStereoPanner();
        // Slight pan to simulate track sides
        panner.pan.value = Math.random() * 0.4 - 0.2;

        const gain = this.ctx!.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(volume, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15); // Slightly longer decay

        source.connect(filter);
        filter.connect(panner);
        panner.connect(gain);
        gain.connect(this.masterGain!);
        source.start(t, Math.random() * 9);
        source.stop(t + 0.3);

        setTimeout(
          () => {
            source.disconnect();
            filter.disconnect();
            panner.disconnect();
            gain.disconnect();
          },
          (delay + 0.4) * 1000
        );
      };

      const tempo = 1.6;
      const id = window.setInterval(() => {
        // Ta-da, ta-da rhythm
        playPulse(0, 0.12, 1000);
        playPulse(0.18, 0.08, 1200);
        playPulse(0.45, 0.1, 900);
        playPulse(0.63, 0.07, 1100);
      }, tempo * 1000);

      this.activeIntervals.push(id);
    };

    scheduleClack();
  }

  private playWindChimes() {
    if (!this.ctx || !this.masterGain) return;

    const notes = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98];

    const playChime = () => {
      if (!this.ctx || !this.masterGain || !this.isPlaying || this.currentNoiseType !== 'chimes') return;

      const t = this.ctx.currentTime;
      const rootFreq = notes[Math.floor(Math.random() * notes.length)];

      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.random() * 1.8 - 0.9;
      const mainGain = this.ctx.createGain();

      const duration = 3 + Math.random() * 4;
      mainGain.gain.setValueAtTime(0, t);
      mainGain.gain.linearRampToValueAtTime(0.04, t + 0.02);
      mainGain.gain.exponentialRampToValueAtTime(0.001, t + duration);

      panner.connect(mainGain);
      mainGain.connect(this.masterGain!);

      // Inharmonic partials for bell synthesis
      const partials = [
        { ratio: 1, gain: 1, decayMax: duration },
        { ratio: 2.76, gain: 0.6, decayMax: duration * 0.5 },
        { ratio: 5.4, gain: 0.4, decayMax: duration * 0.2 },
        { ratio: 8.93, gain: 0.25, decayMax: duration * 0.1 }
      ];

      const nodesToCleanup: AudioNode[] = [panner, mainGain];

      partials.forEach(p => {
        const osc = this.ctx!.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(rootFreq * p.ratio, t);

        const oscGain = this.ctx!.createGain();
        oscGain.gain.setValueAtTime(p.gain, t);
        oscGain.gain.exponentialRampToValueAtTime(0.001, t + p.decayMax);

        osc.connect(oscGain);
        oscGain.connect(panner);

        osc.start(t);
        osc.stop(t + p.decayMax + 0.1);

        nodesToCleanup.push(osc, oscGain);
      });

      setTimeout(
        () => {
          nodesToCleanup.forEach(n => n.disconnect());
        },
        (duration + 0.2) * 1000
      );
    };

    const scheduleChime = () => {
      if (!this.isPlaying || this.currentNoiseType !== 'chimes') return;
      const delay = 1000 + Math.random() * 4000;
      const id = window.setTimeout(() => {
        playChime();
        scheduleChime();
      }, delay);
      this.activeIntervals.push(id);
    };
    scheduleChime();
  }

  // --- New Scenes ---

  private playWaterfall() {
    if (!this.ctx || !this.masterGain) return;

    // Brown rush
    const brown = this.createNoiseBuffer('brown');
    if (brown) {
      const src = this.ctx.createBufferSource();
      src.buffer = brown;
      src.loop = true;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 400;
      const g = this.ctx.createGain();
      g.gain.value = 0.4;
      src.connect(lp);
      lp.connect(g);
      g.connect(this.masterGain);
      src.start();
      this.addMicroLFO(g.gain, 0.1, 0.1);
      this.activeNodes.push(src, lp, g);
    }

    // Pink babble
    const pink = this.createNoiseBuffer('pink');
    if (pink) {
      const src = this.ctx.createBufferSource();
      src.buffer = pink;
      src.loop = true;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1200;
      bp.Q.value = 0.8;
      const g = this.ctx.createGain();
      g.gain.value = 0.15;
      src.connect(bp);
      bp.connect(g);
      g.connect(this.masterGain);
      src.start();
      this.addMicroLFO(bp.frequency, 0.15, 200);
      this.activeNodes.push(src, bp, g);
    }
  }

  private playCityRain() {
    this.playRain(true);
    if (!this.ctx || !this.masterGain) return;

    // Distant traffic whoosh
    const playWhoosh = () => {
      if (!this.ctx || !this.isPlaying || this.currentNoiseType !== 'cityRain') return;
      const t = this.ctx.currentTime;
      const brown = this.createNoiseBuffer('brown');
      if (!brown) return;

      const src = this.ctx.createBufferSource();
      src.buffer = brown;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 200;
      const pan = this.ctx.createStereoPanner();
      const g = this.ctx.createGain();
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
      g.connect(this.masterGain!);
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
      if (!this.isPlaying || this.currentNoiseType !== 'cityRain') return;
      const id = window.setTimeout(
        () => {
          playWhoosh();
          scheduleWhoosh();
        },
        5000 + Math.random() * 10000
      );
      this.activeIntervals.push(id);
    };
    scheduleWhoosh();
  }

  private playGreenNoise() {
    if (!this.ctx || !this.masterGain) return;
    const buffer = this.createNoiseBuffer('pink');
    if (buffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1000;
      bp.Q.value = 1.0;
      const g = this.ctx.createGain();
      g.gain.value = 0.6;
      src.connect(bp);
      bp.connect(g);
      g.connect(this.masterGain);
      src.start();
      this.activeNodes.push(src, bp, g);
    }
  }

  private playAirplane() {
    if (!this.ctx || !this.masterGain) return;
    // Low brown engine
    const brown = this.createNoiseBuffer('brown');
    if (brown) {
      const src = this.ctx.createBufferSource();
      src.buffer = brown;
      src.loop = true;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 150;
      const g = this.ctx.createGain();
      g.gain.value = 0.4;
      src.connect(lp);
      lp.connect(g);
      g.connect(this.masterGain);
      src.start();
      this.addMicroLFO(g.gain, 0.05, 0.05);
      this.activeNodes.push(src, lp, g);
    }
    // Pink air hiss
    const pink = this.createNoiseBuffer('pink');
    if (pink) {
      const src = this.ctx.createBufferSource();
      src.buffer = pink;
      src.loop = true;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1000;
      const g = this.ctx.createGain();
      g.gain.value = 0.1;
      src.connect(hp);
      hp.connect(g);
      g.connect(this.masterGain);
      src.start();
      this.activeNodes.push(src, hp, g);
    }
  }

  private playCatPurr() {
    if (!this.ctx || !this.masterGain) return;

    // The breathing cycle (in and out)
    const breathLfo = this.ctx.createOscillator();
    breathLfo.type = 'sine';
    breathLfo.frequency.value = 0.35; // ~2.8s breath cycle

    const breathGain = this.ctx.createGain();
    // Swell volume up and down. This will modulate the base purr volume.
    breathGain.gain.value = 0.3;

    // Pitch modulation for breathing (cats purr pitch changes slightly when breathing in vs out)
    const pitchModGain = this.ctx.createGain();
    pitchModGain.gain.value = 2; // +/- 2Hz shift

    breathLfo.connect(breathGain);
    breathLfo.connect(pitchModGain);

    // 1. The Motor (Low frequency oscillators sound exactly like a cat's "engine")
    const purrFreq = 26 + Math.random() * 2;

    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = purrFreq;

    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sawtooth';
    // Slight detune for organic beating, making it less synthetic
    osc2.frequency.value = purrFreq * 1.05;

    pitchModGain.connect(osc1.frequency);
    pitchModGain.connect(osc2.frequency);

    const purrFilter = this.ctx.createBiquadFilter();
    purrFilter.type = 'lowpass';
    // Muffle the harsh highs of the saw wave, leaving just the low vibration
    purrFilter.frequency.value = 250;

    // Add slight resonance to mimic the throat cavity
    purrFilter.Q.value = 2;

    const purrVolume = this.ctx.createGain();
    // Base volume
    purrVolume.gain.value = 0.4;

    // Connect breathing volume AM to purr
    breathGain.connect(purrVolume.gain);

    osc1.connect(purrFilter);
    osc2.connect(purrFilter);
    purrFilter.connect(purrVolume);
    purrVolume.connect(this.masterGain);

    osc1.start();
    osc2.start();
    breathLfo.start();

    this.activeNodes.push(osc1, osc2, purrFilter, purrVolume, breathLfo, breathGain, pitchModGain);

    // 2. Subtle Meows
    const playMeow = () => {
      if (!this.ctx || !this.masterGain || !this.isPlaying || this.currentNoiseType !== 'catPurr') return;

      const t = this.ctx.currentTime;
      // Duration of meow
      const duration = 0.8 + Math.random() * 0.6;

      const meowOsc = this.ctx.createOscillator();
      // Triangle for a smooth, less synthetic voice
      meowOsc.type = 'triangle';

      // Pitch contour (Start low, dip up, and go back down)
      const startFreq = 350 + Math.random() * 100;
      const peakFreq = startFreq + 100 + Math.random() * 80;
      const endFreq = startFreq - 50;

      meowOsc.frequency.setValueAtTime(startFreq, t);
      meowOsc.frequency.exponentialRampToValueAtTime(peakFreq, t + duration * 0.3);
      meowOsc.frequency.exponentialRampToValueAtTime(endFreq, t + duration);

      // Volume contour (very subtle/soft)
      const meowGain = this.ctx.createGain();
      meowGain.gain.setValueAtTime(0, t);
      // Swell up softly
      const peakGain = 0.01 + Math.random() * 0.02; // Very quiet!
      meowGain.gain.linearRampToValueAtTime(peakGain, t + duration * 0.4);
      // Fade out
      meowGain.gain.exponentialRampToValueAtTime(0.001, t + duration);

      meowOsc.connect(meowGain);
      meowGain.connect(this.masterGain!);

      meowOsc.start(t);
      meowOsc.stop(t + duration);

      this.activeNodes.push(meowOsc, meowGain);

      // Schedule next meow
      this.activeIntervals.push(
        window.setTimeout(() => {
          if (this.isPlaying && this.currentNoiseType === 'catPurr') {
            playMeow();
          }
        }, (20 + Math.random() * 60) * 1000) // Occasional, 20-80s
      );
    };

    // Delay the first meow
    this.activeIntervals.push(window.setTimeout(playMeow, (10 + Math.random() * 20) * 1000));
  }

  private playASMR() {
    if (!this.ctx || !this.masterGain) return;
    this.playNoiseSource('pink', 0.05);

    const playImpulse = () => {
      if (!this.ctx || !this.isPlaying || this.currentNoiseType !== 'asmr') return;
      const t = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.createNoiseBuffer('white')!;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 5000;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.02, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.01);
      src.connect(hp);
      hp.connect(g);
      g.connect(this.masterGain!);
      src.start(t, Math.random() * 9);
      src.stop(t + 0.05);
      setTimeout(() => {
        src.disconnect();
        hp.disconnect();
        g.disconnect();
      }, 100);
    };

    const scheduleImpulse = () => {
      if (!this.isPlaying || this.currentNoiseType !== 'asmr') return;
      const id = window.setTimeout(
        () => {
          playImpulse();
          scheduleImpulse();
        },
        100 + Math.random() * 2000
      );
      this.activeIntervals.push(id);
    };
    scheduleImpulse();
  }

  private playSpace() {
    if (!this.ctx || !this.masterGain) return;
    const brown = this.createNoiseBuffer('brown');
    if (brown) {
      const src = this.ctx.createBufferSource();
      src.buffer = brown;
      src.loop = true;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 100;
      const g = this.ctx.createGain();
      g.gain.value = 0.5;
      src.connect(lp);
      lp.connect(g);
      g.connect(this.masterGain);
      src.start();
      this.activeNodes.push(src, lp, g);
    }
    const pink = this.createNoiseBuffer('pink');
    if (pink) {
      const src = this.ctx.createBufferSource();
      src.buffer = pink;
      src.loop = true;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 500;
      bp.Q.value = 10;
      const g = this.ctx.createGain();
      g.gain.value = 0.05;
      src.connect(bp);
      bp.connect(g);
      g.connect(this.masterGain);
      src.start();
      this.addMicroLFO(bp.frequency, 0.05, 400);
      this.activeNodes.push(src, bp, g);
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
      case 'waterfall':
        this.playWaterfall();
        break;
      case 'cityRain':
        this.playCityRain();
        break;
      case 'greenNoise':
        this.playGreenNoise();
        break;
      case 'airplane':
        this.playAirplane();
        break;
      case 'catPurr':
        this.playCatPurr();
        break;
      case 'asmr':
        this.playASMR();
        break;
      case 'space':
        this.playSpace();
        break;
      default:
        this.playNoiseSource('pink');
    }
  }

  stop() {
    this.activeNodes.forEach((node) => {
      try {
        if ((node as any).stop) {
          (node as any).stop();
        }
        node.disconnect();
      } catch (e) { }
    });
    this.activeNodes = [];
    this.activeIntervals.forEach((id) => {
      clearTimeout(id);
      clearInterval(id);
    });
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
