import { showMessage } from '../../../js/ui';
import { convertInput } from './pandoc-wasm';

type ConvertResult = { data: Uint8Array; name: string; mime?: string };

function extFromTarget(target: string): { ext: string; mime?: string } {
  switch (target) {
    case 'markdown':
      return { ext: 'md', mime: 'text/markdown' };
    case 'html':
      return { ext: 'html', mime: 'text/html' };
    case 'docx':
      return {
        ext: 'docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      };
    case 'epub':
      return { ext: 'epub', mime: 'application/epub+zip' };
    default:
      return { ext: target, mime: 'application/octet-stream' };
  }
}

export async function convertBuffer(
  input: Uint8Array,
  originalName: string,
  target: string,
  onProgress?: (progress: number) => void
): Promise<ConvertResult> {
  const targetInfo = extFromTarget(target);
  const base = originalName.replace(/\.[^/.]+$/, '') || 'output';
  const outName = `${base}.${targetInfo.ext}`;

  const lower = originalName.toLowerCase();
  let from = 'markdown';
  if (lower.endsWith('.html') || lower.endsWith('.htm') || lower.endsWith('.xhtml')) from = 'html';
  else if (lower.endsWith('.md') || lower.endsWith('.markdown')) from = 'markdown';
  else if (lower.endsWith('.docx')) from = 'docx';
  else if (lower.endsWith('.epub')) from = 'epub';

  const options = {
    from,
    to: targetInfo.ext === 'md' ? 'markdown' : targetInfo.ext,
  };

  try {
    onProgress?.(5);
    const result = await convertInput(options, input, originalName);
    onProgress?.(90);

    console.log('[converter] stdout:', result.stdout);
    console.log('[converter] stderr:', result.stderr);
    console.log('[converter] output length:', result.output.length);

    let outUint8: Uint8Array;

    if (result.output.length > 0) {
      outUint8 = result.output;
    } else if (result.stdout && result.stdout.length > 0) {
      outUint8 = new TextEncoder().encode(result.stdout);
    } else {
      throw new Error('pandoc-wasm did not return an output');
    }

    onProgress?.(100);

    return { data: outUint8, name: outName, mime: targetInfo.mime };
  } catch (e: any) {
    console.error('Conversion error', e);
    showMessage('Conversion error: ' + (e?.message || String(e)), { type: 'alert' });
    throw e;
  }
}
