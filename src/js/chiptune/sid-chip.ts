export class SidVoice {
    public freq = 0;
    public pw = 0;
    public ctrl = 0;
    public ad = 0;
    public sr = 0;

    private phase = 0;
    private envPhase = 'IDLE'; // IDLE, ATTACK, DECAY, SUSTAIN, RELEASE
    private envVal = 0;
    private noiseSeed = 0x7FFFF8;

    public step(sampleRate: number): number {
        // Oscillator step
        let out = 0;
        this.phase += (this.freq * 0.0596) / sampleRate; // approximate mapping
        if (this.phase >= 1.0) this.phase -= 1.0;

        let osc = 0;
        const test = this.ctrl & 0x08;
        const tri = this.ctrl & 0x10;
        const saw = this.ctrl & 0x20;
        const pulse = this.ctrl & 0x40;
        const noise = this.ctrl & 0x80;

        if (test) {
            this.phase = 0;
            osc = 0;
        } else if (tri) {
            osc = this.phase < 0.5 ? this.phase * 4 - 1 : 3 - this.phase * 4;
        } else if (saw) {
            osc = this.phase * 2 - 1;
        } else if (pulse) {
            osc = this.phase < (this.pw / 4095) ? 1.0 : -1.0;
        } else if (noise) {
            // Pseudo-random LFSR
            const bit = ((this.noiseSeed >> 22) ^ (this.noiseSeed >> 17)) & 1;
            this.noiseSeed = ((this.noiseSeed << 1) | bit) & 0x7FFFFF;
            osc = (this.noiseSeed & 0xFF) / 128.0 - 1.0;
        }

        // Envelope step simplified
        const gate = this.ctrl & 0x01;
        if (gate && this.envPhase === 'IDLE') this.envPhase = 'ATTACK';
        else if (!gate && this.envPhase !== 'IDLE') this.envPhase = 'RELEASE';

        // Attack/Decay/Release timing is omitted for this barebones example
        if (this.envPhase === 'ATTACK') {
            this.envVal += 0.005;
            if (this.envVal >= 1.0) { this.envVal = 1.0; this.envPhase = 'DECAY'; }
        } else if (this.envPhase === 'DECAY') {
            const sustain = (this.sr >> 4) / 15.0;
            this.envVal -= 0.001;
            if (this.envVal <= sustain) { this.envVal = sustain; this.envPhase = 'SUSTAIN'; }
        } else if (this.envPhase === 'RELEASE') {
            this.envVal -= 0.001;
            if (this.envVal <= 0) { this.envVal = 0; this.envPhase = 'IDLE'; }
        }

        out = osc * this.envVal;
        return out;
    }
}

export class SIDChip {
    public voices: SidVoice[] = [new SidVoice(), new SidVoice(), new SidVoice()];
    public fltFc = 0;
    public fltRes = 0;
    public fltMode = 0;
    public vol = 0;

    public write(reg: number, val: number): void {
        const v = Math.floor(reg / 7);
        if (v < 3) {
            const r = reg % 7;
            const voice = this.voices[v];
            switch (r) {
                case 0: voice.freq = (voice.freq & 0xFF00) | val; break;
                case 1: voice.freq = (voice.freq & 0x00FF) | (val << 8); break;
                case 2: voice.pw = (voice.pw & 0xFF00) | val; break;
                case 3: voice.pw = (voice.pw & 0x00FF) | ((val & 0x0F) << 8); break;
                case 4: voice.ctrl = val; break;
                case 5: voice.ad = val; break;
                case 6: voice.sr = val; break;
            }
        } else {
            switch (reg) {
                case 21: this.fltFc = (this.fltFc & 0x700) | val; break;
                case 22: this.fltFc = (this.fltFc & 0x0FF) | (val << 8); break;
                case 23: this.fltRes = (val >> 4); break; // Res
                case 24: this.fltMode = val; this.vol = val & 0x0F; break;
            }
        }
    }

    public render(sampleRate: number): number {
        let out = 0;
        for (const v of this.voices) {
            out += v.step(sampleRate);
        }
        return (out / 3.0) * (this.vol / 15.0);
    }
}
