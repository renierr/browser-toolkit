import { showMessage } from '@js/ui.ts';

export default function init() {
  const inputText = document.getElementById('input-text') as HTMLTextAreaElement;
  const outputText = document.getElementById('output-text') as HTMLTextAreaElement;
  const transformSelect = document.getElementById('transform-select') as HTMLSelectElement;
  const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;
  const btnCopy = document.getElementById('btn-copy') as HTMLButtonElement;
  const btnSwap = document.getElementById('btn-swap') as HTMLButtonElement;
  const inputStats = document.getElementById('input-stats') as HTMLSpanElement;
  const outputStats = document.getElementById('output-stats') as HTMLSpanElement;

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

  const transforms: Record<string, (input: string) => string> = {
    'camel-case': (input) => {
      const words = splitIntoWords(input);
      if (words.length === 0) return input;
      return words[0] + words.slice(1).map(capitalize).join('');
    },
    'snake-case': (input) => {
      const words = splitIntoWords(input);
      if (words.length === 0) return input;
      return words.join('_');
    },
    'kebab-case': (input) => {
      const words = splitIntoWords(input);
      if (words.length === 0) return input;
      return words.join('-');
    },
    'pascal-case': (input) => {
      const words = splitIntoWords(input);
      if (words.length === 0) return input;
      return words.map(capitalize).join('');
    },
    'url-slug': (input) => {
      return input
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
    },
    'base64-encode': (input) => {
      if (!input) return '';
      return toBase64(input);
    },
    'base64-decode': (input) => {
      if (!input) return '';
      return fromBase64(input.trim());
    },
    'hex-encode': (input) => {
      if (!input) return '';
      return Array.from(input)
        .map((c) => c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('');
    },
    'hex-decode': (input) => {
      if (!input) return '';
      const hex = input.replace(/\s+/g, '');
      if (hex.length % 2 !== 0) throw new Error('Hex string has odd length');
      if (!/^[0-9a-fA-F]+$/.test(hex)) throw new Error('Invalid hex string');
      let result = '';
      for (let i = 0; i < hex.length; i += 2) {
        result += String.fromCharCode(parseInt(hex.substring(i, i + 2), 16));
      }
      return result;
    },
    'ad-url-decode': (input) => {
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
    },
  };

  const updateStats = () => {
    inputStats.textContent = inputText.value.length + ' chars';
    outputStats.textContent = outputText.value.length + ' chars';
  };

  const transform = () => {
    const input = inputText.value;
    const type = transformSelect.value;
    const fn = transforms[type];
    if (!fn) {
      outputText.value = '';
      updateStats();
      return;
    }
    try {
      outputText.value = fn(input);
    } catch (e) {
      outputText.value = 'Error: ' + (e instanceof Error ? e.message : 'Transformation failed');
    }
    updateStats();
  };

  const handleClear = () => {
    inputText.value = '';
    outputText.value = '';
    transformSelect.value = 'camel-case';
    updateStats();
    inputText.focus();
  };

  const handleCopy = async () => {
    if (!outputText.value) return;
    try {
      await navigator.clipboard.writeText(outputText.value);
      showMessage('Copied to clipboard');
    } catch {
      showMessage('Failed to copy', { type: 'alert' });
    }
  };

  const handleSwap = () => {
    const tmp = inputText.value;
    inputText.value = outputText.value;
    outputText.value = tmp;
    updateStats();
    transform();
  };

  inputText.addEventListener('input', transform);
  transformSelect.addEventListener('change', transform);
  btnClear.addEventListener('click', handleClear);
  btnCopy.addEventListener('click', handleCopy);
  btnSwap.addEventListener('click', handleSwap);

  transform();

  return () => {
    inputText.removeEventListener('input', transform);
    transformSelect.removeEventListener('change', transform);
    btnClear.removeEventListener('click', handleClear);
    btnCopy.removeEventListener('click', handleCopy);
    btnSwap.removeEventListener('click', handleSwap);
  };
}
