import type { Point } from './utils/perspective';

export const FILTER_OPTIONS = ['none', 'grayscale', 'b&w', 'clean'] as const;
export type FilterType = (typeof FILTER_OPTIONS)[number];

export interface ScannedPage {
  id: string;
  /** Original image stored as a Blob to avoid holding decoded bitmaps for all pages. */
  originalBlob: Blob;
  originalWidth: number;
  originalHeight: number;
  /** Lazily decoded image — populated on demand, released when not the active page. */
  originalImage: HTMLImageElement | null;
  processedCanvas: HTMLCanvasElement;
  /** Cached warp result — invalidated when corners change */
  warpedCanvas: HTMLCanvasElement | null;
  /** Cached thumbnail data URL for the page list */
  thumbnailUrl: string | null;
  corners: Point[];
  filter: FilterType;
  /** Rotation angle in degrees (0, 90, 180, 270) applied during enhance mode */
  rotation: number;
}
