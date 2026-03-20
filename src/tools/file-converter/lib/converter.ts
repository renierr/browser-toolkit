import { convertInput } from './pandoc-wasm';

type ConvertResult = { data: Uint8Array; name: string; mime?: string };

const TARGET_FORMATS: Record<string, { ext: string; mime?: string }> = {
  markdown: { ext: 'md', mime: 'text/markdown' },
  html: { ext: 'html', mime: 'text/html' },
  docx: {
    ext: 'docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  epub: { ext: 'epub', mime: 'application/epub+zip' },
  plaintext: { ext: 'txt', mime: 'text/plain' },
  latex: { ext: 'tex', mime: 'application/x-latex' },
  rst: { ext: 'rst', mime: 'text/x-rst' },
  odt: { ext: 'odt', mime: 'application/vnd.oasis.opendocument.text' },
};

export function detectInputFormat(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.html') || lower.endsWith('.htm') || lower.endsWith('.xhtml')) return 'html';
  if (
    lower.endsWith('.md') ||
    lower.endsWith('.markdown') ||
    lower.endsWith('.mdown') ||
    lower.endsWith('.mkd') ||
    lower.endsWith('.mkdn')
  )
    return 'markdown';
  if (lower.endsWith('.docx')) return 'docx';
  if (lower.endsWith('.epub')) return 'epub';
  if (lower.endsWith('.tex') || lower.endsWith('.latex')) return 'latex';
  if (lower.endsWith('.rst')) return 'rst';
  if (lower.endsWith('.odt')) return 'odt';
  if (lower.endsWith('.txt') || lower.endsWith('.text')) return 'plaintext';
  if (lower.endsWith('.rtf')) return 'rtf';
  if (lower.endsWith('.xml')) return 'xml';
  if (lower.endsWith('.doc')) return 'docx';
  return 'markdown';
}

export async function convertBuffer(
  input: Uint8Array,
  originalName: string,
  target: string,
  onProgress?: (progress: number) => void
): Promise<ConvertResult> {
  const targetInfo = TARGET_FORMATS[target] || { ext: target, mime: 'application/octet-stream' };
  const base = originalName.replace(/\.[^/.]+$/, '') || 'output';
  const outName = `${base}.${targetInfo.ext}`;
  const from = detectInputFormat(originalName);
  const to =
    targetInfo.ext === 'md' ? 'markdown' : targetInfo.ext === 'txt' ? 'plaintext' : targetInfo.ext;

  onProgress?.(5);
  const result = await convertInput({ from, to }, input, originalName);
  onProgress?.(90);

  const output =
    result.output.length > 0
      ? result.output
      : result.stdout.length > 0
        ? new TextEncoder().encode(result.stdout)
        : new Uint8Array();

  if (output.length === 0) {
    throw new Error('pandoc-wasm did not return an output');
  }

  onProgress?.(100);
  return { data: output, name: outName, mime: targetInfo.mime };
}
