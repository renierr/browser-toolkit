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

  const transform = getPerspectiveTransform(
    [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ],
    corners
  );

  for (let v = 0; v < height; v++) {
    for (let u = 0; u < width; u++) {
      const den = transform[6] * u + transform[7] * v + 1;
      const x = (transform[0] * u + transform[1] * v + transform[2]) / den;
      const y = (transform[3] * u + transform[4] * v + transform[5]) / den;

      const ix = Math.floor(x);
      const iy = Math.floor(y);

      if (ix >= 0 && ix < sourceCanvas.width - 1 && iy >= 0 && iy < sourceCanvas.height - 1) {
        const srcIdx = (iy * sourceCanvas.width + ix) * 4;
        const dstIdx = (v * width + u) * 4;
        dstData.data[dstIdx] = srcData.data[srcIdx];
        dstData.data[dstIdx + 1] = srcData.data[srcIdx + 1];
        dstData.data[dstIdx + 2] = srcData.data[srcIdx + 2];
        dstData.data[dstIdx + 3] = srcData.data[srcIdx + 3];
      }
    }
  }

  outCtx.putImageData(dstData, 0, 0);
  return outCanvas;
}
