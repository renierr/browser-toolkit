import type { Visualizer, VisualizerState } from './base';

export class PulseGridVisualizer implements Visualizer {
  private gridScroll = 0;

  draw(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    state: VisualizerState
  ): void {
    const { freqData, timeData, bass } = state;
    
    // --- SETUP: Background with Motion Trails ---
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(0, 0, width, height);

    const horizonY = height * 0.45;
    const vanishX = width / 2;

    // --- 1. PERSPECTIVE GRID ---
    ctx.strokeStyle = `rgba(0, 255, 255, ${0.1 + bass * 0.3})`;
    ctx.lineWidth = 1;

    // Horizontal scrolling lines
    this.gridScroll = (this.gridScroll + 1 + bass * 5) % 40;
    for (let y = 0; y < 15; y++) {
        const fy = horizonY + Math.pow(y * 4 + this.gridScroll / 4, 2);
        if (fy > height) continue;
        ctx.beginPath();
        ctx.moveTo(0, fy);
        ctx.lineTo(width, fy);
        ctx.stroke();
    }

    // Vertical perspective lines
    const lineCount = 12;
    for (let i = 0; i <= lineCount; i++) {
        const xOffset = (i / lineCount - 0.5) * width * 3;
        ctx.beginPath();
        ctx.moveTo(vanishX, horizonY);
        ctx.lineTo(vanishX + xOffset, height);
        ctx.stroke();
    }

    // --- 2. RADIAL SPARKS (The Spectrum) ---
    for (let i = 0; i < 32; i++) {
        const val = freqData[i * 4];
        if (val > 100) {
            const percent = val / 255;
            const size = percent * 4;
            const angle = (i / 32) * Math.PI - Math.PI / 2;
            const dist = 50 + percent * 150;
            
            const px = vanishX + Math.sin(angle) * dist;
            const py = horizonY - Math.cos(angle) * dist * 0.5;
            
            ctx.fillStyle = `hsl(${180 + percent * 100}, 100%, 70%)`;
            ctx.fillRect(px, py, size, size);
        }
    }

    // --- 3. HORIZON WAVE (The Waveform) ---
    const amplitude = 2.0; 
    const waveSliceSize = width / timeData.length;
    
    ctx.shadowBlur = 15;
    ctx.shadowColor = 'rgba(255, 0, 255, 0.5)';
    ctx.strokeStyle = 'rgba(255, 0, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();

    let x = 0;
    for (let i = 0; i < timeData.length; i++) {
        const v = (timeData[i] - 128) / 128.0;
        const y = horizonY + (v * 40 * amplitude);
        
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += waveSliceSize;
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // --- 4. SCANLINE / CRT EFFECT ---
    ctx.fillStyle = 'rgba(18, 16, 16, 0.1)';
    for (let i = 0; i < height; i += 4) {
        ctx.fillRect(0, i, width, 1);
    }
  }
}
