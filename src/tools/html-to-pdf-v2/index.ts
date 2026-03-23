import { downloadFile } from '../../js/file-utils.ts';
import { hideProgress, showMessage, showProgress } from '../../js/ui.ts';
import { htmlToPdfBuffer } from '../../js/mupdf-utils.ts';
import { wrapTextByScript } from '../../js/pdf-utils.ts';

const PageSizes: { [key: string]: [number, number] } = {
  A0: [2383.94, 3370.39],
  A1: [1683.78, 2383.94],
  A2: [1190.55, 1683.78],
  A3: [841.89, 1190.55],
  A4: [595.28, 841.89],
  A5: [419.53, 595.28],
  A6: [297.64, 419.53],
  Letter: [612, 792],
  Legal: [612, 1008],
  Tabloid: [792, 1224],
};

const getPageDimensions = (): [number, number] => {
  const pageSizeSelect = document.getElementById('page-size') as HTMLSelectElement;
  const orientationSelect = document.getElementById('page-orientation') as HTMLSelectElement;
  const customWidthInput = document.getElementById('custom-width') as HTMLInputElement;
  const customHeightInput = document.getElementById('custom-height') as HTMLInputElement;

  const sizeKey = pageSizeSelect?.value || 'A4';
  const orientation = orientationSelect?.value || 'portrait';

  let dimensions: [number, number];

  if (sizeKey === 'Custom') {
    dimensions = [
      parseFloat(customWidthInput?.value) || 595,
      parseFloat(customHeightInput?.value) || 842,
    ];
  } else {
    dimensions = PageSizes[sizeKey] || PageSizes['A4'];
  }

  if (orientation === 'landscape') {
    return [dimensions[1], dimensions[0]];
  }

  return dimensions;
};

const wrapHtmlForPdf = (htmlContent: string, fontFamilyOption: string): string => {
  const fontFamily =
    fontFamilyOption ||
    (document.getElementById('font-family') as HTMLSelectElement)?.value ||
    'sans-serif';
  const fontSize = (document.getElementById('font-size') as HTMLInputElement)?.value || '12';
  const margin = (document.getElementById('margin-size') as HTMLInputElement)?.value || '20';

  const htmlOut = wrapTextByScript(htmlContent);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
* { box-sizing: border-box; }
body {
  font-family: ${fontFamily};
  font-size: ${fontSize}pt;
  line-height: 1.4;
  color: #000;
  margin: ${margin}pt;
  padding: 0;
}
h1 { font-size: 24pt; font-weight: bold; margin: 18pt 0 12pt 0; }
h2 { font-size: 20pt; font-weight: bold; margin: 16pt 0 10pt 0; }
h3 { font-size: 16pt; font-weight: bold; margin: 14pt 0 8pt 0; }
h4 { font-size: 14pt; font-weight: bold; margin: 12pt 0 6pt 0; }
h5 { font-size: 12pt; font-weight: bold; margin: 10pt 0 5pt 0; }
h6 { font-size: 11pt; font-weight: bold; margin: 9pt 0 4pt 0; }
p { margin: 8pt 0; }
blockquote {
  margin: 12pt 20pt;
  padding: 8pt 16pt;
  border-left: 4pt solid #ddd;
  background: #f9f9f9;
  font-style: italic;
}
pre, code {
  background: #f5f5f5;
  border: 1pt solid #ddd;
  padding: 8pt;
  font-family: monospace;
  font-size: 10pt;
  border-radius: 3pt;
}
pre { white-space: pre-wrap; word-wrap: break-word; }
ul, ol { margin: 8pt 0; padding-left: 25pt; }
li { margin: 4pt 0; }
a { color: #0066cc; text-decoration: underline; }
img { max-width: 100%; height: auto; margin: 8pt 0; }
strong, b { font-weight: bold; }
em, i { font-style: italic; }
u { text-decoration: underline; }
s, strike { text-decoration: line-through; }
</style>
</head>
<body>
${htmlOut}
</body>
</html>`;
};

const generatePdfMupdf = async (): Promise<void> => {
  const editor = document.getElementById('editor');
  if (!editor) return;

  showProgress('Generating PDF...');

  try {
    const [width, height] = getPageDimensions();
    const fontSize = parseInt(
      (document.getElementById('font-size') as HTMLInputElement)?.value || '12'
    );
    const fontFamily =
      (document.getElementById('font-family') as HTMLSelectElement)?.value || 'sans-serif';
    const htmlContent = editor.innerHTML;
    const wrappedHtml = wrapHtmlForPdf(htmlContent, fontFamily);

    const pdfBuffer = await htmlToPdfBuffer(wrappedHtml, { width, height, fontSize });
    const filename = `document-${new Date().toISOString().slice(0, 10)}.pdf`;

    downloadFile(pdfBuffer, filename, 'application/pdf');
    showMessage('PDF generated successfully!', { type: 'info', timeoutMs: 3000 });
  } catch (error) {
    console.error('PDF generation failed:', error);
    showMessage('Failed to generate PDF. Please try again.', { type: 'alert' });
  } finally {
    hideProgress();
  }
};

const generatePrintCSS = (): string => {
  const fontFamily =
    (document.getElementById('font-family') as HTMLSelectElement)?.value || 'sans-serif';
  const [width, height] = getPageDimensions();
  const fontSize = (document.getElementById('font-size') as HTMLInputElement)?.value || '12';
  const margin = (document.getElementById('margin-size') as HTMLInputElement)?.value || '20';

  return `
@page {
  margin: ${margin}pt;
  size: ${width}pt ${height}pt;
}
body {
  font-family: ${fontFamily};
  font-size: ${fontSize}pt;
  line-height: 1.4;
  color: #000;
  margin: 0;
  padding: 0;
}
h1 { font-size: 24pt; font-weight: bold; margin: 18pt 0 12pt 0; }
h2 { font-size: 20pt; font-weight: bold; margin: 16pt 0 10pt 0; }
h3 { font-size: 16pt; font-weight: bold; margin: 14pt 0 8pt 0; }
h4 { font-size: 14pt; font-weight: bold; margin: 12pt 0 6pt 0; }
h5 { font-size: 12pt; font-weight: bold; margin: 10pt 0 5pt 0; }
h6 { font-size: 11pt; font-weight: bold; margin: 9pt 0 4pt 0; }
p { margin: 8pt 0; }
blockquote {
  margin: 12pt 20pt;
  padding: 8pt 16pt;
  border-left: 4pt solid #ddd;
  background: #f9f9f9;
  font-style: italic;
}
pre, code {
  background: #f5f5f5;
  border: 1pt solid #ddd;
  padding: 8pt;
  font-family: monospace;
  font-size: 10pt;
  border-radius: 3pt;
}
pre { white-space: pre-wrap; word-wrap: break-word; }
ul, ol { margin: 8pt 0; padding-left: 25pt; }
li { margin: 4pt 0; }
a { color: #0066cc; text-decoration: underline; }
img { max-width: 100%; height: auto; margin: 8pt 0; }
print-instructions { display: none; }
@media print {
  .print-instructions { display: none !important; }
}
`;
};

const usePrintToPdf = (): void => {
  const editor = document.getElementById('editor');
  if (!editor) return;

  const printWin = window.open('', '_blank');
  if (!printWin) {
    showMessage('Could not open print window. Please check your popup blocker.', { type: 'alert' });
    return;
  }

  const [width, height] = getPageDimensions();
  const orientation =
    (document.getElementById('page-orientation') as HTMLSelectElement)?.value || 'portrait';

  const printInstructions = `
    <div class="print-instructions" style="position: relative; background: #ffffe0; border: 1px solid #e6e6e6; padding: 15px; margin-bottom: 20px; border-radius: 5px; font-family: sans-serif; font-size: 12pt;">
      <button onclick="window.print()" style="background: #007bff; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; font-size: 12pt; margin-right: 10px;">Print</button>
      <button onclick="window.close()" style="background: #6c757d; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; font-size: 12pt;">Close</button>
      <h4 style="margin: 15px 0 10px 0;">Recommended Print Settings</h4>
      <ul style="margin: 5px 0 0 20px; padding: 0;">
        <li><strong>Paper Size:</strong> ${width}x${height}pt (${orientation})</li>
        <li><strong>Margins:</strong> 'Default' or 'None'</li>
      </ul>
    </div>
  `;

  printWin.document.write(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <title>Document</title>
        <meta charset="utf-8">
        <style>${generatePrintCSS()}</style>
      </head>
      <body>
        ${printInstructions}
        ${editor.innerHTML}
      </body>
    </html>
  `);

  printWin.document.close();
  printWin.focus();

  printWin.onafterprint = () => {
    printWin.close();
  };
};

const saveContent = (): void => {
  const editor = document.getElementById('editor');
  if (!editor) return;

  try {
    const htmlContent = editor.innerHTML;
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const filename = `document-${new Date().toISOString().slice(0, 10)}.html`;
    downloadFile(blob, filename, 'text/html');
  } catch (error) {
    console.error('Failed to save content:', error);
    showMessage('Could not save the editor content.', { type: 'alert' });
  }
};

const loadContent = (): void => {
  const input = document.getElementById('file-input') as HTMLInputElement;
  if (!input) return;

  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const editor = document.getElementById('editor');
      const fileContent = event.target?.result;
      if (editor && typeof fileContent === 'string') {
        editor.innerHTML = fileContent;
      } else {
        showMessage('Failed to read file content.', { type: 'alert' });
      }
    };
    reader.onerror = () => {
      showMessage('Error reading the selected file.', { type: 'alert' });
    };
    reader.readAsText(file);
  };

  input.click();
};

const insertLink = (): void => {
  const editor = document.getElementById('editor');
  if (!editor) return;
  editor.focus();
  const url = prompt('Enter URL:');
  if (url) {
    document.execCommand('createLink', false, url);
  }
};

const insertImage = (): void => {
  const input = document.getElementById('image-input') as HTMLInputElement;
  if (!input) return;

  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const editor = document.getElementById('editor');
      const fileContent = event.target?.result;
      if (editor && typeof fileContent === 'string') {
        const imgContainer = document.createElement('div');
        imgContainer.className = 'editor-image-container';
        imgContainer.style.display = 'inline-block';
        imgContainer.style.position = 'relative';
        imgContainer.style.margin = '8px 0';

        const img = document.createElement('img');
        img.src = fileContent;
        img.alt = file.name;
        img.style.maxWidth = '300px';
        img.style.display = 'block';
        img.style.cursor = 'move';

        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'resize-handle';
        resizeHandle.innerHTML = '⋮⋮';

        imgContainer.appendChild(img);
        imgContainer.appendChild(resizeHandle);
        editor.appendChild(imgContainer);

        setupImageResize(imgContainer, img);
      }
    };
    reader.readAsDataURL(file);
  };

  input.click();
};

const setupImageResize = (container: HTMLElement, img: HTMLImageElement): void => {
  let isResizing = false;
  let startX = 0;
  let startWidth = 0;

  const resizeHandle = container.querySelector('.resize-handle') as HTMLElement;
  if (!resizeHandle) return;

  const startResize = (e: MouseEvent) => {
    e.preventDefault();
    isResizing = true;
    startX = e.clientX;
    startWidth = img.offsetWidth;
    document.addEventListener('mousemove', doResize);
    document.addEventListener('mouseup', stopResize);
  };

  const doResize = (e: MouseEvent) => {
    if (!isResizing) return;
    const diff = e.clientX - startX;
    const newWidth = Math.max(50, Math.min(startWidth + diff, 800));
    img.style.width = newWidth + 'px';
    img.style.maxWidth = 'none';
  };

  const stopResize = () => {
    isResizing = false;
    document.removeEventListener('mousemove', doResize);
    document.removeEventListener('mouseup', stopResize);
  };

  resizeHandle.addEventListener('mousedown', startResize);

  img.addEventListener('click', () => {
    container.classList.toggle('selected');
  });

  document.addEventListener('click', (e) => {
    if (!container.contains(e.target as Node)) {
      container.classList.remove('selected');
    }
  });
};

const addEditorStyles = (): void => {
  const style = document.createElement('style');
  style.textContent = `
    .editor-image-container {
      display: inline-block;
      position: relative;
      margin: 8px 0;
    }
    .editor-image-container.selected {
      outline: 2px solid #3b82f6;
    }
    .editor-image-container img {
      display: block;
      max-width: 300px;
      height: auto;
      cursor: move;
    }
    .resize-handle {
      position: absolute;
      bottom: -8px;
      right: -8px;
      background: #3b82f6;
      color: white;
      padding: 4px 6px;
      font-size: 10px;
      cursor: se-resize;
      border-radius: 4px;
      user-select: none;
      opacity: 0;
      transition: opacity 0.2s;
    }
    .editor-image-container:hover .resize-handle,
    .editor-image-container.selected .resize-handle {
      opacity: 1;
    }
  `;
  document.head.appendChild(style);
};

const execCommand = (command: string, value?: string): void => {
  const editor = document.getElementById('editor');
  if (editor) {
    editor.focus();
  }
  if (value) {
    document.execCommand(command, false, value);
  } else {
    document.execCommand(command, false);
  }
  updateToolbarState();
};

const formatBlock = (tag: string): void => {
  const editor = document.getElementById('editor');
  if (editor) {
    editor.focus();
  }
  document.execCommand('formatBlock', false, tag);
  updateToolbarState();
};

const updateToolbarState = (): void => {
  const buttons: Record<string, string> = {
    'btn-bold': 'bold',
    'btn-italic': 'italic',
    'btn-underline': 'underline',
    'btn-strike': 'strikeThrough',
    'btn-ul': 'insertUnorderedList',
    'btn-ol': 'insertOrderedList',
    'btn-align-left': 'justifyLeft',
    'btn-align-center': 'justifyCenter',
    'btn-align-right': 'justifyRight',
    'btn-align-justify': 'justifyFull',
  };

  for (const [btnId, cmd] of Object.entries(buttons)) {
    const btn = document.getElementById(btnId);
    if (btn) {
      try {
        const state = document.queryCommandState(cmd);
        btn.classList.toggle('btn-active', state);
        btn.classList.toggle('btn-ghost', !state);
      } catch {
        btn.classList.remove('btn-active');
        btn.classList.add('btn-ghost');
      }
    }
  }
};

const setupToolbar = (): void => {
  document.getElementById('btn-bold')?.addEventListener('click', () => execCommand('bold'));
  document.getElementById('btn-italic')?.addEventListener('click', () => execCommand('italic'));
  document
    .getElementById('btn-underline')
    ?.addEventListener('click', () => execCommand('underline'));
  document
    .getElementById('btn-strike')
    ?.addEventListener('click', () => execCommand('strikeThrough'));
  document
    .getElementById('btn-clear')
    ?.addEventListener('click', () => execCommand('removeFormat'));

  document.getElementById('heading-select')?.addEventListener('change', (e) => {
    const value = (e.target as HTMLSelectElement).value;
    if (value) {
      formatBlock(value);
      (e.target as HTMLSelectElement).value = '';
    }
  });

  document
    .getElementById('btn-ul')
    ?.addEventListener('click', () => execCommand('insertUnorderedList'));
  document
    .getElementById('btn-ol')
    ?.addEventListener('click', () => execCommand('insertOrderedList'));

  document
    .getElementById('btn-align-left')
    ?.addEventListener('click', () => execCommand('justifyLeft'));
  document
    .getElementById('btn-align-center')
    ?.addEventListener('click', () => execCommand('justifyCenter'));
  document
    .getElementById('btn-align-right')
    ?.addEventListener('click', () => execCommand('justifyRight'));
  document
    .getElementById('btn-align-justify')
    ?.addEventListener('click', () => execCommand('justifyFull'));

  document
    .getElementById('btn-blockquote')
    ?.addEventListener('click', () => formatBlock('blockquote'));
  document.getElementById('btn-code')?.addEventListener('click', () => formatBlock('pre'));

  document.getElementById('btn-link')?.addEventListener('click', insertLink);
  document.getElementById('btn-image')?.addEventListener('click', insertImage);

  document.addEventListener('selectionchange', () => {
    const selection = window.getSelection();
    if (selection && selection.anchorNode) {
      let node: Node | null = selection.anchorNode;
      while (node && node.nodeType === Node.TEXT_NODE) {
        node = node.parentNode;
      }
      const editor = document.getElementById('editor');
      if (node && editor && (node === editor || editor.contains(node))) {
        updateToolbarState();
      }
    }
  });
};

const setupPageSettings = (): void => {
  const pageSizeSelect = document.getElementById('page-size') as HTMLSelectElement;
  const customSizeContainer = document.getElementById('custom-size-container');

  pageSizeSelect?.addEventListener('change', () => {
    if (pageSizeSelect.value === 'Custom') {
      customSizeContainer?.classList.remove('hidden');
    } else {
      customSizeContainer?.classList.add('hidden');
    }
  });
};

// noinspection JSUnusedGlobalSymbols
export default function init() {
  addEditorStyles();
  setupToolbar();
  setupPageSettings();

  document.getElementById('generate-pdf')?.addEventListener('click', generatePdfMupdf);
  document.getElementById('print-to-pdf')?.addEventListener('click', usePrintToPdf);
  document.getElementById('save-content')?.addEventListener('click', saveContent);
  document.getElementById('load-content')?.addEventListener('click', loadContent);

  const editor = document.getElementById('editor');
  if (editor) {
    editor.focus();

    editor.addEventListener('input', () => {
      if (!editor.innerHTML.trim()) {
        editor.innerHTML = '<p><br></p>';
      }
    });

    if (!editor.innerHTML.trim()) {
      editor.innerHTML = '<p><br></p>';
    }
  }
}
