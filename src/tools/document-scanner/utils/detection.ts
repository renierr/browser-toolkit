import type { Point } from './perspective';

/**
 * Applies a simple 3x3 box blur to a grayscale image.
 */
function boxBlur(pixels: Uint8Array, width: number, height: number): Uint8Array {
  const blurred = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            sum += pixels[ny * width + nx];
            count++;
          }
        }
      }
      blurred[y * width + x] = sum / count;
    }
  }
  return blurred;
}

/**
 * Finds the corners of a document-like shape in an image.
 * Improved version with adaptive thresholding and better corner finding.
 */
export function detectDocumentCorners(canvas: HTMLCanvasElement): Point[] | null {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  const width = canvas.width;
  const height = canvas.height;
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  // Step 1: Grayscale
  const grayscale = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i += 4) {
    grayscale[i / 4] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }

  // Step 1.5: Apply a small blur to reduce noise
  const blurredGrayscale = boxBlur(grayscale, width, height);

  // Step 2: Sobel edge detection
  const edges = new Uint8Array(width * height);
  let maxEdge = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const p00 = blurredGrayscale[idx - width - 1];
      const p01 = blurredGrayscale[idx - width];
      const p02 = blurredGrayscale[idx - width + 1];
      const p10 = blurredGrayscale[idx - 1];
      const p12 = blurredGrayscale[idx + 1];
      const p20 = blurredGrayscale[idx + width - 1];
      const p21 = blurredGrayscale[idx + width];
      const p22 = blurredGrayscale[idx + width + 1];

      const gx = (p02 + 2 * p12 + p22) - (p00 + 2 * p10 + p20);
      const gy = (p20 + 2 * p21 + p22) - (p00 + 2 * p01 + p02);

      const val = Math.sqrt(gx * gx + gy * gy);
      edges[idx] = Math.min(255, val);
      if (val > maxEdge) maxEdge = val;
    }
  }

  // Step 3: Find corners using a more robust approach
  // We look for points that are far from the center and have high edge intensity
  const threshold = maxEdge * 0.2; // Adaptive threshold
  let foundAny = false;

  // Initialize corners with center-ish values
  let tl = { x: width, y: height, score: Infinity };
  let tr = { x: 0, y: height, score: Infinity };
  let br = { x: 0, y: 0, score: Infinity };
  let bl = { x: width, y: 0, score: Infinity };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (edges[y * width + x] > threshold) {
        foundAny = true;

        // Distance to corners
        const dTL = x * x + y * y;
        const dTR = (width - x) * (width - x) + y * y;
        const dBR = (width - x) * (width - x) + (height - y) * (height - y);
        const dBL = x * x + (height - y) * (height - y);

        if (dTL < tl.score) tl = { x, y, score: dTL };
        if (dTR < tr.score) tr = { x, y, score: dTR };
        if (dBR < br.score) br = { x, y, score: dBR };
        if (dBL < bl.score) bl = { x, y, score: dBL };
      }
    }
  }

  if (!foundAny) return null;

  // Basic validation: check if the area is large enough
  const area = Math.abs((tl.x * (tr.y - bl.y) + tr.x * (bl.y - tl.y) + bl.x * (tl.y - tr.y)) / 2) +
               Math.abs((br.x * (tr.y - bl.y) + tr.x * (bl.y - br.y) + bl.x * (br.y - tr.y)) / 2);

  if (area < (width * height) * 0.1) return null;

  return [
    { x: tl.x, y: tl.y },
    { x: tr.x, y: tr.y },
    { x: br.x, y: br.y },
    { x: bl.x, y: bl.y },
  ];
}
