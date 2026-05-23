import { convertInput } from './pandoc-wasm';
import { htmlToPdfBuffer } from '@js/mupdf-utils.ts';
import JSZip from 'jszip';

type ConvertResult = { data: Uint8Array; name: string; mime?: string };

const MD_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  ico: 'image/x-icon',
};

function uint8ToBase64(bytes: Uint8Array): string {
  const chunk = 8192;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunk) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + chunk)));
  }
  return btoa(parts.join(''));
}

async function buildDataUriMap(
  mediaZip?: Uint8Array,
  mediaFiles?: Map<string, Uint8Array>
): Promise<Map<string, string>> {
  const dataUris = new Map<string, string>();
  const tasks: Promise<void>[] = [];

  if (mediaZip && mediaZip.length > 0) {
    const zip = await JSZip.loadAsync(mediaZip);
    zip.forEach((path, entry) => {
      if (entry.dir) return;
      tasks.push(
        entry.async('uint8array').then((data) => {
          const ext = path.split('.').pop()?.toLowerCase() || '';
          const mime = MD_MIME[ext] || 'application/octet-stream';
          dataUris.set(path, `data:${mime};base64,${uint8ToBase64(data)}`);
        })
      );
    });
  }

  if (mediaFiles) {
    for (const [name, data] of mediaFiles) {
      if (data.length === 0) continue;
      const ext = name.split('.').pop()?.toLowerCase() || '';
      const mime = MD_MIME[ext] || 'application/octet-stream';
      dataUris.set(name, `data:${mime};base64,${uint8ToBase64(data)}`);
    }
  }

  await Promise.all(tasks);
  return dataUris;
}

function replaceImageRefs(md: string, dataUris: Map<string, string>): string {
  if (dataUris.size === 0) return md;
  return md.replace(/!\[([^\]]*)\]\(([^)]+)\)(\{[^}]*\})?/g, (_match, alt, path, _attrs) => {
    const uri =
      dataUris.get(path) ||
      dataUris.get(path.replace(/^\.\//, '')) ||
      dataUris.get(path.replace(/^(?:\.\/)?media\//, ''));
    return uri ? `![${alt}](${uri})` : _match;
  });
}

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
      const pdfData = await htmlToPdfBuffer(
        `<style>img{display:block;page-break-inside:avoid;break-inside:avoid}</style>` + htmlText,
        { fontSize: 14 }
      );
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
    const pdfData = await htmlToPdfBuffer(
      `<style>img{display:block;page-break-inside:avoid;break-inside:avoid}</style>` + htmlText,
      { fontSize: 14 }
    );
    onProgress?.(100);

    return { data: pdfData, name: outName, mime: targetInfo.mime };
  }

  const to =
    targetInfo.ext === 'md' ? 'markdown' : targetInfo.ext === 'txt' ? 'plaintext' : targetInfo.ext;

  const hasEmbeddedResources = from !== 'html' && from !== 'markdown' && from !== 'plaintext';
  const needsExtractMedia = to === 'markdown' && hasEmbeddedResources;

  const convertOptions: Record<string, unknown> = { from, to };
  if (needsExtractMedia) {
    convertOptions['extract-media'] = 'media.zip';
  } else {
    convertOptions['embed-resources'] = true;
  }
  convertOptions['standalone'] = true;

  onProgress?.(5);
  const result = await convertInput(convertOptions, input, originalName);
  onProgress?.(90);

  let output =
    result.output.length > 0
      ? result.output
      : result.stdout.length > 0
        ? new TextEncoder().encode(result.stdout)
        : new Uint8Array();

  if (output.length === 0) {
    throw new Error('pandoc-wasm did not return an output');
  }

  if (needsExtractMedia && (result.mediaZip || result.media.size > 0)) {
    const dataUris = await buildDataUriMap(result.mediaZip, result.media);
    if (dataUris.size > 0) {
      const mdText = new TextDecoder().decode(output);
      output = new TextEncoder().encode(replaceImageRefs(mdText, dataUris));
    }
  }

  onProgress?.(100);
  return { data: output, name: outName, mime: targetInfo.mime };
}
