export interface BrailleChar {
  letter: string;
  braille: string;
  unicode: string;
  name: string;
}

export const brailleAlphabet: BrailleChar[] = [
  { letter: 'a', braille: '⠁', unicode: '⠁', name: 'A' },
  { letter: 'b', braille: '⠃', unicode: '⠃', name: 'B' },
  { letter: 'c', braille: '⠉', unicode: '⠉', name: 'C' },
  { letter: 'd', braille: '⠙', unicode: '⠙', name: 'D' },
  { letter: 'e', braille: '⠑', unicode: '⠑', name: 'E' },
  { letter: 'f', braille: '⠋', unicode: '⠋', name: 'F' },
  { letter: 'g', braille: '⠛', unicode: '⠛', name: 'G' },
  { letter: 'h', braille: '⠓', unicode: '⠓', name: 'H' },
  { letter: 'i', braille: '⠊', unicode: '⠊', name: 'I' },
  { letter: 'j', braille: '⠚', unicode: '⠚', name: 'J' },
  { letter: 'k', braille: '⠅', unicode: '⠅', name: 'K' },
  { letter: 'l', braille: '⠇', unicode: '⠇', name: 'L' },
  { letter: 'm', braille: '⠍', unicode: '⠍', name: 'M' },
  { letter: 'n', braille: '⠝', unicode: '⠝', name: 'N' },
  { letter: 'o', braille: '⠕', unicode: '⠕', name: 'O' },
  { letter: 'p', braille: '⠏', unicode: '⠏', name: 'P' },
  { letter: 'q', braille: '⠟', unicode: '⠟', name: 'Q' },
  { letter: 'r', braille: '⠗', unicode: '⠗', name: 'R' },
  { letter: 's', braille: '⠎', unicode: '⠎', name: 'S' },
  { letter: 't', braille: '⠞', unicode: '⠞', name: 'T' },
  { letter: 'u', braille: '⠥', unicode: '⠥', name: 'U' },
  { letter: 'v', braille: '⠧', unicode: '⠧', name: 'V' },
  { letter: 'w', braille: '⠺', unicode: '⠺', name: 'W' },
  { letter: 'x', braille: '⠭', unicode: '⠭', name: 'X' },
  { letter: 'y', braille: '⠽', unicode: '⠽', name: 'Y' },
  { letter: 'z', braille: '⠵', unicode: '⠵', name: 'Z' },
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

const brailleToLetterMap: Record<string, string> = {};
brailleAlphabet.forEach((b) => {
  brailleToLetterMap[b.unicode] = b.letter;
});

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
  const result: string[] = [];
  let inNumber = false;

  for (const char of text) {
    if (/[a-zA-Z]/.test(char)) {
      if (inNumber) {
        inNumber = false;
      }
      const braille = getBrailleForChar(char);
      if (braille) {
        result.push(braille.unicode);
      }
    } else if (/[0-9]/.test(char)) {
      if (!inNumber) {
        result.push(brailleNumberSign);
        inNumber = true;
      }
      const numBraille = numberMap[char];
      if (numBraille) {
        result.push(numBraille);
      }
    } else if (/\s/.test(char)) {
      result.push(' ');
      inNumber = false;
    }
  }

  return result.join('');
}

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
