import { showMessage } from '@js/ui.ts';
import type { ToolPayload } from '@js/types';
import { transforms } from './transforms.ts';

export default function init(payload?: ToolPayload) {
  const inputText = document.getElementById('input-text') as HTMLTextAreaElement;
  const outputText = document.getElementById('output-text') as HTMLTextAreaElement;
  const transformSelect = document.getElementById('transform-select') as HTMLSelectElement;
  const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;
  const btnCopy = document.getElementById('btn-copy') as HTMLButtonElement;
  const btnSwap = document.getElementById('btn-swap') as HTMLButtonElement;
  const inputStats = document.getElementById('input-stats') as HTMLSpanElement;
  const outputStats = document.getElementById('output-stats') as HTMLSpanElement;

  const updateStats = () => {
    inputStats.textContent = inputText.value.length + ' chars';
    outputStats.textContent = outputText.value.length + ' chars';
  };

  const transform = () => {
    const input = inputText.value;
    const type = transformSelect.value;
    const fn = transforms[type];
    if (!fn) {
      outputText.value = '';
      updateStats();
      return;
    }
    try {
      outputText.value = fn(input);
    } catch (e) {
      outputText.value = 'Error: ' + (e instanceof Error ? e.message : 'Transformation failed');
    }
    updateStats();
  };

  const handleClear = () => {
    inputText.value = '';
    outputText.value = '';
    transformSelect.value = 'camel-case';
    updateStats();
    inputText.focus();
  };

  const handleCopy = async () => {
    if (!outputText.value) return;
    try {
      await navigator.clipboard.writeText(outputText.value);
      showMessage('Copied to clipboard');
    } catch {
      showMessage('Failed to copy', { type: 'alert' });
    }
  };

  const handleSwap = () => {
    const tmp = inputText.value;
    inputText.value = outputText.value;
    outputText.value = tmp;
    updateStats();
    transform();
  };

  inputText.addEventListener('input', transform);
  transformSelect.addEventListener('change', transform);
  btnClear.addEventListener('click', handleClear);
  btnCopy.addEventListener('click', handleCopy);
  btnSwap.addEventListener('click', handleSwap);

  if (payload?.sharedFiles?.length) {
    const file = payload.sharedFiles[0];
    file.text().then((text) => {
      inputText.value = text;
      updateStats();
      transform();
    });
  }

  transform();

  return () => {
    inputText.removeEventListener('input', transform);
    transformSelect.removeEventListener('change', transform);
    btnClear.removeEventListener('click', handleClear);
    btnCopy.removeEventListener('click', handleCopy);
    btnSwap.removeEventListener('click', handleSwap);
  };
}
