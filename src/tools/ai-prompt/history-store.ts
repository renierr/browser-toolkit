import type { PromptHistoryEntry, PromptHistorySessionData } from './types';

const HISTORY_STORAGE_KEY = 'ai-prompt:session-history';
const MAX_HISTORY_ENTRIES = 50;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseHistoryEntry(value: unknown): PromptHistoryEntry | null {
  if (!isObject(value)) return null;

  const id = value.id;
  const mode = value.mode;
  const prompt = value.prompt;
  const response = value.response;
  const createdAt = value.createdAt;
  const updatedAt = value.updatedAt;
  const status = value.status;

  if (typeof id !== 'number') return null;
  if (mode !== 'prompt' && mode !== 'translator') return null;
  if (typeof prompt !== 'string') return null;
  if (typeof response !== 'string') return null;
  if (typeof createdAt !== 'number') return null;
  if (typeof updatedAt !== 'number') return null;
  if (status !== 'streaming' && status !== 'done' && status !== 'aborted' && status !== 'error') {
    return null;
  }

  const meta = isObject(value.meta) ? value.meta : undefined;
  return { id, mode, prompt, response, createdAt, updatedAt, status, meta };
}

function parseHistorySessionData(value: unknown): PromptHistorySessionData {
  if (!isObject(value)) return { version: 2, entries: [] };

  if (value.version === 1 && Array.isArray(value.entries)) {
    const legacyEntries = value.entries
      .filter((entry): entry is Record<string, unknown> => isObject(entry))
      .map((entry) => ({
        ...entry,
        mode: 'prompt',
      }));
    return parseHistorySessionData({ version: 2, entries: legacyEntries });
  }

  if (value.version !== 2) return { version: 2, entries: [] };
  if (!Array.isArray(value.entries)) return { version: 2, entries: [] };

  const entries = value.entries
    .map((entry) => parseHistoryEntry(entry))
    .filter((entry): entry is PromptHistoryEntry => entry !== null)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_HISTORY_ENTRIES);

  return { version: 2, entries };
}

export class PromptHistoryStore {
  public load(): PromptHistoryEntry[] {
    try {
      const raw = sessionStorage.getItem(HISTORY_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      return parseHistorySessionData(parsed).entries;
    } catch (error) {
      console.warn('[AI Prompt] Failed to load session history:', error);
      return [];
    }
  }

  public save(entries: PromptHistoryEntry[]): void {
    const data: PromptHistorySessionData = {
      version: 2,
      entries: entries
        .slice()
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, MAX_HISTORY_ENTRIES),
    };

    try {
      sessionStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.warn('[AI Prompt] Failed to save session history:', error);
    }
  }

  public clear(): void {
    try {
      sessionStorage.removeItem(HISTORY_STORAGE_KEY);
    } catch (error) {
      console.warn('[AI Prompt] Failed to clear session history:', error);
    }
  }
}
