export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type ToolType = 'pixelate' | 'blur' | 'fill' | 'crop' | 'move';
export type HandleType = 'tl' | 'tr' | 'bl' | 'br' | 'move' | null;

export interface AppState {
  originalImage: HTMLImageElement | null;
  activeTool: ToolType;
  isDragging: boolean;
  cropRect: Rect;
  dragStartMouse: Point;
  dragStartRect: Rect;
  draggedHandle: HandleType;
}
