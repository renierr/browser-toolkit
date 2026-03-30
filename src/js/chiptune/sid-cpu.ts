export class CPU6502 {
  public mem = new Uint8Array(65536);
  public a = 0;
  public x = 0;
  public y = 0;
  public pc = 0;
  public s = 0xff;
  public p = 0x24; // I and U flags set

  public cycles = 0;

  constructor() {}

  public reset(): void {
    this.a = 0;
    this.x = 0;
    this.y = 0;
    this.s = 0xff;
    this.p = 0x24;
    this.pc = this.read16(0xfffc);
    this.cycles = 0;
  }

  public read(addr: number): number {
    return this.mem[addr];
  }

  public write(addr: number, val: number): void {
    this.mem[addr] = val;
  }

  public read16(addr: number): number {
    return this.read(addr) | (this.read(addr + 1) << 8);
  }

  private push(val: number): void {
    this.write(0x100 + this.s, val);
    this.s = (this.s - 1) & 0xff;
  }

  private push16(val: number): void {
    this.push((val >> 8) & 0xff);
    this.push(val & 0xff);
  }

  private pop(): number {
    this.s = (this.s + 1) & 0xff;
    return this.read(0x100 + this.s);
  }

  private pop16(): number {
    const lo = this.pop();
    const hi = this.pop();
    return lo | (hi << 8);
  }

  private setZN(val: number): void {
    if (val === 0)
      this.p |= 0x02; // Z
    else this.p &= ~0x02;
    if (val & 0x80)
      this.p |= 0x80; // N
    else this.p &= ~0x80;
  }

  private and(val: number): void {
    this.a &= val;
    this.setZN(this.a);
  }

  private ora(val: number): void {
    this.a |= val;
    this.setZN(this.a);
  }

  private eor(val: number): void {
    this.a ^= val;
    this.setZN(this.a);
  }

  private adc(val: number): void {
    const carry = this.p & 0x01 ? 1 : 0;
    const result = this.a + val + carry;
    this.p = (this.p & ~0x01) | (result > 255 ? 0x01 : 0);
    this.a = result & 0xff;
    this.setZN(this.a);
  }

  private sbc(val: number): void {
    this.adc((val ^ 0xff) & 0xff);
  }

  private asl(val: number): number {
    const result = (val << 1) & 0xff;
    this.p = (this.p & ~0x01) | (val & 0x80 ? 0x01 : 0);
    return result;
  }

  private lsr(val: number): number {
    this.p = (this.p & ~0x01) | (val & 0x01);
    const result = val >> 1;
    this.setZN(result);
    return result;
  }

  private rol(val: number): number {
    const carry = this.p & 0x01 ? 1 : 0;
    const result = ((val << 1) | carry) & 0xff;
    this.p = (this.p & ~0x01) | (val & 0x80 ? 0x01 : 0);
    this.setZN(result);
    return result;
  }

  private ror(val: number): number {
    const carry = this.p & 0x01 ? 0x80 : 0;
    const result = (val >> 1) | carry;
    this.p = (this.p & ~0x01) | (val & 0x01);
    this.setZN(result);
    return result;
  }

  private cmp(a: number, b: number): void {
    const result = a - b;
    this.p = (this.p & ~0x01) | (a >= b ? 0x01 : 0);
    this.setZN(result & 0xff);
  }

  private branch(cond: boolean): void {
    const offset = this.read(this.pc++);
    if (cond) {
      const newPc = offset & 0x80 ? this.pc + (offset - 256) : this.pc + offset;
      this.pc = newPc;
      this.cycles += 1;
    }
  }

  public step(): void {
    const op = this.read(this.pc++);
    let val = 0;
    let addr = 0;

    switch (op) {
      case 0x69: // ADC imm
        this.adc(this.read(this.pc++));
        this.cycles += 2;
        break;
      case 0x65: // ADC zp
        this.adc(this.read(this.read(this.pc++)));
        this.cycles += 3;
        break;
      case 0x6d: // ADC abs
        this.adc(this.read(this.read16(this.pc)));
        this.pc += 2;
        this.cycles += 4;
        break;
      case 0xe9: // SBC imm
        this.sbc(this.read(this.pc++));
        this.cycles += 2;
        break;
      case 0xa9: // LDA imm
        this.a = this.read(this.pc++);
        this.setZN(this.a);
        this.cycles += 2;
        break;
      case 0xa5: // LDA zp
        this.a = this.read(this.read(this.pc++));
        this.setZN(this.a);
        this.cycles += 3;
        break;
      case 0xb5: // LDA zp,X
        this.a = this.read((this.read(this.pc++) + this.x) & 0xff);
        this.setZN(this.a);
        this.cycles += 4;
        break;
      case 0xad: // LDA abs
        this.a = this.read(this.read16(this.pc));
        this.pc += 2;
        this.setZN(this.a);
        this.cycles += 4;
        break;
      case 0xbd: // LDA abs,X
        addr = (this.read16(this.pc) + this.x) & 0xffff;
        this.a = this.read(addr);
        this.pc += 2;
        this.setZN(this.a);
        this.cycles += 4;
        break;
      case 0xb9: // LDA abs,Y
        addr = (this.read16(this.pc) + this.y) & 0xffff;
        this.a = this.read(addr);
        this.pc += 2;
        this.setZN(this.a);
        this.cycles += 4;
        break;
      case 0xa1: // LDA (zp,X)
        addr =
          this.read((this.read(this.pc++) + this.x) & 0xff) |
          (this.read((this.read(this.pc) + this.x + 1) & 0xff) << 8);
        this.a = this.read(addr);
        this.setZN(this.a);
        this.cycles += 6;
        break;
      case 0xb1: // LDA (zp),Y
        const base = this.read(this.read(this.pc++));
        addr = (base + this.y) & 0xffff;
        this.a = this.read(addr);
        this.setZN(this.a);
        this.cycles += 5;
        break;
      case 0x85: // STA zp
        this.write(this.read(this.pc++), this.a);
        this.cycles += 3;
        break;
      case 0x95: // STA zp,X
        this.write((this.read(this.pc++) + this.x) & 0xff, this.a);
        this.cycles += 4;
        break;
      case 0x8d: // STA abs
        this.write(this.read16(this.pc), this.a);
        this.pc += 2;
        this.cycles += 4;
        break;
      case 0x9d: // STA abs,X
        this.write((this.read16(this.pc) + this.x) & 0xffff, this.a);
        this.pc += 2;
        this.cycles += 5;
        break;
      case 0x99: // STA abs,Y
        this.write((this.read16(this.pc) + this.y) & 0xffff, this.a);
        this.pc += 2;
        this.cycles += 5;
        break;
      case 0x81: // STA (zp,X)
        addr =
          this.read((this.read(this.pc++) + this.x) & 0xff) |
          (this.read((this.read(this.pc) + this.x + 1) & 0xff) << 8);
        this.write(addr, this.a);
        this.cycles += 6;
        break;
      case 0x91: // STA (zp),Y
        addr = this.read(this.read(this.pc++)) + this.y;
        this.write(addr & 0xffff, this.a);
        this.cycles += 6;
        break;
      case 0xa2: // LDX imm
        this.x = this.read(this.pc++);
        this.setZN(this.x);
        this.cycles += 2;
        break;
      case 0xa6: // LDX zp
        this.x = this.read(this.read(this.pc++));
        this.setZN(this.x);
        this.cycles += 3;
        break;
      case 0xb6: // LDX zp,Y
        this.x = this.read((this.read(this.pc++) + this.y) & 0xff);
        this.setZN(this.x);
        this.cycles += 4;
        break;
      case 0xae: // LDX abs
        this.x = this.read(this.read16(this.pc));
        this.pc += 2;
        this.setZN(this.x);
        this.cycles += 4;
        break;
      case 0xbe: // LDX abs,Y
        this.x = this.read((this.read16(this.pc) + this.y) & 0xffff);
        this.pc += 2;
        this.setZN(this.x);
        this.cycles += 4;
        break;
      case 0x86: // STX zp
        this.write(this.read(this.pc++), this.x);
        this.cycles += 3;
        break;
      case 0x96: // STX zp,Y
        this.write((this.read(this.pc++) + this.y) & 0xff, this.x);
        this.cycles += 4;
        break;
      case 0x8e: // STX abs
        this.write(this.read16(this.pc), this.x);
        this.pc += 2;
        this.cycles += 4;
        break;
      case 0xa0: // LDY imm
        this.y = this.read(this.pc++);
        this.setZN(this.y);
        this.cycles += 2;
        break;
      case 0xa4: // LDY zp
        this.y = this.read(this.read(this.pc++));
        this.setZN(this.y);
        this.cycles += 3;
        break;
      case 0xb4: // LDY zp,X
        this.y = this.read((this.read(this.pc++) + this.x) & 0xff);
        this.setZN(this.y);
        this.cycles += 4;
        break;
      case 0xac: // LDY abs
        this.y = this.read(this.read16(this.pc));
        this.pc += 2;
        this.setZN(this.y);
        this.cycles += 4;
        break;
      case 0xbc: // LDY abs,X
        this.y = this.read((this.read16(this.pc) + this.x) & 0xffff);
        this.pc += 2;
        this.setZN(this.y);
        this.cycles += 4;
        break;
      case 0x84: // STY zp
        this.write(this.read(this.pc++), this.y);
        this.cycles += 3;
        break;
      case 0x94: // STY zp,X
        this.write((this.read(this.pc++) + this.x) & 0xff, this.y);
        this.cycles += 4;
        break;
      case 0x8c: // STY abs
        this.write(this.read16(this.pc), this.y);
        this.pc += 2;
        this.cycles += 4;
        break;
      case 0xaa: // TAX
        this.x = this.a;
        this.setZN(this.x);
        this.cycles += 2;
        break;
      case 0xa8: // TAY
        this.y = this.a;
        this.setZN(this.y);
        this.cycles += 2;
        break;
      case 0x8a: // TXA
        this.a = this.x;
        this.setZN(this.a);
        this.cycles += 2;
        break;
      case 0x98: // TYA
        this.a = this.y;
        this.setZN(this.a);
        this.cycles += 2;
        break;
      case 0xba: // TSX
        this.x = this.s;
        this.setZN(this.x);
        this.cycles += 2;
        break;
      case 0x9a: // TXS
        this.s = this.x;
        this.cycles += 2;
        break;
      case 0x20: // JSR abs
        this.push16(this.pc + 1);
        this.pc = this.read16(this.pc);
        this.cycles += 6;
        break;
      case 0x60: // RTS
        this.pc = this.pop16() + 1;
        this.cycles += 6;
        break;
      case 0x4c: // JMP abs
        this.pc = this.read16(this.pc);
        this.cycles += 3;
        break;
      case 0x6c: // JMP (ind)
        addr = this.read16(this.pc);
        this.pc = this.read16(addr);
        this.cycles += 5;
        break;
      case 0xc9: // CMP imm
        this.cmp(this.a, this.read(this.pc++));
        this.cycles += 2;
        break;
      case 0xc5: // CMP zp
        this.cmp(this.a, this.read(this.read(this.pc++)));
        this.cycles += 3;
        break;
      case 0xd5: // CMP zp,X
        this.cmp(this.a, this.read((this.read(this.pc++) + this.x) & 0xff));
        this.cycles += 4;
        break;
      case 0xcd: // CMP abs
        this.cmp(this.a, this.read(this.read16(this.pc)));
        this.pc += 2;
        this.cycles += 4;
        break;
      case 0xdd: // CMP abs,X
        this.cmp(this.a, this.read((this.read16(this.pc) + this.x) & 0xffff));
        this.pc += 2;
        this.cycles += 4;
        break;
      case 0xd9: // CMP abs,Y
        this.cmp(this.a, this.read((this.read16(this.pc) + this.y) & 0xffff));
        this.pc += 2;
        this.cycles += 4;
        break;
      case 0xe0: // CPX imm
        this.cmp(this.x, this.read(this.pc++));
        this.cycles += 2;
        break;
      case 0xe4: // CPX zp
        this.cmp(this.x, this.read(this.read(this.pc++)));
        this.cycles += 3;
        break;
      case 0xec: // CPX abs
        this.cmp(this.x, this.read(this.read16(this.pc)));
        this.pc += 2;
        this.cycles += 4;
        break;
      case 0xc0: // CPY imm
        this.cmp(this.y, this.read(this.pc++));
        this.cycles += 2;
        break;
      case 0xc4: // CPY zp
        this.cmp(this.y, this.read(this.read(this.pc++)));
        this.cycles += 3;
        break;
      case 0xcc: // CPY abs
        this.cmp(this.y, this.read(this.read16(this.pc)));
        this.pc += 2;
        this.cycles += 4;
        break;
      case 0xd0: // BNE
        this.branch((this.p & 0x02) === 0);
        this.cycles += 2;
        break;
      case 0xf0: // BEQ
        this.branch((this.p & 0x02) !== 0);
        this.cycles += 2;
        break;
      case 0xb0: // BCS
        this.branch((this.p & 0x01) !== 0);
        this.cycles += 2;
        break;
      case 0x90: // BCC
        this.branch((this.p & 0x01) === 0);
        this.cycles += 2;
        break;
      case 0x30: // BMI
        this.branch((this.p & 0x80) !== 0);
        this.cycles += 2;
        break;
      case 0x10: // BPL
        this.branch((this.p & 0x80) === 0);
        this.cycles += 2;
        break;
      case 0x50: // BVC
        this.branch((this.p & 0x40) === 0);
        this.cycles += 2;
        break;
      case 0x70: // BVS
        this.branch((this.p & 0x40) !== 0);
        this.cycles += 2;
        break;
      case 0xe8: // INX
        this.x = (this.x + 1) & 0xff;
        this.setZN(this.x);
        this.cycles += 2;
        break;
      case 0xc8: // INY
        this.y = (this.y + 1) & 0xff;
        this.setZN(this.y);
        this.cycles += 2;
        break;
      case 0xca: // DEX
        this.x = (this.x - 1) & 0xff;
        this.setZN(this.x);
        this.cycles += 2;
        break;
      case 0x88: // DEY
        this.y = (this.y - 1) & 0xff;
        this.setZN(this.y);
        this.cycles += 2;
        break;
      case 0x1a: // NOP (undoc)
      case 0x3a: // NOP (undoc)
      case 0x5a: // NOP (undoc)
      case 0x7a: // NOP (undoc)
      case 0xda: // NOP (undoc)
      case 0xfa: // NOP (undoc)
      case 0xea: // NOP
        this.cycles += 2;
        break;
      case 0x0a: // ASL A
        this.a = this.asl(this.a);
        this.cycles += 2;
        break;
      case 0x06: // ASL zp
        val = this.read(this.pc++);
        this.write(val, this.asl(this.read(val)));
        this.cycles += 5;
        break;
      case 0x0e: // ASL abs
        addr = this.read16(this.pc);
        this.pc += 2;
        this.write(addr, this.asl(this.read(addr)));
        this.cycles += 6;
        break;
      case 0x4a: // LSR A
        this.a = this.lsr(this.a);
        this.cycles += 2;
        break;
      case 0x46: // LSR zp
        val = this.read(this.pc++);
        this.write(val, this.lsr(this.read(val)));
        this.cycles += 5;
        break;
      case 0x4e: // LSR abs
        addr = this.read16(this.pc);
        this.pc += 2;
        this.write(addr, this.lsr(this.read(addr)));
        this.cycles += 6;
        break;
      case 0x2a: // ROL A
        this.a = this.rol(this.a);
        this.cycles += 2;
        break;
      case 0x26: // ROL zp
        val = this.read(this.pc++);
        this.write(val, this.rol(this.read(val)));
        this.cycles += 5;
        break;
      case 0x2e: // ROL abs
        addr = this.read16(this.pc);
        this.pc += 2;
        this.write(addr, this.rol(this.read(addr)));
        this.cycles += 6;
        break;
      case 0x6a: // ROR A
        this.a = this.ror(this.a);
        this.cycles += 2;
        break;
      case 0x66: // ROR zp
        val = this.read(this.pc++);
        this.write(val, this.ror(this.read(val)));
        this.cycles += 5;
        break;
      case 0x6e: // ROR abs
        addr = this.read16(this.pc);
        this.pc += 2;
        this.write(addr, this.ror(this.read(addr)));
        this.cycles += 6;
        break;
      case 0x29: // AND imm
        this.and(this.read(this.pc++));
        this.cycles += 2;
        break;
      case 0x25: // AND zp
        this.and(this.read(this.read(this.pc++)));
        this.cycles += 3;
        break;
      case 0x35: // AND zp,X
        this.and(this.read((this.read(this.pc++) + this.x) & 0xff));
        this.cycles += 4;
        break;
      case 0x2d: // AND abs
        this.and(this.read(this.read16(this.pc)));
        this.pc += 2;
        this.cycles += 4;
        break;
      case 0x3d: // AND abs,X
        this.and(this.read((this.read16(this.pc) + this.x) & 0xffff));
        this.pc += 2;
        this.cycles += 4;
        break;
      case 0x39: // AND abs,Y
        this.and(this.read((this.read16(this.pc) + this.y) & 0xffff));
        this.pc += 2;
        this.cycles += 4;
        break;
      case 0x09: // ORA imm
        this.ora(this.read(this.pc++));
        this.cycles += 2;
        break;
      case 0x05: // ORA zp
        this.ora(this.read(this.read(this.pc++)));
        this.cycles += 3;
        break;
      case 0x15: // ORA zp,X
        this.ora(this.read((this.read(this.pc++) + this.x) & 0xff));
        this.cycles += 4;
        break;
      case 0x0d: // ORA abs
        this.ora(this.read(this.read16(this.pc)));
        this.pc += 2;
        this.cycles += 4;
        break;
      case 0x1d: // ORA abs,X
        this.ora(this.read((this.read16(this.pc) + this.x) & 0xffff));
        this.pc += 2;
        this.cycles += 4;
        break;
      case 0x19: // ORA abs,Y
        this.ora(this.read((this.read16(this.pc) + this.y) & 0xffff));
        this.pc += 2;
        this.cycles += 4;
        break;
      case 0x49: // EOR imm
        this.eor(this.read(this.pc++));
        this.cycles += 2;
        break;
      case 0x45: // EOR zp
        this.eor(this.read(this.read(this.pc++)));
        this.cycles += 3;
        break;
      case 0x55: // EOR zp,X
        this.eor(this.read((this.read(this.pc++) + this.x) & 0xff));
        this.cycles += 4;
        break;
      case 0x4d: // EOR abs
        this.eor(this.read(this.read16(this.pc)));
        this.pc += 2;
        this.cycles += 4;
        break;
      case 0x5d: // EOR abs,X
        this.eor(this.read((this.read16(this.pc) + this.x) & 0xffff));
        this.pc += 2;
        this.cycles += 4;
        break;
      case 0x59: // EOR abs,Y
        this.eor(this.read((this.read16(this.pc) + this.y) & 0xffff));
        this.pc += 2;
        this.cycles += 4;
        break;
      case 0x24: // BIT zp
        val = this.read(this.read(this.pc++));
        this.p = (this.p & 0x3f) | (val & 0xc0);
        this.setZN(this.a & val);
        this.cycles += 3;
        break;
      case 0x2c: // BIT abs
        val = this.read(this.read16(this.pc));
        this.pc += 2;
        this.p = (this.p & 0x3f) | (val & 0xc0);
        this.setZN(this.a & val);
        this.cycles += 4;
        break;
      case 0x00: // BRK
        this.pc = 0;
        this.p |= 0x10;
        break;
      case 0x40: // RTI
        this.p = this.pop();
        this.pc = this.pop16();
        this.cycles += 6;
        break;
      case 0x38: // SEC
        this.p |= 0x01;
        this.cycles += 2;
        break;
      case 0x18: // CLC
        this.p &= ~0x01;
        this.cycles += 2;
        break;
      case 0xf8: // SED
        this.p |= 0x08;
        this.cycles += 2;
        break;
      case 0xd8: // CLD
        this.p &= ~0x08;
        this.cycles += 2;
        break;
      case 0x78: // SEI
        this.p |= 0x04;
        this.cycles += 2;
        break;
      case 0x58: // CLI
        this.p &= ~0x04;
        this.cycles += 2;
        break;
      case 0xb8: // CLV
        this.p &= ~0x40;
        this.cycles += 2;
        break;
      default:
        this.cycles += 2;
        break;
    }
  }
}
