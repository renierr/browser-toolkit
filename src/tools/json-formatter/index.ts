
// noinspection JSUnusedGlobalSymbols
import { showMessage } from '../../js/ui.ts';

export default function init() {
  const input = document.getElementById('json-input') as HTMLTextAreaElement;
  const output = document.getElementById('json-output') as HTMLTextAreaElement;
  const btnFormat = document.getElementById('btn-format');
  const btnMinify = document.getElementById('btn-minify');
  const btnClear = document.getElementById('btn-clear');
  const btnCopy = document.getElementById('btn-copy');


  const processJson = (space: number | string) => {
    const val = input.value.trim();
    if (!val) {
      output.value = '';
      return;
    }

    try {
      const parsed = JSON.parse(val);
      output.value = JSON.stringify(parsed, null, space);
    } catch (e: any) {
      showMessage(e.message, { type: 'alert' });
    }
  };

  btnFormat?.addEventListener('click', () => processJson(2));
  btnMinify?.addEventListener('click', () => processJson(0));

  btnClear?.addEventListener('click', () => {
    input.value = '';
    output.value = '';
  });

  btnCopy?.addEventListener('click', async () => {
    if (!output.value) return;
    try {
      await navigator.clipboard.writeText(output.value);
      const originalText = btnCopy.textContent;
      btnCopy.textContent = 'Copied!';
      btnCopy.classList.add('btn-success');
      setTimeout(() => {
        btnCopy.textContent = originalText;
        btnCopy.classList.remove('btn-success');
      }, 2000);
    } catch (err) {
      showMessage('Failed to copy to clipboard', { type: 'alert', timeoutMs: 5000 });
    }
  });

  input?.addEventListener('input', () => {
    if (input.value.trim() === '') {
      output.value = '';
    }
  });

  // Auto-format on paste
  input?.addEventListener('paste', () => {
    setTimeout(() => processJson(2), 0);
  });
}
