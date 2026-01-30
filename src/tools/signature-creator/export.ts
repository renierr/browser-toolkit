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

// New: Canvas-based animation exporter (WebM) that draws paths progressively with linear timing.
// Approach:
// - Sample each path into many short straight segments (samples) using the existing Catmull-Rom -> cubic approach
// - Compute per-path total lengths and a global total length
// - For each animation frame, compute targetLength = (t/1) * globalTotalLength and draw each path up to that length
// - Record the canvas via canvas.captureStream() + MediaRecorder to produce a WebM blob (widely supported)

interface WebMOptions {
  durationMs?: number;
  fps?: number;
  background?: string | null; // null = transparent
  dpi?: number; // export DPI (applies scale)
}

function cubicPointAt(
  p0: Point,
  c1: { x: number; y: number },
  c2: { x: number; y: number },
  p1: Point,
  t: number
): Point {
  // cubic Bezier evaluation (p0 is start, c1, c2, p1 is end)
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;
  const x = uuu * p0.x + 3 * uu * t * c1.x + 3 * u * tt * c2.x + ttt * p1.x;
  const y = uuu * p0.y + 3 * uu * t * c1.y + 3 * u * tt * c2.y + ttt * p1.y;
  // Interpolate timestamp and pressure between endpoints so returned object satisfies Point
  const timestamp = (p0.timestamp || 0) * (1 - t) + (p1.timestamp || 0) * t;
  const pressure = (p0.pressure || 0.5) * (1 - t) + (p1.pressure || 0.5) * t;
  return { x, y, timestamp, pressure };
}

function samplePathToSegments(
  path: Point[],
  settings: SignatureSettings,
  samplesPerSegment = 8
): { points: Point[]; widths: number[]; totalLen: number } {
  const mode = settings.curveMode || 'natural';
  const baseWidth = settings.penWidth || 2;
  const outPoints: Point[] = [];
  const widths: number[] = [];

  if (!path || path.length === 0) return { points: [], widths: [], totalLen: 0 };
  if (path.length === 1) {
    outPoints.push(path[0]);
    widths.push(baseWidth);
    return { points: outPoints, widths, totalLen: 0 };
  }

  if (mode === 'none') {
    for (let i = 0; i < path.length; i++) {
      outPoints.push(path[i]);
      if (i === 0) widths.push(baseWidth);
      else widths.push(computeSegmentWidth(path[i - 1], path[i], settings));
    }
  } else {
    // For each segment between path[i] and path[i+1], compute Catmull-Rom control points and sample
    for (let i = 0; i < path.length - 1; i++) {
      const p0 = path[Math.max(0, i - 1)];
      const p1 = path[i];
      const p2 = path[i + 1];
      const p3 = path[Math.min(path.length - 1, i + 2)];
      const c = getCatmullRomControlPoints(p0, p1, p2, p3);
      const c1 = { x: c.c1x, y: c.c1y };
      const c2 = { x: c.c2x, y: c.c2y };

      // Sample t from 0..1 (inclusive only for last sample of segment)
      for (let s = 0; s < samplesPerSegment; s++) {
        const t = s / samplesPerSegment;
        const pt = cubicPointAt(p1, c1, c2, p2, t);
        outPoints.push(pt);
        // interpolate width between p1 and p2
        const w1 = computeSegmentWidth(p1, p2, settings);
        widths.push(w1);
      }
    }
    // ensure last point is added
    outPoints.push(path[path.length - 1]);
    widths.push(baseWidth);
  }

  // compute total length
  let totalLen = 0;
  for (let i = 1; i < outPoints.length; i++) {
    const dx = outPoints[i].x - outPoints[i - 1].x;
    const dy = outPoints[i].y - outPoints[i - 1].y;
    totalLen += Math.hypot(dx, dy);
  }

  return { points: outPoints, widths, totalLen };
}

export function generateWebMAnimation(
  paths: Point[][],
  width: number,
  height: number,
  settings: SignatureSettings,
  options: WebMOptions = {}
): Promise<Blob> {
  const durationMs = options.durationMs ?? 2000;
  const fps = options.fps ?? 30;
  const background = options.background ?? null; // transparent
  const dpi = options.dpi ?? settings.dpi ?? 72;

  return new Promise(async (resolve, reject) => {
    try {
      // scale factor for canvas pixel size
      const scaleFactor = dpi / 72;
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(width * scaleFactor);
      canvas.height = Math.ceil(height * scaleFactor);
      const ctx = canvas.getContext('2d')!;
      // use logical coordinate space by scaling
      ctx.scale(scaleFactor, scaleFactor);

      // pre-sample each path
      const perPath = paths.map((p) => samplePathToSegments(p, settings, 12));
      const globalTotal = perPath.reduce((s, p) => s + (p.totalLen || 0), 0) || 0;

      // prepare recording
      const stream = (canvas as HTMLCanvasElement).captureStream(fps);
      const mimeTypes = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
      let mimeType: string | undefined;
      for (const m of mimeTypes) {
        if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) {
          mimeType = m;
          break;
        }
      }

      const recorderOptions = mimeType ? { mimeType } : undefined;
      const recorder = new MediaRecorder(stream, recorderOptions as any);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
      };
      recorder.onerror = (ev) => {
        // fallback: reject
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        reject(new Error('MediaRecorder error: ' + (ev?.error?.message || ev)));
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType ?? 'video/webm' });
        resolve(blob);
      };

      recorder.start();

      const frameCount = Math.max(1, Math.round((durationMs / 1000) * fps));

      // Render loop: for each frame, compute target length and draw paths up to that length
      for (let frame = 0; frame < frameCount; frame++) {
        const t = frame / (frameCount - 1 || 1);
        const targetLen = globalTotal * t;

        // clear
        ctx.clearRect(0, 0, width, height);
        if (background !== null) {
          ctx.fillStyle = background || 'rgba(0,0,0,0)';
          ctx.fillRect(0, 0, width, height);
        }

        // draw each path up to available length
        let remaining = targetLen;
        for (let pi = 0; pi < perPath.length; pi++) {
          const meta = perPath[pi];
          const pts = meta.points;
          const wds = meta.widths;
          if (!pts || pts.length === 0) continue;

          if (remaining >= meta.totalLen) {
            // draw full path
            if (pts.length === 1) {
              ctx.fillStyle = settings.penColor;
              ctx.beginPath();
              ctx.arc(pts[0].x, pts[0].y, (settings.penWidth || 2) / 2, 0, Math.PI * 2);
              ctx.fill();
            } else {
              ctx.strokeStyle = settings.penColor;
              for (let i = 1; i < pts.length; i++) {
                ctx.beginPath();
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.lineWidth = wds[i] ?? (settings.penWidth || 2);
                ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
                ctx.lineTo(pts[i].x, pts[i].y);
                ctx.stroke();
              }
            }
            remaining -= meta.totalLen;
            continue;
          }

          // partial draw: consume portion of this path
          if (remaining <= 0) break;

          // walk along segments until reaching remaining
          let acc = 0;
          for (let i = 1; i < pts.length; i++) {
            const a = pts[i - 1];
            const b = pts[i];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const segLen = Math.hypot(dx, dy);
            if (acc + segLen < remaining) {
              // draw whole segment
              ctx.beginPath();
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';
              ctx.strokeStyle = settings.penColor;
              ctx.lineWidth = wds[i] ?? (settings.penWidth || 2);
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
              acc += segLen;
              continue;
            } else {
              // draw partial segment from a to interpolated point
              const need = remaining - acc;
              const ratio = segLen <= 0 ? 0 : need / segLen;
              const ix = a.x + dx * ratio;
              const iy = a.y + dy * ratio;

              ctx.beginPath();
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';
              ctx.strokeStyle = settings.penColor;
              ctx.lineWidth = wds[i] ?? (settings.penWidth || 2);
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(ix, iy);
              ctx.stroke();

              remaining = 0;
              break;
            }
          }
          // once partial path consumed, break outer if done
          if (remaining <= 0) break;
        }

        // wait for next frame tick - ensure draw is visible to capture
        await new Promise((r) => setTimeout(r, Math.ceil(1000 / fps)));
      }

      // stop recorder and finalize
      recorder.stop();
    } catch (err) {
      reject(err);
    }
  });
}
