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
  const btnPreviewAll = document.getElementById('btn-preview-all') as HTMLButtonElement;
  const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;
  const status = document.getElementById('status') as HTMLDivElement;
  const previewsContainer = document.getElementById('previews-container') as HTMLDivElement;
  const previewsList = document.getElementById('previews-list') as HTMLDivElement;

  if (
    !inputText ||
    !styleSelect ||
    !outputContainer ||
    !horizontalLayoutSelect ||
    !verticalLayoutSelect ||
    !btnCopy ||
    !btnDownload ||
    !btnPreviewAll ||
    !btnClear ||
    !status ||
    !previewsContainer ||
    !previewsList
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
  let isPreviewingAll = false;

  const generate = async () => {
    const text = inputText.value;
    if (text.length === 0) {
      setOutputMessage(outputContainer, EMPTY_RESULT_TEXT);
      btnCopy.disabled = true;
      btnDownload.disabled = true;
      currentOutput = '';
      status.textContent = '';
      previewsContainer.classList.add('hidden');
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

  const previewAllFonts = async () => {
    const text = inputText.value;
    if (!text) {
      showMessage('Please enter some text first');
      return;
    }

    if (isPreviewingAll) return;
    isPreviewingAll = true;
    btnPreviewAll.disabled = true;
    btnPreviewAll.textContent = 'Generating...';
    previewsContainer.classList.remove('hidden');
    previewsList.innerHTML = '';

    const horizontalLayout = horizontalLayoutSelect.value;
    const verticalLayout = verticalLayoutSelect.value;

    const BATCH_SIZE = 10;
    for (let i = 0; i < fontList.length; i += BATCH_SIZE) {
      const batch = fontList.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (fontName) => {
          try {
            const art = await generateAsciiArt(text, fontName, { horizontalLayout, verticalLayout });
            return { fontName, art };
          } catch (e) {
            return { fontName, art: 'Error loading font' };
          }
        })
      );

      results.forEach(({ fontName, art }) => {
        const item = document.createElement('div');
        item.className = 'bg-base-300 p-4 rounded-lg space-y-3';
        item.innerHTML = `
          <div class="flex items-center justify-between">
            <span class="font-bold text-lg">${fontName}</span>
            <button class="btn btn-sm btn-outline btn-select-font" data-font="${fontName}">
              Use this font
            </button>
          </div>
          <pre class="font-mono text-[10px] leading-none whitespace-pre overflow-x-auto p-2 bg-base-100 rounded">${art}</pre>
        `;

        item.querySelector('.btn-select-font')?.addEventListener('click', () => {
          styleSelect.value = fontName;
          // Trigger change event to persist and re-generate
          styleSelect.dispatchEvent(new Event('change'));
          window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        previewsList.appendChild(item);
      });

      // Update button progress
      btnPreviewAll.textContent = `Generating (${Math.min(i + BATCH_SIZE, fontList.length)}/${fontList.length})...`;

      // Small break to keep UI responsive
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    btnPreviewAll.disabled = false;
    btnPreviewAll.innerHTML = '<i data-lucide="eye" class="w-4 h-4 mr-2"></i> Preview All';
    // Re-setup lucide icons for the new buttons
    (window as any).lucide?.createIcons();
    isPreviewingAll = false;
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
    previewsContainer.classList.add('hidden');
    previewsList.innerHTML = '';
    inputText.focus();
    // Trigger change event to clear persisted text
    inputText.dispatchEvent(new Event('change'));
  };

  const onStyleChange = () => {
    debouncedGenerate();
  };

  btnCopy.addEventListener('click', copyToClipboard);
  btnDownload.addEventListener('click', downloadAscii);
  btnPreviewAll.addEventListener('click', previewAllFonts);
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
    btnPreviewAll.removeEventListener('click', previewAllFonts);
    btnClear.removeEventListener('click', clearAll);
    inputText.removeEventListener('input', debouncedGenerate);
    styleSelect.removeEventListener('change', onStyleChange);
    horizontalLayoutSelect.removeEventListener('change', debouncedGenerate);
    verticalLayoutSelect.removeEventListener('change', debouncedGenerate);
  };
}

