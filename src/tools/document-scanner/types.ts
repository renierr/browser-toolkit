import type { Point } from './utils/perspective';

export const FILTER_OPTIONS = ['none', 'grayscale', 'b&w', 'clean'] as const;
export type FilterType = (typeof FILTER_OPTIONS)[number];

export interface ScannedPage {
  id: string;
  originalImage: HTMLImageElement;
  processedCanvas: HTMLCanvasElement;
  /** Cached warp result — invalidated when corners change */
  warpedCanvas: HTMLCanvasElement | null;
  /** Cached thumbnail data URL for the page list */
  thumbnailUrl: string | null;
  corners: Point[];
  filter: FilterType;
}
