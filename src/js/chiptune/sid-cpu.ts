export class CPU6502 {
    public mem = new Uint8Array(65536);
    public a = 0;
    public x = 0;
    public y = 0;
    public pc = 0;
    public s = 0xFF;
    public p = 0x24; // I and U flags set

    public cycles = 0;

    constructor() {}

    public reset(): void {
        this.a = 0;
        this.x = 0;
        this.y = 0;
        this.s = 0xFF;
        this.p = 0x24;
        this.pc = this.read16(0xFFFC);
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
        this.s = (this.s - 1) & 0xFF;
    }

    private push16(val: number): void {
        this.push((val >> 8) & 0xFF);
        this.push(val & 0xFF);
    }

    private pop(): number {
        this.s = (this.s + 1) & 0xFF;
        return this.read(0x100 + this.s);
    }

    private pop16(): number {
        const lo = this.pop();
        const hi = this.pop();
        return lo | (hi << 8);
    }

    private setZN(val: number): void {
        if (val === 0) this.p |= 0x02; // Z
        else this.p &= ~0x02;
        if (val & 0x80) this.p |= 0x80; // N
        else this.p &= ~0x80;
    }

    public step(): void {
        const op = this.read(this.pc++);
        let val = 0;

        // Simplified addressing modes for SID playback
        switch(op) {
            case 0xA9: // LDA imm
                this.a = this.read(this.pc++);
                this.setZN(this.a);
                this.cycles += 2;
                break;
            case 0xA5: // LDA zp
                this.a = this.read(this.read(this.pc++));
                this.setZN(this.a);
                this.cycles += 3;
                break;
            case 0xAD: // LDA abs
                this.a = this.read(this.read16(this.pc));
                this.pc += 2;
                this.setZN(this.a);
                this.cycles += 4;
                break;
            case 0x85: // STA zp
                this.write(this.read(this.pc++), this.a);
                this.cycles += 3;
                break;
            case 0x8D: // STA abs
                this.write(this.read16(this.pc), this.a);
                this.pc += 2;
                this.cycles += 4;
                break;
            case 0xA2: // LDX imm
                this.x = this.read(this.pc++);
                this.setZN(this.x);
                this.cycles += 2;
                break;
            case 0xA0: // LDY imm
                this.y = this.read(this.pc++);
                this.setZN(this.y);
                this.cycles += 2;
                break;
            case 0x86: // STX zp
                this.write(this.read(this.pc++), this.x);
                this.cycles += 3;
                break;
            case 0x84: // STY zp
                this.write(this.read(this.pc++), this.y);
                this.cycles += 3;
                break;
            case 0x8E: // STX abs
                this.write(this.read16(this.pc), this.x);
                this.pc += 2;
                this.cycles += 4;
                break;
            case 0x8C: // STY abs
                this.write(this.read16(this.pc), this.y);
                this.pc += 2;
                this.cycles += 4;
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
            case 0x4C: // JMP abs
                this.pc = this.read16(this.pc);
                this.cycles += 3;
                break;
            case 0xC9: // CMP imm
                val = this.read(this.pc++);
                const cmp = this.a - val;
                if (this.a >= val) this.p |= 0x01; else this.p &= ~0x01;
                this.setZN(cmp & 0xFF);
                this.cycles += 2;
                break;
            case 0xD0: // BNE
                val = this.read(this.pc++);
                if (val & 0x80) val -= 256;
                if ((this.p & 0x02) === 0) {
                    this.pc += val;
                    this.cycles += 3;
                } else this.cycles += 2;
                break;
            case 0xF0: // BEQ
                val = this.read(this.pc++);
                if (val & 0x80) val -= 256;
                if ((this.p & 0x02) !== 0) {
                    this.pc += val;
                    this.cycles += 3;
                } else this.cycles += 2;
                break;
            case 0xE8: // INX
                this.x = (this.x + 1) & 0xFF;
                this.setZN(this.x);
                this.cycles += 2;
                break;
            case 0xC8: // INY
                this.y = (this.y + 1) & 0xFF;
                this.setZN(this.y);
                this.cycles += 2;
                break;
            case 0xCA: // DEX
                this.x = (this.x - 1) & 0xFF;
                this.setZN(this.x);
                this.cycles += 2;
                break;
            case 0x88: // DEY
                this.y = (this.y - 1) & 0xFF;
                this.setZN(this.y);
                this.cycles += 2;
                break;
            case 0x00: // BRK / Return to caller
                 // In our simplified SID context, BRK ends the interrupt/subroutine
                 this.pc = 0;
                 break;
            // Many more opcodes would go here to run all SID tunes. 
            // We implement only a fallback loop for now.
            default:
                // If unknown opcode, treat as NOP so we don't crash
                this.cycles += 2;
                break;
        }
    }
}
