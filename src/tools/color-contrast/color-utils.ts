// Color conversion utilities
export function hexToRgb(hex: string): RGB | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {
    // Try 3-digit hex
    const shortResult = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(hex);
    if (shortResult) {
      return {
        r: parseInt(shortResult[1] + shortResult[1], 16),
        g: parseInt(shortResult[2] + shortResult[2], 16),
        b: parseInt(shortResult[3] + shortResult[3], 16),
      };
    }
    return null;
  }
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((x) => {
        const hex = Math.round(Math.max(0, Math.min(255, x))).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      })
      .join('')
      .toUpperCase()
  );
}

// WCAG relative luminance calculation
export function getLuminance(rgb: RGB): number {
  const [rs, gs, bs] = [rgb.r, rgb.g, rgb.b].map((c) => {
    const sRGB = c / 255;
    return sRGB <= 0.03928 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

// WCAG contrast ratio calculation
export function getContrastRatio(color1: RGB, color2: RGB): number {
  const l1 = getLuminance(color1);
  const l2 = getLuminance(color2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// Check WCAG compliance
export function checkWCAG(ratio: number) {
  return {
    aaLarge: ratio >= 3, // AA for large text (18pt+ or 14pt bold)
    aaNormal: ratio >= 4.5, // AA for normal text
    aaaLarge: ratio >= 4.5, // AAA for large text
    aaaNormal: ratio >= 7, // AAA for normal text
  };
}

// Validate and normalize hex color
export function normalizeHex(input: string): string | null {
  let hex = input.trim().toUpperCase();
  if (!hex.startsWith('#')) hex = '#' + hex;

  if (/^#[0-9A-F]{6}$/.test(hex)) return hex;
  if (/^#[0-9A-F]{3}$/.test(hex)) {
    // Expand 3-digit hex
    return '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }
  return null;
}

// Types
export interface RGB {
  r: number;
  g: number;
  b: number;
}

export function suggestBetterColors(fg: RGB, bg: RGB, targetRatio: number = 4.5): string[] {
  const suggestions: string[] = [];
  const bgLuminance = getLuminance(bg);

  // Try adjusting foreground color
  // Make it darker or lighter depending on background
  const needsDarker = bgLuminance > 0.5;

  for (let step = 1; step <= 10; step++) {
    const factor = needsDarker ? 1 - step * 0.1 : step * 0.1;
    let newR, newG, newB;

    if (needsDarker) {
      // Make darker
      newR = Math.round(fg.r * factor);
      newG = Math.round(fg.g * factor);
      newB = Math.round(fg.b * factor);
    } else {
      // Make lighter
      newR = Math.round(fg.r + (255 - fg.r) * factor);
      newG = Math.round(fg.g + (255 - fg.g) * factor);
      newB = Math.round(fg.b + (255 - fg.b) * factor);
    }

    const newColor = { r: newR, g: newG, b: newB };
    const ratio = getContrastRatio(newColor, bg);

    if (ratio >= targetRatio) {
      const hex = rgbToHex(newR, newG, newB);
      if (!suggestions.includes(hex)) {
        suggestions.push(hex);
        if (suggestions.length >= 3) break;
      }
    }
  }

  // Also try pure black or white if nothing found
  if (suggestions.length === 0) {
    const blackRatio = getContrastRatio({ r: 0, g: 0, b: 0 }, bg);
    const whiteRatio = getContrastRatio({ r: 255, g: 255, b: 255 }, bg);

    if (blackRatio >= targetRatio) suggestions.push('#000000');
    if (whiteRatio >= targetRatio) suggestions.push('#FFFFFF');
  }

  return suggestions;
}

// Extract dominant colors from image
export function extractColorsFromImage(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  numColors: number = 8
): string[] {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  const colorCounts = new Map<string, number>();

  // Sample every nth pixel for performance
  const sampleRate = Math.max(1, Math.floor(pixels.length / 4 / 10000));

  for (let i = 0; i < pixels.length; i += 4 * sampleRate) {
    const r = Math.round(pixels[i] / 32) * 32;
    const g = Math.round(pixels[i + 1] / 32) * 32;
    const b = Math.round(pixels[i + 2] / 32) * 32;
    const hex = rgbToHex(r, g, b);
    colorCounts.set(hex, (colorCounts.get(hex) || 0) + 1);
  }

  // Sort by frequency and return top colors
  return Array.from(colorCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, numColors)
    .map(([color]) => color);
}
