import type { Point } from './perspective';

/**
 * Applies a 5x5 Gaussian blur to a grayscale image.
 * This is more effective at removing noise than a box blur while preserving edges.
 */
function gaussianBlur(pixels: Uint8Array, width: number, height: number): Uint8Array {
  const blurred = new Uint8Array(width * height);
  // 5x5 Gaussian kernel (sigma = 1.0)
  const kernel = [
    1,  4,  7,  4, 1,
    4, 16, 26, 16, 4,
    7, 26, 41, 26, 7,
    4, 16, 26, 16, 4,
    1,  4,  7,  4, 1
  ];
  const kernelSum = 273;

  for (let y = 2; y < height - 2; y++) {
    const yOffset = y * width;
    for (let x = 2; x < width - 2; x++) {
      let sum = 0;
      for (let ky = -2; ky <= 2; ky++) {
        const kyOffset = (y + ky) * width;
        const kRowOffset = (ky + 2) * 5;
        for (let kx = -2; kx <= 2; kx++) {
          sum += pixels[kyOffset + (x + kx)] * kernel[kRowOffset + (kx + 2)];
        }
      }
      blurred[yOffset + x] = sum / kernelSum;
    }
  }
  return blurred;
}

/**
 * Performs a simple 3x3 dilation to connect nearby edge pixels.
 * This helps in creating more continuous edges for corner detection.
 */
function dilate(pixels: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      let max = pixels[idx];
      if (pixels[idx - width] > max) max = pixels[idx - width];
      if (pixels[idx + width] > max) max = pixels[idx + width];
      if (pixels[idx - 1] > max) max = pixels[idx - 1];
      if (pixels[idx + 1] > max) max = pixels[idx + 1];
      out[idx] = max;
    }
  }
  return out;
}

/**
 * Finds the corners of a document-like shape in an image.
 * Improved version with Gaussian blur, contrast stretching, and robust corner heuristics.
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

  // Step 2: Contrast Stretching
  // Enhances the difference between document and background
  let min = 255, max = 0;
  for (let i = 0; i < grayscale.length; i++) {
    if (grayscale[i] < min) min = grayscale[i];
    if (grayscale[i] > max) max = grayscale[i];
  }
  const range = max - min;
  if (range > 20) {
    for (let i = 0; i < grayscale.length; i++) {
      grayscale[i] = ((grayscale[i] - min) / range) * 255;
    }
  }

  // Step 3: Gaussian Blur to reduce noise
  const blurred = gaussianBlur(grayscale, width, height);

  // Step 4: Sobel edge detection
  const edges = new Uint8Array(width * height);
  let maxEdge = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const p00 = blurred[idx - width - 1];
      const p01 = blurred[idx - width];
      const p02 = blurred[idx - width + 1];
      const p10 = blurred[idx - 1];
      const p12 = blurred[idx + 1];
      const p20 = blurred[idx + width - 1];
      const p21 = blurred[idx + width];
      const p22 = blurred[idx + width + 1];

      const gx = (p02 + 2 * p12 + p22) - (p00 + 2 * p10 + p20);
      const gy = (p20 + 2 * p21 + p22) - (p00 + 2 * p01 + p02);

      const val = Math.sqrt(gx * gx + gy * gy);
      edges[idx] = Math.min(255, val);
      if (val > maxEdge) maxEdge = val;
    }
  }

  // Step 5: Dilation to connect broken edges
  const dilatedEdges = dilate(edges, width, height);

  // Step 6: Find corners using extreme points (min/max of x+y and x-y)
  // This is more robust for rotated rectangles than simple distance to image corners.
  const threshold = maxEdge * 0.25;
  let foundAny = false;

  let minSum = Infinity, maxSum = -Infinity;
  let minDiff = Infinity, maxDiff = -Infinity;

  let tl = { x: 0, y: 0 };
  let tr = { x: width, y: 0 };
  let br = { x: width, y: height };
  let bl = { x: 0, y: height };

  for (let y = 0; y < height; y++) {
    const yOffset = y * width;
    for (let x = 0; x < width; x++) {
      if (dilatedEdges[yOffset + x] > threshold) {
        foundAny = true;
        const sum = x + y;
        const diff = x - y;

        if (sum < minSum) { minSum = sum; tl = { x, y }; }
        if (sum > maxSum) { maxSum = sum; br = { x, y }; }
        if (diff > maxDiff) { maxDiff = diff; tr = { x, y }; }
        if (diff < minDiff) { minDiff = diff; bl = { x, y }; }
      }
    }
  }

  if (!foundAny) return null;

  // Validation: check if the area is large enough (at least 5% of the image)
  // Shoelace formula for quadrilateral area
  const area = Math.abs(
    (tl.x * (tr.y - bl.y) + tr.x * (br.y - tl.y) + br.x * (bl.y - tr.y) + bl.x * (tl.y - br.y)) / 2
  );

  if (area < (width * height) * 0.05) return null;

  return [tl, tr, br, bl];
}

export function detectCornersOnImage(img: HTMLImageElement | HTMLCanvasElement, maxDim = 800): Point[] | null {
  const tempCanvas = document.createElement('canvas');
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  tempCanvas.width = img.width * scale;
  tempCanvas.height = img.height * scale;
  const tCtx = tempCanvas.getContext('2d')!;
  tCtx.drawImage(img, 0, 0, tempCanvas.width, tempCanvas.height);
  const detected = detectDocumentCorners(tempCanvas);

  return detected?.map(p => ({
    x: (p.x / tempCanvas.width) * img.width,
    y: (p.y / tempCanvas.height) * img.height
  })) || null;
}
