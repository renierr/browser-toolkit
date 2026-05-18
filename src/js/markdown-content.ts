import { createMarkdownRenderer } from '@js/markdown-renderer';
import { getSettings } from '@js/settings';

const markdownRenderer = createMarkdownRenderer();
const MARKDOWN_VIEWER_CONTEXT = 'markdown-viewer';
const DEFAULT_CONTENT_THEME = 'default';

export function renderMarkdownContent(content: string): string {
  return markdownRenderer.render(content);
}

export function getMarkdownContentTheme(): string {
  const themeSelect = document.querySelector('[data-setting="content-theme"]') as
    | HTMLSelectElement
    | undefined;
  if (themeSelect?.value) {
    return themeSelect.value;
  }

  const settings = getSettings(MARKDOWN_VIEWER_CONTEXT);
  return settings.get<string>('content-theme', DEFAULT_CONTENT_THEME);
}

export function applyMarkdownContentTheme(element: HTMLElement, theme?: string): void {
  const nextTheme = theme || getMarkdownContentTheme() || DEFAULT_CONTENT_THEME;
  element.dataset.contentTheme = nextTheme;
}

export function buildMarkdownPdfHtml(renderedHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: system-ui, sans-serif; padding: 24px; line-height: 1.6; color: #000; background: #fff; }
    h1,h2,h3,h4 { font-weight: bold; margin: 0.6em 0 0.3em; }
    h1 { font-size: 1.6em; } h2 { font-size: 1.3em; } h3 { font-size: 1.1em; }
    ul,ol { padding-left: 1.5em; }
    blockquote { border-left: 4px solid #ccc; margin: 0.5em 0; padding-left: 1em; color: #555; }
    code { background: #f0f0f0; padding: 0.1em 0.3em; border-radius: 0.2em; font-size: 0.9em; }
    pre code { display: block; padding: 1em; white-space: pre-wrap; word-break: break-all; }
    table { border-collapse: collapse; width: 100%; font-size: 0.85em; }
    th,td { border: 1px solid #ccc; padding: 0.3em 0.6em; word-break: break-word; overflow-wrap: break-word; }
    th { background: #f0f0f0; }
    a { color: #0000ee; }
    img { display: block; max-width: 100%; page-break-inside: avoid; break-inside: avoid; }
  </style>
</head>
<body>${renderedHtml}</body>
</html>`;
}
