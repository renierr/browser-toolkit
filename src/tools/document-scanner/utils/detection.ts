import type { Point } from './perspective';

/**
 * Applies a 5x5 Gaussian blur to a grayscale image.
 * This is more effective at removing noise than a box blur while preserving edges.
 */
function gaussianBlur(pixels: Uint8Array, width: number, height: number): Uint8Array {
  const blurred = new Uint8Array(width * height);
  // 5x5 Gaussian kernel (sigma = 1.0)
  const kernel = [
    1, 4, 7, 4, 1, 4, 16, 26, 16, 4, 7, 26, 41, 26, 7, 4, 16, 26, 16, 4, 1, 4, 7, 4, 1,
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
 * Performs a 3x3 erosion to remove small noise.
 */
function erode(pixels: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      let min = pixels[idx];
      if (pixels[idx - width] < min) min = pixels[idx - width];
      if (pixels[idx + width] < min) min = pixels[idx + width];
      if (pixels[idx - 1] < min) min = pixels[idx - 1];
      if (pixels[idx + 1] < min) min = pixels[idx + 1];
      out[idx] = min;
    }
  }
  return out;
}

/**
 * Validates if four points form a plausible document rectangle.
 * Checks for convexity, area, and reasonable aspect ratio.
 */
function isValidDocument(points: Point[], width: number, height: number): boolean {
  const [tl, tr, br, bl] = points;

  // 1. Check Shoelace area
  const area = Math.abs(
    (tl.x * (tr.y - bl.y) + tr.x * (br.y - tl.y) + br.x * (bl.y - tr.y) + bl.x * (tl.y - br.y)) / 2
  );
  if (area < width * height * 0.05) return false;

  // 2. Check for convexity (all internal angles < 180 degrees)
  // For a convex quadrilateral, the cross products of consecutive edges should have the same sign.
  const crossProduct = (a: Point, b: Point, c: Point) =>
    (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
  const cp1 = crossProduct(tl, tr, br);
  const cp2 = crossProduct(tr, br, bl);
  const cp3 = crossProduct(br, bl, tl);
  const cp4 = crossProduct(bl, tl, tr);

  const allPositive = cp1 > 0 && cp2 > 0 && cp3 > 0 && cp4 > 0;
  const allNegative = cp1 < 0 && cp2 < 0 && cp3 < 0 && cp4 < 0;
  if (!allPositive && !allNegative) return false;

  // 3. Check aspect ratio (optional but good for documents)
  // A4 is ~1.41, US Letter is ~1.29. We can allow 0.5 to 2.0
  const side1 = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const side2 = Math.hypot(br.x - tr.x, br.y - tr.y);
  const ratio = side1 / side2;
  return !(ratio < 0.2 || ratio > 5.0);
}

let history: Point[][] = [];
const HISTORY_SIZE = 5;

/**
 * Smooths the detected corners using a simple moving average.
 */
function smoothCorners(newCorners: Point[] | null): Point[] | null {
  if (!newCorners) {
    history = [];
    return null;
  }

  history.push(newCorners);
  if (history.length > HISTORY_SIZE) history.shift();

  const smoothed: Point[] = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ];

  for (const entry of history) {
    for (let i = 0; i < 4; i++) {
      smoothed[i].x += entry[i].x;
      smoothed[i].y += entry[i].y;
    }
  }

  for (let i = 0; i < 4; i++) {
    smoothed[i].x /= history.length;
    smoothed[i].y /= history.length;
  }

  return smoothed;
}

/**
 * Finds the corners of a document-like shape in an image.
 * Improved version with Gaussian blur, contrast stretching, and robust corner heuristics.
 */
export function detectDocumentCorners(canvas: HTMLCanvasElement, maxDim = 400): Point[] | null {
  const width = canvas.width;
  const height = canvas.height;

  // Step 1: Downscale for performance if needed
  let processingCanvas = canvas;
  let processingWidth = width;
  let processingHeight = height;

  const maxProcessingDim = maxDim;
  if (width > maxProcessingDim || height > maxProcessingDim) {
    const scale = Math.min(maxProcessingDim / width, maxProcessingDim / height);
    processingWidth = Math.floor(width * scale);
    processingHeight = Math.floor(height * scale);
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = processingWidth;
    tempCanvas.height = processingHeight;
    const tCtx = tempCanvas.getContext('2d')!;
    tCtx.drawImage(canvas, 0, 0, processingWidth, processingHeight);
    processingCanvas = tempCanvas;
  }

  const pCtx = processingCanvas.getContext('2d', { willReadFrequently: true });
  if (!pCtx) return null;
  const imgData = pCtx.getImageData(0, 0, processingWidth, processingHeight);
  const data = imgData.data;

  // Step 2: Grayscale
  const grayscale = new Uint8Array(processingWidth * processingHeight);
  for (let i = 0; i < data.length; i += 4) {
    grayscale[i / 4] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }

  // Step 3: Contrast Stretching
  // Enhances the difference between document and background
  let min = 255,
    max = 0;
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

  // Step 4: Gaussian Blur to reduce noise
  const blurred = gaussianBlur(grayscale, processingWidth, processingHeight);

  // Step 5: Sobel edge detection
  const edges = new Uint8Array(processingWidth * processingHeight);
  let maxEdge = 0;
  for (let y = 1; y < processingHeight - 1; y++) {
    const yOffset = y * processingWidth;
    for (let x = 1; x < processingWidth - 1; x++) {
      const idx = yOffset + x;
      const p00 = blurred[idx - processingWidth - 1];
      const p01 = blurred[idx - processingWidth];
      const p02 = blurred[idx - processingWidth + 1];
      const p10 = blurred[idx - 1];
      const p12 = blurred[idx + 1];
      const p20 = blurred[idx + processingWidth - 1];
      const p21 = blurred[idx + processingWidth];
      const p22 = blurred[idx + processingWidth + 1];

      const gx = p02 + 2 * p12 + p22 - (p00 + 2 * p10 + p20);
      const gy = p20 + 2 * p21 + p22 - (p00 + 2 * p01 + p02);

      const val = Math.sqrt(gx * gx + gy * gy);
      edges[idx] = Math.min(255, val);
      if (val > maxEdge) maxEdge = val;
    }
  }

  // Step 6: Morphological operations (Closing) to connect broken edges
  const closedEdges = erode(
    dilate(edges, processingWidth, processingHeight),
    processingWidth,
    processingHeight
  );

  // Step 7: Find corners using extreme points
  const threshold = maxEdge * 0.15; // Lowered threshold slightly for better sensitivity
  let foundAny = false;

  let minSum = Infinity,
    maxSum = -Infinity;
  let minDiff = Infinity,
    maxDiff = -Infinity;

  let tl = { x: 0, y: 0 };
  let tr = { x: processingWidth, y: 0 };
  let br = { x: processingWidth, y: processingHeight };
  let bl = { x: 0, y: processingHeight };

  for (let y = 0; y < processingHeight; y++) {
    const yOffset = y * processingWidth;
    for (let x = 0; x < processingWidth; x++) {
      if (closedEdges[yOffset + x] > threshold) {
        foundAny = true;
        const sum = x + y;
        const diff = x - y;

        if (sum < minSum) {
          minSum = sum;
          tl = { x, y };
        }
        if (sum > maxSum) {
          maxSum = sum;
          br = { x, y };
        }
        if (diff > maxDiff) {
          maxDiff = diff;
          tr = { x, y };
        }
        if (diff < minDiff) {
          minDiff = diff;
          bl = { x, y };
        }
      }
    }
  }

  if (!foundAny) return null;

  // Scale corners back to original canvas size
  const corners = [tl, tr, br, bl].map((p) => ({
    x: (p.x / processingWidth) * width,
    y: (p.y / processingHeight) * height,
  }));

  // Validation: check if the area is large enough and shape is convex
  if (!isValidDocument(corners, width, height)) return null;

  return corners;
}

export function detectCornersOnImage(
  img: HTMLImageElement | HTMLCanvasElement,
  maxDim = 1200
): Point[] | null {
  const tempCanvas = document.createElement('canvas');
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  tempCanvas.width = img.width * scale;
  tempCanvas.height = img.height * scale;
  const tCtx = tempCanvas.getContext('2d')!;
  tCtx.drawImage(img, 0, 0, tempCanvas.width, tempCanvas.height);
  const detected = detectDocumentCorners(tempCanvas, maxDim);

  return (
    detected?.map((p) => ({
      x: (p.x / tempCanvas.width) * img.width,
      y: (p.y / tempCanvas.height) * img.height,
    })) || null
  );
}

export function calculateLiveDetection(
  video: HTMLVideoElement,
  detectionCanvas: HTMLCanvasElement,
  dCtx: CanvasRenderingContext2D,
  cameraOverlay: HTMLCanvasElement
) {
  const vWidth = video.videoWidth;
  const vHeight = video.videoHeight;
  const cWidth = video.clientWidth;
  const cHeight = video.clientHeight;

  if (!vWidth || !vHeight || !cWidth || !cHeight) return null;

  const scale = Math.min(1, 300 / Math.max(vWidth, vHeight));
  const dWidth = Math.floor(vWidth * scale);
  const dHeight = Math.floor(vHeight * scale);

  if (detectionCanvas.width !== dWidth || detectionCanvas.height !== dHeight) {
    detectionCanvas.width = dWidth;
    detectionCanvas.height = dHeight;
  }

  dCtx.drawImage(video, 0, 0, vWidth, vHeight, 0, 0, dWidth, dHeight);
  let detected = detectDocumentCorners(detectionCanvas, 300);

  // Temporal smoothing for live detection
  detected = smoothCorners(detected);

  let lastDetectedCorners: Point[] | null = null;
  if (detected) {
    lastDetectedCorners = detected.map((p) => ({
      x: (p.x / dWidth) * vWidth,
      y: (p.y / dHeight) * vHeight,
    }));
  }

  const vAspect = vWidth / vHeight;
  const cAspect = cWidth / cHeight;

  const upscaled =
    detected?.map((p) => {
      // p is in [0, dWidth] x [0, dHeight]
      // First scale to [0, 1]
      const nx = p.x / dWidth;
      const ny = p.y / dHeight;

      // When object-cover is used, the video is scaled to fill the container.
      // One dimension is filled completely, the other is cropped.
      if (vAspect > cAspect) {
        // Video is wider than container, height matches, sides are cropped
        const visibleWidthAtVideoScale = vHeight * cAspect;
        const cropX = (vWidth - visibleWidthAtVideoScale) / 2;
        const vx = nx * vWidth;
        return {
          x: ((vx - cropX) / visibleWidthAtVideoScale) * cWidth,
          y: ny * cHeight,
        };
      } else {
        // Video is taller than container, width matches, top/bottom are cropped
        const visibleHeightAtVideoScale = vWidth / cAspect;
        const cropY = (vHeight - visibleHeightAtVideoScale) / 2;
        const vy = ny * vHeight;
        return {
          x: nx * cWidth,
          y: ((vy - cropY) / visibleHeightAtVideoScale) * cHeight,
        };
      }
    }) || null;

  if (cameraOverlay.width !== cWidth || cameraOverlay.height !== cHeight) {
    cameraOverlay.width = cWidth;
    cameraOverlay.height = cHeight;
  }

  return { lastDetectedCorners, upscaled };
}
