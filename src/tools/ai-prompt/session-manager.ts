import type {
  PromptApiAvailability,
  PromptApiGlobal,
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

export class PromptSessionManager {
  private readonly api: PromptApiGlobal;
  private readonly options: PromptSessionOptions;
  private session: PromptApiSession | null = null;

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

  public async stream(
    prompt: string,
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
    this.session.destroy();
    this.session = null;
  }
}
