import { fetchApi } from './api';

export const isDev = Boolean(import.meta.env.DEV);

export const fuzzyScore = (text: string, term: string): number => {
  if (!term) return 0;
  const target = text.toLowerCase();
  const search = term.toLowerCase();

  let score = 0;
  let lastIndex = -1;
  let totalGap = 0;

  for (let i = 0; i < search.length; i++) {
    const char = search[i];
    const index = target.indexOf(char, lastIndex + 1);

    if (index === -1) return -Infinity;

    // Bonus: Character is at the start of the string
    if (index === 0) score += 100;

    // Bonus: Character is at the start of a word (after space, dash, or underscore)
    if (index > 0 && /[\s\-_]/.test(target[index - 1])) {
      score += 80;
    }

    // Bonus: Consecutive match (no gap from previous character)
    if (lastIndex !== -1 && index === lastIndex + 1) {
      score += 40;
    }

    // Penalty: Increase gap penalty based on how many characters were skipped
    if (lastIndex !== -1) {
      totalGap += index - lastIndex - 1;
    }

    lastIndex = index;
  }

  // Final Score: Subtract the total gap to demote "scattered" matches
  return score - totalGap * 10;
};

function getValueByDotNotation(obj: unknown, path: string): string | undefined {
  const keys = path.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (
      current &&
      typeof current === 'object' &&
      Object.prototype.hasOwnProperty.call(current, key)
    ) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }

  if (current === undefined || current === null) {
    return undefined;
  }
  return String(current);
}

export const replacePlaceholders = (
  templateHtml: string,
  context: unknown,
  partials?: Record<string, string>
): string => {
  const placeholderRegex = /{{([\s\S]+?)}}/g;

  const process = (text: string, depth: number): string => {
    if (depth > 8) {
      console.warn('[utils] Maximum template include depth reached.');
      return text;
    }

    const tagRegex = /<include\s+([^>]+?)\s*\/?>/g;
    let result = text.replace(tagRegex, (match, attrString) => {
      const srcMatch = attrString.match(/src=["']([^"']+)["']/);
      const typeMatch = attrString.match(/type=["']([^"']+)["']/);
      const fileName = srcMatch ? srcMatch[1] : '';
      const isStyle = typeMatch ? typeMatch[1] === 'style' : false;

      if (!fileName) return match;

      if (partials && typeof partials[fileName] === 'string') {
        const content = process(partials[fileName], depth + 1);
        return isStyle ? `<style>\n${content}\n</style>` : content;
      }

      console.warn(`[utils] Tag include not found: ${fileName}`);
      return `[INCLUDE NOT FOUND: ${fileName}]`;
    });

    return result.replace(placeholderRegex, (match, keyPath) => {
      const trimmedPath = keyPath.trim();
      const value = getValueByDotNotation(context, trimmedPath);
      if (value !== undefined) {
        return value;
      }

      console.warn(`[utils] Placeholder not found in context: ${match}`);
      return `[${match} NOT FOUND]`;
    });
  };

  return process(templateHtml, 0);
};

export const html = (strings: TemplateStringsArray, ...values: unknown[]) => {
  return strings.reduce((acc, str, i) => {
    const v = values[i];
    const value = Array.isArray(v) ? v.join('') : (v ?? '');
    return acc + str + (value === false ? '' : value);
  }, '');
};

export const isImageFile = (file: File) => {
  if (file.type) return file.type.startsWith('image/');
  return /\.(jpe?g|png|gif|webp|tiff?|bmp|heic|heif|svg)$/i.test(file.name);
};

export function debounce<T extends (...args: any[]) => any>(fn: T, wait = 0, immediate = false) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;
  let lastThis: any = null;
  let result: ReturnType<T> | undefined;

  const later = () => {
    timer = null;
    if (!immediate && lastArgs) {
      result = fn.apply(lastThis, lastArgs);
      lastArgs = null;
      lastThis = null;
    }
  };

  const debounced = function (this: any, ...args: Parameters<T>) {
    lastArgs = args;
    lastThis = this;

    const callNow = immediate && timer === null;
    if (timer) clearTimeout(timer);
    timer = setTimeout(later, wait);

    if (callNow) {
      result = fn.apply(this, args);
      lastArgs = null;
      lastThis = null;
    }
    return result;
  };

  (debounced as any).cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    lastArgs = null;
    lastThis = null;
  };

  (debounced as any).flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
      if (lastArgs) {
        const res = fn.apply(lastThis, lastArgs);
        lastArgs = null;
        lastThis = null;
        return res;
      }
    }
    return undefined;
  };

  return debounced as ((...args: Parameters<T>) => ReturnType<T> | undefined) & {
    cancel: () => void;
    flush: () => ReturnType<T> | undefined;
  };
}

// noinspection JSUnusedGlobalSymbols
export function throttleTrailing<T extends (...args: any[]) => any>(fn: T, wait = 0) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;
  let lastThis: any = null;

  const throttled = function (this: any, ...args: Parameters<T>) {
    lastArgs = args;
    lastThis = this;

    // If no timer is active, schedule execution after `wait`.
    if (timer === null) {
      timer = setTimeout(() => {
        timer = null;
        if (lastArgs) {
          fn.apply(lastThis, lastArgs);
          lastArgs = null;
          lastThis = null;
        }
      }, wait);
    }
  };

  (throttled as any).cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    lastArgs = null;
    lastThis = null;
  };

  (throttled as any).flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
      if (lastArgs) {
        const res = fn.apply(lastThis, lastArgs);
        lastArgs = null;
        lastThis = null;
        return res;
      }
    }
    return undefined;
  };

  return throttled as ((...args: Parameters<T>) => void) & {
    cancel: () => void;
    flush: () => ReturnType<T> | undefined;
  };
}

/**
 * Race a promise against a timeout. Rejects with `message` if `ms`
 * elapses before the promise settles.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!navigator.clipboard?.writeText) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('[Utils] Failed to copy text to clipboard:', error);
    return false;
  }
}

/**
 * Checks if the backend server is available and responsive.
 * @param timeoutMs Timeout in milliseconds for the health check.
 */
export async function checkBackend(timeoutMs = 2000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetchApi('/health', { signal: controller.signal });
    clearTimeout(timeoutId);
    return response.ok;
  } catch (e) {
    return false;
  }
}

export function uint8ArrayToBase64(data: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
