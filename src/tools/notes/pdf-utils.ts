import { downloadFile } from '@js/file-utils.ts';
import { htmlToPdfBuffer } from '@js/mupdf-utils.ts';
import { showMessage } from '@js/ui.ts';
import { renderMarkdownContent, buildMarkdownPdfHtml } from '@js/markdown-content';
import type { Note } from './types.ts';

export async function exportNoteToPdf(note: Note): Promise<void> {
  const renderedHtml = renderMarkdownContent(note.content);
  const fullHtml = buildMarkdownPdfHtml(renderedHtml);

  try {
    const pdfBytes = await htmlToPdfBuffer(fullHtml);
    const filename = `note-${note.shortId || note.id}.pdf`;
    await downloadFile(pdfBytes, filename, 'application/pdf');
  } catch (e) {
    console.error('Failed to export PDF:', e);
    showMessage('Failed to export PDF. See console for details.', { type: 'alert' });
  }
}
