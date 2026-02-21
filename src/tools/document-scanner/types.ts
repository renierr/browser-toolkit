import type { Point } from './utils/perspective';

export interface ScannedPage {
  id: string;
  originalImage: HTMLImageElement;
  processedCanvas: HTMLCanvasElement;
  corners: Point[];
  filter: 'none' | 'grayscale' | 'b&w' | 'clean';
}
