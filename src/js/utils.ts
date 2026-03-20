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

function getValueByDotNotation(obj: any, path: string): string | undefined {
  const keys = path.split('.');
  let current = obj;

  for (const key of keys) {
    if (current && typeof current === 'object' && current.hasOwnProperty(key)) {
      current = current[key];
    } else {
      return undefined;
    }
  }

  if (current === undefined || current === null) {
    return undefined;
  }
  return String(current);
}

export const replacePlaceholders = (templateHtml: string, context: any): string => {
  const placeholderRegex = /{{(.+?)}}/g;

  let output = templateHtml;

  output = output.replace(placeholderRegex, (match, keyPath) => {
    const trimmedPath = keyPath.trim();
    const value = getValueByDotNotation(context, trimmedPath);

    if (value !== undefined) {
      return value;
    } else {
      console.warn(`Placeholder not found in context: ${match}`);
      return `[${match} NOT FOUND]`;
    }
  });
  return output;
};

export const html = (strings: TemplateStringsArray, ...values: any[]) => {
  return strings.reduce((acc, str, i) => {
    const v = values[i];
    const value = Array.isArray(v) ? v.join('') : (v ?? '');
    return acc + str + (value === false ? '' : value);
  }, '');
};

const parseRational = (v: any): number => {
  if (v === undefined || v === null) return NaN;
  if (typeof v === 'number') return v;

  // If it's an array or array-like (e.g. typed array), try the first element or treat as [num, den]
  if (Array.isArray(v) || (typeof v === 'object' && typeof (v as any).length === 'number')) {
    const arr = Array.isArray(v) ? v : Array.from(v as any);
    if (arr.length === 0) return NaN;
    // If it's a 2-element array treat as fraction [numerator, denominator]
    if (arr.length >= 2 && (typeof arr[0] === 'number' || typeof arr[0] === 'string')) {
      const n = Number(arr[0]);
      const d = Number(arr[1] ?? 1);
      return Number.isFinite(n) && d !== 0 ? n / d : NaN;
    }
    // Otherwise try parsing the first element
    return parseRational(arr[0]);
  }

  if (typeof v === 'string') {
    // fraction like "50/1" or decimal string
    if (v.includes('/')) {
      const [nStr, dStr] = v.split('/');
      const n = Number(nStr);
      const d = Number(dStr);
      return Number.isFinite(n) && d !== 0 ? n / d : NaN;
    }
    const num = Number(v.replace(/[^0-9+\-.eE]/g, ''));
    return Number.isFinite(num) ? num : NaN;
  }

  if (typeof v === 'object') {
    // ExifReader may provide { numerator, denominator } or { num, den } or { value: ... }
    if ('numerator' in v && 'denominator' in v) {
      const n = Number((v as any).numerator);
      const d = Number((v as any).denominator || 1);
      return Number.isFinite(n) && d !== 0 ? n / d : NaN;
    }
    if ('num' in v && 'den' in v) {
      const n = Number((v as any).num);
      const d = Number((v as any).den || 1);
      return Number.isFinite(n) && d !== 0 ? n / d : NaN;
    }
    // Some tag implementations wrap the actual value under a `value` property
    if ('value' in v) return parseRational((v as any).value);

    // Some objects expose numeric indices (array-like object)
    if (typeof (v as any)[0] !== 'undefined') return parseRational([(v as any)[0], (v as any)[1]]);
  }
  return NaN;
};

const gpsArrayToDecimal = (arr: any): number => {
  if (arr === undefined || arr === null) return NaN;
  // Accept real arrays and array-like/typed arrays
  const parts = Array.isArray(arr)
    ? arr
    : typeof arr === 'object' && typeof (arr as any).length === 'number'
      ? Array.from(arr as any)
      : null;
  if (!parts) return NaN;
  const [degRaw, minRaw = 0, secRaw = 0] = parts;
  const deg = parseRational(degRaw);
  const min = parseRational(minRaw);
  const sec = parseRational(secRaw);
  if (![deg, min, sec].every((n) => Number.isFinite(n))) return NaN;
  return deg + min / 60 + sec / 3600;
};

const gpsParseDescriptionToDecimal = (desc: any): number => {
  if (desc === undefined || desc === null) return NaN;
  const s = String(desc);
  // If it's a single decimal number, return it
  const single = s.match(/-?\d+(?:\.\d+)?/);
  if (single && single.length) {
    // If there are exactly 1 number and it contains a dot, assume decimal degrees
    const allNums = s.match(/-?\d+(?:\.\d+)?/g) || [];
    if (allNums.length === 1 && allNums[0].includes('.')) return Number(allNums[0]);
    // If we have 3 numbers -> D M S
    if (allNums.length >= 3) {
      const d = Number(allNums[0]);
      const m = Number(allNums[1]);
      const sec = Number(allNums[2]);
      if ([d, m, sec].every(Number.isFinite)) return d + m / 60 + sec / 3600;
    }
    // fallback to first number
    return Number(allNums[0]);
  }
  return NaN;
};

const gpsApplyHemisphereReferences = (coord: number, refTag: any): number => {
  if (!Number.isFinite(coord)) return NaN;
  const ref = String(refTag?.description ?? refTag?.value ?? refTag ?? '')
    .trim()
    .toUpperCase();
  if (ref.startsWith('S') || ref.startsWith('W') || ref === 'SOUTH' || ref === 'WEST')
    return -Math.abs(coord);
  return coord;
};

export const gpsParseCoordinateFromExifTags = (
  longTag: any,
  latTag: any,
  longRefTag: any,
  latRefTag: any
): { longitude: number; latitude: number } => {
  let latDecimal = NaN;
  let lonDecimal = NaN;

  // Prefer .value arrays when available (rational components)
  if (latTag?.value) latDecimal = gpsArrayToDecimal(latTag.value);
  if (longTag?.value) lonDecimal = gpsArrayToDecimal(longTag.value);

  // Fallback to description parsing
  if (!Number.isFinite(latDecimal))
    latDecimal = gpsParseDescriptionToDecimal(latTag?.description ?? latTag?.value ?? latTag);
  if (!Number.isFinite(lonDecimal))
    lonDecimal = gpsParseDescriptionToDecimal(longTag?.description ?? longTag?.value ?? longTag);

  // Apply hemisphere references
  const finalLat = gpsApplyHemisphereReferences(latDecimal, latRefTag);
  const finalLon = gpsApplyHemisphereReferences(lonDecimal, longRefTag);

  return { longitude: finalLon, latitude: finalLat };
};

export const gpsGenerateGoogleMapsLink = (lat: number, lon: number): string => {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
};

export const isImageFile = (file: File) => {
  if (file.type) return file.type.startsWith('image/');
  return /\.(jpe?g|png|gif|webp|tiff?|bmp|heic|heif|svg)$/i.test(file.name);
};

export async function hashUint8Array(data: Uint8Array) {
  const view = data;
  const len = view.byteLength;
  const bufferSourceForFull: BufferSource = view as unknown as BufferSource;

  // If SubtleCrypto is available in this environment, use it
  const subtleAvailable =
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as any).crypto?.subtle?.digest === 'function';
  if (subtleAvailable) {
    try {
      const hashBuf = (await (globalThis as any).crypto.subtle.digest(
        'SHA-1',
        bufferSourceForFull
      )) as ArrayBuffer;
      const hashArray = Array.from(new Uint8Array(hashBuf));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch (err) {
      console.warn('crypto.subtle.digest failed, falling back to JS hash', err);
    }
  }

  // Fallback hashing (FNV-1a variant) for environments without SubtleCrypto
  let h1 = BigInt(0xcbf29ce484222325n);
  const prime = BigInt(0x100000001b3n);
  for (let i = 0; i < len; i++) {
    h1 ^= BigInt(view[i]);
    h1 = (h1 * prime) & BigInt('0xFFFFFFFFFFFFFFFF');
  }
  // convert to hex padded to 16 chars
  return h1.toString(16).padStart(16, '0');
}

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

let wakeLockSentinel: WakeLockSentinel | null = null;
let wakeLockCount = 0;

function showWakeLockIndicator() {
  try {
    const el = document.getElementById('wake-lock-indicator');
    if (el) {
      el.classList.remove('hidden');
      el.setAttribute('aria-hidden', 'false');
    }
  } catch (_) {
    // ignore
  }
}

function hideWakeLockIndicator() {
  try {
    const el = document.getElementById('wake-lock-indicator');
    if (el) {
      el.classList.add('hidden');
      el.setAttribute('aria-hidden', 'true');
    }
  } catch (_) {
    // ignore
  }
}

async function requestWakeLockInternal() {
  if (!('wakeLock' in navigator) || wakeLockCount === 0 || wakeLockSentinel) return;
  try {
    const lock = await navigator.wakeLock.request('screen');
    // Check again after await to prevent race conditions
    if (wakeLockCount === 0) {
      lock.release();
      return;
    }
    wakeLockSentinel = lock;
    wakeLockSentinel.addEventListener('release', () => {
      wakeLockSentinel = null;
    });
    console.log('Wake Lock acquired');
  } catch (err: any) {
    console.warn(`Wake Lock failed: ${err.name}, ${err.message}`);
  }
}

const handleVisibilityChange = () => {
  if (document.visibilityState === 'visible' && wakeLockCount > 0) {
    requestWakeLockInternal();
  }
};

/**
 * Acquires a screen wake lock, preventing the device from sleeping.
 * Returns a function to release the wake lock.
 * Safe to call multiple times; the lock is only released when all callers have released it.
 */
export function acquireWakeLock(): () => void {
  wakeLockCount++;

  if (wakeLockCount === 1) {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    requestWakeLockInternal();
    showWakeLockIndicator();
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    wakeLockCount--;

    if (wakeLockCount === 0) {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockSentinel) {
        wakeLockSentinel.release();
        wakeLockSentinel = null;
      }
      console.log('Wake Lock fully released');
      hideWakeLockIndicator();
    }
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
