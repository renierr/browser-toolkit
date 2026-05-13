import type { AsciiPresetConfig, AsciiPresetId } from './types.ts';

export const ASCII_PRESETS: Record<AsciiPresetId, AsciiPresetConfig> = {
  'photo-soft': {
    id: 'photo-soft',
    label: 'Photo Soft',
    charset: '@%#*+=-:. ',
    gamma: 1,
    contrast: 1.1,
    brightness: 0,
    edgeWeight: 0,
    fontAspect: 0.52,
    useDithering: false,
    autoContrast: true,
  },
  'photo-detailed': {
    id: 'photo-detailed',
    label: 'Photo Detailed',
    charset: '$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,"^`\'. ',
    gamma: 0.95,
    contrast: 1.2,
    brightness: 0,
    edgeWeight: 0.1,
    fontAspect: 0.5,
    useDithering: true,
    autoContrast: true,
  },
  'terminal-classic': {
    id: 'terminal-classic',
    label: 'Terminal Classic',
    charset: '@#*+=-:. ',
    gamma: 1,
    contrast: 1,
    brightness: 0,
    edgeWeight: 0,
    fontAspect: 0.5,
    useDithering: false,
    autoContrast: false,
  },
  'binary-bold': {
    id: 'binary-bold',
    label: 'Binary Bold',
    charset: '# ',
    gamma: 1,
    contrast: 1.35,
    brightness: 0,
    edgeWeight: 0.2,
    fontAspect: 0.5,
    useDithering: true,
    autoContrast: true,
  },
  blueprint: {
    id: 'blueprint',
    label: 'Blueprint',
    charset: 'MWNXK0Okxdolc:;,. ',
    gamma: 1.05,
    contrast: 1.15,
    brightness: 0,
    edgeWeight: 0.15,
    fontAspect: 0.5,
    useDithering: false,
    autoContrast: true,
  },
  outline: {
    id: 'outline',
    label: 'Outline',
    charset: '@#S%?*+;:,. ',
    gamma: 1,
    contrast: 1.3,
    brightness: 0,
    edgeWeight: 0.35,
    fontAspect: 0.5,
    useDithering: false,
    autoContrast: true,
  },
  minimal: {
    id: 'minimal',
    label: 'Minimal',
    charset: '@#:. ',
    gamma: 1,
    contrast: 1.15,
    brightness: 0,
    edgeWeight: 0,
    fontAspect: 0.53,
    useDithering: false,
    autoContrast: true,
  },
  dots: {
    id: 'dots',
    label: 'Dots',
    charset: '#*:. ',
    gamma: 1.05,
    contrast: 1,
    brightness: 0,
    edgeWeight: 0,
    fontAspect: 0.56,
    useDithering: false,
    autoContrast: false,
  },
};

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function mapLuminanceToChar(luminance: number, charset: string, invert: boolean): string {
  const safeCharset = charset.length > 0 ? charset : ASCII_PRESETS['terminal-classic'].charset;
  const normalized = clamp01(luminance);
  const position = invert ? normalized : 1 - normalized;
  const index = Math.min(safeCharset.length - 1, Math.floor(position * (safeCharset.length - 1)));
  return safeCharset[index] ?? ' ';
}

export function resolveCharset(custom: string, fallback: string): string {
  const trimmed = custom.trim();
  if (trimmed.length >= 2) return trimmed;
  return fallback;
}
