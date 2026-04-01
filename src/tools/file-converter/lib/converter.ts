import { convertInput } from './pandoc-wasm';
import { htmlToPdfBuffer } from '@js/mupdf-utils.ts';

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
  pdf: { ext: 'pdf', mime: 'application/pdf' },
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

  if (target === 'pdf') {
    if (from === 'html') {
      onProgress?.(10);
      const htmlText = new TextDecoder().decode(input);
      const pdfData = await htmlToPdfBuffer(htmlText, { fontSize: 14 });
      onProgress?.(100);
      return { data: pdfData, name: outName, mime: targetInfo.mime };
    }

    onProgress?.(5);
    const htmlConvertOptions: Record<string, unknown> = {
      from,
      to: 'html',
      'embed-resources': true,
      standalone: true,
    };
    const htmlResult = await convertInput(htmlConvertOptions, input, originalName);
    onProgress?.(50);

    const htmlOutput =
      htmlResult.output.length > 0
        ? htmlResult.output
        : htmlResult.stdout.length > 0
          ? new TextEncoder().encode(htmlResult.stdout)
          : new Uint8Array();

    if (htmlOutput.length === 0) {
      throw new Error('pandoc-wasm did not return an HTML output');
    }

    const htmlText = new TextDecoder().decode(htmlOutput);
    onProgress?.(70);
    const pdfData = await htmlToPdfBuffer(htmlText, { fontSize: 14 });
    onProgress?.(100);

    return { data: pdfData, name: outName, mime: targetInfo.mime };
  }

  const to =
    targetInfo.ext === 'md' ? 'markdown' : targetInfo.ext === 'txt' ? 'plaintext' : targetInfo.ext;

  const convertOptions: Record<string, unknown> = { from, to };
  convertOptions['embed-resources'] = true;
  convertOptions['standalone'] = true;

  onProgress?.(5);
  const result = await convertInput(convertOptions, input, originalName);
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
