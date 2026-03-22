import { showMessage } from '../../js/ui.ts';
import { textToBraille, getBrailleUnicode } from './braille.ts';
import { textToASL, generateASLSvg } from './asl.ts';

type Tab = 'braille' | 'asl';

let currentTab: Tab = 'braille';

function renderBrailleOutput(text: string): void {
  const grid = document.getElementById('output-grid') as HTMLDivElement;
  const copyBtn = document.getElementById('btn-copy-braille') as HTMLButtonElement;

  if (!text.trim()) {
    grid.innerHTML = `
      <div class="empty-state col-span-full">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M4 7V4h16v3M9 20h6M12 4v16"/>
        </svg>
        <p>Type text above to see translation</p>
      </div>
    `;
    copyBtn.classList.add('hidden');
    return;
  }

  const brailleChars = textToBraille(text);
  copyBtn.classList.remove('hidden');

  if (brailleChars.length === 0) {
    grid.innerHTML = `
      <div class="empty-state col-span-full">
        <p>No valid characters to display</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = brailleChars
    .map(
      (char) => `
      <div class="char-card" title="Letter ${char.name}">
        <span class="letter">${char.letter.toUpperCase()}</span>
        <span class="braille-visual">${char.unicode}</span>
        <span class="name">${char.name}</span>
      </div>
    `
    )
    .join('');
}

function renderASLOutput(text: string): void {
  const grid = document.getElementById('output-grid') as HTMLDivElement;
  const copyBtn = document.getElementById('btn-copy-braille') as HTMLButtonElement;

  copyBtn.classList.add('hidden');

  if (!text.trim()) {
    grid.innerHTML = `
      <div class="empty-state col-span-full">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M4 7V4h16v3M9 20h6M12 4v16"/>
        </svg>
        <p>Type text above to see translation</p>
      </div>
    `;
    return;
  }

  const aslChars = textToASL(text);

  if (aslChars.length === 0) {
    grid.innerHTML = `
      <div class="empty-state col-span-full">
        <p>No letters to display</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = aslChars
    .map(
      (char) => `
      <div class="char-card" title="ASL ${char.name}">
        <span class="letter">${char.letter.toUpperCase()}</span>
        ${generateASLSvg(char.letter, 48)}
        <span class="name">${char.name}</span>
      </div>
    `
    )
    .join('');
}

function updateOutput(): void {
  const input = document.getElementById('input-text') as HTMLInputElement;
  const text = input.value;

  if (currentTab === 'braille') {
    renderBrailleOutput(text);
  } else {
    renderASLOutput(text);
  }
}

function switchTab(tab: Tab): void {
  currentTab = tab;

  const brailleTab = document.getElementById('tab-braille') as HTMLButtonElement;
  const aslTab = document.getElementById('tab-asl') as HTMLButtonElement;

  if (tab === 'braille') {
    brailleTab.classList.add('active');
    aslTab.classList.remove('active');
  } else {
    brailleTab.classList.remove('active');
    aslTab.classList.add('active');
  }

  updateOutput();
}

// noinspection JSUnusedGlobalSymbols
export default function init() {
  const input = document.getElementById('input-text') as HTMLInputElement;
  const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;
  const tabBraille = document.getElementById('tab-braille') as HTMLButtonElement;
  const tabAsl = document.getElementById('tab-asl') as HTMLButtonElement;
  const btnCopy = document.getElementById('btn-copy-braille') as HTMLButtonElement;

  input.addEventListener('input', updateOutput);

  btnClear.addEventListener('click', () => {
    input.value = '';
    updateOutput();
    input.focus();
  });

  tabBraille.addEventListener('click', () => switchTab('braille'));
  tabAsl.addEventListener('click', () => switchTab('asl'));

  btnCopy.addEventListener('click', () => {
    const text = input.value;
    const brailleText = getBrailleUnicode(text);
    navigator.clipboard.writeText(brailleText).then(() => {
      showMessage('Braille copied to clipboard!', { timeoutMs: 3000 });
    });
  });

  input.focus();

  return () => {
    input.removeEventListener('input', updateOutput);
    btnClear.removeEventListener('click', () => {});
    tabBraille.removeEventListener('click', () => {});
    tabAsl.removeEventListener('click', () => {});
    btnCopy.removeEventListener('click', () => {});
  };
}
