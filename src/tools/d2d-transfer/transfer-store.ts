export type TransferDirection = 'send' | 'receive';
export type TransferMethod = 'audio' | 'visual';

export interface TransferEntry {
  id: string;
  direction: TransferDirection;
  method: TransferMethod;
  text?: string;
  fileName?: string;
  fileBlob?: Blob;
  byteLength: number;
  timestamp: number;
  success: boolean;
}

export class TransferStore {
  private history: TransferEntry[] = [];
  private listeners: Array<() => void> = [];

  add(entry: TransferEntry): void {
    this.history.unshift(entry);
    this.notify();
  }

  getAll(): TransferEntry[] {
    return [...this.history];
  }

  clear(): void {
    this.history = [];
    this.notify();
  }

  onChange(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => {
      const idx = this.listeners.indexOf(fn);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }
}
