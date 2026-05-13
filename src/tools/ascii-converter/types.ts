export type AsciiPresetId =
  | 'photo-soft'
  | 'photo-detailed'
  | 'terminal-classic'
  | 'binary-bold'
  | 'blueprint'
  | 'outline'
  | 'minimal'
  | 'dots';

export type AsciiPresetConfig = {
  id: AsciiPresetId;
  label: string;
  charset: string;
  gamma: number;
  contrast: number;
  brightness: number;
  edgeWeight: number;
  fontAspect: number;
  useDithering: boolean;
  autoContrast: boolean;
};

export type AsciiOptions = {
  width: number;
  charset: string;
  invert: boolean;
  gamma: number;
  contrast: number;
  brightness: number;
  edgeWeight: number;
  fontAspect: number;
  useDithering: boolean;
  autoContrast: boolean;
};

export type AsciiRenderResult = {
  text: string;
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
};
