import { showMessage } from '@js/ui.ts';
import { textToBraille, getBrailleUnicode, brailleToText } from './braille.ts';
import { textToASL } from './asl.ts';

type Mode = 'encode' | 'decode';
let currentMode: Mode = 'encode';

function applyAslSize(size: number): void {
  document.documentElement.style.setProperty('--asl-size', `${size}rem`);
}

function renderEncodeOutput(text: string): string {
  const brailleChars = textToBraille(text);
  const aslChars = textToASL(text);

  const words = text.split(/(\s+)/);
  let brailleIndex = 0;
  let aslIndex = 0;

  const brailleHtml = words
    .map((word) => {
      if (/^\s+$/.test(word)) {
        return `<div class="word-space"></div>`;
      }
      const chars = [];
      for (const char of word) {
        if (/[a-zA-Z]/.test(char)) {
          const b = brailleChars[brailleIndex++];
          if (b) {
            chars.push(`
            <div class="char-row">
              <span class="char-letter">${b.letter.toUpperCase()}</span>
              <span class="char-braille">${b.unicode}</span>
            </div>
          `);
          }
        } else if (/[0-9]/.test(char)) {
          const b = brailleChars[brailleIndex++];
          if (b) {
            chars.push(`
            <div class="char-row">
              <span class="char-letter">${b.letter}</span>
              <span class="char-braille">${b.unicode}</span>
            </div>
          `);
          }
        }
      }
      return chars.join('');
    })
    .join('');

  words.forEach((word) => {
    if (/^\s+$/.test(word)) return;
    for (const char of word) {
      if (/[a-zA-Z]/.test(char)) {
        aslIndex++;
      }
    }
  });

  let aslIndex2 = 0;
  const aslHtml = words
    .map((word) => {
      if (/^\s+$/.test(word)) {
        return `<div class="word-space"></div>`;
      }
      const chars = [];
      for (const char of word) {
        if (/[a-zA-Z]/.test(char)) {
          const a = aslChars[aslIndex2++];
          if (a) {
            chars.push(`
            <div class="char-row">
              <span class="char-asl">${a.letter}</span>
            </div>
          `);
          }
        }
      }
      return chars.join('');
    })
    .join('');

  return `
    <div class="output-section">
      <div class="output-label">Braille</div>
      <div class="output-inline">${brailleHtml}</div>
    </div>
    <div class="output-divider"></div>
    <div class="output-section">
      <div class="output-label">ASL</div>
      <div class="output-inline">${aslHtml}</div>
    </div>
  `;
}

function renderDecodeOutput(text: string): string {
  const decodedText = brailleToText(text);
  const aslChars = textToASL(decodedText);

  const chars = text.split('');
  let aslIndex = 0;
  let decodedIndex = 0;

  const brailleHtml = chars
    .map((char) => {
      if (/\s/.test(char)) {
        return `<div class="word-space"></div>`;
      }
      const decoded = decodedText[decodedIndex++] || '';
      return `
        <div class="char-row">
          <span class="char-braille">${char}</span>
          <span class="char-letter">${decoded.toUpperCase()}</span>
        </div>
      `;
    })
    .join('');

  const aslHtml = chars
    .map((char) => {
      if (/\s/.test(char)) {
        return `<div class="word-space"></div>`;
      }
      const asl = aslChars[aslIndex++];
      return `
        <div class="char-row">
          <span class="char-asl">${asl ? asl.letter.toUpperCase() : ''}</span>
        </div>
      `;
    })
    .join('');

  return `
    <div class="output-section">
      <div class="output-label">Braille</div>
      <div class="output-inline">${brailleHtml}</div>
    </div>
    <div class="output-divider"></div>
    <div class="output-section">
      <div class="output-label">ASL</div>
      <div class="output-inline">${aslHtml}</div>
    </div>
  `;
}

function renderOutput(text: string): void {
  const output = document.getElementById('output-content') as HTMLDivElement;
  const copyBtn = document.getElementById('btn-copy-braille') as HTMLButtonElement;

  if (!text.trim()) {
    output.innerHTML = `
      <div class="empty-state">
        <p>Type text above to see translation</p>
      </div>
    `;
    copyBtn.classList.add('hidden');
    return;
  }

  copyBtn.classList.remove('hidden');

  if (currentMode === 'encode') {
    output.innerHTML = renderEncodeOutput(text);
  } else {
    output.innerHTML = renderDecodeOutput(text);
  }
}

function switchMode(mode: Mode): void {
  currentMode = mode;
  const input = document.getElementById('input-text') as HTMLInputElement;
  const copyBtn = document.getElementById('btn-copy-braille') as HTMLButtonElement;

  input.value = '';

  if (mode === 'encode') {
    input.placeholder = 'Type text to translate...';
    copyBtn.classList.add('hidden');
  } else {
    input.placeholder = 'Paste Braille text to decode...';
    copyBtn.classList.add('hidden');
  }

  const output = document.getElementById('output-content') as HTMLDivElement;
  output.innerHTML = `
    <div class="empty-state">
      <p>Type text above to see translation</p>
    </div>
  `;

  input.focus();
}

function updateOutput(): void {
  const input = document.getElementById('input-text') as HTMLInputElement;
  renderOutput(input.value);
}

// noinspection JSUnusedGlobalSymbols
export default function init() {
  const input = document.getElementById('input-text') as HTMLInputElement;
  const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;
  const btnCopy = document.getElementById('btn-copy-braille') as HTMLButtonElement;
  const aslSizeInput = document.getElementById('asl-size') as HTMLInputElement;
  const aslSizeValue = document.getElementById('asl-size-value') as HTMLSpanElement;
  const modeToggle = document.getElementById('mode-decode') as HTMLInputElement;

  aslSizeInput.addEventListener('input', () => {
    const size = parseInt(aslSizeInput.value);
    applyAslSize(size);
    aslSizeValue.textContent = `${size}rem`;
  });
  aslSizeValue.textContent = `${parseInt(aslSizeInput.value)}rem`;
  applyAslSize(parseInt(aslSizeInput.value));

  modeToggle.addEventListener('change', () => {
    switchMode(modeToggle.checked ? 'decode' : 'encode');
  });

  input.addEventListener('input', updateOutput);

  btnClear.addEventListener('click', () => {
    input.value = '';
    updateOutput();
    input.focus();
  });

  btnCopy.addEventListener('click', () => {
    const text = input.value;
    if (currentMode === 'encode') {
      const brailleText = getBrailleUnicode(text);
      navigator.clipboard.writeText(brailleText).then(() => {
        showMessage('Braille copied to clipboard!', { timeoutMs: 3000 });
      });
    } else {
      const decodedText = brailleToText(text);
      navigator.clipboard.writeText(decodedText).then(() => {
        showMessage('Decoded text copied to clipboard!', { timeoutMs: 3000 });
      });
    }
  });

  input.focus();

  return () => {
    input.removeEventListener('input', updateOutput);
    btnClear.removeEventListener('click', () => {});
    btnCopy.removeEventListener('click', () => {});
    aslSizeInput.removeEventListener('input', () => {});
    modeToggle.removeEventListener('change', () => {});
  };
}
