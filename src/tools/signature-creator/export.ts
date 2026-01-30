import type { Point, SignatureSettings } from './signature-types.ts';
import { computeSegmentWidth, getCatmullRomControlPoints } from './calculation.ts';
import { drawSignaturePath } from './drawing.ts';

export function generatePng(
  paths: Point[][],
  logicalWidth: number,
  logicalHeight: number,
  settings: SignatureSettings
): Promise<{ blob: Blob; width: number; height: number }> {
  return new Promise((resolve) => {
    // Scale Factor (72 DPI is base)
    const scaleFactor = settings.dpi / 72;

    // Setup Canvas
    const exportW = Math.ceil(logicalWidth * scaleFactor);
    const exportH = Math.ceil(logicalHeight * scaleFactor);

    const canvas = document.createElement('canvas');
    canvas.width = exportW;
    canvas.height = exportH;
    const ctx = canvas.getContext('2d')!;

    // Draw Scaled & Translated
    ctx.scale(scaleFactor, scaleFactor);

    paths.forEach((path) => {
      drawSignaturePath(ctx, path, settings);
    });

    canvas.toBlob((blob) => {
      if (blob) resolve({ blob, width: exportW, height: exportH });
    }, 'image/png');
  });
}

export function generateSvg(
  paths: Point[][],
  width: number,
  height: number,
  settings: SignatureSettings
): string {
  const f = (n: number) => {
    const s = n.toFixed(1);
    return s.endsWith('.0') ? s.slice(0, -2) : s;
  };
  let content = '';

  paths.forEach((path) => {
    if (!path || path.length === 0) return;
    const mode = settings.curveMode || 'natural';
    const baseWidth = settings.penWidth || 2;

    if (path.length === 1) {
      content += `<circle cx="${f(path[0].x)}" cy="${f(path[0].y)}" r="${f(baseWidth / 2)}" fill="${settings.penColor}" />\n`;
      return;
    }

    // Draw using Cubic Beziers for max compression and smoothness
    if (mode === 'none') {
      // Simple polyline/path for raw strokes
      let d = `M${f(path[0].x)} ${f(path[0].y)}`;
      for (let i = 1; i < path.length; i++) d += ` L${f(path[i].x)} ${f(path[i].y)}`;
      content += `<path d="${d}" stroke-width="${f(baseWidth)}" />\n`;
    } else {
      let prevWidth = baseWidth;
      for (let i = 0; i < path.length - 1; i++) {
        const p0 = path[Math.max(0, i - 1)];
        const p1 = path[i];
        const p2 = path[i + 1];
        const p3 = path[Math.min(path.length - 1, i + 2)];

        const { c1x, c1y, c2x, c2y } = getCatmullRomControlPoints(p0, p1, p2, p3);
        const rawW = computeSegmentWidth(p1, p2, settings);
        const w = prevWidth * settings.widthSmoothing + rawW * (1 - settings.widthSmoothing);
        prevWidth = w;

        const d = `M${f(p1.x)} ${f(p1.y)} C${f(c1x)} ${f(c1y)}, ${f(c2x)} ${f(c2y)}, ${f(p2.x)} ${f(p2.y)}`;
        content += `<path d="${d}" stroke-width="${f(w)}" />\n`;
      }
    }
  });

  return `<svg width="${f(width)}" height="${f(height)}" viewBox="0 0 ${f(width)} ${f(height)}" xmlns="http://www.w3.org/2000/svg"><g stroke="${settings.penColor}" fill="none" stroke-linecap="round" stroke-linejoin="round">\n${content}</g></svg>`;
}
