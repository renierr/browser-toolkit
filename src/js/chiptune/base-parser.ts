import type { ModuleFile } from './types';
import { readString } from './types';

export abstract class BaseParser {
  protected data: Uint8Array;
  protected pos = 0;

  constructor(data: Uint8Array) {
    this.data = data;
    this.pos = 0;
  }

  protected readU8(): number {
    return this.pos < this.data.length ? this.data[this.pos++] : 0;
  }

  protected readS8(): number {
    const v = this.readU8();
    return v > 127 ? v - 256 : v;
  }

  protected readU16LE(): number {
    if (this.pos + 1 >= this.data.length) return 0;
    const v = this.data[this.pos] | (this.data[this.pos + 1] << 8);
    this.pos += 2;
    return v;
  }

  protected readU16BE(): number {
    if (this.pos + 1 >= this.data.length) return 0;
    const v = (this.data[this.pos] << 8) | this.data[this.pos + 1];
    this.pos += 2;
    return v;
  }

  protected readU32LE(): number {
    if (this.pos + 3 >= this.data.length) return 0;
    const v = (this.data[this.pos] | (this.data[this.pos + 1] << 8) | (this.data[this.pos + 2] << 16) | (this.data[this.pos + 3] << 24)) >>> 0;
    this.pos += 4;
    return v;
  }

  protected readStr(len: number): string {
    const s = readString(this.data, this.pos, len);
    this.pos += len;
    return s;
  }

  protected setPos(offset: number): void {
    if (offset >= 0 && offset <= this.data.length) {
      this.pos = offset;
    }
  }

  abstract parse(): ModuleFile;
}
