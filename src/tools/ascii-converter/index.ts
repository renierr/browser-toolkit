import { downloadFile, retrieveImageBlobFromClipboard, setupFileDropzone } from '@js/file-utils.ts';
import type { ToolPayload } from '@js/types';
import { showMessage } from '@js/ui.ts';
import { debounce } from '@js/utils.ts';
import { ASCII_PRESETS, resolveCharset } from './ascii-mapper.ts';
import { convertImageToAscii } from './image-to-ascii.ts';
import type { AsciiOptions, AsciiPresetId } from './types.ts';

const DEFAULT_OUTPUT = 'ASCII art will appear here.';

function clampWidth(value: number): number {
  if (!Number.isFinite(value)) return 120;
  if (value < 20) return 20;
  if (value > 300) return 300;
  return Math.floor(value);
}

// noinspection JSUnusedGlobalSymbols
export default function init(payload?: ToolPayload): void | (() => void) {
  const container = document.getElementById('ascii-converter-container');
  const imageInput = document.getElementById('image-input') as HTMLInputElement | null;
  const pasteBtn = document.getElementById('paste-btn') as HTMLButtonElement | null;
  const widthInput = document.getElementById('ascii-width') as HTMLInputElement | null;
  const presetSelect = document.getElementById('charset-preset') as HTMLSelectElement | null;
  const customCharsetInput = document.getElementById('custom-charset') as HTMLInputElement | null;
  const invertCheckbox = document.getElementById('invert-map') as HTMLInputElement | null;
  const gammaRange = document.getElementById('gamma-range') as HTMLInputElement | null;
  const contrastRange = document.getElementById('contrast-range') as HTMLInputElement | null;
  const brightnessRange = document.getElementById('brightness-range') as HTMLInputElement | null;
  const edgeRange = document.getElementById('edge-range') as HTMLInputElement | null;
  const aspectRange = document.getElementById('aspect-range') as HTMLInputElement | null;
  const autoContrastCheckbox = document.getElementById('auto-contrast') as HTMLInputElement | null;
  const ditherCheckbox = document.getElementById('dither-map') as HTMLInputElement | null;
  const gammaValue = document.getElementById('gamma-value') as HTMLSpanElement | null;
  const contrastValue = document.getElementById('contrast-value') as HTMLSpanElement | null;
  const brightnessValue = document.getElementById('brightness-value') as HTMLSpanElement | null;
  const edgeValue = document.getElementById('edge-value') as HTMLSpanElement | null;
  const aspectValue = document.getElementById('aspect-value') as HTMLSpanElement | null;
  const resetOptionsBtn = document.getElementById('reset-options-btn') as HTMLButtonElement | null;
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
    !gammaRange ||
    !contrastRange ||
    !brightnessRange ||
    !edgeRange ||
    !aspectRange ||
    !autoContrastCheckbox ||
    !ditherCheckbox ||
    !gammaValue ||
    !contrastValue ||
    !brightnessValue ||
    !edgeValue ||
    !aspectValue ||
    !resetOptionsBtn ||
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

  const persistControl = (element: HTMLElement): void => {
    element.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const formatNum = (value: number): string => value.toFixed(2);

  const syncSliderLabels = (): void => {
    gammaValue.textContent = formatNum(Number(gammaRange.value));
    contrastValue.textContent = formatNum(Number(contrastRange.value));
    brightnessValue.textContent = formatNum(Number(brightnessRange.value));
    edgeValue.textContent = formatNum(Number(edgeRange.value));
    aspectValue.textContent = formatNum(Number(aspectRange.value));
  };

  const applyPreset = (presetId: AsciiPresetId): void => {
    const preset = ASCII_PRESETS[presetId] ?? ASCII_PRESETS['photo-soft'];
    customCharsetInput.placeholder = `Preset: ${preset.charset}`;
    gammaRange.value = String(preset.gamma);
    contrastRange.value = String(preset.contrast);
    brightnessRange.value = String(preset.brightness);
    edgeRange.value = String(preset.edgeWeight);
    aspectRange.value = String(preset.fontAspect);
    ditherCheckbox.checked = preset.useDithering;
    autoContrastCheckbox.checked = preset.autoContrast;
    syncSliderLabels();
  };

  const updatePresetHint = (): void => {
    const preset =
      ASCII_PRESETS[presetSelect.value as AsciiPresetId] ?? ASCII_PRESETS['photo-soft'];
    customCharsetInput.placeholder = `Preset: ${preset.charset}`;
  };

  updatePresetHint();
  syncSliderLabels();

  const setResult = (text: string) => {
    currentAscii = text;
    output.textContent = text.length > 0 ? text : DEFAULT_OUTPUT;
    copyBtn.disabled = text.length === 0;
    downloadBtn.disabled = text.length === 0;
  };

  const getOptions = (): AsciiOptions => {
    const width = clampWidth(Number(widthInput.value));
    widthInput.value = String(width);
    const preset = presetSelect.value as AsciiPresetId;
    const presetConfig = ASCII_PRESETS[preset] ?? ASCII_PRESETS['photo-soft'];
    const presetCharset = presetConfig.charset;
    const charset = resolveCharset(customCharsetInput.value, presetCharset);
    const invert = invertCheckbox.checked;
    return {
      width,
      charset,
      invert,
      gamma: Number(gammaRange.value),
      contrast: Number(contrastRange.value),
      brightness: Number(brightnessRange.value),
      edgeWeight: Number(edgeRange.value),
      fontAspect: Number(aspectRange.value),
      useDithering: ditherCheckbox.checked,
      autoContrast: autoContrastCheckbox.checked,
    };
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
    syncSliderLabels();
    void renderCurrentImage();
  };

  const onControlInput = debounce(() => {
    syncSliderLabels();
    void renderCurrentImage();
  }, 80);

  const onPresetChange = (): void => {
    applyPreset(presetSelect.value as AsciiPresetId);
    updatePresetHint();
    persistControl(gammaRange);
    persistControl(contrastRange);
    persistControl(brightnessRange);
    persistControl(edgeRange);
    persistControl(aspectRange);
    persistControl(autoContrastCheckbox);
    persistControl(ditherCheckbox);
    void renderCurrentImage();
  };

  const onResetOptions = (): void => {
    widthInput.value = '120';
    presetSelect.value = 'photo-soft';
    customCharsetInput.value = '';
    invertCheckbox.checked = false;
    applyPreset('photo-soft');

    persistControl(widthInput);
    persistControl(presetSelect);
    persistControl(customCharsetInput);
    persistControl(invertCheckbox);
    persistControl(gammaRange);
    persistControl(contrastRange);
    persistControl(brightnessRange);
    persistControl(edgeRange);
    persistControl(aspectRange);
    persistControl(autoContrastCheckbox);
    persistControl(ditherCheckbox);

    void renderCurrentImage();
    showMessage('Options reset to defaults.', { timeoutMs: 2000 });
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
  widthInput.addEventListener('input', onControlInput);
  widthInput.addEventListener('change', onControlChange);
  presetSelect.addEventListener('change', onPresetChange);
  customCharsetInput.addEventListener('input', onControlInput);
  invertCheckbox.addEventListener('change', onControlChange);
  gammaRange.addEventListener('input', onControlInput);
  contrastRange.addEventListener('input', onControlInput);
  brightnessRange.addEventListener('input', onControlInput);
  edgeRange.addEventListener('input', onControlInput);
  aspectRange.addEventListener('input', onControlInput);
  autoContrastCheckbox.addEventListener('change', onControlChange);
  ditherCheckbox.addEventListener('change', onControlChange);
  resetOptionsBtn.addEventListener('click', onResetOptions);
  copyBtn.addEventListener('click', onCopy);
  downloadBtn.addEventListener('click', onDownload);

  if (payload?.sharedFiles?.length) {
    void handleIncomingFiles(payload.sharedFiles);
  }

  return () => {
    pasteBtn.removeEventListener('click', onPasteClick);
    widthInput.removeEventListener('input', onControlInput);
    widthInput.removeEventListener('change', onControlChange);
    presetSelect.removeEventListener('change', onPresetChange);
    customCharsetInput.removeEventListener('input', onControlInput);
    invertCheckbox.removeEventListener('change', onControlChange);
    gammaRange.removeEventListener('input', onControlInput);
    contrastRange.removeEventListener('input', onControlInput);
    brightnessRange.removeEventListener('input', onControlInput);
    edgeRange.removeEventListener('input', onControlInput);
    aspectRange.removeEventListener('input', onControlInput);
    autoContrastCheckbox.removeEventListener('change', onControlChange);
    ditherCheckbox.removeEventListener('change', onControlChange);
    resetOptionsBtn.removeEventListener('click', onResetOptions);
    copyBtn.removeEventListener('click', onCopy);
    downloadBtn.removeEventListener('click', onDownload);
  };
}
