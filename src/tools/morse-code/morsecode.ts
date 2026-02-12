// prettier-ignore
export const MORSE_CODE: Record<string, string> = {
  A: '.-',
  B: '-...',
  C: '-.-.',
  D: '-..',
  E: '.',
  F: '..-.',
  G: '--.',
  H: '....',
  I: '..',
  J: '.---',
  K: '-.-',
  L: '.-..',
  M: '--',
  N: '-.',
  O: '---',
  P: '.--.',
  Q: '--.-',
  R: '.-.',
  S: '...',
  T: '-',
  U: '..-',
  V: '...-',
  W: '.--',
  X: '-..-',
  Y: '-.--',
  Z: '--..',
  'Ä': '.-.-',
  'Ö': '---.',
  'Ü': '..--',
  'ß': '...--..',
  '0': '-----',
  '1': '.----',
  '2': '..---',
  '3': '...--',
  '4': '....-',
  '5': '.....',
  '6': '-....',
  '7': '--...',
  '8': '---..',
  '9': '----.',
  ' ': '/',
  '.': '.-.-.-',
  ',': '--..--',
  '?': '..--..',
  "'": '.----.',
  '!': '-.-.--',
  '/': '-..-.',
  '(': '-.--.',
  ')': '-.--.-',
  '&': '.-...',
  ':': '---...',
  ';': '-.-.-.',
  '=': '-...-',
  '+': '.-.-.',
  '-': '-....-',
  _: '..--.-',
  '"': '.-..-.',
  '@': '.--.-.',
};

export const REVERSE_MORSE_CODE: Record<string, string> = Object.entries(MORSE_CODE).reduce(
  (acc, [char, code]) => {
    acc[code] = char;
    return acc;
  },
  {} as Record<string, string>
);

export function textToMorse(text: string): string {
  const words = text
    .toUpperCase()
    .trim()
    .split(/\s+/)
    .filter((w) => w !== '');

  const result: string[] = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const chars = word.split('');

    for (let j = 0; j < chars.length; j++) {
      const char = chars[j];
      const code = MORSE_CODE[char];
      if (code) {
        result.push(code);
        // After each character, add a character gap separator
        if (j < chars.length - 1) {
          result.push('/');
        }
      }
    }

    // After each word, add a word gap separator
    if (i < words.length - 1) {
      result.push('//');
    }
  }

  return result.join(' ');
}

export function textToMorseHtml(text: string): string {
  const morse = textToMorse(text);
  const parts = morse.split(' ');
  let result = '';

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    if (part === '//') {
      result += `<span class="morse-part word-gap" data-index="${i}"> // </span>`;
    } else if (part === '/') {
      result += `<span class="morse-part char-gap" data-index="${i}"> / </span>`;
    } else {
      let charHtml = '';
      for (const sym of part) {
        if (sym === '.') {
          charHtml += '<span class="dot">.</span>';
        } else if (sym === '-') {
          charHtml += '<span class="dash">-</span>';
        }
      }
      result += `<span class="morse-part" data-index="${i}">${charHtml}</span>`;
    }
  }

  return (
    result ||
    '<span class="morse-part" data-index="0"><span class="dot">.</span><span class="dot">.</span><span class="dot">.</span></span> <span class="morse-part char-gap" data-index="1"> / </span> <span class="morse-part" data-index="2"><span class="dash">-</span><span class="dash">-</span><span class="dash">-</span></span> <span class="morse-part char-gap" data-index="3"> / </span> <span class="morse-part" data-index="4"><span class="dot">.</span><span class="dot">.</span><span class="dot">.</span></span>'
  );
}
