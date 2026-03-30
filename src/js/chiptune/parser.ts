import type { ModuleFile } from './types';
import { readString } from './types';
import { ModParser } from './mod-parser';
import { XmParser } from './xm-parser';
import { ItParser } from './it-parser';

export { BaseParser } from './base-parser';
export { ModParser } from './mod-parser';
export { XmParser } from './xm-parser';
export { ItParser } from './it-parser';

export function parseModule(data: Uint8Array): ModuleFile {
  const impm = readString(data, 0, 4);
  if (impm === 'IMPM') return new ItParser(data).parse();
  const extMod = readString(data, 0, 17);
  if (extMod === 'Extended Module: ') return new XmParser(data).parse();
  return new ModParser(data).parse();
}
