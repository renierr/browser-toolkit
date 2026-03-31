import type { Visualizer, VisualizerState } from './base';

export class ClassicVisualizer implements Visualizer {
  draw(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    state: VisualizerState
  ): void {
    const { freqData, timeData } = state;
    
    // --- SETUP: Background with subtle Motion Blur ---
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(0, 0, width, height);

    // --- 1. SPECTRUM (Classic 64-Bar HSL) ---
    const barCount = 64;
    const barWidth = width / barCount;
    const barGap = 1;

    for (let i = 0; i < barCount; i++) {
      const val = freqData[i * 4] || 0;
      const percent = val / 255;
      const barHeight = percent * height;
      
      let hue: number;
      if (i < 16) hue = (i / 16) * 30;
      else if (i < 32) hue = 30 + ((i - 16) / 16) * 60;
      else if (i < 48) hue = 90 + ((i - 32) / 16) * 60;
      else hue = 150 + ((i - 48) / 16) * 120;

      const light = 50 + percent * 10;
      ctx.fillStyle = `hsl(${hue}, 100%, ${light}%)`;
      
      const bx = i * barWidth;
      const by = height - barHeight;
      ctx.fillRect(bx, by, barWidth - barGap, barHeight);
      
      if (percent > 0.1) {
        ctx.fillStyle = `hsl(${hue}, 100%, 75%)`;
        ctx.fillRect(bx, by, barWidth - barGap, 2);
      }
    }

    // --- 2. WAVEFORM (Classic Single Bold Line) ---
    const amplitude = 1.8;
    const waveSliceWidth = width / timeData.length;
    
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 2.5; 
    ctx.lineJoin = 'round';
    ctx.beginPath();
    
    let x = 0;
    for (let i = 0; i < timeData.length; i++) {
        const v = (timeData[i] - 128) / 128.0;
        const y = (height / 2) + (v * (height / 2) * amplitude);
        
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += waveSliceWidth;
    }
    ctx.stroke();
  }
}
