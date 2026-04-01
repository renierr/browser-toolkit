import type { Visualizer, VisualizerState } from './base';

export class ScrollerVisualizer implements Visualizer {
  private scrollX = 0;
  private message =
    'Hi, This is a MOD player - ´´running offline``.      ´You can add files and store them in Browser Database for later use.....` search the bookmark button.    ``All this was possible because of AI :-)´´   -----   ```happy coding';
  private charWidths: number[] = [];
  private totalWidth = 0;
  private font = 'bold 80px Outfit, sans-serif';
  private baseSpeed = 100;
  private currentSpeedMult = 1;

  draw(ctx: CanvasRenderingContext2D, width: number, height: number, state: VisualizerState): void {
    const { timeData, bass, deltaTime } = state;

    if (this.charWidths.length === 0) {
      ctx.font = this.font;
      for (let i = 0; i < this.message.length; i++) {
        const char = this.message[i];
        let w = ctx.measureText(char).width;
        if (char === ' ' || w === 0) w = 25;
        this.charWidths.push(w);
        this.totalWidth += w;
      }
      this.scrollX = width;
    }

    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(0, 0, width, height);

    const centerX = width / 2;
    let testX = this.scrollX;
    let charIndex = 0;
    for (let i = 0; i < this.charWidths.length; i++) {
      const charW = this.charWidths[i];
      const charCenter = testX + charW / 2;
      if (charCenter >= centerX) {
        charIndex = i;
        break;
      }
      testX += charW;
    }

    const centerChar = this.message[charIndex];
    if (centerChar === '`') {
      this.currentSpeedMult = 0.5;
    } else if (centerChar === '´') {
      this.currentSpeedMult = 2;
    }

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

    for (let i = 0; i < this.message.length; i++) {
      const char = this.message[i];
      const charW = this.charWidths[i];
      if (char === '`' || char === '´') {
        drawX += charW;
        continue;
      }

      if (drawX + charW > 0 && drawX < width) {
        const yOffset = Math.sin(time + i * 0.2) * (height * 0.35);
        const y = height / 2 + yOffset;

        const hue = (i * 10 + time * 50) % 360;
        ctx.fillStyle = `hsl(${hue}, 100%, 70%)`;
        ctx.shadowBlur = 15;
        ctx.shadowColor = `hsl(${hue}, 100%, 50%)`;

        ctx.fillText(char, drawX, y);
        ctx.shadowBlur = 0;
      }
      drawX += charW;
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
