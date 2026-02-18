import { showMessage } from '../../js/ui.ts';
import { formatCode, minifyCode, detectFormat, type SupportedFormat } from './formatters.ts';
import {
  generateHighlightedHtml,
  renderCodeToCanvasSimple,
  type ExportTheme,
  type ExportOptions,
} from './export.ts';
import { copyCanvasToClipboard, downloadCanvasAsImage } from '../../js/utils.ts';

// noinspection JSUnusedGlobalSymbols
export default function init() {
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

  const updateHighlightedPreview = async (code: string) => {
    if (!code.trim()) {
      outputCode.innerHTML = '';
      currentFormattedCode = '';
      updateDetectedFormatBadge(null);
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

      const html = await generateHighlightedHtml(code, format, options.theme);

      // Extract just the code content and apply to our container
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;
      const pre = tempDiv.querySelector('pre');

      if (pre) {
        // Apply the highlighted content
        outputContainer.innerHTML = '';
        outputContainer.appendChild(pre);
        pre.className = 'whitespace-pre-wrap break-words h-full overflow-auto rounded-lg';
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

  // Event listeners for format/minify buttons
  btnFormat?.addEventListener('click', () => processCode('format'));
  btnMinify?.addEventListener('click', () => processCode('minify'));

  // Clear button
  btnClear?.addEventListener('click', () => {
    input.value = '';
    outputCode.innerHTML = '';
    outputContainer.innerHTML = '<pre id="code-output-pre" class="whitespace-pre-wrap wrap-break-word"><code id="code-output-code"></code></pre>';
    currentFormattedCode = '';
    updateDetectedFormatBadge(null);
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
      await copyCanvasToClipboard(canvas);

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
      await downloadCanvasAsImage(canvas, `code-${format}-${timestamp}`, 'png');

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
    }
  });

  // Clear output when input is emptied
  input?.addEventListener('input', () => {
    if (input.value.trim() === '') {
      outputCode.innerHTML = '';
      outputContainer.innerHTML = '<pre id="code-output-pre" class="whitespace-pre-wrap wrap-break-word"><code id="code-output-code"></code></pre>';
      currentFormattedCode = '';
      updateDetectedFormatBadge(null);
    }
  });

  // Auto-format on paste
  input?.addEventListener('paste', () => {
    setTimeout(() => processCode('format'), 0);
  });
}
