import { downloadFile } from '../../js/file-utils.ts';
import { htmlToPdfBuffer } from '../../js/mupdf-utils.ts';
import { showMessage } from '../../js/ui.ts';
import { MarkdownParser } from 'overtype/parser';
import type { Note } from './types.ts';

export const removeMarkdownSyntax = (html: string): string => {
  let htmlContent = html.replace(/<span class="syntax-marker[^"]*">.*?<\/span>/g, '');
  htmlContent = htmlContent.replace(/\sclass="(bullet-list|ordered-list|code-fence|hr-marker|blockquote|url-part)"/g, '');
  htmlContent = htmlContent.replace(/\sclass=""/g, '');
  return htmlContent;
};

export async function exportNoteToPdf(note: Note): Promise<void> {
  const htmlContent = removeMarkdownSyntax(MarkdownParser.parse(note.content));
  const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: sans-serif; padding: 20px; line-height: 1.5; color: #000; background: #fff; }
    h1, h2, h3 { font-weight: bold; margin-top: 0.5em; margin-bottom: 0.2em; }
    h1 { font-size: 1.5em; }
    h2 { font-size: 1.25em; }
    h3 { font-size: 1.1em; }
    ul, ol { margin-left: 0; padding-left: 20px; }
    .blockquote { display: block; border-left: 4px solid #ccc; padding-left: 1em; margin: 0.5em 0; opacity: 0.8; }
    code { background-color: #f0f0f0; padding: 0.1em 0.2em; border-radius: 0.2em; font-size: 0.9em; }
    .code-block { background-color: #f0f0f0; padding: 1em; border-radius: 0.5em; margin: 1em 0; overflow-x: auto; white-space: pre; }
    .code-fence { opacity: 0.3; font-size: 0.8em; }
    a { color: #0000ee; text-decoration: underline; }
  </style>
</head>
<body>
  ${htmlContent}
</body>
</html>`;

  try {
    const pdfBytes = await htmlToPdfBuffer(fullHtml);
    const filename = `note-${note.shortId || note.id}.pdf`;
    await downloadFile(pdfBytes, filename, 'application/pdf');
  } catch (e) {
    console.error('Failed to export PDF:', e);
    showMessage('Failed to export PDF. See console for details.', { type: 'alert' });
  }
}
