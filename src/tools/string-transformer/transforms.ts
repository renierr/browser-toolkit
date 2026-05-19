const splitIntoWords = (str: string): string[] => {
  return str
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z\d])/g, '$1 $2')
    .split(/[\s_\-]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
};

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

const toBase64 = (str: string): string => {
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1, 16))
    )
  );
};

const fromBase64 = (str: string): string => {
  return decodeURIComponent(
    atob(str)
      .split('')
      .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join('')
  );
};

const toCase = (input: string, joinWith: string, capitalizeFirst: boolean): string => {
  const words = splitIntoWords(input);
  if (words.length === 0) return input;
  const fn = capitalizeFirst ? (w: string) => capitalize(w) : (w: string) => w;
  return words.map(fn).join(joinWith);
};

const camelCase = (input: string): string => {
  const words = splitIntoWords(input);
  if (words.length === 0) return input;
  return words[0] + words.slice(1).map(capitalize).join('');
};

const pascalCase = (input: string): string => {
  const words = splitIntoWords(input);
  if (words.length === 0) return input;
  return words.map(capitalize).join('');
};

const snakeCase = (input: string): string => toCase(input, '_', false);
const kebabCase = (input: string): string => toCase(input, '-', false);

const urlSlug = (input: string): string => {
  return input
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
};

const hexEncode = (input: string): string => {
  if (!input) return '';
  return Array.from(input)
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('');
};

const hexDecode = (input: string): string => {
  if (!input) return '';
  const hex = input.replace(/\s+/g, '');
  if (hex.length % 2 !== 0) throw new Error('Hex string has odd length');
  if (!/^[0-9a-fA-F]+$/.test(hex)) throw new Error('Invalid hex string');
  let result = '';
  for (let i = 0; i < hex.length; i += 2) {
    result += String.fromCharCode(parseInt(hex.substring(i, i + 2), 16));
  }
  return result;
};

const decodeAdUrl = (input: string): string => {
  if (!input) return '';
  try {
    const url = new URL(input);
    const lines: string[] = [];

    url.searchParams.forEach((val) => {
      const decoded = decodeURIComponent(val);
      const httpMatch = decoded.match(/(https?:\/\/[^\s&]+)/i);
      if (httpMatch) lines.push(httpMatch[1]);
      try {
        const b64 = fromBase64(decoded.replace(/-/g, '+').replace(/_/g, '/'));
        const b64Match = b64.match(/(https?:\/\/[^\s&]+)/i);
        if (b64Match) lines.push(b64Match[1]);
      } catch {
        // not base64, skip
      }
    });

    const pathMatch = url.pathname.match(/(https?:\/\/[^\s?#]+)/i);
    if (pathMatch) lines.push(pathMatch[1]);

    if (url.hash) {
      const hashStr = decodeURIComponent(url.hash.slice(1));
      const hashMatch = hashStr.match(/(https?:\/\/[^\s?#&]+)/i);
      if (hashMatch) lines.push(hashMatch[1]);
    }

    const unique = [...new Set(lines)];
    return unique.length > 0 ? unique.join('\n') : 'No embedded URL detected.';
  } catch {
    throw new Error('Invalid URL');
  }
};

export const transforms: Record<string, (input: string) => string> = {
  'camel-case': camelCase,
  'snake-case': snakeCase,
  'kebab-case': kebabCase,
  'pascal-case': pascalCase,
  'url-slug': urlSlug,
  'base64-encode': (input) => (input ? toBase64(input) : ''),
  'base64-decode': (input) => (input ? fromBase64(input.trim()) : ''),
  'hex-encode': hexEncode,
  'hex-decode': hexDecode,
  'ad-url-decode': decodeAdUrl,
};
