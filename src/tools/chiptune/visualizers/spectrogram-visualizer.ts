import type { Visualizer, VisualizerState } from './base';

export class SpectrogramVisualizer implements Visualizer {
  private history: Uint8Array[] = [];
  private maxHistory = 128;

  reset(): void {
    this.history = [];
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number, state: VisualizerState): void {
    const { freqData } = state;

    // Shift history down by 1 row
    this.history.unshift(new Uint8Array(freqData));
    if (this.history.length > this.maxHistory) {
      this.history.pop();
    }

    // Clear with solid black
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    const rowHeight = height / this.maxHistory;
    const bins = Math.min(freqData.length, 256);
    const colWidth = width / bins;

    for (let row = 0; row < this.history.length; row++) {
      const data = this.history[row];
      const y = row * rowHeight;
      const alpha = 1 - row / this.maxHistory;

      for (let col = 0; col < bins; col++) {
        const val = data[col] / 255;
        if (val < 0.02) continue;

        // Inferno-like colormap: black -> red -> orange -> yellow -> white
        let r: number, g: number, b: number;
        if (val < 0.25) {
          const t = val / 0.25;
          r = Math.floor(t * 128);
          g = 0;
          b = Math.floor(t * 64);
        } else if (val < 0.5) {
          const t = (val - 0.25) / 0.25;
          r = Math.floor(128 + t * 127);
          g = Math.floor(t * 100);
          b = Math.floor(64 - t * 64);
        } else if (val < 0.75) {
          const t = (val - 0.5) / 0.25;
          r = 255;
          g = Math.floor(100 + t * 155);
          b = 0;
        } else {
          const t = (val - 0.75) / 0.25;
          r = 255;
          g = Math.floor(255);
          b = Math.floor(t * 255);
        }

        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.fillRect(col * colWidth, y, colWidth + 1, rowHeight + 1);
      }
    }

    // Frequency labels at bottom
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '10px monospace';
    const labels = ['0', '2k', '4k', '6k', '8k', '10k', '12k', '14k', '16k', '18k', '20k', '22k'];
    const labelStep = Math.floor(bins / labels.length);
    for (let i = 0; i < labels.length; i++) {
      ctx.fillText(labels[i], i * labelStep * colWidth, height - 2);
    }
  }
}
