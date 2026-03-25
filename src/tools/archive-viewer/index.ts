import { showMessage } from '../../js/ui';
import { downloadFile, downloadAsZip } from '../../js/file-utils';
import { loadArchive, type ParsedArchive, type ArchiveEntry } from './archive-parser';
import { renderEntries, formatSize } from './file-tree';

let currentArchive: ParsedArchive | null = null;
let selectedEntries: Set<string> = new Set();

function updateToolbarButtons(): void {
  const downloadBtn = document.getElementById('btn-download-selected') as HTMLButtonElement;
  if (downloadBtn) {
    downloadBtn.disabled = selectedEntries.size === 0;
  }

  const selectAll = document.getElementById('select-all') as HTMLInputElement;
  const checkboxes = document.querySelectorAll('.row-checkbox') as NodeListOf<HTMLInputElement>;
  if (selectAll) {
    selectAll.checked = checkboxes.length > 0 && Array.from(checkboxes).every((cb) => cb.checked);
  }
}

function showPreview(entry: ArchiveEntry): void {
  const modal = document.getElementById('preview-modal') as HTMLDialogElement;
  const filenameEl = document.getElementById('preview-filename');
  const infoEl = document.getElementById('preview-info');
  const contentEl = document.getElementById('preview-content');
  const downloadBtn = document.getElementById('preview-download') as HTMLButtonElement;

  if (filenameEl) filenameEl.textContent = entry.name;
  if (infoEl) {
    infoEl.textContent = `Size: ${formatSize(entry.size)} | Type: ${entry.name.split('.').pop()?.toUpperCase() || 'file'}`;
  }

  if (entry.rawData) {
    const text = new TextDecoder().decode(entry.rawData);
    if (contentEl) {
      contentEl.textContent = text.slice(0, 10000);
      if (text.length > 10000) contentEl.textContent += '\n\n... (truncated)';
    }
  }

  downloadBtn.onclick = () => {
    if (entry.rawData) downloadFile(entry.rawData, entry.name);
  };

  modal?.showModal();
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

async function handleDownloadSelected(): Promise<void> {
  if (!currentArchive || selectedEntries.size === 0) return;

  const filesToDownload: { data: ArrayBuffer; name: string }[] = [];

  for (const path of selectedEntries) {
    const entry = findEntry(currentArchive.entries, path);
    if (entry && entry.rawData) {
      filesToDownload.push({ data: entry.rawData.buffer as ArrayBuffer, name: entry.name });
    }
  }

  if (filesToDownload.length === 1) {
    const f = filesToDownload[0];
    downloadFile(new Uint8Array(f.data), f.name);
  } else if (filesToDownload.length > 1) {
    await downloadAsZip(filesToDownload, 'extracted-files.zip');
  }
}

async function handleDownloadAll(): Promise<void> {
  if (!currentArchive) return;

  const files: { data: ArrayBuffer; name: string }[] = [];

  const collectFiles = (entries: ArchiveEntry[]) => {
    for (const entry of entries) {
      if (!entry.isDirectory && entry.rawData) {
        files.push({ data: entry.rawData.buffer as ArrayBuffer, name: entry.name });
      }
      if (entry.children) collectFiles(entry.children);
    }
  };

  collectFiles(currentArchive.entries);

  if (files.length > 0) {
    await downloadAsZip(files, currentArchive.filename.replace(/\.[^.]+$/, '') + '-extracted.zip');
  }
}

async function handleArchiveLoad(file: File): Promise<void> {
  const loading = document.getElementById('loading-overlay');
  loading?.classList.remove('hidden');

  try {
    const archive = await loadArchive(file);
    currentArchive = archive;
    selectedEntries.clear();

    const infoEl = document.getElementById('archive-info');
    const filenameEl = document.getElementById('info-filename');
    const formatEl = document.getElementById('info-format');
    const countEl = document.getElementById('info-count');
    const sizeEl = document.getElementById('info-size');
    const contentArea = document.getElementById('content-area');
    const fileList = document.getElementById('file-list');

    if (infoEl) infoEl.classList.remove('hidden');
    if (filenameEl) filenameEl.textContent = archive.filename;
    if (formatEl) formatEl.textContent = archive.format;
    if (countEl) countEl.textContent = String(archive.entries.length);
    if (sizeEl) sizeEl.textContent = formatSize(archive.totalSize);
    if (contentArea) contentArea.classList.remove('hidden');
    if (fileList) {
      fileList.innerHTML = '';
      renderEntries(archive.entries, fileList, showPreview, (path, selected) => {
        if (selected) selectedEntries.add(path);
        else selectedEntries.delete(path);
        updateToolbarButtons();
      });
    }
  } catch (error) {
    console.error('[ArchiveViewer] Failed to parse archive:', error);
    showMessage('Failed to parse archive. The file may be corrupted or password-protected.', {
      type: 'alert',
    });
  } finally {
    loading?.classList.add('hidden');
  }
}

function setupEventListeners(): void {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input') as HTMLInputElement;
  const selectAll = document.getElementById('select-all') as HTMLInputElement;
  const downloadSelected = document.getElementById('btn-download-selected');
  const downloadAll = document.getElementById('btn-download-all');
  const expandAll = document.getElementById('btn-expand-all');
  const collapseAll = document.getElementById('btn-collapse-all');
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
      handleArchiveLoad(files[0]);
    }
  });

  fileInput?.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length > 0) {
      handleArchiveLoad(fileInput.files[0]);
    }
  });

  selectAll?.addEventListener('change', () => {
    const checkboxes = document.querySelectorAll('.row-checkbox') as NodeListOf<HTMLInputElement>;
    checkboxes.forEach((cb) => {
      cb.checked = selectAll.checked;
      if (selectAll.checked) {
        const row = cb.closest('.file-row') as HTMLElement;
        if (row) selectedEntries.add(row.dataset.path || '');
      } else {
        selectedEntries.clear();
      }
    });
    updateToolbarButtons();
  });

  downloadSelected?.addEventListener('click', handleDownloadSelected);
  downloadAll?.addEventListener('click', handleDownloadAll);

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
  setupEventListeners();

  return () => {
    currentArchive = null;
    selectedEntries.clear();
  };
}
