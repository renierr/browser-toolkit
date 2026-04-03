import { downloadFile } from '@js/file-utils.ts';
import { HtmlEditor } from '@js/htmleditor/index.ts';
import { htmlToPdfBuffer } from '@js/mupdf-utils.ts';
import { hideProgress, showMessage, showProgress } from '@js/ui.ts';
import { getPageSettings, normalizeImagesForPdf, wrapHtmlForPdf } from './pdf-generator.ts';

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
    customSizeContainer.classList.toggle('hidden', pageSizeSelect.value !== 'Custom');
  };

  pageSizeSelect.addEventListener('change', handlePageSizeChange);
  handlePageSizeChange();

  return () => {
    pageSizeSelect.removeEventListener('change', handlePageSizeChange);
  };
};

// noinspection JSUnusedGlobalSymbols
export default function init(): (() => void) | undefined {
  const editorHost = document.getElementById('editor-host');
  const htmlInput = document.getElementById('file-input') as HTMLInputElement | null;
  const toolContent = document.getElementById('tool-content');

  if (!editorHost || !htmlInput || !toolContent) {
    console.error('[HtmlToPdfV2] Missing required DOM elements');
    return;
  }

  const setToolContentCollapsed = (collapsed: boolean): void => {
    if (collapsed) {
      toolContent.style.maxHeight = '0';
      toolContent.style.overflow = 'hidden';
      return;
    }

    toolContent.style.maxHeight = '';
    toolContent.style.overflow = '';
  };

  const editor = new HtmlEditor({
    host: editorHost,
    extraToolbarButtons: [
      {
        id: 'generate-pdf',
        title: 'Generate PDF',
        icon: 'file-text',
        className: 'btn-primary',
      },
    ],
    onToolbarButtonClick: (buttonId) => {
      if (buttonId === 'generate-pdf') {
        void generatePdf();
      }
    },
    onContentChange: (event) => {
      document.getElementById('generate-pdf')?.toggleAttribute('disabled', !event.hasContent);
    },
    onFullscreenChange: (isFullscreen) => {
      setToolContentCollapsed(isFullscreen);
    },
  });

  const generatePdf = async (): Promise<void> => {
    if (!editor.getText().trim()) {
      showMessage('Please add some content before generating PDF.', { type: 'alert' });
      return;
    }

    showProgress('Generating PDF...');

    try {
      const settings = getPageSettings();
      const cleanHtml = editor.getCleanHtml();
      const normalizedHtml = normalizeImagesForPdf(cleanHtml, editorHost);
      const wrappedHtml = wrapHtmlForPdf(normalizedHtml, settings);

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

  const disposers: Array<() => void> = [];

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

  editor.mount();

  const pageSettingsCleanup = setupPageSettings();
  disposers.push(pageSettingsCleanup);

  addClickListener('generate-pdf', () => {
    void generatePdf();
  });
  addClickListener('save-content', saveContent);
  addClickListener('load-content', () => {
    void loadContent();
  });

  return () => {
    setToolContentCollapsed(false);

    disposers.forEach((dispose) => {
      dispose();
    });

    editor.destroy();
  };
}
