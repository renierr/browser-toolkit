import { codeToHtml, bundledThemes, bundledLanguages } from 'shiki';
import type { SupportedFormat } from './formatters';
import { getShikiLanguage } from './formatters';

export type ExportTheme = keyof typeof bundledThemes;

export interface ExportOptions {
  theme: ExportTheme;
  fontSize: number;
  padding: number;
}

/**
 * Simple canvas-based code rendering
 */
export async function renderCodeToCanvasSimple(
  code: string,
  format: SupportedFormat,
  options: ExportOptions
): Promise<HTMLCanvasElement> {
  const { theme, fontSize, padding } = options;
  const lang = getShikiLanguage(format);

  // Get theme colors
  const themeColors = await getThemeColors(theme);

  // Parse tokens with Shiki
  const { codeToTokens } = await import('shiki');
  const { tokens } = await codeToTokens(code, {
    lang: lang as keyof typeof bundledLanguages,
    theme: theme,
  });

  // Measure text dimensions
  const lines = code.split('\n');
  const lineHeight = fontSize * 1.5;

  // Create temporary canvas for measuring
  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d')!;
  measureCtx.font = `${fontSize}px Consolas, 'Liberation Mono', Menlo, monospace`;

  let maxWidth = 0;
  for (const line of lines) {
    const width = measureCtx.measureText(line).width;
    if (width > maxWidth) maxWidth = width;
  }

  const width = Math.ceil(maxWidth + padding * 2);
  const height = Math.ceil(lines.length * lineHeight + padding * 2);

  // Create final canvas
  const canvas = document.createElement('canvas');
  // Use a fixed high DPI for better quality, but cap it for very large images to avoid browser limits
  // Max canvas area is usually around 268,435,456 pixels (16384 x 16384)
  // Let's be safe and limit the scaling if the image is huge
  let dpr = 2;
  if (width * height * dpr * dpr > 16000000) {
    // If > 16MP (e.g. 4000x4000)
    dpr = 1;
  }

  canvas.width = width * dpr;
  canvas.height = height * dpr;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  // Fill background
  ctx.fillStyle = themeColors.bg;
  roundRect(ctx, 0, 0, width, height, 8);
  ctx.fill();

  // Draw tokens
  ctx.font = `${fontSize}px Consolas, 'Liberation Mono', Menlo, monospace`;
  ctx.textBaseline = 'top';

  let y = padding;
  for (const lineTokens of tokens) {
    let x = padding;
    for (const token of lineTokens) {
      ctx.fillStyle = token.color || themeColors.fg;
      ctx.fillText(token.content, x, y + fontSize * 0.15);
      x += measureCtx.measureText(token.content).width;
    }
    y += lineHeight;
  }

  return canvas;
}

/**
 * Get theme colors for background and foreground
 */
async function getThemeColors(theme: ExportTheme): Promise<{ bg: string; fg: string }> {
  // Default colors for common themes
  const themeDefaults: Record<string, { bg: string; fg: string }> = {
    'github-dark': { bg: '#0d1117', fg: '#c9d1d9' },
    'github-light': { bg: '#ffffff', fg: '#24292f' },
    dracula: { bg: '#282a36', fg: '#f8f8f2' },
    nord: { bg: '#2e3440', fg: '#d8dee9' },
    'one-dark-pro': { bg: '#282c34', fg: '#abb2bf' },
    'vitesse-dark': { bg: '#121212', fg: '#dbd7ca' },
    'vitesse-light': { bg: '#ffffff', fg: '#393a34' },
    'min-dark': { bg: '#1f1f1f', fg: '#b8b8b8' },
    'min-light': { bg: '#ffffff', fg: '#1f1f1f' },
  };

  return themeDefaults[theme] || { bg: '#1e1e1e', fg: '#d4d4d4' };
}

/**
 * Helper function to draw rounded rectangle
 */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Generate highlighted HTML for preview
 */
export async function generateHighlightedHtml(
  code: string,
  format: SupportedFormat,
  theme: ExportTheme
): Promise<string> {
  const lang = getShikiLanguage(format);

  try {
    return await codeToHtml(code, {
      lang: lang as keyof typeof bundledLanguages,
      theme: theme,
    });
  } catch (e) {
    // Fallback to plain text
    const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<pre style="background: #1e1e1e; color: #d4d4d4; padding: 1em; border-radius: 8px;"><code>${escaped}</code></pre>`;
  }
}
