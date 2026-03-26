import { showMessage, showProgress, hideProgress } from '../../js/ui';
import { downloadFile } from '../../js/file-utils';
import {
  loadArchive,
  type ArchiveLoader,
  type ArchiveEntry,
  formatSize,
  buildFileTree,
} from './archive-parser';
import { renderEntries } from './file-tree';

interface ViewerState {
  loader: ArchiveLoader | null;
  selectedEntries: Set<string>;
}

function createState(): ViewerState {
  return {
    loader: null,
    selectedEntries: new Set(),
  };
}

function updateToolbarButtons(state: ViewerState): void {
  const downloadBtn = document.getElementById('btn-download-selected') as HTMLButtonElement;
  if (downloadBtn) {
    downloadBtn.disabled = state.selectedEntries.size === 0;
  }

  const selectAll = document.getElementById('select-all') as HTMLInputElement;
  const checkboxes = document.querySelectorAll('.row-checkbox') as NodeListOf<HTMLInputElement>;
  if (selectAll) {
    selectAll.checked = checkboxes.length > 0 && Array.from(checkboxes).every((cb) => cb.checked);
  }
}

function isBinary(data: Uint8Array, sampleSize = 512): boolean {
  const sample = data.slice(0, sampleSize);
  let nullCount = 0;
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) nullCount++;
  }
  return nullCount > sampleSize * 0.1;
}

async function handlePreview(entry: ArchiveEntry, loader: ArchiveLoader): Promise<void> {
  showProgress('Loading file preview...');

  try {
    const data = await loader.loadEntry(entry.path);
    if (!data) {
      showMessage('Failed to load file content', { type: 'alert' });
      return;
    }

    const modal = document.getElementById('preview-modal') as HTMLDialogElement;
    const filenameEl = document.getElementById('preview-filename');
    const infoEl = document.getElementById('preview-info');
    const contentEl = document.getElementById('preview-content');
    const downloadBtn = document.getElementById('preview-download') as HTMLButtonElement;

    if (filenameEl) filenameEl.textContent = entry.name;
    if (infoEl) {
      infoEl.textContent = `Size: ${formatSize(entry.size)} | Type: ${entry.name.split('.').pop()?.toUpperCase() || 'file'}`;
    }

    if (contentEl) {
      if (isBinary(data)) {
        contentEl.textContent =
          'Binary file - preview not available.\n\nUse the Download button to save this file.';
      } else {
        const text = new TextDecoder().decode(data);
        contentEl.textContent = text.slice(0, 10000);
        if (text.length > 10000) contentEl.textContent += '\n\n... (truncated)';
      }
    }

    downloadBtn.onclick = () => {
      downloadFile(data, entry.name);
    };

    modal?.showModal();
  } finally {
    hideProgress();
  }
}

function findEntry(entries: ArchiveEntry[], path: string): ArchiveEntry | null {
  for (const entry of entries) {
    if (entry.path === path) return entry;
    if (entry.children) {
      const found = findEntry(entry.children, path);
      if (found) return found;
    }
  }
  return null;
}

async function handleDownloadSelected(state: ViewerState): Promise<void> {
  if (!state.loader || state.selectedEntries.size === 0) return;

  showProgress('Preparing downloads...');

  try {
    const entries = await state.loader.loadEntryData();
    const filesToDownload: { data: Uint8Array; name: string }[] = [];

    for (const path of state.selectedEntries) {
      const entry = findEntry(entries, path);
      if (entry) {
        const data = await state.loader.loadEntry(path);
        if (data) {
          filesToDownload.push({ data, name: entry.name });
        }
      }
    }

    for (const f of filesToDownload) {
      downloadFile(f.data, f.name);
      await new Promise((r) => setTimeout(r, 100));
    }
  } finally {
    hideProgress();
  }
}

async function handleDownloadAll(state: ViewerState): Promise<void> {
  if (!state.loader) return;

  showProgress('Preparing extraction...');

  try {
    const entries = await state.loader.loadEntryData();
    const files: { data: Uint8Array; name: string }[] = [];

    const collectEntries = (entries: ArchiveEntry[]): string[] => {
      const paths: string[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory) {
          paths.push(entry.path);
        }
        if (entry.children) {
          paths.push(...collectEntries(entry.children));
        }
      }
      return paths;
    };

    const allPaths = collectEntries(entries);

    for (const path of allPaths) {
      const data = await state.loader.loadEntry(path);
      if (data) {
        const entry = findEntry(entries, path);
        files.push({ data, name: entry?.name || path });
      }
    }

    for (const f of files) {
      downloadFile(f.data, f.name);
      await new Promise((r) => setTimeout(r, 100));
    }
  } finally {
    hideProgress();
  }
}

function resetUI(): void {
  const dropzone = document.getElementById('dropzone');
  const archiveInfo = document.getElementById('archive-info');
  const contentArea = document.getElementById('content-area');
  const fileList = document.getElementById('file-list');
  const fileInput = document.getElementById('file-input') as HTMLInputElement;
  const selectAll = document.getElementById('select-all') as HTMLInputElement;

  if (dropzone) dropzone.classList.remove('hidden');
  if (archiveInfo) archiveInfo.classList.add('hidden');
  if (contentArea) contentArea.classList.add('hidden');
  if (fileList) fileList.innerHTML = '';
  if (fileInput) fileInput.value = '';
  if (selectAll) selectAll.checked = false;
}

function handleStartOver(state: ViewerState): void {
  if (state.loader) {
    state.loader.close();
    state.loader = null;
  }
  state.selectedEntries.clear();
  resetUI();
}

async function handleArchiveLoad(file: File, state: ViewerState): Promise<void> {
  showProgress('Loading archive...');

  try {
    const loader = await loadArchive(file);
    state.loader = loader;
    state.selectedEntries.clear();

    const entries = await loader.loadEntryData();
    const treeEntries = buildFileTree(entries);

    const dropzone = document.getElementById('dropzone');
    const infoEl = document.getElementById('archive-info');
    const filenameEl = document.getElementById('info-filename');
    const formatEl = document.getElementById('info-format');
    const countEl = document.getElementById('info-count');
    const sizeEl = document.getElementById('info-size');
    const contentArea = document.getElementById('content-area');
    const fileList = document.getElementById('file-list');

    if (dropzone) dropzone.classList.add('hidden');
    if (infoEl) infoEl.classList.remove('hidden');
    if (filenameEl) filenameEl.textContent = loader.filename;
    if (formatEl) formatEl.textContent = loader.format;
    if (countEl) countEl.textContent = String(entries.length);
    if (sizeEl) sizeEl.textContent = formatSize(loader.totalSize);
    if (contentArea) contentArea.classList.remove('hidden');
    if (fileList) {
      fileList.innerHTML = '';
      renderEntries(
        treeEntries,
        fileList,
        (entry) => handlePreview(entry, loader),
        (path, selected) => {
          if (selected) state.selectedEntries.add(path);
          else state.selectedEntries.delete(path);
          updateToolbarButtons(state);
        }
      );
    }
  } catch (error) {
    console.error('[ArchiveViewer] Failed to parse archive:', error);
    showMessage('Failed to parse archive. The file may be corrupted or password-protected.', {
      type: 'alert',
    });
  } finally {
    hideProgress();
  }
}

function setupEventListeners(state: ViewerState): void {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input') as HTMLInputElement;
  const selectAll = document.getElementById('select-all') as HTMLInputElement;
  const downloadSelected = document.getElementById('btn-download-selected');
  const downloadAll = document.getElementById('btn-download-all');
  const expandAll = document.getElementById('btn-expand-all');
  const collapseAll = document.getElementById('btn-collapse-all');
  const startOver = document.getElementById('btn-start-over');
  const previewClose = document.getElementById('preview-close');

  dropzone?.addEventListener('click', () => fileInput?.click());

  dropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dropzone-active');
  });

  dropzone?.addEventListener('dragleave', () => {
    dropzone.classList.remove('dropzone-active');
  });

  dropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dropzone-active');
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      handleArchiveLoad(files[0], state);
    }
  });

  fileInput?.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length > 0) {
      handleArchiveLoad(fileInput.files[0], state);
    }
  });

  selectAll?.addEventListener('change', () => {
    const checkboxes = document.querySelectorAll('.row-checkbox') as NodeListOf<HTMLInputElement>;
    checkboxes.forEach((cb) => {
      cb.checked = selectAll.checked;
      if (selectAll.checked) {
        const row = cb.closest('.file-row') as HTMLElement;
        if (row) state.selectedEntries.add(row.dataset.path || '');
      } else {
        state.selectedEntries.clear();
      }
    });
    updateToolbarButtons(state);
  });

  downloadSelected?.addEventListener('click', () => handleDownloadSelected(state));
  downloadAll?.addEventListener('click', () => handleDownloadAll(state));
  startOver?.addEventListener('click', () => handleStartOver(state));

  expandAll?.addEventListener('click', () => {
    const containers = document.querySelectorAll('.children-container');
    containers.forEach((c) => c.classList.remove('hidden'));
  });

  collapseAll?.addEventListener('click', () => {
    const containers = document.querySelectorAll('.children-container');
    containers.forEach((c) => c.classList.add('hidden'));
  });

  previewClose?.addEventListener('click', () => {
    const modal = document.getElementById('preview-modal') as HTMLDialogElement;
    modal?.close();
  });
}

export default function init() {
  const state = createState();
  setupEventListeners(state);

  return () => {
    state.loader?.close();
    state.loader = null;
    state.selectedEntries.clear();
  };
}
