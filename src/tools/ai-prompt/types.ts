export type PromptApiAvailability =
  | 'available'
  | 'downloadable'
  | 'downloading'
  | 'unavailable'
  | string;

export type PromptApiStatus = 'idle' | 'initializing' | 'ready' | 'streaming';

export type PromptSessionOptions = {
  expectedInputs: Array<{ type: 'text' }>;
  expectedOutputs: Array<{ type: 'text' }>;
};

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
  promptStreaming(input: string, options?: { signal?: AbortSignal }): AsyncIterable<string>;
  destroy(): void;
};

export type PromptApiGlobal = {
  availability(options?: PromptSessionOptions): Promise<PromptApiAvailability>;
  create(
    options?: PromptSessionOptions & { monitor?: (monitor: PromptApiMonitor) => void }
  ): Promise<PromptApiSession>;
};
