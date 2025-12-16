export function init() {
  const btn = document.getElementById('convert-btn') as HTMLButtonElement | null;
  const input = document.getElementById('input-date') as HTMLInputElement | null;
  const output = document.getElementById('output') as HTMLElement | null;

  if (!btn || !input || !output) return;

  btn.addEventListener('click', () => {
    const date = new Date(input.value);
    if (Number.isNaN(date.getTime())) {
      output.textContent = 'Invalid date!';
      return;
    }
    output.textContent = `Timestamp: ${date.getTime()}`;
  });
}

init();
