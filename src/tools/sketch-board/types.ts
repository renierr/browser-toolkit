export type ToolMode =
  | 'pan'
  | 'freehand'
  | 'line'
  | 'rect'
  | 'rect-filled'
  | 'ellipse'
  | 'ellipse-filled';
export type DrawMode = Exclude<ToolMode, 'pan'>;

export type Point = {
  x: number;
  y: number;
};

type BaseElement = {
  id: string;
  color: string;
  width: number;
};

export type FreehandElement = BaseElement & {
  type: 'freehand';
  points: Point[];
};

export type LineElement = BaseElement & {
  type: 'line';
  start: Point;
  end: Point;
};

export type RectElement = BaseElement & {
  type: 'rect';
  start: Point;
  end: Point;
  filled?: boolean;
};

export type EllipseElement = BaseElement & {
  type: 'ellipse';
  start: Point;
  end: Point;
  filled?: boolean;
};

export type SketchElement = FreehandElement | LineElement | RectElement | EllipseElement;

export type ViewportState = {
  x: number;
  y: number;
  scale: number;
};

export type DrawingMeta = {
  elementCount: number;
  colors: string[];
  lastTool: ToolMode;
};

export type DrawingRecord = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  viewport: ViewportState;
  elements: SketchElement[];
  thumbnailDataUrl: string;
  meta: DrawingMeta;
};
