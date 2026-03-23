import { downloadFile } from '../../js/file-utils.ts';
import { hideProgress, showMessage, showProgress } from '../../js/ui.ts';
import { htmlToPdfBuffer } from '../../js/mupdf-utils.ts';
import { wrapHtmlForPdf, getPageSettings, getPrintCss } from './pdf-generator.ts';
import { insertImageToEditor, setupAllImages, handleEditorClick } from './editor-utils.ts';
import {
  setupToolbarListeners,
  updateToolbarState,
  getCurrentBlockFormat,
} from './toolbar-utils.ts';

const generatePdfMupdf = async (): Promise<void> => {
  const editor = document.getElementById('editor');
  if (!editor) return;

  showProgress('Generating PDF...');

  try {
    const settings = getPageSettings();
    const htmlContent = cleanEditorContent(editor);
    const wrappedHtml = wrapHtmlForPdf(htmlContent);

    const pdfBuffer = await htmlToPdfBuffer(wrappedHtml, {
      width: settings.width,
      height: settings.height,
      fontSize: settings.fontSize,
    });
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

const usePrintToPdf = (): void => {
  const editor = document.getElementById('editor');
  if (!editor) return;

  const printWin = window.open('', '_blank');
  if (!printWin) {
    showMessage('Could not open print window. Please check your popup blocker.', { type: 'alert' });
    return;
  }

  const settings = getPageSettings();
  const orientation =
    (document.getElementById('page-orientation') as HTMLSelectElement)?.value || 'portrait';

  const printInstructions = `
    <div class="print-instructions" style="position: relative; background: #ffffe0; border: 1px solid #e6e6e6; padding: 15px; margin-bottom: 20px; border-radius: 5px; font-family: sans-serif; font-size: 12pt;">
      <button onclick="window.print()" style="background: #007bff; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; font-size: 12pt; margin-right: 10px;">Print</button>
      <button onclick="window.close()" style="background: #6c757d; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; font-size: 12pt;">Close</button>
      <h4 style="margin: 15px 0 10px 0;">Recommended Print Settings</h4>
      <ul style="margin: 5px 0 0 20px; padding: 0;">
        <li><strong>Paper Size:</strong> ${settings.width}x${settings.height}pt (${orientation})</li>
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
        <style>${getPrintCss()}</style>
      </head>
      <body>
        ${printInstructions}
        ${cleanEditorContent(editor)}
      </body>
    </html>
  `);

  printWin.document.close();
  printWin.focus();

  printWin.onafterprint = () => {
    printWin.close();
  };
};

const cleanEditorContent = (editor: HTMLElement): string => {
  const clone = editor.cloneNode(true) as HTMLElement;
  const containers = clone.querySelectorAll('.editor-image-container');
  containers.forEach((container) => {
    const handle = container.querySelector('.editor-image-container__handle');
    if (handle) handle.remove();
    container.classList.remove('editor-image-container--selected');
    container.removeAttribute('data-image-setup');
  });
  return clone.innerHTML;
};

const saveContent = (): void => {
  const editor = document.getElementById('editor');
  if (!editor) return;

  try {
    const htmlContent = cleanEditorContent(editor);
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

    const editor = document.getElementById('editor');
    if (!editor) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const fileContent = event.target?.result;
      if (typeof fileContent === 'string') {
        insertImageToEditor(editor, file, fileContent);
      }
    };
    reader.readAsDataURL(file);
  };

  input.click();
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

let isFullscreen = false;

const toggleFullscreen = (): void => {
  const editorContainer = document.getElementById('editor-container');
  const btn = document.getElementById('btn-fullscreen');

  if (!editorContainer || !btn) return;

  isFullscreen = !isFullscreen;

  if (isFullscreen) {
    editorContainer.classList.add('fullscreen');
  } else {
    editorContainer.classList.remove('fullscreen');
  }
  document.getElementById('editor')?.focus();
};

// noinspection JSUnusedGlobalSymbols
export default function init() {
  setupToolbarListeners();
  setupPageSettings();

  document.getElementById('generate-pdf')?.addEventListener('click', generatePdfMupdf);
  document.getElementById('print-to-pdf')?.addEventListener('click', usePrintToPdf);
  document.getElementById('save-content')?.addEventListener('click', saveContent);
  document.getElementById('load-content')?.addEventListener('click', loadContent);
  document.getElementById('btn-link')?.addEventListener('click', insertLink);
  document.getElementById('btn-image')?.addEventListener('click', insertImage);
  document.getElementById('btn-fullscreen')?.addEventListener('click', toggleFullscreen);

  const editor = document.getElementById('editor');
  if (editor) {
    editor.focus();

    let lastBlockTag = '';

    editor.addEventListener('input', () => {
      if (!editor.innerHTML.trim()) {
        editor.innerHTML = '<p><br></p>';
      }
    });

    editor.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isFullscreen) {
        toggleFullscreen();
        return;
      }

      if (e.key === 'Enter') {
        const blockFormat = getCurrentBlockFormat();
        if (blockFormat && (blockFormat.tag === 'blockquote' || blockFormat.tag === 'pre')) {
          if (lastBlockTag === blockFormat.tag) {
            document.execCommand('formatBlock', false, 'p');
            lastBlockTag = '';
            setTimeout(updateToolbarState, 0);
          } else {
            lastBlockTag = blockFormat.tag;
          }
        } else {
          lastBlockTag = '';
        }
      } else if (e.key === 'ArrowUp') {
        const selection = window.getSelection();
        if (!selection || !selection.anchorNode) return;

        const preEl =
          selection.anchorNode.nodeType === Node.TEXT_NODE
            ? (selection.anchorNode as Text).parentElement?.closest('pre')
            : null;
        const bqEl =
          selection.anchorNode.nodeType === Node.TEXT_NODE
            ? (selection.anchorNode as Text).parentElement?.closest('blockquote')
            : null;
        const blockEl = preEl || bqEl;
        if (blockEl && blockEl === blockEl.parentElement?.firstChild) {
          const range = selection.getRangeAt(0);
          if (range.startOffset === 0 && range.endOffset === 0) {
            e.preventDefault();
            const newP = document.createElement('p');
            newP.innerHTML = '<br>';
            blockEl.parentNode?.insertBefore(newP, blockEl);
            const newRange = document.createRange();
            newRange.setStart(newP, 0);
            newRange.setEnd(newP, 0);
            selection.removeAllRanges();
            selection.addRange(newRange);
          }
        }
        lastBlockTag = '';
      } else if (e.key === 'ArrowDown') {
        const selection = window.getSelection();
        if (!selection || !selection.anchorNode) return;

        const preEl =
          selection.anchorNode.nodeType === Node.TEXT_NODE
            ? (selection.anchorNode as Text).parentElement?.closest('pre')
            : null;
        const bqEl =
          selection.anchorNode.nodeType === Node.TEXT_NODE
            ? (selection.anchorNode as Text).parentElement?.closest('blockquote')
            : null;
        const blockEl = preEl || bqEl;
        if (blockEl && blockEl === blockEl.parentElement?.lastChild) {
          e.preventDefault();
          const newP = document.createElement('p');
          newP.innerHTML = '<br>';
          if (blockEl.nextSibling) {
            blockEl.parentNode?.insertBefore(newP, blockEl.nextSibling);
          } else {
            blockEl.parentNode?.appendChild(newP);
          }
          const newRange = document.createRange();
          newRange.setStart(newP, 0);
          newRange.setEnd(newP, 0);
          selection.removeAllRanges();
          selection.addRange(newRange);
        }
        lastBlockTag = '';
      } else {
        lastBlockTag = '';
      }
    });

    editor.addEventListener('keyup', updateToolbarState);
    editor.addEventListener('pointerup', updateToolbarState);

    editor.addEventListener('click', handleEditorClick);
    editor.addEventListener('pointerdown', handleEditorClick);

    let imageDebounce: number | undefined;
    const reSetupImages = () => {
      if (imageDebounce) clearTimeout(imageDebounce);
      imageDebounce = window.setTimeout(() => {
        setupAllImages(editor);
      }, 50);
    };

    const imageObserver = new MutationObserver(() => {
      reSetupImages();
    });
    imageObserver.observe(editor, { childList: true, subtree: true, characterData: true });

    editor.addEventListener('input', reSetupImages);
    editor.addEventListener('paste', () => {
      setTimeout(reSetupImages, 150);
    });

    if (!editor.innerHTML.trim()) {
      editor.innerHTML = '<p><br></p>';
    }

    setupAllImages(editor);
  }
}
