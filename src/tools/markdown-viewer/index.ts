import { setupFileDropzone, downloadFile } from '@js/file-utils';
import { showMessage, showProgress, hideProgress } from '@js/ui';
import { htmlToPdfBuffer } from '@js/mupdf-utils';
import type { SharedFilesPayload } from '@js/share-target';
import { createMarkdownRenderer } from '@js/markdown-renderer';
import { getSettings } from '@js/settings';
import { MarkdownParser } from 'overtype/parser';

interface State {
  isSourceView: boolean;
  currentFile: File | null;
  currentContent: string;
  renderedHtml: string;
}

const state: State = {
  isSourceView: false,
  currentFile: null,
  currentContent: '',
  renderedHtml: '',
};

export default function init(payload?: SharedFilesPayload): (() => void) | undefined {
  const renderer = createMarkdownRenderer();

  const viewer = document.getElementById('viewer') as HTMLElement;
  const fileName = document.getElementById('file-name') as HTMLElement;
  const toggleBtn = document.getElementById('toggle-view') as HTMLButtonElement;
  const toggleLabel = document.getElementById('toggle-label') as HTMLElement;
  const iconCode = document.getElementById('icon-code') as HTMLElement;
  const iconEye = document.getElementById('icon-eye') as HTMLElement;
  const renderedContent = document.getElementById('rendered-content') as HTMLElement;
  const sourceView = document.getElementById('source-view') as HTMLElement;
  const newFileBtn = document.getElementById('new-file-btn') as HTMLButtonElement;
  const exportPdfBtn = document.getElementById('export-pdf-btn') as HTMLButtonElement;
  const toolCard = document.getElementById('tool-card') as HTMLElement;
  const themeSelect = document.getElementById('content-theme') as HTMLSelectElement;

  const settings = getSettings('markdown-viewer');
  const cleanupSettings = settings.bind(viewer);
  applyContentTheme(themeSelect.value || 'default');

  themeSelect.addEventListener('change', () => {
    applyContentTheme(themeSelect.value);
  });

  function applyContentTheme(theme: string): void {
    renderedContent.dataset.contentTheme = theme;
  }

  setupFileDropzone('dropzone', 'file-input', (files) => {
    loadFile(files[0]);
  });

  toggleBtn.addEventListener('click', () => {
    state.isSourceView = !state.isSourceView;
    updateView();
  });

  newFileBtn.addEventListener('click', () => {
    resetViewer();
  });

  exportPdfBtn.addEventListener('click', () => {
    void exportToPdf();
  });

  const handleSharedFiles = (files: File[]) => {
    if (files.length > 0) {
      const file = files[0];
      if (isMarkdownFile(file)) {
        loadFile(file);
      } else {
        showMessage('Please select a Markdown file (.md, .txt)', { type: 'alert' });
      }
    }
  };

  if (payload?.sharedFiles?.length) {
    handleSharedFiles(payload.sharedFiles);
  }

  function loadFile(file: File) {
    if (!isMarkdownFile(file)) {
      showMessage('Please select a Markdown file (.md, .txt)', { type: 'alert' });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      state.currentContent = content;
      state.currentFile = file;
      state.renderedHtml = renderer.render(content);

      fileName.textContent = file.name;

      toolCard.classList.add('hidden');
      viewer.classList.remove('hidden');
      viewer.classList.add('flex');

      renderedContent.innerHTML = state.renderedHtml;
      renderedContent.querySelectorAll('table').forEach((table) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'overflow-x-auto';
        table.parentNode?.insertBefore(wrapper, table);
        wrapper.appendChild(table);
      });
      sourceView.innerHTML = MarkdownParser.parse(state.currentContent);

      updateView();
      renderedContent.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    reader.onerror = () => {
      showMessage('Failed to read file', { type: 'alert' });
    };

    reader.readAsText(file);
  }

  function updateView() {
    if (state.isSourceView) {
      renderedContent.classList.add('hidden');
      sourceView.classList.remove('hidden');
      iconCode.classList.add('hidden');
      iconEye.classList.remove('hidden');
      toggleLabel.textContent = 'Rendered';
    } else {
      renderedContent.classList.remove('hidden');
      sourceView.classList.add('hidden');
      iconCode.classList.remove('hidden');
      iconEye.classList.add('hidden');
      toggleLabel.textContent = 'Source';
    }
  }

  function isMarkdownFile(file: File): boolean {
    const name = file.name.toLowerCase();
    return (
      name.endsWith('.md') ||
      name.endsWith('.markdown') ||
      name.endsWith('.txt') ||
      file.type === 'text/markdown' ||
      file.type === 'text/x-markdown' ||
      file.type === 'text/plain'
    );
  }

  async function exportToPdf() {
    if (!state.renderedHtml || !state.currentFile) return;
    showProgress('Exporting PDF…');
    try {
      const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: system-ui, sans-serif; padding: 24px; line-height: 1.6; color: #000; background: #fff; }
    h1,h2,h3,h4 { font-weight: bold; margin: 0.6em 0 0.3em; }
    h1 { font-size: 1.6em; } h2 { font-size: 1.3em; } h3 { font-size: 1.1em; }
    ul,ol { padding-left: 1.5em; }
    blockquote { border-left: 4px solid #ccc; margin: 0.5em 0; padding-left: 1em; color: #555; }
    code { background: #f0f0f0; padding: 0.1em 0.3em; border-radius: 0.2em; font-size: 0.9em; }
    pre code { display: block; padding: 1em; overflow-x: auto; white-space: pre; }
    table { border-collapse: collapse; width: 100%; }
    th,td { border: 1px solid #ccc; padding: 0.4em 0.8em; }
    th { background: #f0f0f0; }
    a { color: #0000ee; }
    img { max-width: 100%; }
  </style>
</head>
<body>${state.renderedHtml}</body>
</html>`;
      const pdfBytes = await htmlToPdfBuffer(fullHtml);
      const name = (state.currentFile.name.replace(/\.[^.]+$/, '') || 'document') + '.pdf';
      await downloadFile(pdfBytes, name, 'application/pdf');
    } catch (e) {
      console.error('[markdown-viewer] PDF export failed', e);
      showMessage('Failed to export PDF.', { type: 'alert' });
    } finally {
      hideProgress();
    }
  }

  function resetViewer() {
    state.isSourceView = false;
    state.currentFile = null;
    state.currentContent = '';
    state.renderedHtml = '';
    fileName.textContent = '';
    renderedContent.innerHTML = '';
    sourceView.innerHTML = '';
    viewer.classList.remove('flex');
    viewer.classList.add('hidden');
    toolCard.classList.remove('hidden');
    updateView();
  }

  return () => {
    cleanupSettings();
  };
}
