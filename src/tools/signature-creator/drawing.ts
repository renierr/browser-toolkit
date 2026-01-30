import type { Point, SignatureSettings } from './signature-types.ts';
import {
  computeSegmentWidth,
  computeWidthFromVelocityAndPressure,
  getCatmullRomControlPoints,
} from './calculation.ts';

export function drawSignaturePath(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  settings: SignatureSettings
) {
  if (!points || points.length === 0) return;

  const mode = settings.curveMode || 'natural';
  const baseWidth = settings.penWidth || 2;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = settings.penColor;
  ctx.fillStyle = settings.penColor;

  if (points.length === 1) {
    const p = points[0];
    ctx.beginPath();
    ctx.arc(p.x, p.y, baseWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  // Draw segment-by-segment for variable width
  if (mode === 'fast') {
    // Quadratic Curve (Midpoint approximation)
    let p1 = points[0];
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);

    let prevWidth = baseWidth;

    for (let i = 1; i < points.length; i++) {
      const p2 = points[i];
      const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

      const rawW = computeSegmentWidth(p1, p2, settings);
      const w = prevWidth * settings.widthSmoothing + rawW * (1 - settings.widthSmoothing);

      ctx.lineWidth = w;
      ctx.quadraticCurveTo(p1.x, p1.y, mid.x, mid.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mid.x, mid.y);

      p1 = p2;
      prevWidth = w;
    }
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  } else if (mode === 'natural') {
    let recentVels: number[] = [];
    let recentPressures: number[] = [];

    // Natural: Cubic Bezier (Catmull-Rom)
    let prevWidth = baseWidth;

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];

      const { c1x, c1y, c2x, c2y } = getCatmullRomControlPoints(p0, p1, p2, p3);
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      const dt = Math.max(1, p2.timestamp - p1.timestamp);
      const vel = dist / dt;
      const pressAvg = ((p1.pressure || 1) + (p2.pressure || 1)) / 2;

      recentVels.push(vel);
      recentPressures.push(pressAvg);
      if (recentVels.length > 5) recentVels.shift(); // max 5 segments
      if (recentPressures.length > 5) recentPressures.shift();

      const avgVel = recentVels.reduce((a, b) => a + b, 0) / recentVels.length;
      const avgPress = recentPressures.reduce((a, b) => a + b, 0) / recentPressures.length;

      const rawWidth = computeWidthFromVelocityAndPressure(avgVel, avgPress, settings);
      const w = prevWidth * settings.widthSmoothing + rawWidth * (1 - settings.widthSmoothing);
      prevWidth = w;

      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.bezierCurveTo(c1x, c1y, c2x, c2y, p2.x, p2.y);
      ctx.stroke();
    }
  } else if (mode === 'draft') {
    let p1 = points[0];
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineCap = 'round';

    let prevWidth = baseWidth;

    for (let i = 1; i < points.length; i++) {
      const p2 = points[i];
      const rawW = computeSegmentWidth(p1, p2, settings);
      const w = prevWidth * settings.widthSmoothing + rawW * (1 - settings.widthSmoothing);
      ctx.lineWidth = w;
      ctx.moveTo(p1.x, p1.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.lineTo(p2.x, p2.y);
      p1 = p2;
      prevWidth = w;
    }
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  } else {
    // None: Raw strokes - straight segments with constant width
    ctx.lineWidth = baseWidth;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
}