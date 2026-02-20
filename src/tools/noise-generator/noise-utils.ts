export class NoiseGenerator {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
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

    const bufferSize = 2 * this.ctx.sampleRate; // 2 seconds buffer
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);

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
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        output[i] *= 0.11; // (roughly) compensate for gain
        b6 = white * 0.115926;
      }
    } else if (type === 'brown') {
      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        output[i] = (lastOut + (0.02 * white)) / 1.02;
        lastOut = output[i];
        output[i] *= 3.5; // (roughly) compensate for gain
      }
    }
    return buffer;
  }

  private playNoiseSource(type: 'white' | 'pink' | 'brown', gainVal: number = 1.0): AudioNode | null {
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

    // Layer 1: Pink noise (Hiss)
    const pinkBuffer = this.createNoiseBuffer('pink');
    if (pinkBuffer) {
        const source = this.ctx.createBufferSource();
        source.buffer = pinkBuffer;
        source.loop = true;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 800; // Muffle it a bit

        const gain = this.ctx.createGain();
        gain.gain.value = 0.6;

        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        source.start();
        this.activeNodes.push(source, filter, gain);
    }

    // Layer 2: Brown noise (Rumble)
    const brownBuffer = this.createNoiseBuffer('brown');
    if (brownBuffer) {
        const source = this.ctx.createBufferSource();
        source.buffer = brownBuffer;
        source.loop = true;

        const gain = this.ctx.createGain();
        gain.gain.value = 0.3;

        source.connect(gain);
        gain.connect(this.masterGain);
        source.start();
        this.activeNodes.push(source, gain);
    }
  }

  private playWaves() {
    if (!this.ctx || !this.masterGain) return;

    const buffer = this.createNoiseBuffer('brown');
    if (!buffer) return;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    // Filter to smooth out the brown noise
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1000;

    // Gain node to be modulated
    const waveGain = this.ctx.createGain();
    waveGain.gain.value = 0.4; // Base gain

    // LFO to modulate volume
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.15; // ~6.6 seconds period

    // Scale LFO output to affect gain
    // We want gain to oscillate between ~0.1 and ~0.7
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.3; // Modulation depth

    lfo.connect(lfoGain);
    lfoGain.connect(waveGain.gain);

    source.connect(filter);
    filter.connect(waveGain);
    waveGain.connect(this.masterGain);

    source.start();
    lfo.start();

    this.activeNodes.push(source, filter, waveGain, lfo, lfoGain);
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
        gain.gain.value = 0.2;

        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        source.start();
        this.activeNodes.push(source, filter, gain);
    }

    // 2. Birds (Random Chirps)
    const playChirp = () => {
        if (!this.ctx || !this.masterGain || !this.isPlaying) return;

        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        // Randomize bird properties
        const startFreq = 1500 + Math.random() * 1000;
        const endFreq = startFreq + (Math.random() * 500 - 250);
        const duration = 0.1 + Math.random() * 0.1;

        osc.type = Math.random() > 0.5 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(startFreq, t);
        osc.frequency.linearRampToValueAtTime(endFreq, t + duration);

        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.1, t + 0.02); // Attack
        gain.gain.linearRampToValueAtTime(0, t + duration); // Decay

        osc.connect(gain);
        gain.connect(this.masterGain!);

        osc.start(t);
        osc.stop(t + duration + 0.1);

        // Cleanup node references after playing
        setTimeout(() => {
            osc.disconnect();
            gain.disconnect();
        }, (duration + 0.2) * 1000);
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
        filter.frequency.value = 500; // Deep rumble

        const gain = this.ctx.createGain();
        gain.gain.value = 0.8;

        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        source.start();
        this.activeNodes.push(source, filter, gain);
    }

    // 2. Crackling (Random clicks)
    const playCrackle = () => {
        if (!this.ctx || !this.masterGain || !this.isPlaying) return;

        const t = this.ctx.currentTime;
        const buffer = this.createNoiseBuffer('white'); // Use white noise for sharp clicks
        if (!buffer) return;

        const source = this.ctx.createBufferSource();
        source.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 1000;

        const gain = this.ctx.createGain();
        // Short envelope
        const duration = 0.05 + Math.random() * 0.05;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.5 + Math.random() * 0.5, t + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.01, t + duration);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain!);

        source.start(t);
        source.stop(t + duration + 0.1);

        // Cleanup
        setTimeout(() => {
            source.disconnect();
            filter.disconnect();
            gain.disconnect();
        }, (duration + 0.2) * 1000);
    };

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
        gain.gain.value = 0.1; // Very quiet

        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        source.start();
        this.activeNodes.push(source, filter, gain);
    }

    // 2. Crickets
    const playCricket = () => {
        if (!this.ctx || !this.masterGain || !this.isPlaying) return;
        const t = this.ctx.currentTime;

        // Carrier (High pitch)
        const carrier = this.ctx.createOscillator();
        carrier.type = 'sine';
        carrier.frequency.value = 4500 + Math.random() * 200;

        // Modulator (Rapid amplitude modulation for the "trill")
        const modulator = this.ctx.createOscillator();
        modulator.type = 'square';
        modulator.frequency.value = 30; // 30Hz trill

        const modGain = this.ctx.createGain();
        modGain.gain.value = 1000; // Depth

        const mainGain = this.ctx.createGain();

        // Envelope for the chirp
        const duration = 0.15;
        mainGain.gain.setValueAtTime(0, t);
        mainGain.gain.linearRampToValueAtTime(0.15, t + 0.02);
        mainGain.gain.linearRampToValueAtTime(0, t + duration);

        // Connections: Modulator -> ModGain -> Carrier.frequency (FM synthesis for texture)
        // Or AM synthesis: Modulator -> GainNode controlling Carrier volume.
        // Let's do simple AM: Carrier -> Gain -> Destination. Gain controlled by Modulator.
        // Actually, simple sine wave with envelope is often enough, but let's add FM for texture.

        modulator.connect(modGain);
        modGain.connect(carrier.frequency);

        carrier.connect(mainGain);
        mainGain.connect(this.masterGain!);

        carrier.start(t);
        modulator.start(t);
        carrier.stop(t + duration + 0.1);
        modulator.stop(t + duration + 0.1);

        setTimeout(() => {
            carrier.disconnect();
            modulator.disconnect();
            modGain.disconnect();
            mainGain.disconnect();
        }, (duration + 0.2) * 1000);
    };

    const scheduleCricket = () => {
        if (!this.isPlaying) return;
        const delay = 500 + Math.random() * 1500;
        const id = window.setTimeout(() => {
            // Play a few chirps in a row
            const chirps = 1 + Math.floor(Math.random() * 3);
            for(let i=0; i<chirps; i++) {
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
        filter.frequency.value = 400;

        const gain = this.ctx.createGain();
        gain.gain.value = 0.6;

        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        source.start();
        this.activeNodes.push(source, filter, gain);
    }

    // 2. Motor Hum (Sine waves)
    const hum1 = this.ctx.createOscillator();
    hum1.frequency.value = 100; // 100Hz hum
    const hum1Gain = this.ctx.createGain();
    hum1Gain.gain.value = 0.05;

    const hum2 = this.ctx.createOscillator();
    hum2.frequency.value = 50; // Sub hum
    const hum2Gain = this.ctx.createGain();
    hum2Gain.gain.value = 0.05;

    hum1.connect(hum1Gain);
    hum1Gain.connect(this.masterGain);
    hum1.start();

    hum2.connect(hum2Gain);
    hum2Gain.connect(this.masterGain);
    hum2.start();

    this.activeNodes.push(hum1, hum1Gain, hum2, hum2Gain);
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
    this.activeNodes.forEach(node => {
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
    this.activeIntervals.forEach(id => clearTimeout(id));
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
