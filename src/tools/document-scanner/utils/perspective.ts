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
