import { sourceToCanvas } from './canvas';

export interface Point {
  x: number;
  y: number;
}

// Linear algebra helper for perspective transform
// Computes transform that maps src[0..3] -> dst[0..3]
export function getPerspectiveTransform(src: Point[], dst: Point[]) {
  const p: number[][] = [];
  for (let i = 0; i < 4; i++) {
    p.push([src[i].x, src[i].y, 1, 0, 0, 0, -src[i].x * dst[i].x, -src[i].y * dst[i].x, dst[i].x]);
    p.push([0, 0, 0, src[i].x, src[i].y, 1, -src[i].x * dst[i].y, -src[i].y * dst[i].y, dst[i].y]);
  }

  // Solve the 8x8 system using Gaussian elimination
  return solve(p);
}

function solve(matrix: number[][]) {
  const n = 8;
  for (let i = 0; i < n; i++) {
    let max = i;
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(matrix[j][i]) > Math.abs(matrix[max][i])) max = j;
    }
    [matrix[i], matrix[max]] = [matrix[max], matrix[i]];

    for (let j = i + 1; j < n; j++) {
      const c = -matrix[j][i] / matrix[i][i];
      for (let k = i; k <= n; k++) {
        if (i === k) matrix[j][k] = 0;
        else matrix[j][k] += c * matrix[i][k];
      }
    }
  }

  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = matrix[i][n] / matrix[i][i];
    for (let j = i - 1; j >= 0; j--) {
      matrix[j][n] -= matrix[j][i] * x[i];
    }
  }
  return x;
}

export function warp(
  source: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement,
  corners: Point[]
): HTMLCanvasElement {
  const sourceCanvas = sourceToCanvas(source);
  const w1 = Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y);
  const w2 = Math.hypot(corners[2].x - corners[3].x, corners[2].y - corners[3].y);
  const h1 = Math.hypot(corners[3].x - corners[0].x, corners[3].y - corners[0].y);
  const h2 = Math.hypot(corners[2].x - corners[1].x, corners[2].y - corners[1].y);

  const width = Math.round(Math.max(w1, w2));
  const height = Math.round(Math.max(h1, h2));

  const outCanvas = document.createElement('canvas');
  outCanvas.width = width;
  outCanvas.height = height;
  const outCtx = outCanvas.getContext('2d')!;

  const srcCtx = sourceCanvas.getContext('2d')!;
  const srcData = srcCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const dstData = outCtx.createImageData(width, height);

  const srcW = sourceCanvas.width;
  const srcH = sourceCanvas.height;

  const transform = getPerspectiveTransform(
    [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ],
    corners
  );

  // Extract transform coefficients for direct access
  const t0 = transform[0],
    t1 = transform[1],
    t2 = transform[2];
  const t3 = transform[3],
    t4 = transform[4],
    t5 = transform[5];
  const t6 = transform[6],
    t7 = transform[7];

  // Bilinear interpolation with Uint8 component access
  const srcBytes = srcData.data;

  for (let v = 0; v < height; v++) {
    // Row-level precomputation: terms that only depend on v
    const rv1 = t1 * v + t2;
    const rv4 = t4 * v + t5;
    const rv7 = t7 * v + 1;

    const rowOff = v * width;

    for (let u = 0; u < width; u++) {
      const den = t6 * u + rv7;
      const invDen = 1 / den;
      const x = (t0 * u + rv1) * invDen;
      const y = (t3 * u + rv4) * invDen;

      const ix = x | 0; // fast floor for positive numbers
      const iy = y | 0;

      if (ix >= 0 && ix < srcW - 1 && iy >= 0 && iy < srcH - 1) {
        const fx = x - ix;
        const fy = y - iy;

        // Bilinear interpolation
        const idx00 = (iy * srcW + ix) << 2;
        const idx10 = idx00 + 4;
        const idx01 = idx00 + (srcW << 2);
        const idx11 = idx01 + 4;

        const w00 = (1 - fx) * (1 - fy);
        const w10 = fx * (1 - fy);
        const w01 = (1 - fx) * fy;
        const w11 = fx * fy;

        const dstIdx = (rowOff + u) << 2;
        dstData.data[dstIdx] =
          srcBytes[idx00] * w00 + srcBytes[idx10] * w10 + srcBytes[idx01] * w01 + srcBytes[idx11] * w11;
        dstData.data[dstIdx + 1] =
          srcBytes[idx00 + 1] * w00 + srcBytes[idx10 + 1] * w10 + srcBytes[idx01 + 1] * w01 + srcBytes[idx11 + 1] * w11;
        dstData.data[dstIdx + 2] =
          srcBytes[idx00 + 2] * w00 + srcBytes[idx10 + 2] * w10 + srcBytes[idx01 + 2] * w01 + srcBytes[idx11 + 2] * w11;
        dstData.data[dstIdx + 3] = 255;
      }
    }
  }

  outCtx.putImageData(dstData, 0, 0);
  return outCanvas;
}
