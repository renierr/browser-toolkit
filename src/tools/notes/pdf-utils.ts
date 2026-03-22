import { downloadFile } from '../../js/file-utils.ts';
import { htmlToPdfBuffer } from '../../js/mupdf-utils.ts';
import { showMessage } from '../../js/ui.ts';
import { MarkdownParser } from 'overtype/parser';
import type { Note } from './types.ts';

function wrapTextByScript(html: string): string {
  const cjkRegex =
    /([\u4e00-\u9fff\u3400-\u4dbf\u{20000}-\u{2a6df}\u{2a700}-\u{2b73f}\u{2b740}-\u{2b81f}\u{2b820}-\u{2ceaf}\u{2ceb0}-\u{2ebef}\u{3000}-\u{303f}\u{3040}-\u{309f}\u{30a0}-\u{30ff}\u{3100}-\u{312f}\u{3131}-\u{318e}\u{3190}-\u{319f}\u{31a0}-\u{31bf}\u{31f0}-\u{31ff}\u{3300}-\u{33ff}\u{f900}-\u{faff}]+)/gu;
  const emojiRegex =
    /([\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]+)/gu;
  const specialCharsRegex = /([✔️✓✗✘©®™§¶†‡•…‰′″¤€£¥¢±∞≠≈÷×☑☒]+)/gu;

  let result = html;

  result = result.replace(
    cjkRegex,
    '<span style="font-family: cjk, sans-serif;">$1</span>'
  );

  result = result.replace(
    emojiRegex,
    '<span style="font-family: emoji, sans-serif;">$1</span>'
  );

  result = result.replace(
    specialCharsRegex,
    '<span style="font-family: emoji, sans-serif;">$1</span>'
  );

  return result;
}

export const removeMarkdownSyntax = (html: string): string => {
  let htmlContent = html.replace(/<span class="syntax-marker[^"]*">.*?<\/span>/g, '');
  htmlContent = htmlContent.replace(
    /\sclass="(bullet-list|ordered-list|code-fence|hr-marker|blockquote|url-part)"/g,
    ''
  );
  htmlContent = htmlContent.replace(/\sclass=""/g, '');
  return htmlContent;
};

export async function exportNoteToPdf(note: Note): Promise<void> {
  let htmlContent = removeMarkdownSyntax(MarkdownParser.parse(note.content));
  htmlContent = wrapTextByScript(htmlContent);

  const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: system-ui, sans-serif; padding: 20px; line-height: 1.5; color: #000; background: #fff; }
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
