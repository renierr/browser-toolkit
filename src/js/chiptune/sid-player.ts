import { CPU6502 } from './sid-cpu';
import { SIDChip } from './sid-chip';
import type { SidModule } from './sid-parser';

export class SidPlayer {
  private cpu: CPU6502;
  private sid: SIDChip;
  private module: SidModule | null = null;
  private sampleRate: number = 44100;

  private logSidWrites = false;

  constructor() {
    this.cpu = new CPU6502();
    this.sid = new SIDChip();
    // Set up SID write interception
    this.cpu.setSidWriteCallback((addr, val) => {
      if (this.logSidWrites) {
        console.log(
          `[SID WRITE] addr=${addr.toString(16)} val=${val.toString(16)} A=${this.cpu.a.toString(16)}`
        );
      }
      this.sid.write(addr - 0xd400, val);
    });
    // Set up SID read interception
    this.cpu.setSidReadCallback((addr) => {
      // Return SID register values or random for undriven pins
      return this.sid.read(addr - 0xd400);
    });
  }

  public loadModule(mod: SidModule, sampleRate: number = 44100): void {
    this.module = mod;
    this.sampleRate = sampleRate;
    this.cpu.reset();

    // Zero all memory
    this.cpu.mem.fill(0);

    // Set up C64-like memory map and vectors
    this.cpu.write(0x01, 0x37); // I/O for SID
    this.cpu.write(0x00, 0);
    this.cpu.write(0x2a, 0);
    // Zero page - commonly used by SID players
    for (let i = 0x02; i < 0xff; i++) this.cpu.write(i, 0);
    // Some common locations
    this.cpu.write(0x91, 1); // SID song speed flag
    this.cpu.write(0x93, 0); // often used for flags

    // C64 vectors
    this.cpu.write(0xfffc, 0x00);
    this.cpu.write(0xfffd, 0x08); // Reset vector -> $0800
    this.cpu.write(0xfffe, 0x00);
    this.cpu.write(0xffff, 0x00); // IRQ vector

    console.log('[SID] loadModule:', {
      loadAddr: mod.loadAddr,
      initAddr: mod.initAddr,
      playAddr: mod.playAddr,
      dataLen: mod.data.length,
    });

    // Copy ROM to memory
    const start = mod.loadAddr;
    for (let i = 0; i < mod.data.length; i++) {
      this.cpu.write(start + i, mod.data[i]);
    }

    // Log first few bytes at playAddr
    console.log(
      '[SID] Code at playAddr:',
      this.cpu.read(mod.playAddr).toString(16),
      this.cpu.read(mod.playAddr + 1).toString(16),
      this.cpu.read(mod.playAddr + 2).toString(16),
      this.cpu.read(mod.playAddr + 3).toString(16)
    );

    // Also check the jump target
    const jumpTarget = (this.cpu.read(mod.playAddr + 2) << 8) | this.cpu.read(mod.playAddr + 1);
    console.log('[SID] Jump target:', jumpTarget.toString(16));
    console.log(
      '[SID] Code at jump target:',
      this.cpu.read(jumpTarget).toString(16),
      this.cpu.read(jumpTarget + 1).toString(16),
      this.cpu.read(jumpTarget + 2).toString(16),
      this.cpu.read(jumpTarget + 3).toString(16)
    );

    // Setup pseudo environment - zero page and stack
    this.cpu.write(0x01, 0x37);
    this.cpu.write(0x00, 0); // zp scratch
    this.cpu.write(0x2a, 0); // used by some SID routines

    // Call INIT routine
    this.cpu.a = mod.startSong - 1; // 0-based
    this.cpu.x = 0;
    this.cpu.y = 0;

    // We set PC to initAddr and run it until an RTS (0x60) brings PC back to 0
    this.cpu.pc = mod.initAddr;
    console.log('[SID] Running init, PC:', mod.initAddr.toString(16));

    // Run init with more iterations
    let watchdog = 0;
    while (this.cpu.pc !== 0 && watchdog++ < 200000) {
      this.cpu.step();
    }
    console.log('[SID] Init done, PC:', this.cpu.pc.toString(16), 'watchdog:', watchdog);

    // Print some memory around $03xx after init - this is often where data pointers live
    console.log(
      '[SID] Memory $0300:',
      this.cpu.mem[0x300].toString(16),
      this.cpu.mem[0x301].toString(16),
      this.cpu.mem[0x302].toString(16),
      this.cpu.mem[0x303].toString(16),
      this.cpu.mem[0x304].toString(16),
      this.cpu.mem[0x305].toString(16)
    );

    // Log what's at playAddr now (some inits modify code)
    console.log(
      '[SID] Code at playAddr after init:',
      this.cpu.read(mod.playAddr).toString(16),
      this.cpu.read(mod.playAddr + 1).toString(16),
      this.cpu.read(mod.playAddr + 2).toString(16),
      this.cpu.read(mod.playAddr + 3).toString(16)
    );

    // Setup for PLAY routine (called 50 times per sec on PAL)
  }

  public isPlaying = false;

  public start(): void {
    this.isPlaying = true;
  }

  public stop(): void {
    this.isPlaying = false;
  }

  private frameCount = 0;

  public render(outputBuffer: Float32Array, length: number): void {
    if (!this.module || !this.isPlaying) {
      outputBuffer.fill(0);
      return;
    }

    const samplesPerFrame = Math.floor(this.sampleRate / 50);

    for (let i = 0; i < length; i++) {
      if (i % samplesPerFrame === 0) {
        if (this.frameCount < 1) {
          this.cpu.debugLog = true;
          this.logSidWrites = true;
        }

        this.cpu.pc = this.module.playAddr;
        let watchdog = 0;
        let firstOpcodes: string[] = [];
        let lastPC = 0;
        let lastCmd = '';
        while (this.cpu.pc !== 0 && watchdog++ < 200000) {
          const beforePc = this.cpu.pc;
          this.cpu.step();
          lastPC = this.cpu.pc;
          const cmd = this.cpu.mem[beforePc];
          if (watchdog < 30) {
            firstOpcodes.push(`${beforePc.toString(16)}:${cmd.toString(16)}`);
          }
          if (cmd === 0x60) {
            lastCmd = 'RTS';
            break;
          }
          if (cmd === 0x00) {
            lastCmd = 'BRK';
            break;
          }
        }
        if (this.frameCount < 1) {
          console.log('[SID] First opcodes:', firstOpcodes.join(' '));
          console.log('[SID] Last PC:', lastPC.toString(16), 'Exit reason:', lastCmd);
        }
        this.logSidWrites = false;

        if (this.frameCount < 1) {
          console.log('[SID] Play watchdog hit at:', watchdog, 'CPU cycles:', this.cpu.cycles);
        }
        this.cpu.debugLog = false;

        if (this.frameCount < 3) {
          console.log('[SID] Play done, PC:', this.cpu.pc.toString(16), 'watchdog:', watchdog);
          // Check SID chip state
          const voice0 = this.sid.voices[0];
          console.log(
            '[SID] SID voice0: freq=',
            voice0.freq,
            'ctrl=',
            voice0.ctrl.toString(16),
            'vol=',
            this.sid.vol
          );
        }
        this.frameCount++;
      }
      outputBuffer[i] = this.sid.render(this.sampleRate);
    }
  }
}
