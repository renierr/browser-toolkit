import type { Visualizer, VisualizerState } from './base';

export class NeonNexusVisualizer implements Visualizer {
  private rotation = 0;

  draw(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    state: VisualizerState
  ): void {
    const { freqData, timeData, bass } = state;
    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.min(width, height) * 0.45;

    // --- SETUP: Faded Background ---
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(0, 0, width, height);

    this.rotation += 0.01 + bass * 0.05;

    // --- 1. CORE PULSE ---
    const coreRadius = 20 + bass * 30;
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, coreRadius);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.2, '#00ffcc');
    gradient.addColorStop(1, 'rgba(0, 255, 204, 0)');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, coreRadius * 2, 0, Math.PI * 2);
    ctx.fill();

    // --- 2. FREQUENCY RINGS (The Spectrum) ---
    const ringCount = 4;
    for (let r = 0; r < ringCount; r++) {
      const ringRadius = (maxRadius / ringCount) * (r + 1);
      const startBin = r * 16;
      let avg = 0;
      for (let i = 0; i < 16; i++) avg += freqData[startBin + i];
      avg /= 16 * 255;

      ctx.strokeStyle = `hsla(${160 + r * 30}, 100%, 60%, ${0.2 + avg * 0.5})`;
      ctx.lineWidth = 1 + avg * 5;
      
      ctx.beginPath();
      ctx.arc(centerX, centerY, ringRadius + avg * 10, 0, Math.PI * 2);
      ctx.stroke();

      // Add "orbiting" nodes
      const nodeCount = 6;
      for (let n = 0; n < nodeCount; n++) {
        const angle = this.rotation * (r % 2 === 0 ? 1 : -1) + (n / nodeCount) * Math.PI * 2;
        const nx = centerX + Math.cos(angle) * (ringRadius + avg * 10);
        const ny = centerY + Math.sin(angle) * (ringRadius + avg * 10);
        ctx.fillStyle = `hsl(${160 + r * 30}, 100%, 70%)`;
        ctx.beginPath();
        ctx.arc(nx, ny, 2 + avg * 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // --- 3. CIRCULAR WAVEFORM AURA ---
    const waveRadius = maxRadius * 0.8;
    const amplitude = 1.5;
    
    ctx.strokeStyle = '#00ffcc';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#00ffcc';
    ctx.beginPath();

    const points = timeData.length;
    for (let i = 0; i < points; i++) {
        const angle = (i / points) * Math.PI * 2;
        const v = (timeData[i] - 128) / 128.0;
        const r = waveRadius + (v * 40 * amplitude);
        
        const x = centerX + Math.cos(angle) * r;
        const y = centerY + Math.sin(angle) * r;
        
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // --- 4. PERIPHERAL SPARKS ---
    if (bass > 0.6) {
        for (let i = 0; i < 12; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = coreRadius + Math.random() * maxRadius;
            const sx = centerX + Math.cos(angle) * dist;
            const sy = centerY + Math.sin(angle) * dist;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(sx, sy, 2, 2);
        }
    }
  }
}
