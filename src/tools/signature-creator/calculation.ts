// Catmull-Rom to Cubic Bezier Control Points
import type { Point } from './signature-types.ts';

export const getCatmullRomControlPoints = (p0: Point, p1: Point, p2: Point, p3: Point) => {
  return {
    c1x: p1.x + (p2.x - p0.x) / 6,
    c1y: p1.y + (p2.y - p0.y) / 6,
    c2x: p2.x - (p3.x - p1.x) / 6,
    c2y: p2.y - (p3.y - p1.y) / 6,
  };
};

export function buildNormalizedFromPaths(paths: Point[][], baseWidth: number) {
  // Calculate Bounds & Normalize
  const flat = paths.flat();
  const minX = Math.min(...flat.map((p) => p.x));
  const minY = Math.min(...flat.map((p) => p.y));
  const maxX = Math.max(...flat.map((p) => p.x));
  const maxY = Math.max(...flat.map((p) => p.y));

  const padding = baseWidth * 2;
  const logicalWidth = maxX - minX + padding * 2;
  const logicalHeight = maxY - minY + padding * 2;

  // Shift paths to start at (0,0) for storage portability
  const normalizedPaths: Point[][] = paths.map((path) =>
    path.map((p) => ({
      x: p.x - minX + padding,
      y: p.y - minY + padding,
      timestamp: p.timestamp,
      pressure: p.pressure,
    }))
  );
  return { normalizedPaths, logicalWidth, logicalHeight };
}

function perpendicularDistanceSq(p: Point, p0: Point, p1: Point): number {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  if (dx === 0 && dy === 0) {
    // p0 und p1 sind identisch → Distanz zu p0
    return (p.x - p0.x) ** 2 + (p.y - p0.y) ** 2;
  }

  const t = ((p.x - p0.x) * dx + (p.y - p0.y) * dy) / (dx * dx + dy * dy);
  const tClamped = Math.max(0, Math.min(1, t)); // Projektion auf das Segment

  const projX = p0.x + tClamped * dx;
  const projY = p0.y + tClamped * dy;

  const distX = p.x - projX;
  const distY = p.y - projY;
  return distX * distX + distY * distY;
}

export function simplifyRDP(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points.slice();

  const result: Point[] = [];
  const stack: [number, number][] = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let maxDistSq = 0;
    let maxIndex = 0;

    for (let i = start + 1; i < end; i++) {
      const distSq = perpendicularDistanceSq(points[i], points[start], points[end]);
      if (distSq > maxDistSq) {
        maxDistSq = distSq;
        maxIndex = i;
      }
    }

    if (maxDistSq > epsilon * epsilon) {
      stack.push([maxIndex, end]);
      stack.push([start, maxIndex]);
    } else {
      result.push(points[start]);
    }
  }

  result.push(points[points.length - 1]);
  result.sort((a, b) => points.indexOf(a) - points.indexOf(b));
  return result;
}
