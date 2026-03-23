export interface ASLChar {
  letter: string;
  name: string;
}

export const aslAlphabet: ASLChar[] = [
  { letter: 'a', name: 'A' },
  { letter: 'b', name: 'B' },
  { letter: 'c', name: 'C' },
  { letter: 'd', name: 'D' },
  { letter: 'e', name: 'E' },
  { letter: 'f', name: 'F' },
  { letter: 'g', name: 'G' },
  { letter: 'h', name: 'H' },
  { letter: 'i', name: 'I' },
  { letter: 'j', name: 'J' },
  { letter: 'k', name: 'K' },
  { letter: 'l', name: 'L' },
  { letter: 'm', name: 'M' },
  { letter: 'n', name: 'N' },
  { letter: 'o', name: 'O' },
  { letter: 'p', name: 'P' },
  { letter: 'q', name: 'Q' },
  { letter: 'r', name: 'R' },
  { letter: 's', name: 'S' },
  { letter: 't', name: 'T' },
  { letter: 'u', name: 'U' },
  { letter: 'v', name: 'V' },
  { letter: 'w', name: 'W' },
  { letter: 'x', name: 'X' },
  { letter: 'y', name: 'Y' },
  { letter: 'z', name: 'Z' },
];

export function getASLForChar(char: string): ASLChar | null {
  const lower = char.toLowerCase();
  return aslAlphabet.find((a) => a.letter === lower) || null;
}

export function textToASL(text: string): ASLChar[] {
  const result: ASLChar[] = [];
  for (const char of text) {
    if (/[a-zA-Z]/.test(char)) {
      const asl = getASLForChar(char);
      if (asl) {
        result.push(asl);
      }
    }
  }
  return result;
}
