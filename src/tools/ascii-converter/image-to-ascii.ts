import { blobToImageData } from '@js/image-utils.ts';
import { mapLuminanceToChar } from './ascii-mapper.ts';
import type { AsciiOptions, AsciiRenderResult } from './types.ts';

const FONT_ASPECT_RATIO = 0.5;

function computeOutputDimensions(
  width: number,
  height: number,
  targetWidth: number
): [number, number] {
  const safeWidth = Math.max(1, Math.floor(targetWidth));
  const scaledHeight = Math.max(1, Math.floor((height / width) * safeWidth * FONT_ASPECT_RATIO));
  return [safeWidth, scaledHeight];
}

function pixelLuminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
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
    options.width
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

  const rows: string[] = [];
  for (let y = 0; y < outputHeight; y++) {
    let row = '';
    for (let x = 0; x < outputWidth; x++) {
      const offset = (y * outputWidth + x) * 4;
      const r = sampled[offset] ?? 0;
      const g = sampled[offset + 1] ?? 0;
      const b = sampled[offset + 2] ?? 0;
      const luminance = pixelLuminance(r, g, b);
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
