import type { Visualizer, VisualizerState } from './base';

export class Grid3DVisualizer implements Visualizer {
  private rotationY = 0;
  private rotationX = 0.7; // Bird's-eye tilt (positive)
  private panning = 0;

  draw(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    state: VisualizerState
  ): void {
    const { freqData, bass } = state;
    
    // Config
    const focalLength = 400;
    const cameraDist = 600; // Slightly further for better framing
    const centerY = height * 0.45; // Center vertically for top-down view

    this.rotationY += 0.008 + bass * 0.02;
    this.panning += 0.01;
    const panOffset = Math.sin(this.panning) * (width * 0.15);
    const centerX = width / 2 + panOffset;

    // --- SETUP: Faded Background ---
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(0, 0, width, height);

    const cosY = Math.cos(this.rotationY);
    const sinY = Math.sin(this.rotationY);
    const cosX = Math.cos(this.rotationX);
    const sinX = Math.sin(this.rotationX);

    // Helpers
    const transform = (x: number, y: number, z: number) => {
      // 1. Rotate Y
      let tx = x * cosY - z * sinY;
      let tz = x * sinY + z * cosY;
      // 2. Rotate X (Tilt towards viewer)
      let ty = y * cosX - tz * sinX;
      let tz2 = y * sinX + tz * cosX;
      
      // 3. Project
      const scale = focalLength / (tz2 + cameraDist);
      return {
        px: centerX + tx * scale,
        py: centerY + ty * scale,
        z: tz2,
        scale
      };
    };

    // --- 1. BASE PLATE ---
    const gridSize = 170;
    const plateCorners = [
      { x: -gridSize, y: 0, z: -gridSize },
      { x: gridSize, y: 0, z: -gridSize },
      { x: gridSize, y: 0, z: gridSize },
      { x: -gridSize, y: 0, z: gridSize },
    ].map(p => transform(p.x, p.y, p.z));

    ctx.fillStyle = 'rgba(60, 0, 0, 0.9)'; // Solid foundation
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.6)';
    ctx.beginPath();
    ctx.moveTo(plateCorners[0].px, plateCorners[0].py);
    plateCorners.forEach(c => ctx.lineTo(c.px, c.py));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // --- 2. DATA PREP & DEPTH SORT ---
    const bars: any[] = [];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const binIdx = (r * 4 + c) * 4;
        const val = freqData[binIdx] || 0;
        const bx = (c - 1.5) * 85;
        const bz = (r - 1.5) * 85;
        
        // Calculate center for sorting
        const center = transform(bx, 0, bz);
        bars.push({ bx, bz, val: val / 255, id: r * 4 + c, tz: center.z });
      }
    }

    // Back-to-front
    bars.sort((a, b) => b.tz - a.tz);

    // --- 3. RENDERING BARS ---
    bars.forEach((bar) => {
      const h = bar.val * 200; // Peak height
      if (h < 2) return;

      const s = 30; // Half-width
      const { bx, bz } = bar;
      
      const v = [
        transform(bx - s, 0, bz - s), // 0: bottom-back-left
        transform(bx + s, 0, bz - s), // 1: bottom-back-right
        transform(bx + s, 0, bz + s), // 2: bottom-front-right
        transform(bx - s, 0, bz + s), // 3: bottom-front-left
        transform(bx - s, -h, bz - s), // 4: top-back-left
        transform(bx + s, -h, bz - s), // 5: top-back-right
        transform(bx + s, -h, bz + s), // 6: top-front-right
        transform(bx - s, -h, bz + s), // 7: top-front-left
      ];

      const hue = (bar.id / 15) * 60;
      const lightness = 40 + bar.val * 30;

      const drawFace = (indices: number[], color: string, border = false) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(v[indices[0]].px, v[indices[0]].py);
        indices.forEach(idx => ctx.lineTo(v[idx].px, v[idx].py));
        ctx.closePath();
        ctx.fill();
        if (border) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
          ctx.stroke();
        }
      };

      const topC = `hsl(${hue}, 100%, ${lightness + 20}%)`;
      const frontC = `hsl(${hue}, 100%, ${lightness}%)`;
      const sideC = `hsl(${hue}, 100%, ${lightness - 15}%)`;

      // Back-to-front within the bar
      drawFace([0, 1, 5, 4], sideC); // Back
      drawFace([1, 2, 6, 5], sideC); // Right
      drawFace([0, 3, 7, 4], sideC); // Left
      drawFace([3, 2, 6, 7], frontC); // Front
      drawFace([4, 5, 6, 7], topC, true); // Top (Bird's eye view focus)
    });
  }
}
