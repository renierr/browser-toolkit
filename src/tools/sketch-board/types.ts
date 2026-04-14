export type ToolMode =
  | 'pan'
  | 'select'
  | 'freehand'
  | 'line'
  | 'rect'
  | 'rect-filled'
  | 'ellipse'
  | 'ellipse-filled'
  | 'text';
export type DrawMode = Exclude<ToolMode, 'pan' | 'select'>;

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

export type TextElement = BaseElement & {
  type: 'text';
  position: Point;
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
};

export type SketchElement =
  | FreehandElement
  | LineElement
  | RectElement
  | EllipseElement
  | TextElement;

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

export type SketchState = {
  elements: SketchElement[];
  viewport: ViewportState;
  mode: ToolMode;
  hasUnsavedChanges: boolean;
};

export type DrawToolContext = {
  readonly color: string;
  readonly strokeWidth: number;
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly fontWeight: 'normal' | 'bold';
  readonly fontStyle: 'normal' | 'italic';
  readonly viewport: ViewportState;
};
