export interface TTSOptions {
  voiceIndex: number;
  rate: number;
  pitch: number;
  volume: number;
}

export class SpeechEngine {
  private synth: SpeechSynthesis | null;
  private voices: SpeechSynthesisVoice[] = [];
  private userStopped = false;

  constructor() {
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
  }

  public isSupported(): boolean {
    return !!this.synth;
  }

  public async loadVoices(): Promise<SpeechSynthesisVoice[]> {
    return new Promise((resolve) => {
      if (!this.synth) return resolve([]);

      const getAndResolve = () => {
        const voices = this.synth!.getVoices();
        if (voices && voices.length > 0) {
          this.voices = voices;
          resolve(voices);
          return true;
        }
        return false;
      };

      if (getAndResolve()) return;

      const onVoicesChanged = () => {
        if (getAndResolve()) {
          this.synth?.removeEventListener('voiceschanged', onVoicesChanged);
        }
      };
      this.synth.addEventListener('voiceschanged', onVoicesChanged);

      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (getAndResolve() || attempts > 20) {
          clearInterval(interval);
          this.synth?.removeEventListener('voiceschanged', onVoicesChanged);
          if (attempts > 20 && this.voices.length === 0) resolve([]);
        }
      }, 150);
    });
  }

  public speak(
    text: string,
    options: TTSOptions,
    onEnd?: () => void,
    onError?: (msg: string) => void
  ): void {
    if (!this.synth) return;

    this.userStopped = false;
    this.synth.cancel();

    setTimeout(() => {
      if (!text.trim()) return;

      const utterance = new SpeechSynthesisUtterance(text);

      if (options.voiceIndex >= 0 && this.voices[options.voiceIndex]) {
        utterance.voice = this.voices[options.voiceIndex];
        utterance.lang = this.voices[options.voiceIndex].lang;
        utterance.rate = options.rate;
        utterance.pitch = options.pitch;
        utterance.volume = options.volume;
      }

      utterance.onend = () => {
        this.userStopped = false;
        onEnd?.();
      };
      utterance.onerror = (e) => {
        if (this.userStopped) {
          this.userStopped = false;
          return;
        }

        if (e.error === 'interrupted' || e.error === 'canceled') {
          return;
        }

        if (e.error === 'synthesis-failed') {
          onError?.('Linux Synthesis Failed. Check speech-dispatcher and spd-conf.');
        } else {
          onError?.(`Error: ${e.error || 'Unknown'}`);
        }
      };

      this.synth!.speak(utterance);

      if (this.synth!.paused) {
        this.synth!.resume();
      }
    }, 50);
  }

  public stop(): void {
    this.userStopped = true;
    this.synth?.cancel();
  }

  public isSpeaking(): boolean {
    return this.synth?.speaking ?? false;
  }

  public isPaused(): boolean {
    return this.synth?.paused ?? false;
  }

  public pause(): void {
    if (!this.synth || this.synth.speaking === false) return;
    this.synth.pause();
  }

  public resume(): void {
    if (!this.synth || this.synth.paused === false) return;
    this.synth.resume();
  }
}
