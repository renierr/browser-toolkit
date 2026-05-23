export interface BgTimerHandle {
  readonly id: string;
  start(seconds: number, callbacks: BgTimerCallbacks, options?: BgTimerStartOptions): void;
  cancel(): void;
  getRemaining(): number;
  isRunning(): boolean;
}

export interface BgTimerCallbacks {
  onTick?(remaining: number): void;
  onComplete?(): void;
}

export interface BgTimerStartOptions {
  suppressNotification?: boolean;
}

let nextId = 0;

class BackgroundTimerEngine {
  private audioCtx: AudioContext | null = null;
  private silentOsc: OscillatorNode | null = null;
  private silentGain: GainNode | null = null;
  private refCount = 0;

  private getCtx(): AudioContext | null {
    if (!this.audioCtx) {
      try {
        const AC =
          window.AudioContext ||
          (window as never as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.audioCtx = new AC();
      } catch {
        return null;
      }
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  private ensureSilentAudio(): void {
    this.refCount++;
    if (this.silentOsc) return;
    const ctx = this.getCtx();
    if (!ctx) return;
    try {
      this.silentOsc = ctx.createOscillator();
      this.silentGain = ctx.createGain();
      this.silentOsc.frequency.setValueAtTime(1, ctx.currentTime);
      this.silentGain.gain.setValueAtTime(0.001, ctx.currentTime);
      this.silentOsc.connect(this.silentGain);
      this.silentGain.connect(ctx.destination);
      this.silentOsc.start();
    } catch {}
  }

  private releaseSilentAudio(): void {
    this.refCount = Math.max(0, this.refCount - 1);
    if (this.refCount > 0) return;
    if (this.silentOsc) {
      try {
        this.silentOsc.stop();
        this.silentOsc.disconnect();
      } catch {}
      this.silentOsc = null;
    }
    if (this.silentGain) {
      try {
        this.silentGain.disconnect();
      } catch {}
      this.silentGain = null;
    }
  }

  createTimer(): BgTimerHandle {
    const engine = this;
    const id = `bg-timer-${++nextId}-${Date.now()}`;
    let state: 'idle' | 'running' | 'finished' = 'idle';
    let callbacks: BgTimerCallbacks = {};
    let remaining = 0;
    let endTime = 0;
    let fallbackInterval: ReturnType<typeof setInterval> | null = null;
    let keepaliveInterval: ReturnType<typeof setInterval> | null = null;

    function swAvailable(): boolean {
      return 'serviceWorker' in navigator && navigator.serviceWorker.controller !== null;
    }

    function sendToSW(type: string, payload: Record<string, unknown> = {}) {
      if (!swAvailable()) return;
      navigator.serviceWorker.controller!.postMessage({ type, payload: { ...payload, id } });
    }

    function handleSWMessage(event: MessageEvent) {
      const { type, payload } = event.data || {};
      if (!payload || payload.id !== id) return;

      switch (type) {
        case 'bg-timer-tick': {
          remaining = Math.max(0, Math.ceil(payload.remaining / 1000));
          callbacks.onTick?.(remaining);
          break;
        }
        case 'bg-timer-finished': {
          remaining = 0;
          state = 'finished';
          callbacks.onComplete?.();
          cleanup();
          break;
        }
        case 'bg-timer-started': {
          state = 'running';
          remaining = payload.duration;
          break;
        }
        case 'bg-timer-cancelled': {
          state = 'idle';
          remaining = 0;
          cleanup();
          break;
        }
        case 'bg-timer-state': {
          remaining = Math.max(0, Math.ceil((payload.timeLeft || 0) / 1000));
          state = payload.isRunning ? 'running' : 'idle';
          endTime = payload.endTime || 0;
          if (state === 'running') {
            callbacks.onTick?.(remaining);
          }
          break;
        }
      }
    }

    function onSWMessage(event: MessageEvent) {
      handleSWMessage(event);
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible' && state === 'running') {
        requestStateFromSW();
      }
    }

    function requestStateFromSW() {
      if (!swAvailable()) return;
      sendToSW('bg-timer-get-state');
    }

    function startKeepalive(): void {
      if (keepaliveInterval) return;
      keepaliveInterval = setInterval(() => {
        if (state === 'running') {
          sendToSW('bg-timer-keepalive');
        }
      }, 15000);
    }

    function stopKeepalive(): void {
      if (keepaliveInterval) {
        clearInterval(keepaliveInterval);
        keepaliveInterval = null;
      }
    }

    function startFallback(seconds: number) {
      endTime = Date.now() + seconds * 1000;
      remaining = seconds;
      state = 'running';

      if (fallbackInterval) clearInterval(fallbackInterval);
      fallbackInterval = setInterval(() => {
        const r = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
        if (r !== remaining) {
          remaining = r;
          callbacks.onTick?.(remaining);
        }
        if (remaining <= 0) {
          state = 'finished';
          callbacks.onComplete?.();
          cleanup();
        }
      }, 200);
    }

    function stopFallback() {
      if (fallbackInterval) {
        clearInterval(fallbackInterval);
        fallbackInterval = null;
      }
    }

    function stopKeepaliveAndSWListener() {
      stopKeepalive();
      navigator.serviceWorker.removeEventListener('message', onSWMessage);
    }

    function cleanup() {
      stopKeepaliveAndSWListener();
      stopFallback();
      engine.releaseSilentAudio();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    }

    return {
      id,

      start(seconds: number, cb: BgTimerCallbacks, options?: BgTimerStartOptions) {
        cleanup();
        callbacks = cb;
        remaining = seconds;
        state = 'running';
        endTime = Date.now() + seconds * 1000;

        if (swAvailable()) {
          navigator.serviceWorker.addEventListener('message', onSWMessage);
          sendToSW('bg-timer-start', {
            duration: seconds,
            suppressNotification: !!options?.suppressNotification,
          });
          document.addEventListener('visibilitychange', onVisibilityChange);
          engine.ensureSilentAudio();
          startKeepalive();
        } else {
          startFallback(seconds);
        }
      },

      cancel() {
        if (state === 'running') {
          sendToSW('bg-timer-cancel');
        }
        state = 'idle';
        remaining = 0;
        cleanup();
      },

      getRemaining(): number {
        if (state !== 'running') return remaining;
        if (endTime > 0) {
          return Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
        }
        return remaining;
      },

      isRunning(): boolean {
        return state === 'running';
      },
    };
  }
}

export const backgroundTimer = new BackgroundTimerEngine();
