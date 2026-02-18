/**
 * Export highlighted code as an image using Shiki for syntax highlighting
 */

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
 * Render code to a canvas element with syntax highlighting
 */
export async function renderCodeToCanvas(
  code: string,
  format: SupportedFormat,
  options: ExportOptions
): Promise<HTMLCanvasElement> {
  const { theme, fontSize, padding } = options;
  const lang = getShikiLanguage(format);

  // Generate highlighted HTML using Shiki
  const highlightedHtml = await codeToHtml(code, {
    lang: lang as keyof typeof bundledLanguages,
    theme: theme,
  });

  // Create a temporary container to render the HTML
  const container = document.createElement('div');
  container.innerHTML = highlightedHtml;
  container.style.cssText = `
    position: absolute;
    left: -9999px;
    top: -9999px;
    font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
    font-size: ${fontSize}px;
    line-height: 1.5;
    white-space: pre;
    padding: ${padding}px;
  `;

  // The pre element contains background color from theme
  const preElement = container.querySelector('pre');
  if (preElement) {
    preElement.style.margin = '0';
    preElement.style.padding = `${padding}px`;
    preElement.style.borderRadius = '8px';
    preElement.style.overflow = 'visible';
  }

  document.body.appendChild(container);

  // Measure the rendered size
  const rect = container.getBoundingClientRect();
  const width = Math.ceil(rect.width);
  const height = Math.ceil(rect.height);

  // Create canvas
  const canvas = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  // Get background color from the pre element
  const computedStyle = preElement ? window.getComputedStyle(preElement) : null;
  const bgColor = computedStyle?.backgroundColor || '#1e1e1e';

  // Fill background with rounded corners
  ctx.fillStyle = bgColor;
  roundRect(ctx, 0, 0, width, height, 8);
  ctx.fill();

  // Use html2canvas-like approach: render to SVG foreignObject
  const svgData = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml">
          ${container.innerHTML}
        </div>
      </foreignObject>
    </svg>
  `;

  // Clean up
  document.body.removeChild(container);

  // Convert SVG to image
  const img = new Image();
  const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = url;
  });

  ctx.drawImage(img, 0, 0, width, height);
  URL.revokeObjectURL(url);

  return canvas;
}

/**
 * Alternative approach: Use OffscreenCanvas with CSS rendering
 * This creates a styled code block and captures it
 */
export async function renderCodeToCanvasViaClone(
  code: string,
  format: SupportedFormat,
  options: ExportOptions
): Promise<HTMLCanvasElement> {
  const { theme, fontSize, padding } = options;
  const lang = getShikiLanguage(format);

  // Generate highlighted HTML
  const highlightedHtml = await codeToHtml(code, {
    lang: lang as keyof typeof bundledLanguages,
    theme: theme,
  });

  // Create iframe for isolated rendering
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position: fixed; left: -9999px; top: -9999px; width: 10000px; height: 10000px; border: none;';
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument!;
  iframeDoc.open();
  iframeDoc.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: transparent; }
        pre {
          font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
          font-size: ${fontSize}px;
          line-height: 1.5;
          padding: ${padding}px;
          border-radius: 8px;
          display: inline-block;
          margin: 0;
          white-space: pre;
        }
        code { font-family: inherit; }
      </style>
    </head>
    <body>
      <div id="container">${highlightedHtml}</div>
    </body>
    </html>
  `);
  iframeDoc.close();

  // Wait for fonts to load
  await new Promise(resolve => setTimeout(resolve, 100));

  const container = iframeDoc.getElementById('container')!;
  const pre = container.querySelector('pre');

  // Get dimensions
  const rect = container.getBoundingClientRect();
  const width = Math.ceil(rect.width);
  const height = Math.ceil(rect.height);

  // Get background color
  const bgColor = pre ? window.getComputedStyle(pre).backgroundColor : '#1e1e1e';

  // Create canvas
  const canvas = document.createElement('canvas');
  const dpr = 2; // Fixed high DPI for quality
  canvas.width = width * dpr;
  canvas.height = height * dpr;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  // Fill background
  ctx.fillStyle = bgColor;
  roundRect(ctx, 0, 0, width, height, 8);
  ctx.fill();

  // Render via SVG foreignObject
  const serializer = new XMLSerializer();
  const containerClone = container.cloneNode(true) as HTMLElement;

  // Inline all styles for the SVG
  const preClone = containerClone.querySelector('pre');
  if (preClone) {
    preClone.style.cssText = `
      font-family: 'Consolas', 'Liberation Mono', Menlo, monospace;
      font-size: ${fontSize}px;
      line-height: 1.5;
      padding: ${padding}px;
      border-radius: 8px;
      display: inline-block;
      margin: 0;
      white-space: pre;
      background: ${bgColor};
    `;
  }

  const svgData = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <foreignObject width="100%" height="100%">
        ${serializer.serializeToString(containerClone)}
      </foreignObject>
    </svg>
  `;

  document.body.removeChild(iframe);

  // Convert to image
  const img = new Image();
  const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load SVG image'));
    img.src = url;
  });

  ctx.drawImage(img, 0, 0, width, height);
  URL.revokeObjectURL(url);

  return canvas;
}

/**
 * Simple canvas-based code rendering (fallback)
 * This draws text directly without HTML rendering
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
  const dpr = 2;
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
    'dracula': { bg: '#282a36', fg: '#f8f8f2' },
    'nord': { bg: '#2e3440', fg: '#d8dee9' },
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
 * Export canvas to PNG file download
 */
export function downloadCanvasAsPng(canvas: HTMLCanvasElement, filename = 'code.png'): void {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

/**
 * Copy canvas to clipboard
 */
export async function copyCanvasToClipboard(canvas: HTMLCanvasElement): Promise<void> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error('Failed to create blob from canvas'));
        return;
      }
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        resolve();
      } catch (err) {
        reject(err);
      }
    }, 'image/png');
  });
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
    const escaped = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `<pre style="background: #1e1e1e; color: #d4d4d4; padding: 1em; border-radius: 8px;"><code>${escaped}</code></pre>`;
  }
}

