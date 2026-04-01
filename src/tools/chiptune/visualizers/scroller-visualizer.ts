import type { Visualizer, VisualizerState } from './base';

export class ScrollerVisualizer implements Visualizer {
  private scrollX = 0;
  private message =
    '👉 Hi, This is a MOD player - running offline.      ´You can add files and store them in Browser Database for later use..... search the bookmark button. 🏷️`    ``All this was possible because of AI 😁´´   -----   happy coding';
  private charWidths: number[] = [];
  private totalWidth = 0;
  private font =
    'bold 80px Outfit, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  private baseSpeed = 100;
  private currentSpeedMult = 1;
  private segmenter: Intl.Segmenter | null = null;

  reset(): void {
    this.scrollX = 0;
    this.charWidths = [];
    this.totalWidth = 0;
    this.currentSpeedMult = 1;
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number, state: VisualizerState): void {
    const { timeData, bass, deltaTime } = state;

    if (this.charWidths.length === 0) {
      ctx.font = this.font;

      // Use Intl.Segmenter for proper emoji/Unicode handling
      this.segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
      const segments = this.segmenter.segment(this.message);
      for (const seg of segments) {
        const char = seg.segment;
        let w = ctx.measureText(char).width;
        if (char === ' ' || w === 0) w = 45;
        this.charWidths.push(w);
        this.totalWidth += w;
      }
      this.scrollX = width;
    }

    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(0, 0, width, height);

    const effectiveSpeed = this.baseSpeed * this.currentSpeedMult * (1 + bass * 2);
    this.scrollX -= effectiveSpeed * deltaTime;

    if (this.scrollX < -this.totalWidth) {
      this.scrollX = width;
      this.currentSpeedMult = 1;
    }

    ctx.font = this.font;
    ctx.textBaseline = 'middle';

    let drawX = this.scrollX;
    const time = Date.now() * 0.005;

    // Use segmenter to iterate through grapheme clusters
    const segments = this.segmenter?.segment(this.message) ?? [];
    let idx = 0;
    for (const seg of segments) {
      const char = seg.segment;
      const charW = this.charWidths[idx];

      if (drawX + charW > 0 && drawX < width) {
        const yOffset = Math.sin(time + idx * 0.2) * (height * 0.35);
        const y = height / 2 + yOffset;

        const hue = (idx * 10 + time * 50) % 360;
        ctx.fillStyle = `hsl(${hue}, 100%, 70%)`;
        ctx.shadowBlur = 15;
        ctx.shadowColor = `hsl(${hue}, 100%, 50%)`;

        ctx.fillText(char, drawX, y);
        ctx.shadowBlur = 0;
      }
      drawX += charW;
      idx++;
    }

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
