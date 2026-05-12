import type { PromptHistoryEntry, PromptHistorySessionData } from './types';

const HISTORY_STORAGE_KEY = 'ai-prompt:session-history';
const MAX_HISTORY_ENTRIES = 50;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseHistoryEntry(value: unknown): PromptHistoryEntry | null {
  if (!isObject(value)) return null;

  const id = value.id;
  const prompt = value.prompt;
  const response = value.response;
  const createdAt = value.createdAt;
  const updatedAt = value.updatedAt;
  const status = value.status;

  if (typeof id !== 'number') return null;
  if (typeof prompt !== 'string') return null;
  if (typeof response !== 'string') return null;
  if (typeof createdAt !== 'number') return null;
  if (typeof updatedAt !== 'number') return null;
  if (status !== 'streaming' && status !== 'done' && status !== 'aborted' && status !== 'error') {
    return null;
  }

  return { id, prompt, response, createdAt, updatedAt, status };
}

function parseHistorySessionData(value: unknown): PromptHistorySessionData {
  if (!isObject(value)) return { version: 1, entries: [] };
  if (value.version !== 1) return { version: 1, entries: [] };
  if (!Array.isArray(value.entries)) return { version: 1, entries: [] };

  const entries = value.entries
    .map((entry) => parseHistoryEntry(entry))
    .filter((entry): entry is PromptHistoryEntry => entry !== null)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_HISTORY_ENTRIES);

  return { version: 1, entries };
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
      version: 1,
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
