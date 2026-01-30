export interface Point {
  x: number;
  y: number;
  timestamp: number;
  pressure: number;
}

export interface SignatureData {
  id: string;
  image: string; // Base64 PNG (preview)
  width: number; // Logical width (1x scale)
  height: number; // Logical height (1x scale)
  timestamp: number;
  settings: SignatureSettings;
  rawPaths: Point[][]; // Normalized paths (relative to 0,0)
}
export type CurveMode = 'fast' | 'natural' | 'draft' | 'none';
export type RDPMode = 'none' | 'low' | 'medium' | 'high';

export interface SignatureSettings {
  penColor: string;
  penWidth: number;
  curveMode: CurveMode;
  rdpMode: RDPMode;
  dpi: number;
  moveTolerance: number;
  minWidthFactor: number;
  maxWidthFactor: number;
  velocitySensitivity: number;
  pressureInfluence: number;
  velocityInfluence: number;
  widthSmoothing: number;
}

export type Cmd =
  | { type: 'addPath'; path: Point[] }
  | { type: 'clear'; prev: Point[][] }
  | { type: 'replace'; prev: Point[][]; next: Point[][] };
