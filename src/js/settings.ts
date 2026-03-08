export class Settings {
  private context: string;

  constructor(context: string) {
    this.context = context;
  }

  private getKey(name: string): string {
    return `bk:settings:${this.context}:${name}`;
  }

  /**
   * Retrieves a setting value from storage.
   */
  get<T>(name: string, defaultValue?: T): T {
    try {
      const item = localStorage.getItem(this.getKey(name));
      return item === null ? (defaultValue as T) : JSON.parse(item);
    } catch (e) {
      console.warn(`[Settings] Failed to load setting "${name}"`, e);
      return defaultValue as T;
    }
  }

  /**
   * Saves a setting value to storage.
   */
  set<T>(name: string, value: T): void {
    try {
      localStorage.setItem(this.getKey(name), JSON.stringify(value));
    } catch (e) {
      console.warn(`[Settings] Failed to save setting "${name}"`, e);
    }
  }

  /**
   * Automatically binds input elements with `data-setting="name"` to storage.
   * - Restores values from storage immediately.
   * - Listens for 'change' events to update storage.
   *
   * Returns a cleanup function to remove event listeners.
   */
  bind(container: HTMLElement): () => void {
    const inputs = container.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >('[data-setting]');

    const handlers: { element: Element; handler: EventListener }[] = [];

    inputs.forEach((el) => {
      const name = (el as HTMLElement).dataset.setting;
      if (!name) return;

      const input = el as HTMLInputElement;
      const type = input.type;
      const isCheckbox = type === 'checkbox';
      const isRadio = type === 'radio';
      const isNumber = type === 'number';

      // 1. Restore value from storage
      const stored = this.get(name);
      if (stored !== undefined && stored !== null) {
        if (isCheckbox) {
          input.checked = Boolean(stored);
        } else if (isRadio) {
          if (String(stored) === input.value) {
            input.checked = true;
          }
        } else {
          input.value = String(stored);
        }
      }

      // 2. Listen for changes
      const handler = () => {
        let value: any;

        if (isCheckbox) {
          value = input.checked;
        } else if (isRadio) {
          if (input.checked) {
            value = input.value;
          } else {
            return;
          }
        } else if (isNumber) {
          value = input.valueAsNumber;
          if (isNaN(value) && input.value === '') {
            value = null;
          }
        } else {
          value = input.value;
        }

        this.set(name, value);
      };

      el.addEventListener('change', handler);
      handlers.push({ element: el, handler });
    });

    return () => {
      handlers.forEach(({ element, handler }) => {
        element.removeEventListener('change', handler);
      });
    };
  }
}

/**
 * Factory to get a Settings instance for a specific context (e.g. tool ID).
 */
export const getSettings = (context: string) => new Settings(context);
