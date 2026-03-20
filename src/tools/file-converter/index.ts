import { downloadAsZip, downloadFile, setupFileDropzone } from '../../js/file-utils';
import { hideProgress, showMessage, showProgress } from '../../js/ui';
import { loadSharedFiles } from '../../js/share-target';
import type { SharedFilesPayload } from '../../js/share-target';
import { identifyFileType, isPandocSupportedInput, getFileTypeLabel } from '../../js/magic-bytes';
import { openInTool } from '../../js/tool-chooser';

import { convertBuffer, detectInputFormat } from './lib/converter';

type FileEntry = { data: Uint8Array; name: string; mime?: string };

const FORMAT_LABELS: Record<string, string> = {
  markdown: 'Markdown (.md)',
  html: 'HTML (.html)',
  docx: 'DOCX (.docx)',
  epub: 'EPUB (.epub)',
  plaintext: 'Plain Text (.txt)',
  latex: 'LaTeX (.tex)',
  rst: 'reStructuredText (.rst)',
  odt: 'ODT (.odt)',
};

function getExt(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'HTML';
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'Markdown';
  if (lower.endsWith('.docx')) return 'DOCX';
  if (lower.endsWith('.epub')) return 'EPUB';
  return name.split('.').pop()?.toUpperCase() || 'Unknown';
}

function formatSize(bytes: number): string {
  return `${Math.round(bytes / 1024)} KB`;
}

// noinspection JSUnusedGlobalSymbols
export default async function init(payload?: SharedFilesPayload) {
  const files: File[] = [];
  const outputs: FileEntry[] = [];

  const convertBtn = document.getElementById('fc-convert-btn') as HTMLButtonElement;
  const downloadBtn = document.getElementById('fc-download-btn') as HTMLButtonElement;
  const shareBtn = document.getElementById('fc-share-btn') as HTMLButtonElement;
  const actionButtons = document.getElementById('fc-action-buttons') as HTMLDivElement;
  const formatSel = document.getElementById('fc-target-format') as HTMLSelectElement;

  if (!convertBtn || !formatSel) return;

  let lastConversionKey = '';

  function updateButtonStates() {
    const hasOutputs = outputs.length > 0;
    const hasFiles = files.length > 0;
    const currentKey = getConversionKey();
    const alreadyConverted = hasOutputs && lastConversionKey === currentKey;

    if (!hasFiles) {
      actionButtons.classList.add('hidden');
      return;
    }

    actionButtons.classList.remove('hidden');
    downloadBtn.disabled = !alreadyConverted;
    shareBtn.disabled = !alreadyConverted;
    convertBtn.disabled = alreadyConverted;
  }

  function updateFormatOptions() {
    if (files.length === 0) return;

    const inputFormat = detectInputFormat(files[0].name);
    const options = formatSel.options;

    for (let i = 0; i < options.length; i++) {
      const option = options[i];
      const formatValue = option.value;

      if (formatValue === inputFormat) {
        option.disabled = true;
        option.textContent = `${FORMAT_LABELS[formatValue]} (same as input)`;
      } else {
        option.disabled = false;
        option.textContent = FORMAT_LABELS[formatValue] || formatValue;
      }
    }

    if (formatSel.value === inputFormat) {
      for (let i = 0; i < options.length; i++) {
        if (!options[i].disabled) {
          formatSel.value = options[i].value;
          break;
        }
      }
    }
  }

  function renderFileInfo() {
    const container = document.getElementById('fc-file-info')!;
    const resultContainer = document.getElementById('result-container')!;
    const preview = document.getElementById('fc-preview')!;

    if (files.length === 0) {
      container.classList.add('hidden');
      resultContainer.classList.add('hidden');
      updateButtonStates();
      return;
    }

    container.classList.remove('hidden');
    resultContainer.classList.remove('hidden');
    updateFormatOptions();

    if (files.length === 1) {
      const f = files[0];
      container.innerHTML = `
        <div class="flex items-center gap-2">
          <button class="btn btn-ghost btn-xs fc-remove" data-index="0">×</button>
          <i data-lucide="file-text" class="w-4 h-4"></i>
          <span class="font-medium">${f.name}</span>
          <span class="opacity-60">— ${formatSize(f.size)}</span>
        </div>
      `;
    } else {
      const fileList = files
        .map(
          (f, i) => `
        <div class="flex items-center gap-2 py-1">
          <button class="btn btn-ghost btn-xs fc-remove" data-index="${i}">×</button>
          <span class="truncate flex-1">${f.name}</span>
          <span class="opacity-60 text-sm">${formatSize(f.size)}</span>
        </div>
      `
        )
        .join('');
      container.innerHTML = `
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <i data-lucide="files" class="w-4 h-4"></i>
            <span class="font-medium">${files.length} files selected</span>
          </div>
          <button class="btn btn-ghost btn-xs" id="fc-clear-all">Clear all</button>
        </div>
        <div class="text-sm">${fileList}</div>
      `;
    }

    container.querySelector('#fc-clear-all')?.addEventListener('click', () => {
      files.length = 0;
      outputs.length = 0;
      renderFileInfo();
    });
    container.querySelectorAll('.fc-remove').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt((e.target as HTMLElement).getAttribute('data-index') || '0');
        files.splice(idx, 1);
        outputs.length = 0;
        renderFileInfo();
      });
    });

    const target = formatSel.value;
    preview.classList.remove('hidden');
    document.getElementById('fc-convert-from')!.textContent = getExt(files[0].name);
    document.getElementById('fc-convert-to')!.textContent = FORMAT_LABELS[target] || target;
    updateButtonStates();
  }

  function getConversionKey(): string {
    const fileKeys = files.map((f) => `${f.name}:${f.size}`).join('|');
    return `${fileKeys}->${formatSel.value}`;
  }

  async function doDownload() {
    if (outputs.length === 1) {
      const o = outputs[0];
      await downloadFile(o.data, o.name, o.mime || 'application/octet-stream');
    } else {
      await downloadAsZip(
        outputs.map((o) => ({ data: o.data.buffer, name: o.name })),
        'converted-files.zip'
      );
    }
    showMessage('Download started.', { type: 'info', timeoutMs: 3000 });
  }

  async function doShare() {
    if (outputs.length === 0) return;

    const outputFiles = outputs.map((o) => {
      const mime = o.mime || 'application/octet-stream';
      return new File([o.data.buffer as ArrayBuffer], o.name, { type: mime });
    });

    await openInTool(outputFiles);
  }

  setupFileDropzone('dropzone', 'fc-file-input', (newFiles) => {
    for (const file of newFiles) {
      if (!files.some((f) => f.name === file.name && f.size === file.size)) {
        files.push(file);
      }
    }
    outputs.length = 0;
    renderFileInfo();
  });

  formatSel.addEventListener('change', () => {
    document.getElementById('fc-convert-to')!.textContent =
      FORMAT_LABELS[formatSel.value] || formatSel.value;
    if (outputs.length > 0) {
      outputs.length = 0;
      lastConversionKey = '';
      updateButtonStates();
    }
  });

  downloadBtn.addEventListener('click', async () => {
    if (outputs.length > 0) {
      await doDownload();
    }
  });

  shareBtn.addEventListener('click', async () => {
    if (outputs.length > 0) {
      await doShare();
    }
  });

  if (payload?.sharedFiles?.length) {
    files.push(...payload.sharedFiles);
    renderFileInfo();
  }

  try {
    const shared = await loadSharedFiles([] as unknown as string[]).catch(() => []);
    if (shared?.length && files.length === 0) {
      files.push(...shared);
      renderFileInfo();
    }
  } catch {}

  const SUPPORTED_EXTENSIONS = new Set([
    'html',
    'htm',
    'xhtml',
    'md',
    'markdown',
    'mdown',
    'mkd',
    'mkdn',
    'docx',
    'doc',
    'epub',
    'xml',
    'txt',
    'rtf',
    'odt',
    'latex',
    'tex',
    'rst',
    'org',
    'textile',
    'jira',
    'twiki',
    'creole',
    'docbook',
    'fb2',
    'opml',
    'bib',
    'csljson',
  ]);

  function getExtension(name: string): string {
    return name.split('.').pop()?.toLowerCase() || '';
  }

  const validateFiles = async (): Promise<{
    valid: File[];
    skipped: { file: File; reason: string }[];
  }> => {
    const valid: File[] = [];
    const skipped: { file: File; reason: string }[] = [];

    for (const f of files) {
      const ext = getExtension(f.name);

      if (SUPPORTED_EXTENSIONS.has(ext)) {
        valid.push(f);
        continue;
      }

      const sample = await f.slice(0, 8192).arrayBuffer();
      const detected = identifyFileType(new Uint8Array(sample));

      if (detected) {
        if (isPandocSupportedInput(detected.type)) {
          valid.push(f);
        } else {
          skipped.push({
            file: f,
            reason: getFileTypeLabel(detected.type),
          });
        }
      } else {
        skipped.push({ file: f, reason: 'Unknown file type' });
      }
    }

    return { valid, skipped };
  };

  convertBtn.addEventListener('click', async () => {
    if (!files.length) {
      showMessage('Please upload a file first', { type: 'warning' });
      return;
    }

    const target = formatSel.value;
    convertBtn.disabled = true;

    try {
      showProgress('Validating files…', { visible: true, progress: 0 });
      const { valid, skipped } = await validateFiles();

      if (skipped.length > 0) {
        const skippedList = skipped.map((s) => `${s.file.name} (${s.reason})`).join(', ');
        showMessage(`Skipped: ${skippedList}`, { type: 'warning', timeoutMs: 8000 });
      }

      if (valid.length === 0) {
        showMessage('No supported files to convert', { type: 'alert' });
        return;
      }

      outputs.length = 0;
      lastConversionKey = getConversionKey();
      showProgress('Loading Pandoc…', { visible: true, progress: 0, tooLongMs: 5000 });

      for (let i = 0; i < valid.length; i++) {
        const f = valid[i];
        showProgress(`Converting ${i + 1}/${valid.length}…`, {
          visible: true,
          progress: 0,
          tooLongMs: 10000,
        });
        const buffer = await f.arrayBuffer();
        const result = await convertBuffer(new Uint8Array(buffer), f.name, target);
        outputs.push(result);
      }

      renderFileInfo();
      showMessage('Conversion complete!', { type: 'info', timeoutMs: 3000 });
    } catch (e: unknown) {
      showMessage('Conversion failed: ' + (e instanceof Error ? e.message : String(e)), {
        type: 'alert',
      });
    } finally {
      hideProgress();
    }
  });

  renderFileInfo();
}
