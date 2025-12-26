import { showMessage } from '../../js/ui.ts';

// noinspection JSUnusedGlobalSymbols
export default function init() {
  const inputText = document.getElementById('input-text') as HTMLTextAreaElement;
  const outputText = document.getElementById('output-text') as HTMLTextAreaElement;
  const btnEncode = document.getElementById('btn-encode') as HTMLButtonElement;
  const btnDecode = document.getElementById('btn-decode') as HTMLButtonElement;
  const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;
  const btnCopy = document.getElementById('btn-copy') as HTMLButtonElement;
  const inputStats = document.getElementById('input-stats') as HTMLSpanElement;
  const outputStats = document.getElementById('output-stats') as HTMLSpanElement;

  // Helper to handle UTF-8 encoding/decoding correctly
  const toBase64 = (str: string): string => {
    return btoa(
      encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function toSolidBytes(_match, p1) {
        return String.fromCharCode(parseInt(p1, 16));
      })
    );
  };

  const fromBase64 = (str: string): string => {
    return decodeURIComponent(
      atob(str)
        .split('')
        .map(function (c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        })
        .join('')
    );
  };

  const updateStats = () => {
    inputStats.textContent = `${inputText.value.length} chars`;
    outputStats.textContent = `${outputText.value.length} chars`;
  };

  const handleEncode = () => {
    try {
      const input = inputText.value;
      if (!input) {
        outputText.value = '';
        updateStats();
        return;
      }
      outputText.value = toBase64(input);
      updateStats();
    } catch (e) {
      showMessage('Encoding failed. Ensure input is valid text', { type: 'alert' });
      console.error(e);
    }
  };

  const handleDecode = () => {
    try {
      const input = inputText.value.trim();
      if (!input) {
        outputText.value = '';
        updateStats();
        return;
      }
      outputText.value = fromBase64(input);
      updateStats();
    } catch (e) {
      showMessage('Decoding failed. Invalid Base64 string.', { type: 'alert' });
      console.error(e);
    }
  };

  const handleClear = () => {
    inputText.value = '';
    outputText.value = '';
    updateStats();
    inputText.focus();
  };

  const handleCopy = async () => {
    if (!outputText.value) return;
    try {
      await navigator.clipboard.writeText(outputText.value);
      const originalText = btnCopy.textContent;
      btnCopy.textContent = 'Copied!';
      setTimeout(() => {
        btnCopy.textContent = originalText;
      }, 2000);
    } catch (err) {
      showMessage('Failed to copy to clipboard', { type: 'alert' });
    }
  };

  // Event Listeners
  btnEncode.addEventListener('click', handleEncode);
  btnDecode.addEventListener('click', handleDecode);
  btnClear.addEventListener('click', handleClear);
  btnCopy.addEventListener('click', handleCopy);
  inputText.addEventListener('input', updateStats);

  // Cleanup
  return () => {
    btnEncode.removeEventListener('click', handleEncode);
    btnDecode.removeEventListener('click', handleDecode);
    btnClear.removeEventListener('click', handleClear);
    btnCopy.removeEventListener('click', handleCopy);
    inputText.removeEventListener('input', updateStats);
  };
}
