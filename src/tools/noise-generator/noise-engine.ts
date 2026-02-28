export interface NoiseLayerConfig {
  type: 'white' | 'pink' | 'brown';
  filter?: { type: BiquadFilterType; freq: number; Q?: number };
  pan?: number;
  gain: number;
  startTime?: number;
  offset?: number;
}

export interface OscillatorLayerConfig {
  type: OscillatorType;
  freq: number;
  filter?: { type: BiquadFilterType; freq: number; Q?: number };
  pan?: number;
  gain: number;
  startTime?: number;
}

export class NoiseEngine {
  public ctx: AudioContext | null = null;
  public masterGain: GainNode | null = null;
  private noiseBuffers: Map<string, AudioBuffer> = new Map();
  public activeNodes: AudioNode[] = [];
  public activeIntervals: number[] = [];
  private volume: number = 0.5;

  constructor(initialVolume: number = 0.5) {
    this.volume = initialVolume;
  }

  public initContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      this.masterGain.gain.value = this.volume;
    }
  }

  public createNoiseBuffer(type: 'white' | 'pink' | 'brown'): AudioBuffer | null {
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

  public addMicroLFO(target: AudioParam, baseRate = 0.08, depth = 0.12) {
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

  public createNoiseLayer(config: NoiseLayerConfig) {
    if (!this.ctx || !this.masterGain) return null;
    const buffer = this.createNoiseBuffer(config.type);
    if (!buffer) return null;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    let currentNode: AudioNode = source;
    let filterNode: BiquadFilterNode | undefined;
    let pannerNode: StereoPannerNode | undefined;

    if (config.filter) {
      filterNode = this.ctx.createBiquadFilter();
      filterNode.type = config.filter.type;
      filterNode.frequency.value = config.filter.freq;
      if (config.filter.Q !== undefined) filterNode.Q.value = config.filter.Q;
      currentNode.connect(filterNode);
      currentNode = filterNode;
      this.activeNodes.push(filterNode);
    }

    if (config.pan !== undefined) {
      pannerNode = this.ctx.createStereoPanner();
      pannerNode.pan.value = config.pan;
      currentNode.connect(pannerNode);
      currentNode = pannerNode;
      this.activeNodes.push(pannerNode);
    }

    const gainNode = this.ctx.createGain();
    gainNode.gain.value = config.gain;
    currentNode.connect(gainNode);
    gainNode.connect(this.masterGain);

    source.start(config.startTime || 0, config.offset || 0);
    this.activeNodes.push(source, gainNode);

    return { source, gain: gainNode, filter: filterNode, panner: pannerNode };
  }

  public createOscillatorLayer(config: OscillatorLayerConfig) {
    if (!this.ctx || !this.masterGain) return null;

    const source = this.ctx.createOscillator();
    source.type = config.type;
    source.frequency.value = config.freq;

    let currentNode: AudioNode = source;
    let filterNode: BiquadFilterNode | undefined;
    let pannerNode: StereoPannerNode | undefined;

    if (config.filter) {
      filterNode = this.ctx.createBiquadFilter();
      filterNode.type = config.filter.type;
      filterNode.frequency.value = config.filter.freq;
      if (config.filter.Q !== undefined) filterNode.Q.value = config.filter.Q;
      currentNode.connect(filterNode);
      currentNode = filterNode;
      this.activeNodes.push(filterNode);
    }

    if (config.pan !== undefined) {
      pannerNode = this.ctx.createStereoPanner();
      pannerNode.pan.value = config.pan;
      currentNode.connect(pannerNode);
      currentNode = pannerNode;
      this.activeNodes.push(pannerNode);
    }

    const gainNode = this.ctx.createGain();
    gainNode.gain.value = config.gain;
    currentNode.connect(gainNode);
    gainNode.connect(this.masterGain);

    source.start(config.startTime || 0);
    this.activeNodes.push(source, gainNode);

    return { source, gain: gainNode, filter: filterNode, panner: pannerNode };
  }

  public stop() {
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
  }

  public setVolume(value: number) {
    this.volume = value;
    if (this.masterGain) {
      this.masterGain.gain.value = this.volume;
    }
  }
}
