import { CPU6502 } from './sid-cpu';
import { SIDChip } from './sid-chip';
import type { SidModule } from './sid-parser';

export class SidPlayer {
    private cpu: CPU6502;
    private sid: SIDChip;
    private module: SidModule | null = null;
    private sampleRate: number = 44100;
    
    constructor() {
        this.cpu = new CPU6502();
        this.sid = new SIDChip();
    }
    
    public loadModule(mod: SidModule, sampleRate: number = 44100): void {
        this.module = mod;
        this.sampleRate = sampleRate;
        this.cpu.reset();
        
        // Copy ROM to memory
        const start = mod.loadAddr;
        for (let i = 0; i < mod.data.length; i++) {
            this.cpu.write(start + i, mod.data[i]);
        }
        
        // Setup pseudo environment
        this.cpu.write(0x01, 0x37);
        
        // Call INIT routine
        this.cpu.a = mod.startSong - 1; // 0-based
        this.cpu.x = 0;
        this.cpu.y = 0;
        
        // We set PC to initAddr and run it until an RTS (0x60) brings PC back to 0
        this.cpu.pc = mod.initAddr;
        
        let watchdog = 0;
        while (this.cpu.pc !== 0 && watchdog++ < 10000) {
            this.cpu.step();
            // Handle writes to SID (0xD400 - 0xD418)
            const addr = this.cpu.pc - 1; // Simplistic intercept mechanism if write
            if (addr >= 0xD400 && addr <= 0xD418) {
                // In a real CPU emu, the write itself would trigger this.
                // We'll trust the memory polling instead.
            }
        }
        
        // Setup for PLAY routine (called 50 times per sec on PAL)
    }

    // Render continuous audio chunk
    public renderStream(outputBuffer: Float32Array, length: number): void {
        if (!this.module) return;
        
        // The SID play routine needs to be called 50 times a second 
        // Samples per play routine = 44100 / 50 = 882
        const samplesPerFrame = Math.floor(this.sampleRate / 50);
        
        for (let i = 0; i < length; i++) {
            if (i % samplesPerFrame === 0) {
                // Trigger play routine
                this.cpu.pc = this.module.playAddr;
                let watchdog = 0;
                while (this.cpu.pc !== 0 && watchdog++ < 50000) {
                    this.cpu.step();
                }
                
                // Poll SID registers manually because our CPU wrapper is very rudimentary
                for (let r = 0; r <= 0x18; r++) {
                    this.sid.write(r, this.cpu.read(0xD400 + r));
                }
            }
            outputBuffer[i] = this.sid.render(this.sampleRate);
        }
    }
}
