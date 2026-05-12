export type PromptApiAvailability =
  | 'available'
  | 'downloadable'
  | 'downloading'
  | 'unavailable'
  | string;

export type PromptApiStatus = 'idle' | 'initializing' | 'ready' | 'streaming';

export type OutputMode = 'plain' | 'markdown';

export type PromptHistoryEntryStatus = 'streaming' | 'done' | 'aborted' | 'error';

export type PromptHistoryEntry = {
  id: number;
  prompt: string;
  response: string;
  createdAt: number;
  updatedAt: number;
  status: PromptHistoryEntryStatus;
};

export type PromptHistorySessionData = {
  version: 1;
  entries: PromptHistoryEntry[];
};

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
