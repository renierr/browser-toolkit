import { setupFileDropzone } from '../../js/file-utils';
import { showMessage } from '../../js/ui';
import type { SharedFilesPayload } from '../../js/share-target';
import { createMarkdownRenderer } from './markdown-renderer';
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
  const toolCard = document.getElementById('tool-card') as HTMLElement;

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
    toggleBtn.removeEventListener('click', () => {});
    newFileBtn.removeEventListener('click', () => {});
  };
}
