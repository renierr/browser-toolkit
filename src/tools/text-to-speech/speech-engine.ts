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

  public speak(text: string, options: TTSOptions, onEnd?: () => void, onError?: (msg: string) => void): void {
    if (!this.synth) return;
    
    // 1. Clear any pending speech
    this.synth.cancel();

    // 2. Delay slightly to allow the engine to reset (Crucial for Chrome/Linux/Android)
    setTimeout(() => {
      if (!text.trim()) return;

      const utterance = new SpeechSynthesisUtterance(text);
      
      if (options.voiceIndex >= 0 && this.voices[options.voiceIndex]) {
        utterance.voice = this.voices[options.voiceIndex];
        utterance.lang = this.voices[options.voiceIndex].lang;
      } else {
        // Fallback to browser language
        utterance.lang = navigator.language || 'en-US';
      }

      utterance.rate = options.rate;
      utterance.pitch = options.pitch;
      utterance.volume = options.volume;

      utterance.onend = () => onEnd?.();
      utterance.onerror = (e) => {
        console.error('[SpeechEngine] Error Event:', e);
        // If we failed, try one last time with absolute defaults
        if (e.error === 'synthesis-failed') {
          console.warn('[SpeechEngine] Retrying with minimal settings...');
          this.speakMinimal(text, onEnd, onError);
        } else {
          onError?.(`Error: ${e.error || 'Unknown'}`);
        }
      };

      try {
        this.synth!.speak(utterance);
        // 3. Force resume in case the engine is stuck (Common on Linux/Chrome)
        if (this.synth!.paused) {
          this.synth!.resume();
        }
      } catch (e) {
        console.error('[SpeechEngine] Speak Exception:', e);
        onError?.('Playback exception.');
      }
    }, 100);
  }

  // A "super safe" fallback mode
  private speakMinimal(text: string, onEnd?: () => void, onError?: (msg: string) => void): void {
    if (!this.synth) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => onEnd?.();
    utterance.onerror = () => onError?.('System TTS failed even in Safe Mode.');
    this.synth.speak(utterance);
    this.synth.resume();
  }

  public stop(): void {
    this.synth?.cancel();
  }
}
