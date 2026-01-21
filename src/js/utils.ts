export const isDev = Boolean(import.meta.env.DEV);

export const fuzzyScore = (text: string, term: string): number => {
  if (term === '') return 0;
  text = text.toLowerCase();
  term = term.toLowerCase();

  let score = 0;
  let termIndex = 0;

  for (const char of text) {
    if (char === term[termIndex]) {
      score += 1 - termIndex * 0.1;
      termIndex++;
      if (termIndex === term.length) return score;
    }
  }
  return termIndex === term.length ? score : -Infinity;
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

export async function copyCanvasToClipboard(
  canvas: HTMLCanvasElement,
  format: 'jpg' | 'png' = 'png'
): Promise<void> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error('Failed to create blob from canvas'));
        return;
      }
      try {
        const data = [new ClipboardItem({ [blob.type]: blob })];
        await navigator.clipboard.write(data);
        resolve();
      } catch (err) {
        reject(err);
      }
    }, `image/${format}`);
  });
}

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
  const parts = Array.isArray(arr) ? arr : (typeof arr === 'object' && typeof (arr as any).length === 'number') ? Array.from(arr as any) : null;
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
}

export const isImageFile = (file: File) => {
  if (file.type) return file.type.startsWith('image/');
  return /\.(jpe?g|png|gif|webp|tiff?|bmp|heic|heif|svg)$/i.test(file.name);
};

export async function hashUint8Array(data: Uint8Array, opts?: { sampleSize?: number; forceFull?: boolean }) {
  const sampleSize = opts?.sampleSize ?? 64 * 1024; // 64KB
  const forceFull = opts?.forceFull ?? false;

  const view = data;
  const len = view.byteLength;
  // create an exact ArrayBuffer slice covering only the view bytes for SubtleCrypto (avoids SharedArrayBuffer union issue)
  const fullBuf = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;

  // If SubtleCrypto is available and the size is small or user requested full, hash full buffer
  const hasSubtle = typeof crypto !== 'undefined' && !!(crypto && (crypto as any).subtle && (crypto as any).subtle.digest);
  if (hasSubtle && (forceFull || len <= sampleSize * 3)) {
    const hashBuf = await (crypto.subtle.digest('SHA-1', fullBuf) as Promise<ArrayBuffer>);
    const hashArray = Array.from(new Uint8Array(hashBuf));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // If large, sample first/middle/last blocks to reduce work and still be robust
  if (hasSubtle) {
    const s = Math.min(sampleSize, len);
    const out = new Uint8Array(s * 3 + 8);
    // start
    out.set(view.subarray(0, s), 0);
    // middle
    const midStart = Math.max(0, Math.floor((len - s) / 2));
    out.set(view.subarray(midStart, midStart + s), s);
    // end
    const endStart = Math.max(0, len - s);
    out.set(view.subarray(endStart, endStart + s), s * 2);
    // append 64-bit little-endian length to reduce collisions
    const dv = new DataView(out.buffer);
    // write as unsigned 64-bit (split into two 32-bit parts)
    dv.setUint32(s * 3, len >>> 0, true);
    dv.setUint32(s * 3 + 4, Math.floor(len / 0x100000000), true);

    const hashBuf = await (crypto.subtle.digest('SHA-1', out.buffer) as Promise<ArrayBuffer>);
    const hashArray = Array.from(new Uint8Array(hashBuf));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Fallback: fast non-crypto FNV-1a 64-bit hashed to hex (not cryptographically strong but fast)
  let h1 = BigInt(0xcbf29ce484222325n);
  const prime = BigInt(0x100000001b3n);
  for (let i = 0; i < len; i++) {
    h1 ^= BigInt(view[i]);
    h1 = (h1 * prime) & BigInt('0xFFFFFFFFFFFFFFFF');
  }
  // convert to hex padded to 16 chars
  return h1.toString(16).padStart(16, '0');
}