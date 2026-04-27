export interface TTSOptions {
  voiceIndex: number;
  rate: number;
  pitch: number;
  volume: number;
}

export class SpeechEngine {
  private synth: SpeechSynthesis;
  private voices: SpeechSynthesisVoice[] = [];

  constructor() {
    this.synth = window.speechSynthesis;
  }

  public async loadVoices(): Promise<SpeechSynthesisVoice[]> {
    return new Promise((resolve) => {
      let voices = this.synth.getVoices();
      if (voices.length > 0) {
        this.voices = voices;
        resolve(voices);
      } else {
        this.synth.onvoiceschanged = () => {
          this.voices = this.synth.getVoices();
          resolve(this.voices);
        };
      }
    });
  }

  public getVoices(): SpeechSynthesisVoice[] {
    return this.voices;
  }

  public speak(
    text: string,
    options: TTSOptions,
    onEnd?: () => void,
    onError?: (err: any) => void
  ): void {
    this.stop();

    if (!text.trim()) return;

    const utterance = new SpeechSynthesisUtterance(text);
    const selectedVoice = this.voices[options.voiceIndex];

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    utterance.rate = options.rate;
    utterance.pitch = options.pitch;
    utterance.volume = options.volume;

    utterance.onend = () => {
      if (onEnd) onEnd();
    };

    utterance.onerror = (event) => {
      console.error('[SpeechEngine] Error:', event);
      if (onError) onError(event);
    };

    this.synth.speak(utterance);
  }

  public pause(): void {
    this.synth.pause();
  }

  public resume(): void {
    this.synth.resume();
  }

  public stop(): void {
    this.synth.cancel();
  }

  public isSpeaking(): boolean {
    return this.synth.speaking;
  }

  public isPaused(): boolean {
    return this.synth.paused;
  }
}
