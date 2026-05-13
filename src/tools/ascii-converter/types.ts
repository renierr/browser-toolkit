export type AsciiPreset = 'dense' | 'classic' | 'binary';

export type AsciiOptions = {
  width: number;
  charset: string;
  invert: boolean;
};

export type AsciiRenderResult = {
  text: string;
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
};
