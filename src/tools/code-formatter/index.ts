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
  const input = document.getElementById('code-input') as HTMLTextAreaElement;
  const outputContainer = document.getElementById('code-output') as HTMLDivElement;
  const outputCode = document.getElementById('code-output-code') as HTMLElement;
  const formatSelect = document.getElementById('format-select') as HTMLSelectElement;
  const detectedFormatBadge = document.getElementById('detected-format') as HTMLSpanElement;
  const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;
  const fontSizeInput = document.getElementById('export-font-size') as HTMLInputElement;
  const paddingInput = document.getElementById('export-padding') as HTMLInputElement;

  const btnFormat = document.getElementById('btn-format') as HTMLButtonElement;
  const btnMinify = document.getElementById('btn-minify') as HTMLButtonElement;
  const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;
  const btnCopy = document.getElementById('btn-copy') as HTMLButtonElement;
  const btnExportClipboard = document.getElementById('btn-export-clipboard') as HTMLButtonElement;
  const btnExportFile = document.getElementById('btn-export-file') as HTMLButtonElement;

  let currentFormattedCode = '';
  let isProcessing = false;

  const getFormat = (): SupportedFormat => {
    return formatSelect.value as SupportedFormat;
  };

  const getExportOptions = (): ExportOptions => ({
    theme: themeSelect.value as ExportTheme,
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
    // Disable format/minify for plain text
    const isText = format === 'text';
    // Some formats don't support minification
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

    if (btnFormat) btnFormat.disabled = !hasText || isText;
    if (btnMinify) btnMinify.disabled = !hasText || noMinify;
  };

  const clearState = () => {
    input.value = '';
    outputCode.innerHTML = '';
    outputContainer.innerHTML =
      '<pre id="code-output-pre" class=""><code id="code-output-code"></code></pre>';
    currentFormattedCode = '';
    updateDetectedFormatBadge(null);
    updateButtonStates('text');
  };

  const updateHighlightedPreview = async (code: string) => {
    if (!code.trim()) {
      clearState();
      return;
    }

    try {
      const options = getExportOptions();
      let format = getFormat();

      // If auto, detect format for highlighting
      if (format === 'auto') {
        const detected = detectFormat(code);
        format = detected;
        updateDetectedFormatBadge(detected);
      } else {
        updateDetectedFormatBadge(null);
      }

      updateButtonStates(format);

      const html = await generateHighlightedHtml(code, format, options.theme);

      // Extract just the code content and apply to our container
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;
      const pre = tempDiv.querySelector('pre');

      if (pre) {
        // Apply the highlighted content
        outputContainer.innerHTML = '';
        outputContainer.appendChild(pre);
        pre.className = 'h-full overflow-auto rounded-lg';
        pre.style.margin = '0';
        pre.style.height = '100%';
      } else {
        outputCode.innerHTML = html;
      }

      currentFormattedCode = code;
    } catch (e) {
      // Fallback to plain text
      outputCode.textContent = code;
      currentFormattedCode = code;
    }
  };

  const processCode = async (action: 'format' | 'minify') => {
    if (isProcessing) return;

    const val = input.value.trim();
    if (!val) {
      await updateHighlightedPreview('');
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
      await updateHighlightedPreview(result);
    } catch (e: any) {
      showMessage(`${format.toUpperCase()} Error: ${e.message}`, { type: 'alert' });
    } finally {
      isProcessing = false;
    }
  };

  const handleFileUpload = async (files: FileList | File[]) => {
    if (files.length === 0) return;

    const file = files[0];
    try {
      // Check for binary content (null bytes) in the first 8KB
      const buffer = await file.slice(0, 8192).arrayBuffer();
      const view = new Uint8Array(buffer);
      if (view.some((b) => b === 0)) {
        showMessage('Binary file detected. Please upload a text file.', { type: 'warning' });
        return;
      }

      const text = await file.text();
      input.value = text;

      // Try to detect format from extension
      const detectedFormat = detectFormatFromExtension(file.name);
      if (detectedFormat) {
        formatSelect.value = detectedFormat;
        updateButtonStates(detectedFormat);
        updateDetectedFormatBadge(null); // Hide auto badge since we selected a format
      } else {
        formatSelect.value = 'auto';
        // Let auto-detection happen in processCode or updateHighlightedPreview
      }

      // Auto-format on upload
      setTimeout(() => processCode('format'), 0);
    } catch (err) {
      showMessage('Failed to read file', { type: 'alert' });
    }
  };

  // Setup file dropzone
  setupFileDropzone('dropzone', 'file-input', handleFileUpload);

  // Event listeners for format/minify buttons
  btnFormat?.addEventListener('click', () => processCode('format'));
  btnMinify?.addEventListener('click', () => processCode('minify'));

  // Clear button
  btnClear?.addEventListener('click', () => {
    clearState();
  });

  // Copy formatted text to clipboard
  btnCopy?.addEventListener('click', async () => {
    if (!currentFormattedCode) return;
    try {
      await navigator.clipboard.writeText(currentFormattedCode);
      const originalHtml = btnCopy.innerHTML;
      btnCopy.innerHTML = '<i data-lucide="check" class="w-4 h-4 mr-2"></i>Copied!';
      btnCopy.classList.add('btn-success');
      setTimeout(() => {
        btnCopy.innerHTML = originalHtml;
        btnCopy.classList.remove('btn-success');
      }, 2000);
    } catch (err) {
      showMessage('Failed to copy to clipboard', { type: 'alert', timeoutMs: 5000 });
    }
  });

  // Export as image to clipboard
  btnExportClipboard?.addEventListener('click', async () => {
    if (!currentFormattedCode) {
      showMessage('No code to export', { type: 'warning' });
      return;
    }

    try {
      btnExportClipboard.disabled = true;

      let format = getFormat();
      if (format === 'auto') {
        format = detectFormat(currentFormattedCode);
      }

      const canvas = await renderCodeToCanvasSimple(
        currentFormattedCode,
        format,
        getExportOptions()
      );
      await CanvasExporter.copyToClipboard(canvas);

      const originalHtml = btnExportClipboard.innerHTML;
      btnExportClipboard.innerHTML = '<i data-lucide="check" class="w-4 h-4 mr-2"></i>Copied!';
      btnExportClipboard.classList.add('btn-success');
      setTimeout(() => {
        btnExportClipboard.innerHTML = originalHtml;
        btnExportClipboard.classList.remove('btn-success');
        btnExportClipboard.disabled = false;
      }, 2000);
    } catch (err: any) {
      showMessage(`Failed to copy image: ${err.message}`, { type: 'alert' });
      btnExportClipboard.disabled = false;
    }
  });

  // Export as image file download
  btnExportFile?.addEventListener('click', async () => {
    if (!currentFormattedCode) {
      showMessage('No code to export', { type: 'warning' });
      return;
    }

    try {
      btnExportFile.disabled = true;

      let format = getFormat();
      if (format === 'auto') {
        format = detectFormat(currentFormattedCode);
      }

      const canvas = await renderCodeToCanvasSimple(
        currentFormattedCode,
        format,
        getExportOptions()
      );

      const timestamp = new Date().toISOString().slice(0, 10);
      await CanvasExporter.download(canvas, `code-${format}-${timestamp}`, 'png');

      btnExportFile.disabled = false;
    } catch (err: any) {
      showMessage(`Failed to export image: ${err.message}`, { type: 'alert' });
      btnExportFile.disabled = false;
    }
  });

  // Update preview when theme changes
  themeSelect?.addEventListener('change', () => {
    if (currentFormattedCode) {
      updateHighlightedPreview(currentFormattedCode);
    }
  });

  // Update preview when format changes (to re-highlight with correct language)
  formatSelect?.addEventListener('change', () => {
    if (currentFormattedCode) {
      updateHighlightedPreview(currentFormattedCode);
    }
    // Hide badge if user manually selects a format
    if (formatSelect.value !== 'auto') {
      updateDetectedFormatBadge(null);
      updateButtonStates(formatSelect.value as SupportedFormat);
    } else {
      // If switching back to auto, re-detect to set button states
      const detected = detectFormat(currentFormattedCode);
      updateButtonStates(detected);
    }
  });

  // Clear output when input is emptied
  input?.addEventListener('input', () => {
    if (input.value.trim() === '') {
      clearState();
    }
    updateButtonStates('auto');
  });

  // Auto-format on paste
  input?.addEventListener('paste', () => {
    setTimeout(() => processCode('format'), 0);
  });

  // Handle shared content
  if (payload) {
    if (payload.sharedFiles && payload.sharedFiles.length > 0) {
      handleFileUpload(payload.sharedFiles);
    }
  }

  updateButtonStates('text');
}
