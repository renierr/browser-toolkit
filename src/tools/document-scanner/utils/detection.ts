import type { Point } from './perspective';

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

  // Step 2: Simple Sobel-ish edge detection
  const edges = new Uint8Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const gx =
        -grayscale[idx - width - 1] +
        grayscale[idx - width + 1] -
        2 * grayscale[idx - 1] +
        2 * grayscale[idx + 1] -
        grayscale[idx + width - 1] +
        grayscale[idx + width + 1];
      const gy =
        -grayscale[idx - width - 1] -
        2 * grayscale[idx - width] -
        grayscale[idx - width + 1] +
        grayscale[idx + width - 1] +
        2 * grayscale[idx + width] +
        grayscale[idx + width + 1];
      edges[idx] = Math.min(255, Math.sqrt(gx * gx + gy * gy));
    }
  }

  // Step 3: Find points that maximize/minimize x+y and x-y to find corners
  const threshold = 50; // edge intensity threshold
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
