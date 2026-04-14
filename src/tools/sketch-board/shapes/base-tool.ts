import type { DrawMode, DrawToolContext, Point, SketchElement } from '../types.ts';

/** Contract for draw tool implementations. Each shape tool implements this. */
export type DrawTool = {
  readonly mode: DrawMode;
  onPointerDown(point: Point, ctx: DrawToolContext): void;
  onPointerMove(point: Point, ctx: DrawToolContext): void;
  onPointerUp(point: Point, ctx: DrawToolContext): SketchElement | null;
  drawPreview(canvasCtx: CanvasRenderingContext2D, ctx: DrawToolContext): void;
  drawSegment?(canvasCtx: CanvasRenderingContext2D, ctx: DrawToolContext): void;
  reset(): void;
  readonly streamsLive: boolean;
};
