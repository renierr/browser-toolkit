import type {
  LanguageDetectorApiGlobal,
  LanguageDetectorSession,
  PromptApiAvailability,
  PromptApiGlobal,
  PromptInput,
  PromptSessionOptions,
  TranslatorApiAvailability,
  TranslatorApiGlobal,
  TranslatorSession,
} from './types';

export type DownloadMonitorHandler = (percent: number) => void;

type PromptInitResult = {
  availability: PromptApiAvailability;
  ready: boolean;
};

type TranslatorInitResult = {
  availability: TranslatorApiAvailability;
  ready: boolean;
};

export class PromptModeClient {
  private readonly api: PromptApiGlobal;
  private readonly options: PromptSessionOptions;
  private session: ReturnType<PromptApiGlobal['create']> extends Promise<infer T>
    ? T | null
    : null = null;
  private contextOverflowListener: ((event: Event) => void) | null = null;

  public constructor(api: PromptApiGlobal, options: PromptSessionOptions) {
    this.api = api;
    this.options = options;
  }

  public async checkAvailability(): Promise<PromptApiAvailability> {
    return this.api.availability(this.options);
  }

  public async init(onDownloadProgress: DownloadMonitorHandler): Promise<PromptInitResult> {
    const availability = await this.checkAvailability();
    if (availability === 'unavailable') {
      this.destroy();
      return { availability, ready: false };
    }

    this.destroy();
    this.session = await this.api.create({
      ...this.options,
      monitor: (monitor) => {
        monitor.addEventListener('downloadprogress', (event) => {
          const loaded = typeof event.loaded === 'number' ? event.loaded : 0;
          const bounded = Math.max(0, Math.min(1, loaded));
          onDownloadProgress(Math.round(bounded * 100));
        });
      },
    });

    if (this.contextOverflowListener && this.session.addEventListener) {
      this.session.addEventListener('contextoverflow', this.contextOverflowListener);
    }

    return { availability, ready: true };
  }

  public hasSession(): boolean {
    return this.session !== null;
  }

  public async run(input: PromptInput, signal?: AbortSignal): Promise<string> {
    if (!this.session) {
      throw new Error('Prompt mode is not initialized.');
    }
    let response = '';
    const stream = this.session.promptStreaming(input, { signal });
    for await (const chunk of stream) {
      response += chunk;
    }
    return response;
  }

  public async stream(
    input: PromptInput,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<void> {
    if (!this.session) {
      throw new Error('Prompt mode is not initialized.');
    }
    const stream = this.session.promptStreaming(input, { signal });
    for await (const chunk of stream) {
      onChunk(chunk);
    }
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

  public getContextTelemetry(): {
    usage: number | null;
    window: number | null;
    percent: number | null;
  } {
    if (!this.session) return { usage: null, window: null, percent: null };
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

  public destroy(): void {
    if (!this.session) return;
    if (this.contextOverflowListener && this.session.removeEventListener) {
      this.session.removeEventListener('contextoverflow', this.contextOverflowListener);
    }
    this.session.destroy();
    this.session = null;
  }
}

type TranslatorRunArgs = {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
  detectSource: boolean;
};

export class TranslatorModeClient {
  private readonly translatorApi: TranslatorApiGlobal;
  private readonly languageDetectorApi: LanguageDetectorApiGlobal | null;
  private translators: Map<string, TranslatorSession> = new Map();
  private languageDetector: LanguageDetectorSession | null = null;

  public constructor(
    translatorApi: TranslatorApiGlobal,
    languageDetectorApi: LanguageDetectorApiGlobal | null
  ) {
    this.translatorApi = translatorApi;
    this.languageDetectorApi = languageDetectorApi;
  }

  public async checkAvailability(options: {
    sourceLanguage: string;
    targetLanguage: string;
  }): Promise<TranslatorApiAvailability> {
    return this.translatorApi.availability(options);
  }

  public async init(onDownloadProgress: DownloadMonitorHandler): Promise<TranslatorInitResult> {
    const availability = await this.translatorApi.availability({
      sourceLanguage: 'en',
      targetLanguage: 'de',
    });

    if (availability === 'unavailable') {
      return { availability, ready: false };
    }

    if (this.languageDetectorApi && !this.languageDetector) {
      try {
        this.languageDetector = await this.languageDetectorApi.create({
          monitor: (monitor) => {
            monitor.addEventListener('downloadprogress', (event) => {
              const loaded = typeof event.loaded === 'number' ? event.loaded : 0;
              const bounded = Math.max(0, Math.min(1, loaded));
              onDownloadProgress(Math.round(bounded * 100));
            });
          },
        });
      } catch (error) {
        console.warn(
          '[AI Prompt] LanguageDetector init failed; using manual source language.',
          error
        );
      }
    }

    return { availability, ready: true };
  }

  public hasSession(): boolean {
    return true;
  }

  public async run(
    args: TranslatorRunArgs
  ): Promise<{ output: string; detectedLanguage: string | null }> {
    const detectedLanguage = args.detectSource
      ? await this.detectLanguage(args.text, args.sourceLanguage)
      : args.sourceLanguage;

    const sourceLanguage = detectedLanguage || args.sourceLanguage;
    const translator = await this.getOrCreateTranslator(sourceLanguage, args.targetLanguage);
    const output = await translator.translate(args.text);
    return { output, detectedLanguage };
  }

  public destroy(): void {
    for (const translator of this.translators.values()) {
      try {
        translator.destroy?.();
      } catch (error) {
        console.warn('[AI Prompt] Failed to destroy translator instance:', error);
      }
    }
    this.translators.clear();
    if (this.languageDetector) {
      try {
        this.languageDetector.destroy?.();
      } catch (error) {
        console.warn('[AI Prompt] Failed to destroy language detector instance:', error);
      }
      this.languageDetector = null;
    }
  }

  private async detectLanguage(text: string, fallback: string): Promise<string> {
    if (!this.languageDetector) return fallback;
    try {
      const results = await this.languageDetector.detect(text);
      const top = results[0];
      if (!top?.detectedLanguage) return fallback;
      return top.detectedLanguage;
    } catch (error) {
      console.warn('[AI Prompt] Language detection failed; using fallback source language.', error);
      return fallback;
    }
  }

  private async getOrCreateTranslator(
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<TranslatorSession> {
    const key = `${sourceLanguage}->${targetLanguage}`;
    const existing = this.translators.get(key);
    if (existing) return existing;

    const translator = await this.translatorApi.create({
      sourceLanguage,
      targetLanguage,
    });
    this.translators.set(key, translator);
    return translator;
  }
}
