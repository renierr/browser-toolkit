import type {
  PromptApiAvailability,
  PromptApiGlobal,
  PromptInput,
  PromptApiMonitor,
  PromptApiSession,
  PromptSessionOptions,
} from './types';

export type StreamHandlers = {
  onChunk: (chunk: string) => void;
};

export type InitResult = {
  availability: PromptApiAvailability;
  session: PromptApiSession | null;
};

export type ContextTelemetry = {
  usage: number | null;
  window: number | null;
  percent: number | null;
};

export class PromptSessionManager {
  private readonly api: PromptApiGlobal;
  private readonly options: PromptSessionOptions;
  private session: PromptApiSession | null = null;
  private contextOverflowListener: ((event: Event) => void) | null = null;

  public constructor(api: PromptApiGlobal, options: PromptSessionOptions) {
    this.api = api;
    this.options = options;
  }

  public async checkAvailability(): Promise<PromptApiAvailability> {
    return this.api.availability(this.options);
  }

  public async init(onDownloadProgress: (percent: number) => void): Promise<InitResult> {
    const availability = await this.checkAvailability();

    if (availability === 'unavailable') {
      return { availability, session: null };
    }

    this.destroy();

    this.session = await this.api.create({
      ...this.options,
      monitor: (monitor: PromptApiMonitor) => {
        monitor.addEventListener('downloadprogress', (event) => {
          const loaded = typeof event.loaded === 'number' ? event.loaded : 0;
          const bounded = Math.max(0, Math.min(1, loaded));
          onDownloadProgress(Math.round(bounded * 100));
        });
      },
    });

    return {
      availability,
      session: this.session,
    };
  }

  public hasSession(): boolean {
    return this.session !== null;
  }

  public setContextOverflowListener(listener: (() => void) | null): void {
    if (this.contextOverflowListener && this.session?.removeEventListener) {
      this.session.removeEventListener('contextoverflow', this.contextOverflowListener);
    }

    if (!listener) {
      this.contextOverflowListener = null;
      return;
    }

    this.contextOverflowListener = () => listener();
    if (this.session?.addEventListener) {
      this.session.addEventListener('contextoverflow', this.contextOverflowListener);
    }
  }

  public getContextTelemetry(): ContextTelemetry {
    if (!this.session) {
      return { usage: null, window: null, percent: null };
    }

    const usage = typeof this.session.contextUsage === 'number' ? this.session.contextUsage : null;
    const windowSize =
      typeof this.session.contextWindow === 'number' ? this.session.contextWindow : null;

    if (usage === null || windowSize === null || windowSize <= 0) {
      return { usage, window: windowSize, percent: null };
    }

    return {
      usage,
      window: windowSize,
      percent: Math.max(0, Math.min(100, Math.round((usage / windowSize) * 100))),
    };
  }

  public async stream(
    prompt: PromptInput,
    handlers: StreamHandlers,
    signal?: AbortSignal
  ): Promise<void> {
    if (!this.session) {
      throw new Error('Prompt session is not initialized.');
    }

    const stream = this.session.promptStreaming(prompt, { signal });
    for await (const chunk of stream) {
      handlers.onChunk(chunk);
    }
  }

  public destroy(): void {
    if (!this.session) return;
    if (this.contextOverflowListener && this.session.removeEventListener) {
      this.session.removeEventListener('contextoverflow', this.contextOverflowListener);
    }
    this.contextOverflowListener = null;
    this.session.destroy();
    this.session = null;
  }
}
