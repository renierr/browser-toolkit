import { blobToImageData } from '@js/image-utils.ts';
import { mapLuminanceToChar } from './ascii-mapper.ts';
import type { AsciiOptions, AsciiRenderResult } from './types.ts';

function computeOutputDimensions(
  width: number,
  height: number,
  targetWidth: number,
  fontAspect: number
): [number, number] {
  const safeWidth = Math.max(1, Math.floor(targetWidth));
  const safeAspect = Math.min(0.9, Math.max(0.2, fontAspect));
  const scaledHeight = Math.max(1, Math.floor((height / width) * safeWidth * safeAspect));
  return [safeWidth, scaledHeight];
}

function pixelLuminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function autoStretchContrast(values: Float32Array): void {
  let min = 1;
  let max = 0;
  for (let i = 0; i < values.length; i++) {
    const value = values[i] ?? 0;
    if (value < min) min = value;
    if (value > max) max = value;
  }

  if (max - min < 0.02) return;

  const range = max - min;
  for (let i = 0; i < values.length; i++) {
    values[i] = clamp01(((values[i] ?? 0) - min) / range);
  }
}

function applyToneCurve(
  values: Float32Array,
  gamma: number,
  contrast: number,
  brightness: number
): void {
  const safeGamma = Math.max(0.1, gamma);
  for (let i = 0; i < values.length; i++) {
    let value = values[i] ?? 0;
    value = Math.pow(value, 1 / safeGamma);
    value = (value - 0.5) * contrast + 0.5 + brightness;
    values[i] = clamp01(value);
  }
}

function applyEdgeBoost(values: Float32Array, width: number, height: number, weight: number): void {
  if (weight <= 0) return;
  const source = new Float32Array(values);
  const strength = Math.min(1, Math.max(0, weight));

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = y * width + x;
      const left = source[index - 1] ?? 0;
      const right = source[index + 1] ?? 0;
      const up = source[index - width] ?? 0;
      const down = source[index + width] ?? 0;
      const gradient = Math.min(1, (Math.abs(right - left) + Math.abs(down - up)) * 0.8);
      values[index] = clamp01((values[index] ?? 0) - gradient * strength * 0.6);
    }
  }
}

function applyFloydSteinberg(
  values: Float32Array,
  width: number,
  height: number,
  levels: number
): void {
  if (levels < 2) return;
  const copy = new Float32Array(values);
  const levelFactor = levels - 1;

  const diffuse = (index: number, error: number, factor: number): void => {
    copy[index] = clamp01((copy[index] ?? 0) + error * factor);
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const oldValue = copy[index] ?? 0;
      const quantized = Math.round(oldValue * levelFactor) / levelFactor;
      copy[index] = quantized;
      const error = oldValue - quantized;

      if (x + 1 < width) diffuse(index + 1, error, 7 / 16);
      if (x - 1 >= 0 && y + 1 < height) diffuse(index + width - 1, error, 3 / 16);
      if (y + 1 < height) diffuse(index + width, error, 5 / 16);
      if (x + 1 < width && y + 1 < height) diffuse(index + width + 1, error, 1 / 16);
    }
  }

  values.set(copy);
}

export async function convertImageToAscii(
  source: Blob,
  options: AsciiOptions
): Promise<AsciiRenderResult> {
  const imageData = await blobToImageData(source);
  const sourceWidth = imageData.width;
  const sourceHeight = imageData.height;

  if (sourceWidth === 0 || sourceHeight === 0) {
    throw new Error('Image has invalid dimensions');
  }

  const [outputWidth, outputHeight] = computeOutputDimensions(
    sourceWidth,
    sourceHeight,
    options.width,
    options.fontAspect
  );

  const canvas = new OffscreenCanvas(outputWidth, outputHeight);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('Failed to create 2D context');
  }

  const sourceCanvas = new OffscreenCanvas(sourceWidth, sourceHeight);
  const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!sourceContext) {
    throw new Error('Failed to create source context');
  }

  sourceContext.putImageData(imageData, 0, 0);
  context.drawImage(sourceCanvas, 0, 0, outputWidth, outputHeight);
  const sampled = context.getImageData(0, 0, outputWidth, outputHeight).data;

  const luminanceValues = new Float32Array(outputWidth * outputHeight);
  for (let i = 0; i < luminanceValues.length; i++) {
    const offset = i * 4;
    const r = sampled[offset] ?? 0;
    const g = sampled[offset + 1] ?? 0;
    const b = sampled[offset + 2] ?? 0;
    luminanceValues[i] = pixelLuminance(r, g, b);
  }

  if (options.autoContrast) {
    autoStretchContrast(luminanceValues);
  }

  applyToneCurve(luminanceValues, options.gamma, options.contrast, options.brightness);
  applyEdgeBoost(luminanceValues, outputWidth, outputHeight, options.edgeWeight);

  if (options.useDithering) {
    applyFloydSteinberg(luminanceValues, outputWidth, outputHeight, options.charset.length);
  }

  const rows: string[] = [];
  for (let y = 0; y < outputHeight; y++) {
    let row = '';
    for (let x = 0; x < outputWidth; x++) {
      const luminance = luminanceValues[y * outputWidth + x] ?? 0;
      row += mapLuminanceToChar(luminance, options.charset, options.invert);
    }
    rows.push(row);
  }

  sourceCanvas.width = 0;
  sourceCanvas.height = 0;
  canvas.width = 0;
  canvas.height = 0;

  return {
    text: rows.join('\n'),
    sourceWidth,
    sourceHeight,
    outputWidth,
    outputHeight,
  };
}
