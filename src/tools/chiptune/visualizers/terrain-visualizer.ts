import type { Visualizer, VisualizerState } from './base';

type Layer = {
  data: Float32Array;
  age: number;
};

export class TerrainVisualizer implements Visualizer {
  private layers: Layer[] = [];
  private maxLayers = 8;

  reset(): void {
    this.layers = [];
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number, state: VisualizerState): void {
    const { freqData, bass } = state;

    // Add new layer from current frequency data
    const newData = new Float32Array(64);
    for (let i = 0; i < 64; i++) {
      newData[i] = freqData[i * 4] / 255;
    }
    this.layers.unshift({ data: newData, age: 0 });
    if (this.layers.length > this.maxLayers) {
      this.layers.pop();
    }

    // Age layers
    for (const layer of this.layers) {
      layer.age += state.deltaTime;
    }

    // Clear with deep sky/night gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, '#0a0a2e');
    bgGrad.addColorStop(0.5, '#16213e');
    bgGrad.addColorStop(1, '#1a1a2e');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Stars
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    for (let i = 0; i < 50; i++) {
      const sx = (i * 137.5) % width;
      const sy = (i * 73.1) % (height * 0.4);
      const size = 0.5 + (i % 3) * 0.5;
      ctx.fillRect(sx, sy, size, size);
    }

    // Draw layers back to front (oldest = background mountains, newest = foreground)
    for (let li = this.layers.length - 1; li >= 0; li--) {
      const layer = this.layers[li];
      const depthRatio = 1 - li / this.maxLayers;
      const baseY = height * (0.3 + depthRatio * 0.5);
      const peakHeight = height * (0.15 + depthRatio * 0.35);
      const alpha = 0.15 + depthRatio * 0.7;

      // Color gradient based on depth
      const hue = 200 + li * 15;
      const saturation = 60 + depthRatio * 40;
      const lightness = 20 + depthRatio * 30;

      // Build mountain path
      ctx.beginPath();
      ctx.moveTo(0, height);

      const points = layer.data.length;
      const stepX = width / (points - 1);

      for (let i = 0; i < points; i++) {
        const x = i * stepX;
        const val = layer.data[i];
        const y = baseY - val * peakHeight;

        if (i === 0) ctx.lineTo(x, y);
        else {
          // Smooth curves between points
          const prevX = (i - 1) * stepX;
          const prevVal = layer.data[i - 1];
          const prevY = baseY - prevVal * peakHeight;
          const cpX = (prevX + x) / 2;
          ctx.quadraticCurveTo(prevX, prevY, cpX, (prevY + y) / 2);
          ctx.quadraticCurveTo(x, y, x, y);
        }
      }

      ctx.lineTo(width, height);
      ctx.closePath();

      // Fill with gradient
      const grad = ctx.createLinearGradient(0, baseY - peakHeight, 0, height);
      grad.addColorStop(0, `hsla(${hue}, ${saturation}%, ${lightness + 20}%, ${alpha})`);
      grad.addColorStop(0.5, `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha * 0.9})`);
      grad.addColorStop(
        1,
        `hsla(${hue + 20}, ${saturation - 10}%, ${lightness - 10}%, ${alpha * 0.8})`
      );
      ctx.fillStyle = grad;
      ctx.fill();

      // Snow caps on peaks
      ctx.strokeStyle = `hsla(${hue}, ${saturation}%, 85%, ${alpha * 0.6})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < points; i++) {
        const x = i * stepX;
        const val = layer.data[i];
        if (val > 0.6) {
          const y = baseY - val * peakHeight;
          if (i === 0 || layer.data[i - 1] <= 0.6) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }

    // Bass pulse overlay
    if (bass > 0.5) {
      const pulseAlpha = (bass - 0.5) * 0.3;
      ctx.fillStyle = `rgba(255, 200, 100, ${pulseAlpha})`;
      ctx.fillRect(0, 0, width, height);
    }
  }
}
