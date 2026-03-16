/**
 * Manages calculation history for the current session.
 */

export interface HistoryItem {
  id: string;
  expression: string;
  result: string | number;
  timestamp: number;
}

export class HistoryManager {
  private history: HistoryItem[] = [];
  private readonly STORAGE_KEY = 'calculator_history_v1';
  private readonly MAX_ITEMS = 20;

  constructor() {
    // Try to load existing history from localStorage; fall back to empty array on error
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (raw) {
        let parsedAny = JSON.parse(raw);
        let parsed: any[] = [];

        // Accept several potential persisted shapes for compatibility:
        // - An array of items
        // - { items: [...] } or { history: [...] } or { data: [...] }
        // - An object map of id -> item
        if (Array.isArray(parsedAny)) {
          parsed = parsedAny;
        } else if (parsedAny && Array.isArray(parsedAny.items)) {
          parsed = parsedAny.items;
        } else if (parsedAny && Array.isArray(parsedAny.history)) {
          parsed = parsedAny.history;
        } else if (parsedAny && Array.isArray(parsedAny.data)) {
          parsed = parsedAny.data;
        } else if (parsedAny && typeof parsedAny === 'object') {
          // If it's an object map, take its values (may include metadata properties which we'll filter)
          parsed = Object.values(parsedAny);
        }

        if (Array.isArray(parsed) && parsed.length > 0) {
          // Normalize items: ensure required fields exist and types are correct
          const normalized = parsed
            .map((it) => {
              try {
                if (!it) return null;
                const id = typeof it.id === 'string' && it.id ? it.id : this.generateId();
                const expression =
                  typeof it.expression === 'string' ? it.expression : String(it.expression ?? '');
                const result =
                  typeof it.result === 'string' || typeof it.result === 'number'
                    ? it.result
                    : String(it.result ?? '');
                const timestamp =
                  typeof it.timestamp === 'number' && !isNaN(it.timestamp)
                    ? it.timestamp
                    : Date.now();
                return { id, expression, result, timestamp } as HistoryItem;
              } catch (e) {
                return null;
              }
            })
            .filter(Boolean) as HistoryItem[];

          // Sort by timestamp desc so latest items come first, then trim to MAX_ITEMS
          normalized.sort((a, b) => b.timestamp - a.timestamp);
          this.history = normalized.slice(0, this.MAX_ITEMS);
          // Persist normalized shape back to storage to avoid future parse issues
          this.save();
          // Debug: log loaded count when available
          try {
            console.debug && console.debug('Calculator: loaded history items', this.history.length);
          } catch (e) {}
        }
      }
    } catch (e) {
      // If storage isn't available or JSON parse fails, keep in-memory history only
      this.history = [];
    }
  }

  private generateId(): string {
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
    } catch (e) {
      // fallthrough to fallback
    }
    // Fallback: timestamp + random string
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }

  private save(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.history.slice(0, this.MAX_ITEMS)));
      try {
        console.debug && console.debug('Calculator: saved history items', this.history.length);
      } catch (e) {}
    } catch (e) {
      // Ignore storage errors (e.g., quota, privacy mode) and keep history in memory
    }
  }

  /**
   * Adds a new item to the history.
   */
  addItem(expression: string, result: string | number): HistoryItem {
    const item: HistoryItem = {
      id: this.generateId(),
      expression,
      result,
      timestamp: Date.now(),
    };
    // Prepend new item and keep only the most recent MAX_ITEMS
    this.history.unshift(item);
    if (this.history.length > this.MAX_ITEMS) {
      this.history = this.history.slice(0, this.MAX_ITEMS);
    }
    this.save();

    return item;
  }

  /**
   * Returns all history items.
   */
  getHistory(): HistoryItem[] {
    return [...this.history];
  }

  /**
   * Gets the last calculation if available.
   */
  getLastItem(): HistoryItem | null {
    return this.history.length > 0 ? this.history[0] : null;
  }

  /**
   * Clears the current session history.
   */
  clear(): void {
    this.history = [];
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (e) {
      // ignore
    }
  }
}
