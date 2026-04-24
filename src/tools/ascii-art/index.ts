import { showMessage } from '@js/ui.ts';
import { downloadFile } from '@js/file-utils.ts';
import { debounce } from '@js/utils.ts';
import { fonts } from './fonts.ts';

const EMPTY_RESULT_TEXT = 'Result will appear here...';
const ERROR_RESULT_TEXT = 'Error generating ASCII art';

function generateAsciiArt(text: string, style: string): string {
  const font = fonts[style];
  if (!font) return '';

  const upperText = text.toUpperCase();
  const sampleChar = font['A'] || Object.values(font)[0];
  const lineHeight = sampleChar.length;
  const fallbackChar = font['?'] ?? font[' '] ?? Array.from({ length: lineHeight }, () => ' ');

  const lines: string[][] = [];
  for (let i = 0; i < lineHeight; i++) {
    lines[i] = [];
  }

  for (const char of upperText) {
    const charMap = font[char] ?? fallbackChar;
    for (let i = 0; i < lineHeight; i++) {
      lines[i].push(charMap[i] ?? '');
    }
  }

  return lines.map((line) => line.join('')).join('\n');
}

function setOutputMessage(container: HTMLDivElement, message: string): void {
  container.textContent = message;
}

export default function init(): (() => void) | void {
  const inputText = document.getElementById('input-text') as HTMLInputElement;
  const styleSelect = document.getElementById('style-select') as HTMLSelectElement;
  const outputContainer = document.getElementById('output-container') as HTMLDivElement;
  const btnCopy = document.getElementById('btn-copy') as HTMLButtonElement;
  const btnDownload = document.getElementById('btn-download') as HTMLButtonElement;
  const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;
  const status = document.getElementById('status') as HTMLDivElement;

  if (
    !inputText ||
    !styleSelect ||
    !outputContainer ||
    !btnCopy ||
    !btnDownload ||
    !btnClear ||
    !status
  ) {
    console.error('[AsciiArt] Missing required DOM elements');
    return;
  }

  let currentOutput = '';

  const generate = () => {
    const text = inputText.value;
    if (text.length === 0) {
      setOutputMessage(outputContainer, EMPTY_RESULT_TEXT);
      btnCopy.disabled = true;
      btnDownload.disabled = true;
      currentOutput = '';
      status.textContent = '';
      return;
    }

    const style = styleSelect.value;
    currentOutput = generateAsciiArt(text, style);

    if (currentOutput) {
      outputContainer.textContent = currentOutput;
      btnCopy.disabled = false;
      btnDownload.disabled = false;
      status.textContent = `${text.length} characters generated`;
    } else {
      setOutputMessage(outputContainer, ERROR_RESULT_TEXT);
      btnCopy.disabled = true;
      btnDownload.disabled = true;
      currentOutput = '';
      status.textContent = '';
    }
  };

  const debouncedGenerate = debounce(generate, 300);

  const copyToClipboard = async () => {
    if (!currentOutput) return;
    if (!navigator.clipboard) {
      showMessage('Clipboard API not available', { type: 'alert' });
      return;
    }

    try {
      await navigator.clipboard.writeText(currentOutput);
      showMessage('Copied to clipboard!', { timeoutMs: 2000 });
    } catch (err) {
      console.error('[AsciiArt] Failed to copy:', err);
      showMessage('Failed to copy to clipboard', { type: 'alert' });
    }
  };

  const downloadAscii = () => {
    if (!currentOutput) return;
    const blob = new Blob([currentOutput], { type: 'text/plain;charset=utf-8' });
    downloadFile(blob, 'ascii-art.txt');
  };

  const clearAll = () => {
    inputText.value = '';
    setOutputMessage(outputContainer, EMPTY_RESULT_TEXT);
    btnCopy.disabled = true;
    btnDownload.disabled = true;
    currentOutput = '';
    status.textContent = '';
    inputText.focus();
  };

  const onStyleChange = () => {
    debouncedGenerate();
  };

  btnCopy.addEventListener('click', copyToClipboard);
  btnDownload.addEventListener('click', downloadAscii);
  btnClear.addEventListener('click', clearAll);
  inputText.addEventListener('input', debouncedGenerate);
  styleSelect.addEventListener('change', onStyleChange);

  return () => {
    btnCopy.removeEventListener('click', copyToClipboard);
    btnDownload.removeEventListener('click', downloadAscii);
    btnClear.removeEventListener('click', clearAll);
    inputText.removeEventListener('input', debouncedGenerate);
    styleSelect.removeEventListener('change', onStyleChange);
  };
}
