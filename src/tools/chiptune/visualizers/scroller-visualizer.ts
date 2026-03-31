import type { Visualizer, VisualizerState } from './base';

export class ScrollerVisualizer implements Visualizer {
  private scrollX = 0;
  private message =
    'Hi This is a MOD player - running offline. You can add files and store them in Browser Database for later use..... search the bookmark button.    All this was possible because of AI :-) ----- happy coding';
  private charWidths: number[] = [];
  private totalWidth = 0;
  private font = 'bold 80px Outfit, sans-serif';

  draw(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    state: VisualizerState
  ): void {
    const { timeData, bass } = state;
    
    // 1. Initial Measurement (once)
    if (this.charWidths.length === 0) {
      ctx.font = this.font;
      for (let i = 0; i < this.message.length; i++) {
        const w = ctx.measureText(this.message[i]).width;
        this.charWidths.push(w);
        this.totalWidth += w;
      }
      this.scrollX = width; // Start from right
    }

    // 2. Clear & Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(0, 0, width, height);

    // 3. Scroll Update
    this.scrollX -= 3 + bass * 8; // Speed up with bass
    if (this.scrollX < -this.totalWidth) {
      this.scrollX = width;
    }

    // 4. Draw Scrolltext (Sine Bouncing)
    ctx.font = this.font;
    ctx.textBaseline = 'middle';
    
    let currentX = this.scrollX;
    const time = Date.now() * 0.005;

    for (let i = 0; i < this.message.length; i++) {
      const char = this.message[i];
      const charW = this.charWidths[i];
      
      // Only draw if on screen
      if (currentX + charW > 0 && currentX < width) {
        const yOffset = Math.sin(time + i * 0.2) * (height * 0.35);
        const y = height / 2 + yOffset;
        
        // Fancy Color (Hue Shift)
        const hue = (i * 10 + time * 50) % 360;
        ctx.fillStyle = `hsl(${hue}, 100%, 70%)`;
        ctx.shadowBlur = 15;
        ctx.shadowColor = `hsl(${hue}, 100%, 50%)`;
        
        ctx.fillText(char, currentX, y);
        ctx.shadowBlur = 0; // Reset shadow for next perf
      }
      currentX += charW;
    }

    // 5. Waveform Overlay (On top)
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.beginPath();
    
    const sliceWidth = width / timeData.length;
    let x = 0;

    for (let i = 0; i < timeData.length; i++) {
      const v = (timeData[i] - 128) / 128.0;
      const y = height / 2 + v * height * 0.45;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      x += sliceWidth;
    }
    
    ctx.stroke();
  }
}
