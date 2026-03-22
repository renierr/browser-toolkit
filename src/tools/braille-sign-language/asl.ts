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

export function generateASLSvg(letter: string, size: number = 64): string {
  const paths: Record<string, string> = {
    a: 'M32 56V40l-8-8v-8l8-8v-8l8 8v24l-8 16zm0-24h8v-8h-8v8zm8-16l-8 8h8v-8z',
    b: 'M44 56V16H24v8h12v8H24v8h12v16h8zm-12 0H24v-8h8v8zm8-24h-8v-8h8v8zm0-16h-8v-8h8v8z',
    c: 'M44 48c0-8-12-12-12-20s4-12 12-12 12 4 12 12-4 12-12 20zm-4-4c4-4 8-8 8-12s-2-8-8-8-8 4-8 8 4 8 8 12z',
    d: 'M44 56V16h-8v8h-12v8h12v8H36v8h8v16h8zm-12-8h-8v-8h8v8zm12-32h-12v-8h12v8z',
    e: 'M44 56V16H24v8h20v8H24v8h12v8h8v8h-12v8zm-8-24h-12v-8h12v8zm0-16h-12v-8h12v8z',
    f: 'M36 56V16H24v8h4v4h-4v8h4v8h-4v8h12v-8h4v8h4v-8h-4v-8h4v-8h-4v-4h4v-8h-12v8h-4v-8z',
    g: 'M44 56V40c0-8-12-12-12-20s4-12 12-12 12 4 12 12v8h-8v-8c0-2-2-4-4-4s-4 2-4 4v16h12v8h-8zm-4-4c4-4 8-8 8-12v-8h-4v8c0 2-2 4-4 4s-4-2-4-4v-4h-4v16z',
    h: 'M44 56V16H24v8h12v8H24v8h8v16h12v-8h-8v-16h8v8h-4v8h4v8h-8zm-12 0h-8v-8h8v8zm8-24h-8v-8h8v8zm0-16h-8v-8h8v8z',
    i: 'M32 56V16h-8v8h-4v8h4v16h8v-8h4v-8h-4v-16zm0 24h-4v-8h4v8zm4-24h-4v-8h4v8z',
    j: 'M40 56V16h-8v8h-8v8h8v16h8v-16h4v16h4v-32h-8zm0 24h-8v-8h8v8zm0-16h-4v-8h4v8z',
    k: 'M32 56V16h-8v8h4v8h-4v8h4v8h-4v8h8v-8h4v-8h-4v-8h4v-8h-8v8zm0-8h4v-8h-4v8z',
    l: 'M24 56V16h-8v8h12v32h8V16h-12v40zm4-40h-4v-8h4v8z',
    m: 'M56 56V16H32v8h8v4h-8v4h8v4h-8v4h8v4h-8v8h12v-8h8v-8h-8v-8h8v-8h-8v-8h8v8h4v8h-8zm-16 0h-8v-8h8v8zm0-8h-8v-8h8v8zm-8-8h8v-8h-8v8zm8-8h-8v-8h8v8z',
    n: 'M44 56V16H24v8h12v32h8V16h-8v32h8v8zm-12-8h-8v-8h8v8zm8-32h-8v-8h8v8z',
    o: 'M32 56c-12 0-20-8-20-20s8-20 20-20 20 8 20 20-8 20-20 20zm0-36c-8 0-12 4-12 16s4 16 12 16 12-4 12-16-4-16-12-16z',
    p: 'M44 56V40c0-12-12-16-12-24s4-12 12-12 12 4 12 12v8h-8v-8c0-2-2-4-4-4s-4 2-4 4v32h4v8h-12v-16h12v-8zm-4-12c4-4 8-8 8-12v-4h-4v4c0 2-2 4-4 4s-4-2-4-4v-4h-4v16z',
    q: 'M44 56V40c0-12-12-16-12-24s4-12 12-12 12 4 12 12v8h-8v-8c0-2-2-4-4-4s-4 2-4 4v40h-4v8h12v-8h4v-16zm-4-12c4-4 8-8 8-12v-4h-4v4c0 2-2 4-4 4s-4-2-4-4v-4h-4v16z',
    r: 'M32 56V16h-8v8h4v32h4v-32h4v8h-4v24zm0-40h-4v-8h4v8z',
    s: 'M40 52c0-8-16-12-16-20s8-8 16-8 12 4 12 12-8 8-16 12-8 8-8 16 8 8 16 8 12-4 12-12-8-8-16-8zm-12-8c8-4 12-8 12-12s-4-4-12-4-8 4-8 8 4 4 8 8zm0 12c-8 4-12 4-12 8s4 4 12 4 8-4 8-8-4-4-8-4z',
    t: 'M44 56V16h-8v8h-12v8h12v8h-4v8h4v8h8v-40h-4v-8h4v-8z',
    u: 'M44 56V16h-8v8h-4v8h4v16h8V24h4v8h-4v16h4v8h-4zm-4-24h-4v-8h4v8zm0-8h-4v-8h4v8z',
    v: 'M56 56V16h-8v8h-8v8h8v16h-16v8h24v-40zm-24 24h8v-8h-8v8z',
    w: 'M60 56V16h-8v8h-4v8h4v8h-4v8h4v8h-8v8h20v-40h-4v-8h4v-8zm-12 24h-4v-8h4v8zm4-16h-4v-8h4v8zm0-8h-4v-8h4v8z',
    x: 'M48 56V16h-8v8l-8-8-8 8v-8l8-8-8-8v8l8 8v-16h8v16l8-8 8 8v-16h8v16l8-8 8 8v8l-8 8 8 8v-8l-8-8v16h-8v-16l-8 8-8-8v16h-8z',
    y: 'M48 56V40l-8-16v-8l8-8v-8h8v8l8 8v8l-8 16v16h-8v-16zm-8-16l-4 8h8l-4-8z',
    z: 'M48 56V16h-32v8h24v8h-24v8h24v16h8v-32h-24v-8h24v8z',
  };

  const path = paths[letter.toLowerCase()] || '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}" class="asl-svg">
    <style>.asl-svg { fill: currentColor; }</style>
    <path d="${path}" />
  </svg>`;
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
