import type { Visualizer, VisualizerState } from './base';

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
  brightness: number;
};

export class ParticleConstellationVisualizer implements Visualizer {
  private particles: Particle[] = [];
  private maxParticles = 300;
  private connections: { a: number; b: number; strength: number }[] = [];

  reset(): void {
    this.particles = [];
    this.connections = [];
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number, state: VisualizerState): void {
    const { freqData, timeData, bass, deltaTime } = state;

    // Fade background
    ctx.fillStyle = 'rgba(5, 5, 15, 0.15)';
    ctx.fillRect(0, 0, width, height);

    // Spawn new particles based on frequency energy
    const spawnRate = Math.floor(3 + bass * 15);
    for (let s = 0; s < spawnRate; s++) {
      // Pick random frequency bin weighted toward active ones
      let binIdx = Math.floor(Math.random() * 128);
      const energy = freqData[binIdx * 2] / 255;
      if (Math.random() > energy) continue;

      const x = (binIdx / 128) * width;
      const y = height * (0.6 + Math.random() * 0.3);
      const speed = 0.5 + energy * 2;
      const hue = (binIdx / 128) * 280 + 20;

      this.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 0.5,
        vy: -speed * (0.5 + Math.random()),
        life: 0,
        maxLife: 2 + Math.random() * 3,
        size: 1 + energy * 3,
        hue,
        brightness: 50 + energy * 30,
      });
    }

    // Update particles
    const dt = Math.min(deltaTime, 0.05);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * 60 * dt;
      p.y += p.vy * 60 * dt;
      p.vy -= bass * 0.5 * dt;
      p.life += dt;

      if (p.life > p.maxLife || p.y < -10 || p.x < -10 || p.x > width + 10) {
        this.particles.splice(i, 1);
      }
    }

    // Cap particles
    if (this.particles.length > this.maxParticles) {
      this.particles.splice(0, this.particles.length - this.maxParticles);
    }

    // Draw connections between nearby particles (constellation effect)
    const connectionDist = 60 + bass * 40;
    this.connections = [];
    for (let i = 0; i < this.particles.length; i++) {
      for (let j = i + 1; j < this.particles.length; j++) {
        const a = this.particles[i];
        const b = this.particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < connectionDist) {
          const strength = 1 - dist / connectionDist;
          this.connections.push({ a: i, b: j, strength });
        }
      }
    }

    // Draw connection lines
    for (const conn of this.connections) {
      const a = this.particles[conn.a];
      const b = this.particles[conn.b];
      const lifeRatio = (a.life + b.life) / (a.maxLife + b.maxLife);
      const alpha = conn.strength * (1 - lifeRatio) * 0.4;
      const hue = (a.hue + b.hue) / 2;

      ctx.strokeStyle = `hsla(${hue}, 80%, 70%, ${alpha})`;
      ctx.lineWidth = 0.5 + conn.strength;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // Draw particles with glow
    for (const p of this.particles) {
      const lifeRatio = p.life / p.maxLife;
      const alpha = lifeRatio < 0.1 ? lifeRatio * 10 : 1 - (lifeRatio - 0.1) / 0.9;
      const size = p.size * (1 + Math.sin(p.life * 5) * 0.2);

      // Glow
      ctx.shadowBlur = 8;
      ctx.shadowColor = `hsla(${p.hue}, 80%, 60%, ${alpha * 0.5})`;

      // Particle core
      ctx.fillStyle = `hsla(${p.hue}, 80%, ${p.brightness}%, ${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fill();

      // Bright center
      ctx.fillStyle = `hsla(${p.hue}, 60%, 90%, ${alpha * 0.8})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.shadowBlur = 0;

    // Waveform as subtle horizontal line through constellation
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const sliceWidth = width / timeData.length;
    let x = 0;
    for (let i = 0; i < timeData.length; i++) {
      const v = (timeData[i] - 128) / 128.0;
      const y = height * 0.85 + v * height * 0.1;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceWidth;
    }
    ctx.stroke();
  }
}
