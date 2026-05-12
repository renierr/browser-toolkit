export type PromptApiAvailability =
  | 'available'
  | 'downloadable'
  | 'downloading'
  | 'unavailable'
  | string;

export type PromptApiStatus = 'idle' | 'initializing' | 'ready' | 'streaming';

export type ToolModeId = 'prompt' | 'translator';

export type OutputMode = 'plain' | 'markdown';

export type PromptHistoryEntryStatus = 'streaming' | 'done' | 'aborted' | 'error';

export type PromptHistoryEntry = {
  id: number;
  mode: 'prompt' | 'translator';
  prompt: string;
  response: string;
  createdAt: number;
  updatedAt: number;
  status: PromptHistoryEntryStatus;
  meta?: Record<string, unknown>;
};

export type PromptHistorySessionData = {
  version: 2;
  entries: PromptHistoryEntry[];
};

export type PromptSessionOptions = {
  expectedInputs: Array<{ type: 'text' }>;
  expectedOutputs: Array<{ type: 'text' }>;
};

export type PromptMessageRole = 'system' | 'user' | 'assistant';

export type PromptMessage = {
  role: PromptMessageRole;
  content: string;
};

export type PromptInput = string | PromptMessage[];

export type DownloadProgressEvent = Event & {
  loaded?: number;
};

export type PromptApiMonitor = {
  addEventListener(
    type: 'downloadprogress',
    listener: (event: DownloadProgressEvent) => void
  ): void;
};

export type PromptApiSession = {
  promptStreaming(input: PromptInput, options?: { signal?: AbortSignal }): AsyncIterable<string>;
  destroy(): void;
  contextUsage?: number;
  contextWindow?: number;
  addEventListener?: (type: 'contextoverflow', listener: (event: Event) => void) => void;
  removeEventListener?: (type: 'contextoverflow', listener: (event: Event) => void) => void;
};

export type PromptApiGlobal = {
  availability(options?: PromptSessionOptions): Promise<PromptApiAvailability>;
  create(
    options?: PromptSessionOptions & { monitor?: (monitor: PromptApiMonitor) => void }
  ): Promise<PromptApiSession>;
};

export type TranslatorApiAvailability =
  | 'available'
  | 'downloadable'
  | 'downloading'
  | 'unavailable'
  | string;

export type TranslatorSessionOptions = {
  sourceLanguage: string;
  targetLanguage: string;
};

export type TranslatorSession = {
  translate(input: string): Promise<string>;
  destroy?: () => void;
};

export type TranslatorApiGlobal = {
  availability(options: TranslatorSessionOptions): Promise<TranslatorApiAvailability>;
  create(
    options: TranslatorSessionOptions & { monitor?: (monitor: PromptApiMonitor) => void }
  ): Promise<TranslatorSession>;
};

export type LanguageDetectionResult = {
  detectedLanguage: string;
  confidence: number;
};

export type LanguageDetectorApiAvailability =
  | 'available'
  | 'downloadable'
  | 'downloading'
  | 'unavailable'
  | string;

export type LanguageDetectorSession = {
  detect(input: string): Promise<LanguageDetectionResult[]>;
  destroy?: () => void;
};

export type LanguageDetectorApiGlobal = {
  availability(): Promise<LanguageDetectorApiAvailability>;
  create(options?: {
    monitor?: (monitor: PromptApiMonitor) => void;
  }): Promise<LanguageDetectorSession>;
};
