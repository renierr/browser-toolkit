import { PromptHistoryStore } from './history-store';
import type { PromptHistoryEntry, PromptHistorySessionData, PromptMessage } from './types';

type StartEntryArgs = {
  mode: 'prompt' | 'translator';
  prompt: string;
  meta?: Record<string, unknown>;
};

export class PromptConversationHistory {
  private readonly store: PromptHistoryStore;
  private entries: PromptHistoryEntry[];
  private nextId: number;

  public constructor(store: PromptHistoryStore) {
    this.store = store;
    this.entries = store.load();
    this.nextId = this.entries.reduce((max, entry) => Math.max(max, entry.id), 0) + 1;
  }

  public list(): PromptHistoryEntry[] {
    return this.entries;
  }

  public clear(): void {
    this.entries = [];
    this.nextId = 1;
    this.store.clear();
  }

  public startPrompt(args: StartEntryArgs): PromptHistoryEntry {
    const now = Date.now();
    const entry: PromptHistoryEntry = {
      id: this.nextId,
      mode: args.mode,
      prompt: args.prompt,
      response: '',
      createdAt: now,
      updatedAt: now,
      status: 'streaming',
      meta: args.meta,
    };

    this.nextId += 1;
    this.entries.unshift(entry);
    this.persist();
    return entry;
  }

  public appendResponse(id: number, chunk: string): void {
    const entry = this.findById(id);
    if (!entry) return;
    entry.response += chunk;
    entry.updatedAt = Date.now();
    this.persist();
  }

  public markDone(id: number, fallbackResponse?: string): void {
    const entry = this.findById(id);
    if (!entry) return;
    if (!entry.response.trim() && fallbackResponse) {
      entry.response = fallbackResponse;
    }
    entry.status = 'done';
    entry.updatedAt = Date.now();
    this.persist();
  }

  public markAborted(id: number, fallbackResponse?: string): void {
    const entry = this.findById(id);
    if (!entry) return;
    if (!entry.response.trim() && fallbackResponse) {
      entry.response = fallbackResponse;
    }
    entry.status = 'aborted';
    entry.updatedAt = Date.now();
    this.persist();
  }

  public markError(id: number, fallbackResponse?: string): void {
    const entry = this.findById(id);
    if (!entry) return;
    if (!entry.response.trim() && fallbackResponse) {
      entry.response = fallbackResponse;
    }
    entry.status = 'error';
    entry.updatedAt = Date.now();
    this.persist();
  }

  public toSessionData(): PromptHistorySessionData {
    return {
      version: 2,
      entries: this.entries,
    };
  }

  public updateMeta(id: number, meta: Record<string, unknown>): void {
    const entry = this.findById(id);
    if (!entry) return;
    entry.meta = {
      ...(entry.meta || {}),
      ...meta,
    };
    entry.updatedAt = Date.now();
    this.persist();
  }

  public toConversationMessages(maxEntries: number = 12): PromptMessage[] {
    const ordered = this.entries
      .slice()
      .filter(
        (entry) =>
          entry.mode === 'prompt' &&
          (entry.status === 'done' || entry.status === 'aborted' || entry.status === 'error')
      )
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(-maxEntries);

    const messages: PromptMessage[] = [];
    for (const entry of ordered) {
      messages.push({ role: 'user', content: entry.prompt });
      if (entry.response.trim()) {
        messages.push({ role: 'assistant', content: entry.response });
      }
    }

    return messages;
  }

  private findById(id: number): PromptHistoryEntry | undefined {
    return this.entries.find((entry) => entry.id === id);
  }

  private persist(): void {
    this.store.save(this.entries);
  }
}
