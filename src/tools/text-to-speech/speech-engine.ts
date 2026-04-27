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
    console.log('[SpeechEngine] Initializing voice load...');
    
    return new Promise((resolve) => {
      if (!this.synth) {
        console.error('[SpeechEngine] SpeechSynthesis not supported in this browser.');
        resolve([]);
        return;
      }

      let resolved = false;
      const resolveOnce = (voices: SpeechSynthesisVoice[]) => {
        if (resolved) return;
        resolved = true;
        this.voices = voices;
        clearInterval(interval);
        if (this.synth) {
          this.synth.removeEventListener('voiceschanged', onVoicesChanged);
        }
        console.log(`[SpeechEngine] Loaded ${voices.length} voices.`);
        resolve(voices);
      };

      const checkVoices = () => {
        if (!this.synth) return false;
        const voices = this.synth.getVoices();
        if (voices && voices.length > 0) {
          resolveOnce(voices);
          return true;
        }
        return false;
      };

      const onVoicesChanged = () => {
        console.log('[SpeechEngine] voiceschanged event received.');
        checkVoices();
      };

      // Listen for the event
      this.synth.addEventListener('voiceschanged', onVoicesChanged);

      // Polling fallback (crucial for Chrome/Linux)
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (checkVoices() || attempts > 30) { // 3 seconds timeout
          if (attempts > 30 && !resolved) {
            console.warn('[SpeechEngine] Voice load timed out.');
            resolveOnce([]);
          }
        }
      }, 100);

      // Kickstart: some browsers need a dummy utterance to wake up the engine
      try {
        const dummy = new SpeechSynthesisUtterance('');
        this.synth.speak(dummy);
        this.synth.cancel();
      } catch (e) {
        console.error('[SpeechEngine] Kickstart failed', e);
      }

      // Initial check
      checkVoices();
    });
  }

  public getVoices(): SpeechSynthesisVoice[] {
    return this.voices;
  }

  public speak(text: string, options: TTSOptions, onEnd?: () => void, onError?: (err: any) => void): void {
    if (!this.synth) return;
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
      console.error('[SpeechEngine] Playback error:', event);
      if (onError) onError(event);
    };

    this.synth.speak(utterance);
  }

  public pause(): void {
    this.synth?.pause();
  }

  public resume(): void {
    this.synth?.resume();
  }

  public stop(): void {
    this.synth?.cancel();
  }
}
