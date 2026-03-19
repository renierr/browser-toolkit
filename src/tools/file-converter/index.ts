import { downloadAsZip, downloadFile, setupFileDropzone } from '../../js/file-utils';
import { hideProgress, showMessage, showProgress } from '../../js/ui';
import type { SharedFilesPayload } from '../../js/share-target';
import { loadSharedFiles } from '../../js/share-target';

import { convertBuffer } from './lib/converter';

let currentFiles: File[] = [];
let currentOutputs: { data: Uint8Array; name: string; mime?: string }[] = [];
let currentTarget = 'markdown';

const formatLabels: Record<string, string> = {
  markdown: 'Markdown (.md)',
  html: 'HTML (.html)',
  docx: 'DOCX (.docx)',
  epub: 'EPUB (.epub)',
};

function getFileExtension(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'HTML';
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'Markdown';
  if (lower.endsWith('.docx')) return 'DOCX';
  if (lower.endsWith('.epub')) return 'EPUB';
  return name.split('.').pop()?.toUpperCase() || 'Unknown';
}

function updateUI() {
  const resultContainer = document.getElementById('result-container');
  const fileInfo = document.getElementById('fc-file-info');
  const preview = document.getElementById('fc-preview');
  const convertFrom = document.getElementById('fc-convert-from');
  const convertTo = document.getElementById('fc-convert-to');
  const downloadBtn = document.getElementById('fc-download-btn') as HTMLButtonElement | null;
  const formatSel = document.getElementById('fc-target-format') as HTMLSelectElement | null;

  if (
    !resultContainer ||
    !fileInfo ||
    !preview ||
    !convertFrom ||
    !convertTo ||
    !downloadBtn ||
    !formatSel
  )
    return;

  if (currentFiles.length === 0) {
    resultContainer.classList.add('hidden');
    fileInfo.classList.add('hidden');
    downloadBtn.disabled = true;
    return;
  }

  resultContainer.classList.remove('hidden');
  fileInfo.classList.remove('hidden');

  if (currentFiles.length === 1) {
    const file = currentFiles[0];
    fileInfo.innerHTML = `
      <div class="flex items-center gap-2">
        <i data-lucide="file-text" class="w-4 h-4"></i>
        <span class="font-medium">${file.name}</span>
        <span class="opacity-60">— ${Math.round(file.size / 1024)} KB</span>
      </div>
    `;
  } else {
    fileInfo.innerHTML = `
      <div class="flex items-center gap-2">
        <i data-lucide="files" class="w-4 h-4"></i>
        <span class="font-medium">${currentFiles.length} files selected</span>
      </div>
    `;
  }

  currentTarget = formatSel.value;

  convertFrom.textContent = getFileExtension(currentFiles[0].name);
  convertTo.textContent = formatLabels[currentTarget] || currentTarget;
  preview.classList.remove('hidden');

  downloadBtn.disabled = currentOutputs.length === 0;
}

// noinspection JSUnusedGlobalSymbols
export default async function init(payload?: SharedFilesPayload) {
  const dropzone = document.getElementById('dropzone');
  const input = document.getElementById('fc-file-input') as HTMLInputElement | null;
  const formatSel = document.getElementById('fc-target-format') as HTMLSelectElement | null;
  const downloadBtn = document.getElementById('fc-download-btn') as HTMLButtonElement | null;

  if (!dropzone || !input || !formatSel || !downloadBtn) return;

  setupFileDropzone('dropzone', 'fc-file-input', (files) => {
    currentFiles = Array.from(files);
    currentOutputs = [];
    updateUI();
  });

  formatSel.addEventListener('change', () => {
    currentTarget = formatSel.value;
    const convertTo = document.getElementById('fc-convert-to');
    if (convertTo) convertTo.textContent = formatLabels[currentTarget] || currentTarget;
  });

  if (payload?.sharedFiles?.length) {
    currentFiles = payload.sharedFiles.slice();
    updateUI();
  }

  try {
    const shared = await loadSharedFiles([] as any).catch(() => []);
    if (shared?.length && currentFiles.length === 0) {
      currentFiles = shared.slice();
      updateUI();
    }
  } catch {}

  downloadBtn.addEventListener('click', async () => {
    if (!currentOutputs.length) return;
    downloadBtn.disabled = true;

    try {
      if (currentOutputs.length === 1) {
        const o = currentOutputs[0];
        await downloadFile(o.data, o.name, o.mime || 'application/octet-stream');
        showMessage('File downloaded.', { type: 'info', timeoutMs: 3000 });
      } else {
        const files = currentOutputs.map((o) => ({ data: o.data.buffer, name: o.name }));
        await downloadAsZip(files, 'converted-files.zip');
        showMessage(`${currentOutputs.length} files downloaded.`, {
          type: 'info',
          timeoutMs: 3000,
        });
      }
    } finally {
      downloadBtn.disabled = false;
    }
  });

  const convertBtn = document.createElement('button');
  convertBtn.id = 'fc-convert-btn';
  convertBtn.className = 'btn btn-primary';
  convertBtn.innerHTML = '<i data-lucide="refresh-cw" class="w-4 h-4 mr-2"></i> Convert';

  const actionsDiv = downloadBtn.parentElement;
  if (actionsDiv) {
    actionsDiv.insertBefore(convertBtn, downloadBtn);
  }

  convertBtn.addEventListener('click', async () => {
    if (!currentFiles.length) {
      showMessage('Please upload a file first', { type: 'warning' });
      return;
    }

    const target = formatSel.value;
    convertBtn.disabled = true;

    try {
      showProgress('Loading Pandoc…', { visible: true, progress: 0, tooLongMs: 5000 });
      currentOutputs = [];

      for (let i = 0; i < currentFiles.length; i++) {
        const f = currentFiles[i];
        showProgress(`Converting ${i + 1}/${currentFiles.length}…`, {
          visible: true,
          progress: 0,
          tooLongMs: 10000,
        });

        const arrayBuffer = await f.arrayBuffer();
        const result = await convertBuffer(
          new Uint8Array(arrayBuffer),
          f.name,
          target,
          (progress) => {
            showProgress(`Converting ${i + 1}/${currentFiles.length}…`, {
              visible: true,
              progress,
              tooLongMs: 10000,
            });
          }
        );
        currentOutputs.push(result);
      }

      updateUI();
      showMessage('Conversion complete!', { type: 'info', timeoutMs: 3000 });
    } catch (e: any) {
      console.error('Conversion error:', e);
      showMessage('Conversion failed: ' + (e?.message || String(e)), { type: 'alert' });
    } finally {
      convertBtn.disabled = false;
      hideProgress();
    }
  });

  if ((window as any).lucide) updateUI();

  return () => {};
}
