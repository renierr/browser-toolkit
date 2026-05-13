import { downloadFile, retrieveImageBlobFromClipboard, setupFileDropzone } from '@js/file-utils.ts';
import type { SharedFilesPayload } from '@js/share-target';
import { showMessage } from '@js/ui.ts';
import { ASCII_PRESETS, resolveCharset } from './ascii-mapper.ts';
import { convertImageToAscii } from './image-to-ascii.ts';
import type { AsciiOptions, AsciiPreset } from './types.ts';

const DEFAULT_OUTPUT = 'ASCII art will appear here.';

function clampWidth(value: number): number {
  if (!Number.isFinite(value)) return 120;
  if (value < 20) return 20;
  if (value > 300) return 300;
  return Math.floor(value);
}

// noinspection JSUnusedGlobalSymbols
export default function init(payload?: SharedFilesPayload): void | (() => void) {
  const container = document.getElementById('ascii-converter-container');
  const imageInput = document.getElementById('image-input') as HTMLInputElement | null;
  const pasteBtn = document.getElementById('paste-btn') as HTMLButtonElement | null;
  const widthInput = document.getElementById('ascii-width') as HTMLInputElement | null;
  const presetSelect = document.getElementById('charset-preset') as HTMLSelectElement | null;
  const customCharsetInput = document.getElementById('custom-charset') as HTMLInputElement | null;
  const invertCheckbox = document.getElementById('invert-map') as HTMLInputElement | null;
  const output = document.getElementById('ascii-output') as HTMLPreElement | null;
  const status = document.getElementById('status') as HTMLDivElement | null;
  const copyBtn = document.getElementById('copy-btn') as HTMLButtonElement | null;
  const downloadBtn = document.getElementById('download-btn') as HTMLButtonElement | null;

  if (
    !container ||
    !imageInput ||
    !pasteBtn ||
    !widthInput ||
    !presetSelect ||
    !customCharsetInput ||
    !invertCheckbox ||
    !output ||
    !status ||
    !copyBtn ||
    !downloadBtn
  ) {
    console.error('[AsciiConverter] Missing required DOM elements');
    return;
  }

  let currentImage: File | null = null;
  let currentAscii = '';

  output.textContent = DEFAULT_OUTPUT;

  const setResult = (text: string) => {
    currentAscii = text;
    output.textContent = text.length > 0 ? text : DEFAULT_OUTPUT;
    copyBtn.disabled = text.length === 0;
    downloadBtn.disabled = text.length === 0;
  };

  const getOptions = (): AsciiOptions => {
    const width = clampWidth(Number(widthInput.value));
    widthInput.value = String(width);
    const preset = presetSelect.value as AsciiPreset;
    const presetCharset = ASCII_PRESETS[preset] ?? ASCII_PRESETS.classic;
    const charset = resolveCharset(customCharsetInput.value, presetCharset);
    const invert = invertCheckbox.checked;
    return { width, charset, invert };
  };

  const renderCurrentImage = async (): Promise<void> => {
    if (!currentImage) {
      setResult('');
      status.textContent = 'Upload or paste an image to begin.';
      return;
    }

    try {
      status.textContent = 'Converting image...';
      const options = getOptions();
      const result = await convertImageToAscii(currentImage, options);
      setResult(result.text);
      status.textContent = `${currentImage.name} | ${result.sourceWidth}x${result.sourceHeight} -> ${result.outputWidth}x${result.outputHeight}`;
    } catch (error) {
      console.error('[AsciiConverter] Failed to convert image:', error);
      setResult('');
      status.textContent = 'Failed to convert image.';
      showMessage('Failed to convert image to ASCII.', { type: 'alert' });
    }
  };

  const handleIncomingFiles = async (files: FileList | File[]): Promise<void> => {
    if (!files.length) return;
    const first = files[0];
    if (!first.type.startsWith('image/')) {
      showMessage('Please provide an image file.', { type: 'warning' });
      return;
    }
    currentImage = first;
    await renderCurrentImage();
  };

  const onPasteClick = async (event: Event): Promise<void> => {
    event.preventDefault();
    event.stopPropagation();
    try {
      const blob = await retrieveImageBlobFromClipboard();
      if (!blob) {
        showMessage('No image found in clipboard.', { type: 'info' });
        return;
      }
      const file = new File([blob], `pasted-image-${Date.now()}.png`, { type: blob.type });
      await handleIncomingFiles([file]);
    } catch (error) {
      console.error('[AsciiConverter] Failed to read clipboard image:', error);
      showMessage('Failed to read image from clipboard.', { type: 'alert' });
    }
  };

  const onControlChange = () => {
    void renderCurrentImage();
  };

  const onCopy = async () => {
    if (!currentAscii) return;
    if (!navigator.clipboard) {
      showMessage('Clipboard API not available.', { type: 'warning' });
      return;
    }
    try {
      await navigator.clipboard.writeText(currentAscii);
      showMessage('ASCII copied to clipboard.', { timeoutMs: 2000 });
    } catch (error) {
      console.error('[AsciiConverter] Copy failed:', error);
      showMessage('Failed to copy ASCII output.', { type: 'alert' });
    }
  };

  const onDownload = async () => {
    if (!currentAscii) return;
    const blob = new Blob([currentAscii], { type: 'text/plain;charset=utf-8' });
    await downloadFile(blob, 'ascii-art.txt');
  };

  setupFileDropzone('dropzone', 'image-input', (files) => {
    void handleIncomingFiles(files);
  });

  pasteBtn.addEventListener('click', onPasteClick);
  widthInput.addEventListener('change', onControlChange);
  presetSelect.addEventListener('change', onControlChange);
  customCharsetInput.addEventListener('input', onControlChange);
  invertCheckbox.addEventListener('change', onControlChange);
  copyBtn.addEventListener('click', onCopy);
  downloadBtn.addEventListener('click', onDownload);

  if (payload?.sharedFiles?.length) {
    void handleIncomingFiles(payload.sharedFiles);
  }

  return () => {
    pasteBtn.removeEventListener('click', onPasteClick);
    widthInput.removeEventListener('change', onControlChange);
    presetSelect.removeEventListener('change', onControlChange);
    customCharsetInput.removeEventListener('input', onControlChange);
    invertCheckbox.removeEventListener('change', onControlChange);
    copyBtn.removeEventListener('click', onCopy);
    downloadBtn.removeEventListener('click', onDownload);
  };
}
