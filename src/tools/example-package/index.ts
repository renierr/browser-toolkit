import isOdd from 'is-odd';
import { showMessage } from '../../js/ui.ts';

export default function init() {
  const form = document.getElementById('even-odd-form') as HTMLFormElement | null;
  const input = document.getElementById('number-input') as HTMLInputElement | null;

  if (!form || !input) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = input.value.trim();
    if (value === '') {
      return;
    }
    const num = Number(value);
    if (isNaN(num)) {
      showMessage('Please insert a valid number.', { type: 'alert', timeoutMs: 5000 });
      return;
    }
    showMessage(`Number ${num} is ${isOdd(num) ? 'odd' : 'even'}.`, { timeoutMs: 5000 });
  });
}
