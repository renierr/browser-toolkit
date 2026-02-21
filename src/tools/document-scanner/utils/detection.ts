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
 * This is a simplified version of document detection.
 * It uses color/intensity thresholding and basic contour analysis.
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

  // Step 2: Simple Sobel-ish edge detection (using abs(gx) + abs(gy) for speed)
  const edges = new Uint8Array(width * height);
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

      edges[idx] = Math.min(255, Math.abs(gx) + Math.abs(gy)); // Faster approximation
    }
  }

  // Step 3: Find points that maximize/minimize x+y and x-y to find corners
  const threshold = 30; // edge intensity threshold (reduced for sensitivity)
  let foundAny = false;

  let minSum = { x: 0, y: 0, val: Infinity };
  let maxSum = { x: 0, y: 0, val: -Infinity };
  let minDiff = { x: 0, y: 0, val: Infinity };
  let maxDiff = { x: 0, y: 0, val: -Infinity };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (edges[y * width + x] > threshold) {
        foundAny = true;
        const sum = x + y;
        const diff = x - y;

        if (sum < minSum.val) minSum = { x, y, val: sum };
        if (sum > maxSum.val) maxSum = { x, y, val: sum };
        if (diff < minDiff.val) minDiff = { x, y, val: diff };
        if (diff > maxDiff.val) maxDiff = { x, y, val: diff };
      }
    }
  }

  if (!foundAny) return null;

  // Expected order: Top-Left, Top-Right, Bottom-Right, Bottom-Left
  return [
    { x: minSum.x, y: minSum.y }, // Top-Left (min x+y)
    { x: maxDiff.x, y: maxDiff.y }, // Top-Right (max x-y)
    { x: maxSum.x, y: maxSum.y }, // Bottom-Right (max x+y)
    { x: minDiff.x, y: minDiff.y }, // Bottom-Left (min x-y)
  ];
}
