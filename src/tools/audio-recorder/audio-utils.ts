export class AudioRecorder {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private analyser: AnalyserNode | null = null;
  private recordingStartTime: number = 0;
  private recordingInterval: number | null = null;
  private onTimerUpdate: ((time: string) => void) | null = null;
  private onStop: ((url: string, date: Date) => void) | null = null;

  constructor(
    onTimerUpdate?: (time: string) => void,
    onStop?: (url: string, date: Date) => void
  ) {
    this.onTimerUpdate = onTimerUpdate || null;
    this.onStop = onStop || null;
  }

  async start(): Promise<AnalyserNode | null> {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      source.connect(this.analyser);

      this.mediaRecorder = new MediaRecorder(this.mediaStream);
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        this.audioChunks.push(event.data);
      };

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        if (this.onStop) {
          this.onStop(audioUrl, new Date());
        }
      };

      this.mediaRecorder.start();
      this.recordingStartTime = Date.now();
      this.updateTimer();
      this.recordingInterval = window.setInterval(() => this.updateTimer(), 1000);

      return this.analyser;

    } catch (err) {
      console.error('Error accessing microphone:', err);
      throw err;
    }
  }

  stop() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
    }
    if (this.recordingInterval) {
      clearInterval(this.recordingInterval);
      this.recordingInterval = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  private updateTimer() {
    const elapsed = Math.floor((Date.now() - this.recordingStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');
    if (this.onTimerUpdate) {
      this.onTimerUpdate(`${minutes}:${seconds}`);
    }
  }
}

export class NoiseGenerator {
  private noiseContext: AudioContext | null = null;
  private noiseSource: AudioBufferSourceNode | null = null;
  private noiseGain: GainNode | null = null;
  private currentNoiseType: string | null = null;
  private isPlaying = false;
  private volume: number = 0.5;

  constructor(initialVolume: number = 0.5) {
    this.volume = initialVolume;
  }

  private initContext() {
    if (!this.noiseContext) {
      this.noiseContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.noiseGain = this.noiseContext.createGain();
      this.noiseGain.connect(this.noiseContext.destination);
      this.noiseGain.gain.value = this.volume;
    }
  }

  private createBuffer(type: string): AudioBuffer | null {
    if (!this.noiseContext) return null;

    const bufferSize = 2 * this.noiseContext.sampleRate; // 2 seconds buffer
    const buffer = this.noiseContext.createBuffer(1, bufferSize, this.noiseContext.sampleRate);
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
    } else {
      // Fallback for now:
      if (type === 'rain') return this.createBuffer('pink'); // Rain is close to pink
      if (type === 'forest') return this.createBuffer('pink'); // Wind in trees is pink-ish
      if (type === 'waves') return this.createBuffer('brown'); // Waves are brown-ish
    }

    return buffer;
  }

  play(type: string) {
    this.initContext();
    if (!this.noiseContext || !this.noiseGain) return;

    if (this.isPlaying) {
      this.stop();
    }

    const buffer = this.createBuffer(type);
    if (!buffer) return;

    this.noiseSource = this.noiseContext.createBufferSource();
    this.noiseSource.buffer = buffer;
    this.noiseSource.loop = true;
    this.noiseSource.connect(this.noiseGain);
    this.noiseSource.start();

    this.isPlaying = true;
    this.currentNoiseType = type;
  }

  stop() {
    if (this.noiseSource) {
      this.noiseSource.stop();
      this.noiseSource.disconnect();
      this.noiseSource = null;
    }
    this.isPlaying = false;
  }

  setVolume(value: number) {
    this.volume = value;
    if (this.noiseGain) {
      this.noiseGain.gain.value = this.volume;
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
    if (this.noiseContext) {
      this.noiseContext.close();
      this.noiseContext = null;
    }
  }
}
