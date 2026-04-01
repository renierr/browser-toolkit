const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const AMIGA_BASE_PERIODS = [1712, 1616, 1525, 1440, 1357, 1281, 1209, 1141, 1077, 1017, 961, 907];

export const ROWS_PER_PATTERN = 64;

export type TrackerCol = 'note' | 'ins' | 'vol' | 'effect' | 'param';

export type ClipboardCell = {
  note: number | null;
  instrument: number;
  volume: number | null;
  effect: number;
  effectParam: number;
};

export function noteNumberToName(n: number): { note: string; octave: number } | null {
  if (n < 1 || n > 96) return null;
  const idx = (n - 1) % 12;
  const oct = Math.floor((n - 1) / 12) + 1;
  return { note: NOTE_NAMES[idx], octave: oct };
}

export function noteNameToNumber(note: string, octave: number): number {
  const idx = NOTE_NAMES.indexOf(note);
  if (idx < 0) return 0;
  return octave * 12 + idx + 1;
}

export function formatNoteCompact(noteNum: number | null): string {
  if (!noteNum || noteNum === 97) return noteNum === 97 ? '^^^' : '---';
  const info = noteNumberToName(noteNum);
  if (!info) return '---';
  return `${info.note.padEnd(2, '-')}${info.octave}`;
}

export function noteToFrequency(note: string, octave: number): number {
  const semitones = NOTE_NAMES.indexOf(note);
  if (semitones < 0) return 0;
  const midiNote = (octave + 1) * 12 + semitones;
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}

export function calculatePeriod(noteNum: number): number {
  const noteIdx = (noteNum - 1) % 12;
  const octave = Math.floor((noteNum - 1) / 12);
  let period = AMIGA_BASE_PERIODS[noteIdx] || 0;
  period = period / Math.pow(2, octave);
  return Math.round(period);
}

export function hexByte(value: number): string {
  return value.toString(16).toUpperCase().padStart(2, '0');
}

export function parseHexByte(input: string): number {
  const parsed = parseInt(input, 16);
  return isNaN(parsed) ? 0 : parsed;
}

export const NOTE_MAP: Record<string, string> = {
  z: 'C',
  s: 'C#',
  x: 'D',
  d: 'D#',
  c: 'E',
  v: 'F',
  g: 'F#',
  b: 'G',
  h: 'G#',
  n: 'A',
  j: 'A#',
  m: 'B',
};
