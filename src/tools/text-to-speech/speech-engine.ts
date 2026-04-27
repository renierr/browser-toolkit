export interface TTSOptions {
  voiceIndex: number;
  rate: number;
  pitch: number;
  volume: number;
}

export class SpeechEngine {
  private synth: SpeechSynthesis | null;
  private voices: SpeechSynthesisVoice[] = [];

  constructor() {
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
  }

  public isSupported(): boolean {
    return !!this.synth;
  }

  public async loadVoices(): Promise<SpeechSynthesisVoice[]> {
    return new Promise((resolve) => {
      if (!this.synth) {
        resolve([]);
        return;
      }

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
          if (attempts > 20 && this.voices.length === 0) {
            resolve([]);
          }
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

    // 1. Clear everything
    this.synth.cancel();

    // 2. Short wait before starting new synthesis
    setTimeout(() => {
      if (!text.trim()) return;

      const utterance = new SpeechSynthesisUtterance(text);

      if (options.voiceIndex >= 0 && this.voices[options.voiceIndex]) {
        utterance.voice = this.voices[options.voiceIndex];
        utterance.lang = this.voices[options.voiceIndex].lang;
      } else {
        utterance.lang = navigator.language || 'en-US';
      }

      utterance.rate = options.rate;
      utterance.pitch = options.pitch;
      utterance.volume = options.volume;

      utterance.onend = () => onEnd?.();
      utterance.onerror = (e) => {
        console.error('[SpeechEngine] Error Event:', e);
        if (e.error === 'synthesis-failed') {
          console.warn('[SpeechEngine] Retrying with aggressive reset...');
          this.speakMinimal(text, onEnd, onError);
        } else {
          onError?.(`Error: ${e.error || 'Unknown'}`);
        }
      };

      try {
        this.synth!.speak(utterance);
        // Force state to resume
        this.synth!.resume();
      } catch (e) {
        console.error('[SpeechEngine] Speak Exception:', e);
        onError?.('Playback exception.');
      }
    }, 150);
  }

  private speakMinimal(text: string, onEnd?: () => void, onError?: (msg: string) => void): void {
    if (!this.synth) return;

    this.synth.cancel();
    setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(text);
      // Absolute defaults, no custom voice/rate/etc
      utterance.onend = () => onEnd?.();
      utterance.onerror = (e) => {
        console.error('[SpeechEngine] Minimal fallback failed:', e);
        onError?.('System TTS failed. On Linux: check speech-dispatcher.');
      };
      this.synth!.speak(utterance);
      this.synth!.resume();
    }, 200);
  }

  public stop(): void {
    this.synth?.cancel();
  }
}
