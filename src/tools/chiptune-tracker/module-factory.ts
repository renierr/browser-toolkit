import type { ModuleFile, Note } from '@js/chiptune/types';
import { ROWS_PER_PATTERN } from './note-utils';

export function createEmptyModule(channels = 4, patternCount = 4): ModuleFile {
  const instruments = Array.from({ length: 31 }, (_, i) => ({
    name: `Sample ${i + 1}`,
    samples: [],
    sampleMap: [],
    volumeFadeout: 0,
  }));

  const patterns = Array.from({ length: patternCount }, () => createEmptyPattern(channels));

  return {
    type: 'MOD',
    title: 'Untitled',
    instruments,
    patterns,
    sequence: Array.from({ length: patternCount }, (_, i) => i),
    channels,
    defaultBpm: 125,
    defaultSpeed: 6,
    rowsPerPattern: ROWS_PER_PATTERN,
    linearFrequencies: false,
  };
}

export function createEmptyPattern(channels: number): { rows: Note[][] } {
  const rows = Array.from({ length: ROWS_PER_PATTERN }, () =>
    Array.from({ length: channels }, () => createEmptyNote())
  );
  return { rows };
}

function createEmptyNote(): Note {
  return {
    note: null,
    period: null,
    instrument: 0,
    volume: null,
    volumeColumn: null,
    effect: 0,
    effectParam: 0,
  };
}

export function insertPattern(mod: ModuleFile, index: number): number {
  const newId = mod.patterns.length;
  mod.patterns.push(createEmptyPattern(mod.channels));
  mod.sequence.splice(index, 0, newId);
  return newId;
}

export function duplicatePattern(mod: ModuleFile, index: number): number {
  const srcPatternId = mod.sequence[index];
  const srcPattern = mod.patterns[srcPatternId];
  if (!srcPattern) return -1;

  const newId = mod.patterns.length;
  const rows = srcPattern.rows.map((row) => row.map((cell) => ({ ...cell })));
  mod.patterns.push({ rows });
  mod.sequence.splice(index + 1, 0, newId);
  return newId;
}

export function removePattern(mod: ModuleFile, index: number): boolean {
  if (mod.sequence.length <= 1) return false;
  mod.sequence.splice(index, 1);
  return true;
}

export function patternHasContent(mod: ModuleFile, patternId: number): boolean {
  const pattern = mod.patterns[patternId];
  if (!pattern) return false;
  for (const row of pattern.rows) {
    for (const cell of row) {
      if (cell.note || cell.instrument || cell.effect) return true;
    }
  }
  return false;
}
