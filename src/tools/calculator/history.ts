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

  /**
   * Adds a new item to the history.
   */
  addItem(expression: string, result: string | number): HistoryItem {
    const item: HistoryItem = {
      id: crypto.randomUUID(),
      expression,
      result,
      timestamp: Date.now()
    };
    
    // Keep internal history, but we only show the last 50 for performance
    this.history.unshift(item);
    if (this.history.length > 50) {
      this.history.pop();
    }
    
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
  }
}
