import type { HeartRateSession } from './db';

export class EKGGraph {
  private ekgPoints: number[] = [];
  private readonly maxPoints = 200;
  private lastHeartRate = 0;
  private phase = 0;
  private animationFrameId: number | null = null;
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  public start() {
    this.draw();
  }

  public stop() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  public setHeartRate(bpm: number) {
    this.lastHeartRate = bpm;
  }

  private draw = () => {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    this.ctx.clearRect(0, 0, width, height);
    this.ctx.beginPath();
    this.ctx.strokeStyle = '#ff52d9';
    this.ctx.lineWidth = 2;
    this.ctx.lineJoin = 'round';

    const step = width / (this.maxPoints - 1);
    for (let i = 0; i < this.ekgPoints.length; i++) {
      const x = i * step;
      const y = height / 2 - this.ekgPoints[i] * (height / 3);
      if (i === 0) this.ctx.moveTo(x, y);
      else this.ctx.lineTo(x, y);
    }
    this.ctx.stroke();

    if (this.lastHeartRate > 0) {
      const period = (60 / this.lastHeartRate) * 60;
      this.phase++;
      let spike = 0;
      const p = this.phase % Math.floor(period);

      if (p < 5) spike = 0.1;
      else if (p >= 5 && p < 7) spike = -0.1;
      else if (p >= 7 && p < 10) spike = 1.0;
      else if (p >= 10 && p < 12) spike = -0.2;
      else if (p >= 20 && p < 30) spike = 0.2;
      else spike = (Math.random() - 0.5) * 0.05;

      this.ekgPoints.push(spike);
    } else {
      this.ekgPoints.push((Math.random() - 0.5) * 0.05);
    }

    if (this.ekgPoints.length > this.maxPoints) this.ekgPoints.shift();
    this.animationFrameId = requestAnimationFrame(this.draw);
  };
}

export function drawSessionGraph(canvas: HTMLCanvasElement, session: HeartRateSession) {
  const ctx = canvas.getContext('2d')!;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = width;
  canvas.height = height;

  const points = session.dataPoints;
  if (points.length < 2) {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#666';
    ctx.textAlign = 'center';
    ctx.fillText('Not enough data points', width / 2, height / 2);
    return;
  }

  ctx.clearRect(0, 0, width, height);

  const hrs = points.map((p) => p.heartRate);
  const minHr = Math.min(...hrs) - 5;
  const maxHr = Math.max(...hrs) + 5;
  const range = maxHr - minHr;

  const startTime = session.startTime;
  const endTime = session.endTime || points[points.length - 1].timestamp;
  const duration = endTime - startTime;

  // Grid lines
  ctx.strokeStyle = 'rgba(128, 128, 128, 0.1)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = (height * i) / 4;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();

    ctx.fillStyle = 'rgba(128, 128, 128, 0.5)';
    ctx.font = '10px sans-serif';
    const labelValue = Math.round(maxHr - (range * i) / 4);
    ctx.fillText(labelValue.toString(), 5, y - 2);
  }

  // Data line
  ctx.strokeStyle = '#ff52d9';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();

  points.forEach((p, i) => {
    const x = ((p.timestamp - startTime) / duration) * width;
    const y = height - ((p.heartRate - minHr) / range) * height;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, 'rgba(255, 82, 217, 0.2)');
  gradient.addColorStop(1, 'rgba(255, 82, 217, 0)');
  ctx.fillStyle = gradient;
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fill();
}
