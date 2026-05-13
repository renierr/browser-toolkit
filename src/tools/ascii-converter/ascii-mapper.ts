export const ASCII_PRESETS = {
  dense: '@#S%?*+;:,. ',
  classic: '@#*+=-:. ',
  binary: '# .',
} as const;

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function mapLuminanceToChar(luminance: number, charset: string, invert: boolean): string {
  const safeCharset = charset.length > 0 ? charset : ASCII_PRESETS.classic;
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
