export type ToolMode =
  | 'pan'
  | 'select'
  | 'freehand'
  | 'line'
  | 'rect'
  | 'ellipse'
  | 'triangle'
  | 'diamond'
  | 'hexagon'
  | 'arrow'
  | 'double-arrow'
  | 'speech-bubble'
  | 'checkmark'
  | 'text'
  | 'image';
export type DrawMode = Exclude<ToolMode, 'pan' | 'select'>;

export type BrushStyle = 'normal' | 'shaky';

export type Point = {
  x: number;
  y: number;
};

type BaseElement = {
  id: string;
  color: string;
  fillColor?: string;
  width: number;
  rotation?: number;
  brushStyle?: BrushStyle;
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
};

export type EllipseElement = BaseElement & {
  type: 'ellipse';
  start: Point;
  end: Point;
};

export type TriangleElement = BaseElement & {
  type: 'triangle';
  start: Point;
  end: Point;
};

export type ArrowElement = BaseElement & {
  type: 'arrow';
  start: Point;
  end: Point;
};

export type DoubleArrowElement = BaseElement & {
  type: 'double-arrow';
  start: Point;
  end: Point;
};

export type DiamondElement = BaseElement & {
  type: 'diamond';
  start: Point;
  end: Point;
};

export type HexagonElement = BaseElement & {
  type: 'hexagon';
  start: Point;
  end: Point;
};

export type SpeechBubbleElement = BaseElement & {
  type: 'speech-bubble';
  start: Point;
  end: Point;
};

export type CheckmarkElement = BaseElement & {
  type: 'checkmark';
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
  originalWidth?: number;
  originalHeight?: number;
};

export type GroupElement = BaseElement & {
  type: 'group';
  elements: SketchElement[];
};

export type SketchElement =
  | FreehandElement
  | LineElement
  | RectElement
  | EllipseElement
  | TriangleElement
  | DiamondElement
  | HexagonElement
  | ArrowElement
  | DoubleArrowElement
  | SpeechBubbleElement
  | CheckmarkElement
  | TextElement
  | ImageElement
  | GroupElement;

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
  readonly fillColor: string | null;
  readonly brushStyle: BrushStyle;
  readonly viewport: ViewportState;
};
