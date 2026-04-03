import { downloadFile } from '@js/file-utils.ts';
import { hideProgress, showMessage, showProgress } from '@js/ui.ts';
import { htmlToPdfBuffer } from '@js/mupdf-utils.ts';
import { wrapHtmlForPdf, getPageSettings } from './pdf-generator.ts';
import { sanitizeHtml } from './sanitizer.ts';
import { HtmlEditor } from '../../js/htmleditor/html-editor.ts';

const readFileAsText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === 'string') {
        resolve(content);
        return;
      }
      reject(new Error('File content is not text.'));
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error('Failed to read file.'));
    };

    reader.readAsText(file);
  });
};

const pickSingleFile = (input: HTMLInputElement): Promise<File | null> => {
  return new Promise((resolve) => {
    const handleChange = (event: Event): void => {
      const file = (event.target as HTMLInputElement).files?.[0] ?? null;
      input.removeEventListener('change', handleChange);
      resolve(file);
    };

    input.addEventListener('change', handleChange);
    input.click();
  });
};

const setupPageSettings = (): (() => void) => {
  const pageSizeSelect = document.getElementById('page-size') as HTMLSelectElement | null;
  const customSizeContainer = document.getElementById('custom-size-container');

  if (!pageSizeSelect || !customSizeContainer) {
    return () => undefined;
  }

  const handlePageSizeChange = (): void => {
    const showCustomSize = pageSizeSelect.value === 'Custom';
    customSizeContainer.classList.toggle('hidden', !showCustomSize);
  };

  pageSizeSelect.addEventListener('change', handlePageSizeChange);
  handlePageSizeChange();

  return () => {
    pageSizeSelect.removeEventListener('change', handlePageSizeChange);
  };
};

// noinspection JSUnusedGlobalSymbols
export default function init(): (() => void) | undefined {
  const editorElement = document.getElementById('editor');
  const toolbarElement = document.getElementById('editor-toolbar');
  const imageInput = document.getElementById('image-input') as HTMLInputElement | null;
  const htmlInput = document.getElementById('file-input') as HTMLInputElement | null;
  const editorContainer = document.getElementById('editor-container');
  const toolContent = document.getElementById('tool-content');

  if (!editorElement || !toolbarElement || !htmlInput || !editorContainer || !toolContent) {
    console.error('[HtmlToPdfV2] Missing required DOM elements');
    return;
  }

  const editor = new HtmlEditor({
    editor: editorElement,
    toolbar: toolbarElement,
    imageInput,
    sanitizeHtml,
    onContentChange: () => {
      const hasContent = Boolean(editorElement.innerText.trim());
      document.getElementById('btn-generate-pdf')?.toggleAttribute('disabled', !hasContent);
      document.getElementById('generate-pdf')?.toggleAttribute('disabled', !hasContent);
    },
  });

  editor.mount();

  const disposers: Array<() => void> = [];
  let isFullscreen = false;

  const addClickListener = (id: string, handler: () => void): void => {
    const element = document.getElementById(id);
    if (!element) {
      return;
    }

    const listener = (): void => {
      handler();
    };

    element.addEventListener('click', listener);
    disposers.push(() => {
      element.removeEventListener('click', listener);
    });
  };

  const toggleFullscreen = (): void => {
    isFullscreen = !isFullscreen;

    editorContainer.classList.toggle('fullscreen', isFullscreen);

    if (isFullscreen) {
      toolContent.style.maxHeight = '0';
      toolContent.style.overflow = 'hidden';
    } else {
      toolContent.style.maxHeight = '';
      toolContent.style.overflow = '';
    }

    editor.focus();
  };

  const generatePdf = async (): Promise<void> => {
    if (!editorElement.innerText.trim()) {
      showMessage('Please add some content before generating PDF.', { type: 'alert' });
      return;
    }

    showProgress('Generating PDF...');

    try {
      const settings = getPageSettings();
      const wrappedHtml = wrapHtmlForPdf(editor.getCleanHtml());

      const pdfBuffer = await htmlToPdfBuffer(wrappedHtml, {
        width: settings.width,
        height: settings.height,
        fontSize: settings.fontSize,
      });

      const filename = `document-${new Date().toISOString().slice(0, 10)}.pdf`;
      downloadFile(pdfBuffer, filename, 'application/pdf');
      showMessage('PDF generated successfully!', { type: 'info', timeoutMs: 3000 });
    } catch (error) {
      console.error('[HtmlToPdfV2] PDF generation failed:', error);
      showMessage('Failed to generate PDF. Please try again.', { type: 'alert' });
    } finally {
      hideProgress();
    }
  };

  const saveContent = (): void => {
    try {
      const htmlContent = editor.getCleanHtml();
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const filename = `document-${new Date().toISOString().slice(0, 10)}.html`;
      downloadFile(blob, filename, 'text/html');
    } catch (error) {
      console.error('[HtmlToPdfV2] Failed to save content:', error);
      showMessage('Could not save the editor content.', { type: 'alert' });
    }
  };

  const loadContent = async (): Promise<void> => {
    try {
      const file = await pickSingleFile(htmlInput);
      if (!file) {
        return;
      }

      const content = await readFileAsText(file);
      editor.setHtml(content);
      htmlInput.value = '';
    } catch (error) {
      console.error('[HtmlToPdfV2] Failed to load content:', error);
      showMessage('Error reading the selected file.', { type: 'alert' });
    }
  };

  const pageSettingsCleanup = setupPageSettings();
  disposers.push(pageSettingsCleanup);

  addClickListener('generate-pdf', () => {
    void generatePdf();
  });
  addClickListener('btn-generate-pdf', () => {
    void generatePdf();
  });
  addClickListener('save-content', saveContent);
  addClickListener('load-content', () => {
    void loadContent();
  });
  addClickListener('btn-link', () => editor.promptForLink());
  addClickListener('btn-image', () => editor.promptForImageInsert());
  addClickListener('btn-fullscreen', toggleFullscreen);

  const escapeListener = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && isFullscreen) {
      toggleFullscreen();
    }
  };
  editorElement.addEventListener('keydown', escapeListener);
  disposers.push(() => {
    editorElement.removeEventListener('keydown', escapeListener);
  });

  return () => {
    if (isFullscreen) {
      editorContainer.classList.remove('fullscreen');
      toolContent.style.maxHeight = '';
      toolContent.style.overflow = '';
    }

    disposers.forEach((dispose) => {
      dispose();
    });
    editor.destroy();
  };
}
