import type { DrawMode, DrawParams, DrawToolContext, Point, SketchElement } from '../types.ts';

/** Option groups a tool can declare for the toolbar */
export type ToolOptionId =
  | 'color'
  | 'fill'
  | 'font'
  | 'image'
  | 'group'
  | 'ungroup'
  | 'rotation'
  | 'brush'
  | 'width';

/** Contract for draw tool implementations. Each shape tool implements this. */
export type DrawTool<T extends SketchElement = SketchElement> = {
  readonly mode: DrawMode;
  /** Which toolbar option groups this tool needs visible */
  readonly toolOptions: ReadonlySet<ToolOptionId>;
  onPointerDown(point: Point, ctx: DrawToolContext): void;
  onPointerMove(point: Point, ctx: DrawToolContext): void;
  onPointerUp(point: Point, ctx: DrawToolContext): SketchElement | null;
  draw(params: DrawParams<T>): void;
  drawPreview(canvasCtx: CanvasRenderingContext2D, ctx: DrawToolContext): void;
  drawSegment?(canvasCtx: CanvasRenderingContext2D, ctx: DrawToolContext): void;
  reset(): void;
  readonly streamsLive: boolean;
};

/** Derive tool options from an element type (for select-mode toolbar) */
export function optionsForElementType(type: string): ReadonlySet<ToolOptionId> {
  switch (type) {
    case 'text':
      return new Set(['color', 'font']);
    case 'image':
      return new Set(['image']);
    case 'rect':
    case 'ellipse':
    case 'triangle':
    case 'diamond':
    case 'hexagon':
    case 'speech-bubble':
    case 'group':
      return new Set(['color', 'fill', 'brush', 'width']);
    case 'line':
    case 'arrow':
    case 'double-arrow':
    case 'checkmark':
    case 'freehand':
      return new Set(['color', 'brush', 'width']);
    default:
      return new Set(['color']);
  }
}
