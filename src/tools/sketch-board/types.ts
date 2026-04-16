export type ToolMode =
  | 'pan'
  | 'select'
  | 'freehand'
  | 'line'
  | 'rect'
  | 'ellipse'
  | 'triangle'
  | 'arrow'
  | 'text'
  | 'image';
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

export type TriangleElement = BaseElement & {
  type: 'triangle';
  start: Point;
  end: Point;
  filled?: boolean;
};

export type ArrowElement = BaseElement & {
  type: 'arrow';
  start: Point;
  end: Point;
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

export type ImageElement = BaseElement & {
  type: 'image';
  position: Point;
  imageWidth: number;
  imageHeight: number;
  imageData: string;
};

export type SketchElement =
  | FreehandElement
  | LineElement
  | RectElement
  | EllipseElement
  | TriangleElement
  | ArrowElement
  | TextElement
  | ImageElement;

export type ViewportState = {
  x: number;
  y: number;
  scale: number;
};

export type DrawingMeta = {
  elementCount: number;
  colors: string[];
  lastTool: ToolMode;
  background?: string;
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

export type DrawToolContext = {
  readonly color: string;
  readonly strokeWidth: number;
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly fontWeight: 'normal' | 'bold';
  readonly fontStyle: 'normal' | 'italic';
  readonly filled: boolean;
  readonly viewport: ViewportState;
};
