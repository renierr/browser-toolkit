export interface BrailleChar {
  letter: string;
  braille: string;
  unicode: string;
  name: string;
}

export const brailleAlphabet: BrailleChar[] = [
  { letter: 'a', braille: '⠁', unicode: '\u2801', name: 'A' },
  { letter: 'b', braille: '⠃', unicode: '\u2803', name: 'B' },
  { letter: 'c', braille: '⠉', unicode: '\u2809', name: 'C' },
  { letter: 'd', braille: '⠙', unicode: '\u2819', name: 'D' },
  { letter: 'e', braille: '⠑', unicode: '\u2811', name: 'E' },
  { letter: 'f', braille: '⠋', unicode: '\u280B', name: 'F' },
  { letter: 'g', braille: '⠛', unicode: '\u281B', name: 'G' },
  { letter: 'h', braille: '⠓', unicode: '\u2813', name: 'H' },
  { letter: 'i', braille: '⠊', unicode: '\u280A', name: 'I' },
  { letter: 'j', braille: '⠚', unicode: '\u281A', name: 'J' },
  { letter: 'k', braille: '⠅', unicode: '\u2805', name: 'K' },
  { letter: 'l', braille: '⠇', unicode: '\u2815', name: 'L' },
  { letter: 'm', braille: '⠍', unicode: '\u280D', name: 'M' },
  { letter: 'n', braille: '⠝', unicode: '\u281D', name: 'N' },
  { letter: 'o', braille: '⠕', unicode: '\u2815', name: 'O' },
  { letter: 'p', braille: '⠏', unicode: '\u280F', name: 'P' },
  { letter: 'q', braille: '⠟', unicode: '\u281F', name: 'Q' },
  { letter: 'r', braille: '⠗', unicode: '\u2817', name: 'R' },
  { letter: 's', braille: '⠎', unicode: '\u280E', name: 'S' },
  { letter: 't', braille: '⠞', unicode: '\u281E', name: 'T' },
  { letter: 'u', braille: '⠥', unicode: '\u2825', name: 'U' },
  { letter: 'v', braille: '⠧', unicode: '\u2827', name: 'V' },
  { letter: 'w', braille: '⠺', unicode: '\u283A', name: 'W' },
  { letter: 'x', braille: '⠭', unicode: '\u282D', name: 'X' },
  { letter: 'y', braille: '⠽', unicode: '\u283D', name: 'Y' },
  { letter: 'z', braille: '⠵', unicode: '\u2835', name: 'Z' },
];

export const brailleNumberSign = '⠼';
export const numberMap: Record<string, string> = {
  '1': '⠁',
  '2': '⠃',
  '3': '⠉',
  '4': '⠙',
  '5': '⠑',
  '6': '⠋',
  '7': '⠛',
  '8': '⠓',
  '9': '⠊',
  '0': '⠚',
};

export function getBrailleForChar(char: string): BrailleChar | null {
  const lower = char.toLowerCase();
  return brailleAlphabet.find((b) => b.letter === lower) || null;
}

export function textToBraille(text: string): BrailleChar[] {
  const result: BrailleChar[] = [];
  let inNumber = false;

  for (const char of text) {
    if (/[a-zA-Z]/.test(char)) {
      if (inNumber) {
        inNumber = false;
      }
      const braille = getBrailleForChar(char);
      if (braille) {
        result.push(braille);
      }
    } else if (/[0-9]/.test(char)) {
      if (!inNumber) {
        result.push({
          letter: '#',
          braille: brailleNumberSign,
          unicode: brailleNumberSign,
          name: 'Number Sign',
        });
        inNumber = true;
      }
      const numBraille = numberMap[char];
      if (numBraille) {
        result.push({
          letter: char,
          braille: numBraille,
          unicode: numBraille,
          name: char,
        });
      }
    } else if (/\s/.test(char)) {
      if (inNumber) {
        inNumber = false;
      }
    }
  }

  return result;
}

export function generateBrailleSvg(brailleChar: string, size: number = 48): string {
  const dotRadius = size * 0.12;
  const dotSpacing = size * 0.35;
  const margin = size * 0.15;

  const dotPositions = [
    { x: margin, y: margin },
    { x: margin + dotSpacing, y: margin },
    { x: margin, y: margin + dotSpacing },
    { x: margin + dotSpacing, y: margin + dotSpacing },
    { x: margin, y: margin + dotSpacing * 2 },
    { x: margin + dotSpacing, y: margin + dotSpacing * 2 },
  ];

  const dotPattern: Record<string, number[]> = {
    '⠁': [1, 0, 0, 0, 0, 0],
    '⠃': [1, 1, 0, 0, 0, 0],
    '⠉': [1, 0, 1, 0, 0, 0],
    '⠙': [1, 0, 1, 1, 0, 0],
    '⠑': [1, 0, 0, 1, 0, 0],
    '⠋': [1, 1, 1, 0, 0, 0],
    '⠛': [1, 1, 1, 1, 0, 0],
    '⠓': [1, 1, 0, 1, 0, 0],
    '⠊': [1, 0, 1, 1, 0, 0],
    '⠚': [1, 0, 1, 1, 1, 0],
    '⠅': [1, 0, 0, 0, 1, 0],
    '⠇': [1, 1, 0, 0, 1, 0],
    '⠍': [1, 0, 1, 0, 1, 0],
    '⠝': [1, 0, 1, 1, 1, 0],
    '⠕': [1, 0, 0, 1, 1, 0],
    '⠏': [1, 1, 1, 0, 1, 0],
    '⠟': [1, 1, 1, 1, 1, 0],
    '⠗': [1, 1, 0, 1, 1, 0],
    '⠎': [1, 0, 1, 1, 1, 0],
    '⠞': [1, 0, 1, 1, 1, 1],
    '⠥': [1, 0, 0, 0, 1, 1],
    '⠧': [1, 1, 0, 0, 1, 1],
    '⠺': [1, 0, 1, 1, 1, 1],
    '⠭': [1, 0, 1, 0, 1, 1],
    '⠽': [1, 0, 1, 1, 1, 1],
    '⠵': [1, 0, 1, 0, 1, 1],
    '⠼': [0, 0, 1, 1, 1, 0],
  };

  const pattern = dotPattern[brailleChar] || [];
  const dots = dotPositions.map((pos, i) => ({
    cx: pos.x,
    cy: pos.y,
    filled: pattern[i] === 1,
  }));

  const svgDots = dots
    .map(
      (dot) =>
        `<circle cx="${dot.cx}" cy="${dot.cy}" r="${dotRadius}" class="${dot.filled ? 'filled' : 'empty'}"/>`
    )
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="braille-svg">
    <style>
      .filled { fill: currentColor; }
      .empty { fill: none; stroke: currentColor; stroke-width: 1.5; opacity: 0.3; }
    </style>
    ${svgDots}
  </svg>`;
}

export function getBrailleUnicode(text: string): string {
  const brailleChars = textToBraille(text);
  return brailleChars.map((b) => b.unicode).join('');
}

const brailleToLetterMap: Record<string, string> = {};
brailleAlphabet.forEach((b) => {
  brailleToLetterMap[b.unicode] = b.letter;
});

export function brailleToText(brailleText: string): string {
  const result: string[] = [];
  let i = 0;

  while (i < brailleText.length) {
    const char = brailleText[i];

    if (char === brailleNumberSign) {
      result.push('#');
      i++;
      continue;
    }

    const letter = brailleToLetterMap[char];
    if (letter) {
      result.push(letter);
    } else if (!/\s/.test(char) && char.trim() !== '') {
      result.push(char);
    } else if (/\s/.test(char)) {
      result.push(' ');
    }
    i++;
  }

  return result.join('');
}
