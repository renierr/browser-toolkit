import type { Visualizer, VisualizerState } from './base';

type AnalogMeter = {
  x: number;
  y: number;
  radius: number;
  currentAngle: number;
  targetAngle: number;
  velocity: number;
};

export class VUMeterVisualizer implements Visualizer {
  private meters: AnalogMeter[] = [];
  private masterMeter: AnalogMeter | null = null;

  reset(): void {
    this.meters = [];
    this.masterMeter = null;
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number, state: VisualizerState): void {
    const { freqData, bass, deltaTime } = state;

    // Dark console panel
    ctx.fillStyle = '#2a2520';
    ctx.fillRect(0, 0, width, height);

    // Panel texture
    ctx.fillStyle = 'rgba(0, 0, 0, 0.04)';
    for (let y = 0; y < height; y += 3) {
      ctx.fillRect(0, y, width, 1);
    }

    // Top rail
    const topGrad = ctx.createLinearGradient(0, 0, 0, 10);
    topGrad.addColorStop(0, '#4a4540');
    topGrad.addColorStop(1, '#2a2520');
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, width, 10);

    // Bottom rail
    const botGrad = ctx.createLinearGradient(0, height - 10, 0, height);
    botGrad.addColorStop(0, '#2a2520');
    botGrad.addColorStop(1, '#4a4540');
    ctx.fillStyle = botGrad;
    ctx.fillRect(0, height - 10, width, 10);

    // Screws in corners
    const drawScrew = (sx: number, sy: number) => {
      ctx.fillStyle = '#555550';
      ctx.beginPath();
      ctx.arc(sx, sy, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#3a3530';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(sx - 2, sy);
      ctx.lineTo(sx + 2, sy);
      ctx.stroke();
    };
    drawScrew(6, 6);
    drawScrew(width - 6, 6);
    drawScrew(6, height - 6);
    drawScrew(width - 6, height - 6);

    // Setup meters
    const meterCount = 16;
    const meterRadius = Math.min(28, (width - 40) / (meterCount * 2.5));
    const spacing = meterRadius * 2.2;
    const totalWidth = meterCount * spacing;
    const startX = (width - totalWidth) / 2 + meterRadius;
    const centerY = height * 0.45;

    if (this.meters.length !== meterCount) {
      this.meters = [];
      for (let i = 0; i < meterCount; i++) {
        this.meters.push({
          x: startX + i * spacing,
          y: centerY,
          radius: meterRadius,
          currentAngle: Math.PI,
          targetAngle: Math.PI,
          velocity: 0,
        });
      }
    }

    // Master meter
    if (!this.masterMeter) {
      this.masterMeter = {
        x: width / 2,
        y: height - 28,
        radius: Math.min(22, meterRadius * 0.8),
        currentAngle: Math.PI,
        targetAngle: Math.PI,
        velocity: 0,
      };
    }

    // Update meter physics
    const binsPerMeter = Math.floor(freqData.length / meterCount);
    for (let i = 0; i < meterCount; i++) {
      let sum = 0;
      for (let j = 0; j < binsPerMeter; j++) {
        sum += freqData[i * binsPerMeter + j];
      }
      const level = sum / (binsPerMeter * 255);

      // Map level to angle (PI = -inf, 2*PI = 0dB+)
      const angle = Math.PI + level * Math.PI * 0.75;
      this.meters[i].targetAngle = Math.min(angle, Math.PI * 1.75);

      // Spring physics for needle
      const spring = 12;
      const damping = 0.7;
      const diff = this.meters[i].targetAngle - this.meters[i].currentAngle;
      this.meters[i].velocity += diff * spring * deltaTime;
      this.meters[i].velocity *= damping;
      this.meters[i].currentAngle += this.meters[i].velocity;
    }

    // Master meter physics
    if (this.masterMeter) {
      const angle = Math.PI + bass * Math.PI * 0.75;
      this.masterMeter.targetAngle = Math.min(angle, Math.PI * 1.75);
      const spring = 10;
      const damping = 0.65;
      const diff = this.masterMeter.targetAngle - this.masterMeter.currentAngle;
      this.masterMeter.velocity += diff * spring * deltaTime;
      this.masterMeter.velocity *= damping;
      this.masterMeter.currentAngle += this.masterMeter.velocity;
    }

    // Draw each meter
    for (const meter of this.meters) {
      this.drawAnalogMeter(ctx, meter, false);
    }

    // Draw master meter
    if (this.masterMeter) {
      this.drawAnalogMeter(ctx, this.masterMeter, true);
    }
  }

  private drawAnalogMeter(
    ctx: CanvasRenderingContext2D,
    meter: AnalogMeter,
    isMaster: boolean
  ): void {
    const { x, y, radius, currentAngle } = meter;
    const r = radius;

    // Meter face (cream colored)
    ctx.fillStyle = '#f0ece4';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // Meter bezel (metal ring)
    ctx.strokeStyle = '#666660';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();

    // Inner bezel shadow
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r - 1, 0, Math.PI * 2);
    ctx.stroke();

    // Scale arc markings
    const scaleStart = Math.PI;
    const scaleEnd = Math.PI * 1.75;

    // Major tick marks
    const majorTicks = [
      { pos: 0, label: '' },
      { pos: 0.2, label: '' },
      { pos: 0.4, label: '' },
      { pos: 0.6, label: '' },
      { pos: 0.8, label: '' },
      { pos: 1.0, label: '' },
    ];

    for (const tick of majorTicks) {
      const angle = scaleStart + tick.pos * (scaleEnd - scaleStart);
      const innerR = r * 0.75;
      const outerR = r * 0.88;

      ctx.strokeStyle = tick.pos > 0.8 ? '#cc3322' : '#333330';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(angle) * innerR, y + Math.sin(angle) * innerR);
      ctx.lineTo(x + Math.cos(angle) * outerR, y + Math.sin(angle) * outerR);
      ctx.stroke();
    }

    // Minor ticks
    for (let i = 0; i <= 20; i++) {
      const pos = i / 20;
      const angle = scaleStart + pos * (scaleEnd - scaleStart);
      const innerR = r * 0.82;
      const outerR = r * 0.88;

      ctx.strokeStyle = pos > 0.8 ? 'rgba(200, 50, 30, 0.4)' : 'rgba(50, 50, 48, 0.3)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(angle) * innerR, y + Math.sin(angle) * innerR);
      ctx.lineTo(x + Math.cos(angle) * outerR, y + Math.sin(angle) * outerR);
      ctx.stroke();
    }

    // Red zone arc
    ctx.strokeStyle = 'rgba(200, 50, 30, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.82, scaleStart + 0.8 * (scaleEnd - scaleStart), scaleEnd);
    ctx.stroke();

    // VU label
    if (!isMaster) {
      ctx.fillStyle = '#555550';
      ctx.font = `${Math.max(5, r * 0.25)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('VU', x, y + r * 0.2);
    } else {
      ctx.fillStyle = '#555550';
      ctx.font = `${Math.max(5, r * 0.22)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('MSTR', x, y + r * 0.2);
    }

    // Needle
    const needleAngle = currentAngle;
    const needleLen = r * 0.78;
    const needleX = x + Math.cos(needleAngle) * needleLen;
    const needleY = y + Math.sin(needleAngle) * needleLen;

    // Needle shadow
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 1, y + 1);
    ctx.lineTo(needleX + 1, needleY + 1);
    ctx.stroke();

    // Needle line
    ctx.strokeStyle = '#222220';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(needleX, needleY);
    ctx.stroke();

    // Needle pivot
    ctx.fillStyle = '#444440';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.08, 0, Math.PI * 2);
    ctx.fill();

    // Glass reflection
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.arc(x - r * 0.2, y - r * 0.2, r * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
}
