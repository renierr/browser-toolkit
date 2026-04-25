import { showMessage } from '@js/ui.ts';
import { downloadFile } from '@js/file-utils.ts';
import { debounce } from '@js/utils.ts';
import figlet from 'figlet';
import { fontList } from './font-list.ts';

import { getSettings } from '@js/settings.ts';

const EMPTY_RESULT_TEXT = 'Result will appear here...';
const ERROR_RESULT_TEXT = 'Error generating ASCII art';

const loadedFonts = new Set<string>();
const fontModules = import.meta.glob('./node_modules/figlet/importable-fonts/*.js');

async function ensureFontLoaded(fontName: string): Promise<void> {
  if (loadedFonts.has(fontName)) return;

  try {
    const path = `./node_modules/figlet/importable-fonts/${fontName}.js`;
    const loader = fontModules[path];

    if (!loader) {
      throw new Error(`Font module not found for: ${fontName}`);
    }

    const fontData = (await loader()) as { default: string };
    figlet.parseFont(fontName, fontData.default);
    loadedFonts.add(fontName);
  } catch (error) {
    console.error(`[AsciiArt] Failed to load font: ${fontName}`, error);
    throw error;
  }
}

async function generateAsciiArt(
  text: string,
  fontName: string,
  options: { horizontalLayout: string; verticalLayout: string }
): Promise<string> {
  await ensureFontLoaded(fontName);

  return new Promise((resolve, reject) => {
    figlet.text(
      text,
      {
        font: fontName as any,
        horizontalLayout: options.horizontalLayout as any,
        verticalLayout: options.verticalLayout as any,
      },
      (err, data) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(data || '');
      }
    );
  });
}

function setOutputMessage(container: HTMLDivElement, message: string): void {
  container.textContent = message;
}

export default function init(): (() => void) | void {
  const container = document.getElementById('ascii-art-container') || (document.querySelector('.card') as HTMLElement);
  const inputText = document.getElementById('input-text') as HTMLInputElement;
  const styleSelect = document.getElementById('style-select') as HTMLSelectElement;
  const outputContainer = document.getElementById('output-container') as HTMLDivElement;
  const horizontalLayoutSelect = document.getElementById('horizontal-layout') as HTMLSelectElement;
  const verticalLayoutSelect = document.getElementById('vertical-layout') as HTMLSelectElement;
  const btnCopy = document.getElementById('btn-copy') as HTMLButtonElement;
  const btnDownload = document.getElementById('btn-download') as HTMLButtonElement;
  const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;
  const status = document.getElementById('status') as HTMLDivElement;

  if (
    !inputText ||
    !styleSelect ||
    !outputContainer ||
    !horizontalLayoutSelect ||
    !verticalLayoutSelect ||
    !btnCopy ||
    !btnDownload ||
    !btnClear ||
    !status
  ) {
    console.error('[AsciiArt] Missing required DOM elements');
    return;
  }

  // Populate style-select with fonts from figlet
  styleSelect.innerHTML = '';
  fontList.forEach((font) => {
    const option = document.createElement('option');
    option.value = font;
    option.textContent = font;
    if (font === 'Standard') option.selected = true;
    styleSelect.appendChild(option);
  });

  const settings = getSettings('ascii-art');
  const unbind = container ? settings.bind(container) : () => {};

  let currentOutput = '';

  const generate = async () => {
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
    const horizontalLayout = horizontalLayoutSelect.value;
    const verticalLayout = verticalLayoutSelect.value;

    try {
      currentOutput = await generateAsciiArt(text, style, { horizontalLayout, verticalLayout });
      if (currentOutput) {
        outputContainer.textContent = currentOutput;
        btnCopy.disabled = false;
        btnDownload.disabled = false;
        const styleName = styleSelect.selectedOptions[0]?.textContent ?? style;
        status.textContent = `${text.length} characters | ${styleName}`;
      } else {
        setOutputMessage(outputContainer, ERROR_RESULT_TEXT);
        btnCopy.disabled = true;
        btnDownload.disabled = true;
        currentOutput = '';
        status.textContent = '';
      }
    } catch (err) {
      console.error('[AsciiArt] Generation failed:', err);
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
  horizontalLayoutSelect.addEventListener('change', debouncedGenerate);
  verticalLayoutSelect.addEventListener('change', debouncedGenerate);

  // Initial generation to handle restored settings
  generate();

  return () => {
    unbind();
    btnCopy.removeEventListener('click', copyToClipboard);
    btnDownload.removeEventListener('click', downloadAscii);
    btnClear.removeEventListener('click', clearAll);
    inputText.removeEventListener('input', debouncedGenerate);
    styleSelect.removeEventListener('change', onStyleChange);
    horizontalLayoutSelect.removeEventListener('change', debouncedGenerate);
    verticalLayoutSelect.removeEventListener('change', debouncedGenerate);
  };
}

