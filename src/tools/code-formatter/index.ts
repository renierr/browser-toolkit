import { showMessage } from '@js/ui.ts';
import {
  formatCode,
  minifyCode,
  detectFormat,
  detectFormatFromExtension,
  type SupportedFormat,
} from './formatters.ts';
import {
  generateHighlightedHtml,
  renderCodeToCanvasSimple,
  type ExportTheme,
  type ExportOptions,
} from './export.ts';
import { setupFileDropzone } from '@js/file-utils.ts';
import type { ToolPayload } from '@js/types';
import { CanvasExporter } from '@js/canvas-utils.ts';

// noinspection JSUnusedGlobalSymbols
export default function init(payload?: ToolPayload) {
  // === Landing ===
  const landingView = document.getElementById('landing-view') as HTMLDivElement;

  // === Viewer ===
  const viewerView = document.getElementById('viewer-view') as HTMLDivElement;
  const viewerOutput = document.getElementById('viewer-output') as HTMLDivElement;
  const viewerOutputCode = document.getElementById('viewer-output-code') as HTMLElement;
  const viewerFilename = document.getElementById('viewer-filename') as HTMLSpanElement;
  const viewerFormatBadge = document.getElementById('viewer-format-badge') as HTMLSpanElement;
  const viewerTheme = document.getElementById('viewer-theme') as HTMLSelectElement;
  const btnSwitchEditor = document.getElementById('btn-switch-editor') as HTMLButtonElement;
  const btnViewerCopy = document.getElementById('btn-viewer-copy') as HTMLButtonElement;
  const btnViewerExportClipboard = document.getElementById(
    'btn-viewer-export-clipboard'
  ) as HTMLButtonElement;
  const btnViewerExportFile = document.getElementById(
    'btn-viewer-export-file'
  ) as HTMLButtonElement;
  const btnCloseViewer = document.getElementById('btn-close-viewer') as HTMLButtonElement;

  const btnOpenEditor = document.getElementById('btn-open-editor') as HTMLButtonElement;

  // === Editor ===
  const editorView = document.getElementById('editor-view') as HTMLDivElement;
  const input = document.getElementById('code-input') as HTMLTextAreaElement;
  const editorOutput = document.getElementById('editor-output') as HTMLDivElement;
  const editorOutputCode = document.getElementById('editor-output-code') as HTMLElement;
  const formatSelect = document.getElementById('format-select') as HTMLSelectElement;
  const detectedFormatBadge = document.getElementById('detected-format') as HTMLSpanElement;
  const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;
  const btnSwitchViewer = document.getElementById('btn-switch-viewer') as HTMLButtonElement;
  const fontSizeInput = document.getElementById('export-font-size') as HTMLInputElement;
  const paddingInput = document.getElementById('export-padding') as HTMLInputElement;

  const btnFormat = document.getElementById('btn-format') as HTMLButtonElement;
  const btnMinify = document.getElementById('btn-minify') as HTMLButtonElement;
  const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;
  const btnCopy = document.getElementById('btn-copy') as HTMLButtonElement;
  const btnExportClipboard = document.getElementById('btn-export-clipboard') as HTMLButtonElement;
  const btnExportFile = document.getElementById('btn-export-file') as HTMLButtonElement;

  // === State ===
  let currentCode = '';
  let currentResolvedFormat: SupportedFormat = 'text';
  let currentFileName = '';
  let currentTheme = 'dracula';
  let isProcessing = false;

  const getFormat = (): SupportedFormat => {
    return formatSelect.value as SupportedFormat;
  };

  const getActiveTheme = (): ExportTheme => currentTheme as ExportTheme;

  const getExportOptions = (): ExportOptions => ({
    theme: getActiveTheme(),
    fontSize: parseInt(fontSizeInput.value) || 14,
    padding: parseInt(paddingInput.value) || 20,
  });

  const updateDetectedFormatBadge = (format: SupportedFormat | null) => {
    if (format && format !== 'auto' && format !== 'text') {
      detectedFormatBadge.textContent = format.toUpperCase();
      detectedFormatBadge.classList.remove('hidden');
    } else {
      detectedFormatBadge.classList.add('hidden');
    }
  };

  const updateButtonStates = (format: SupportedFormat) => {
    const hasText = input.value.trim() !== '';
    const isText = format === 'text';
    const noMinify = [
      'yaml',
      'markdown',
      'mdx',
      'graphql',
      'text',
      'python',
      'ruby',
      'bash',
      'powershell',
      'dockerfile',
      'toml',
      'ini',
    ].includes(format);

    btnFormat.disabled = !hasText || isText;
    btnMinify.disabled = !hasText || noMinify;
  };

  const updateViewerFormatBadge = (format: SupportedFormat) => {
    if (format && format !== 'text') {
      viewerFormatBadge.textContent = format.toUpperCase();
      viewerFormatBadge.classList.remove('hidden');
    } else {
      viewerFormatBadge.classList.add('hidden');
    }
  };

  const resetOutputs = () => {
    viewerOutput.innerHTML =
      '<pre id="viewer-output-pre" class="h-full m-0"><code id="viewer-output-code"></code></pre>';
    editorOutput.innerHTML =
      '<pre id="editor-output-pre" class="h-full m-0"><code id="editor-output-code"></code></pre>';
  };

  const applyHighlightedHtml = (html: string, container: HTMLElement, fallbackEl: HTMLElement) => {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    const pre = tempDiv.querySelector('pre');
    if (pre) {
      container.innerHTML = '';
      container.appendChild(pre);
    } else {
      fallbackEl.textContent = currentCode;
    }
  };

  const render = async (code: string) => {
    if (!code.trim()) {
      resetOutputs();
      currentCode = '';
      return;
    }

    const theme = getActiveTheme();
    let format = getFormat();
    if (format === 'auto') {
      format = detectFormat(code);
    }

    currentResolvedFormat = format;

    try {
      const html = await generateHighlightedHtml(code, format, theme);
      applyHighlightedHtml(html, viewerOutput, viewerOutputCode);
      applyHighlightedHtml(html, editorOutput, editorOutputCode);
      currentCode = code;
    } catch (e) {
      viewerOutputCode.textContent = code;
      editorOutputCode.textContent = code;
      currentCode = code;
    }

    updateViewerFormatBadge(format);
    updateDetectedFormatBadge(format);
  };

  // === Mode switching ===

  const showLanding = () => {
    viewerView.classList.add('hidden');
    editorView.classList.add('hidden');
    landingView.classList.remove('hidden');
  };

  const switchToViewer = () => {
    if (editorView.classList.contains('hidden') === false) {
      currentCode = input.value || currentCode;
    }
    render(currentCode);

    viewerFilename.textContent = currentFileName;
    viewerFilename.classList.toggle('hidden', !currentFileName);

    landingView.classList.add('hidden');
    editorView.classList.add('hidden');
    viewerView.classList.remove('hidden');
  };

  const switchToEditor = () => {
    input.value = currentCode;
    updateButtonStates(currentResolvedFormat);

    landingView.classList.add('hidden');
    viewerView.classList.add('hidden');
    editorView.classList.remove('hidden');
  };

  // === File handling ===

  const clearAll = () => {
    currentCode = '';
    currentFileName = '';
    currentResolvedFormat = 'text';
    input.value = '';
    resetOutputs();
    viewerFilename.classList.add('hidden');
    viewerFormatBadge.classList.add('hidden');
    updateDetectedFormatBadge(null);
    formatSelect.value = 'auto';
    updateButtonStates('text');
    showLanding();
  };

  const handleFileUpload = async (files: FileList | File[]) => {
    if (files.length === 0) return;

    const file = files[0];
    try {
      const buffer = await file.slice(0, 8192).arrayBuffer();
      const view = new Uint8Array(buffer);
      if (view.some((b) => b === 0)) {
        showMessage('Binary file detected. Please upload a text file.', { type: 'warning' });
        return;
      }

      const text = await file.text();
      currentCode = text;
      currentFileName = file.name;

      const detectedFormat = detectFormatFromExtension(file.name);
      if (detectedFormat) {
        formatSelect.value = detectedFormat;
        updateButtonStates(detectedFormat);
      } else {
        formatSelect.value = 'auto';
      }

      await render(text);
      switchToViewer();
    } catch (err) {
      showMessage('Failed to read file', { type: 'alert' });
    }
  };

  // === Processing ===

  const processCode = async (action: 'format' | 'minify') => {
    if (isProcessing) return;

    const val = input.value.trim();
    if (!val) {
      await render('');
      return;
    }

    isProcessing = true;
    let format = getFormat();

    try {
      let result: string;
      if (action === 'format') {
        result = await formatCode(val, format);
      } else {
        result = minifyCode(val, format);
      }

      input.value = result;
      await render(result);
    } catch (e: any) {
      showMessage(`${format.toUpperCase()} Error: ${e.message}`, { type: 'alert' });
    } finally {
      isProcessing = false;
    }
  };

  // === Helpers for copy/export ===

  const flashButton = (btn: HTMLButtonElement, html: string, successClass: string) => {
    const original = btn.innerHTML;
    btn.innerHTML = html;
    btn.classList.add(successClass);
    setTimeout(() => {
      btn.innerHTML = original;
      btn.classList.remove(successClass);
    }, 2000);
  };

  const handleCopy = async (btn: HTMLButtonElement) => {
    if (!currentCode) return;
    try {
      await navigator.clipboard.writeText(currentCode);
      flashButton(btn, '<i data-lucide="check" class="w-4 h-4 mr-2"></i>Copied!', 'btn-success');
    } catch (err) {
      showMessage('Failed to copy to clipboard', { type: 'alert', timeoutMs: 5000 });
    }
  };

  const handleExportClipboard = async (btn: HTMLButtonElement) => {
    if (!currentCode) {
      showMessage('No code to export', { type: 'warning' });
      return;
    }

    try {
      btn.disabled = true;
      const canvas = await renderCodeToCanvasSimple(
        currentCode,
        currentResolvedFormat,
        getExportOptions()
      );
      await CanvasExporter.copyToClipboard(canvas);
      flashButton(btn, '<i data-lucide="check" class="w-4 h-4 mr-2"></i>Copied!', 'btn-success');
      btn.disabled = false;
    } catch (err: any) {
      showMessage(`Failed to copy image: ${err.message}`, { type: 'alert' });
      btn.disabled = false;
    }
  };

  const handleExportFile = async (btn: HTMLButtonElement) => {
    if (!currentCode) {
      showMessage('No code to export', { type: 'warning' });
      return;
    }

    try {
      btn.disabled = true;
      const canvas = await renderCodeToCanvasSimple(
        currentCode,
        currentResolvedFormat,
        getExportOptions()
      );
      const timestamp = new Date().toISOString().slice(0, 10);
      await CanvasExporter.download(canvas, `code-${currentResolvedFormat}-${timestamp}`, 'png');
      btn.disabled = false;
    } catch (err: any) {
      showMessage(`Failed to export image: ${err.message}`, { type: 'alert' });
      btn.disabled = false;
    }
  };

  // === Setup ===

  setupFileDropzone('dropzone', 'file-input', handleFileUpload);

  btnOpenEditor?.addEventListener('click', () => {
    currentCode = '';
    currentFileName = '';
    formatSelect.value = 'auto';
    input.value = '';
    resetOutputs();
    updateButtonStates('text');
    switchToEditor();
    input.focus();
  });

  // --- Viewer listeners ---

  btnSwitchEditor?.addEventListener('click', switchToEditor);
  btnCloseViewer?.addEventListener('click', clearAll);
  btnViewerCopy?.addEventListener('click', () => handleCopy(btnViewerCopy));
  btnViewerExportClipboard?.addEventListener('click', () =>
    handleExportClipboard(btnViewerExportClipboard)
  );
  btnViewerExportFile?.addEventListener('click', () => handleExportFile(btnViewerExportFile));

  viewerTheme?.addEventListener('change', () => {
    currentTheme = viewerTheme.value;
    themeSelect.value = currentTheme;
    if (currentCode) render(currentCode);
  });

  // --- Editor listeners ---

  btnSwitchViewer?.addEventListener('click', switchToViewer);

  themeSelect?.addEventListener('change', () => {
    currentTheme = themeSelect.value;
    viewerTheme.value = currentTheme;
    if (currentCode) render(currentCode);
  });

  formatSelect?.addEventListener('change', () => {
    if (currentCode) render(currentCode);
    if (formatSelect.value !== 'auto') {
      updateDetectedFormatBadge(null);
      updateButtonStates(formatSelect.value as SupportedFormat);
    } else {
      const detected = detectFormat(currentCode);
      updateButtonStates(detected);
    }
  });

  btnFormat?.addEventListener('click', () => processCode('format'));
  btnMinify?.addEventListener('click', () => processCode('minify'));
  btnClear?.addEventListener('click', clearAll);

  btnCopy?.addEventListener('click', () => handleCopy(btnCopy));

  btnExportClipboard?.addEventListener('click', () => handleExportClipboard(btnExportClipboard));
  btnExportFile?.addEventListener('click', () => handleExportFile(btnExportFile));

  input?.addEventListener('input', () => {
    if (input.value.trim() === '') {
      resetOutputs();
      currentCode = '';
    }
    updateButtonStates('auto');
  });

  input?.addEventListener('paste', () => {
    setTimeout(() => processCode('format'), 0);
  });

  // === Share target ===

  if (payload) {
    if (payload.sharedFiles && payload.sharedFiles.length > 0) {
      handleFileUpload(payload.sharedFiles);
    }
  }

  updateButtonStates('text');
}
