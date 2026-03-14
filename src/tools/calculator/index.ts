import { CalculatorLogic } from './logic';
import { HistoryManager } from './history';

// noinspection JSUnusedGlobalSymbols
export default function init() {
  const display = document.getElementById('calc-display') as HTMLDivElement;
  const lastOp = document.getElementById('calc-last-op') as HTMLDivElement;
  const sciButtons = document.getElementById('calc-scientific-buttons') as HTMLDivElement;
  const historyPanel = document.getElementById('calc-history-panel') as HTMLDivElement;
  const historyList = document.getElementById('calc-history-list') as HTMLDivElement;

  const historyManager = new HistoryManager();
  let currentInput = '0';
  let isScientific = false;

  const updateDisplay = (animate = false) => {
    display.innerText = currentInput;
    if (animate) {
      display.classList.add('calc-result-flash');
      setTimeout(() => display.classList.remove('calc-result-flash'), 300);
    }
    // Scroll to end
    display.scrollLeft = display.scrollWidth;
  };

  const updateHistory = () => {
    const history = historyManager.getHistory();
    if (history.length === 0) {
      historyList.innerHTML =
        '<div class="text-center text-base-content/40 mt-10">No calculations yet</div>';
      return;
    }

    historyList.innerHTML = history
      .map(
        (item) => `
      <div class="card bg-base-200 p-3 cursor-pointer hover:bg-base-300 transition-colors" data-id="${item.id}">
        <div class="text-xs text-base-content/60 truncate">${item.expression}</div>
        <div class="text-lg font-mono font-bold text-right text-base-content">${item.result}</div>
      </div>
    `
      )
      .join('');

    // Add click listeners to history items
    historyList.querySelectorAll('.card').forEach((card) => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-id');
        const item = history.find((i) => i.id === id);
        if (item) {
          currentInput = item.result.toString();
          lastOp.innerText = item.expression;
          updateDisplay();
          // Hide popover when item selected
          if (historyPanel.hidePopover) historyPanel.hidePopover();
        }
      });
    });
  };

  const calculate = () => {
    if (currentInput === '0' && lastOp.innerText === '') return;

    // Check for trailing operators
    const sanitizedInput = currentInput.replace(/[+\-*/]$/, '');

    const calculation = CalculatorLogic.evaluate(sanitizedInput);
    if (calculation.error) {
      lastOp.innerText = 'Error';
      currentInput = calculation.result.toString();
    } else {
      lastOp.innerText = `${calculation.expression} =`;
      const formattedResult = CalculatorLogic.formatDisplay(calculation.result);
      historyManager.addItem(calculation.expression, formattedResult);
      currentInput = formattedResult;
      updateHistory();
    }
    updateDisplay(true);
  };

  const handleInput = (val: string) => {
    if (currentInput === '0' && val !== '.') {
      currentInput = val;
    } else {
      currentInput += val;
    }
    updateDisplay();
  };

  const handleBackspace = () => {
    if (currentInput.length > 1) {
      currentInput = currentInput.slice(0, -1);
    } else {
      currentInput = '0';
    }
    updateDisplay();
  };

  // Event Listeners
  document.querySelectorAll('[data-val], [data-key], [data-op]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const val =
        btn.getAttribute('data-val') || btn.getAttribute('data-key') || btn.getAttribute('data-op');
      if (val) handleInput(val);
    });
  });

  document.getElementById('calc-clear')?.addEventListener('click', () => {
    currentInput = '0';
    lastOp.innerText = '';
    updateDisplay();
  });

  document.getElementById('calc-backspace')?.addEventListener('click', handleBackspace);

  document.getElementById('calc-equals')?.addEventListener('click', calculate);

  document.getElementById('calc-copy')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(currentInput);
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  });

  document.getElementById('calc-toggle-sci')?.addEventListener('click', () => {
    isScientific = !isScientific;
    if (isScientific) {
      sciButtons.style.display = 'grid';
    } else {
      sciButtons.style.display = '';
    }
  });

  document.getElementById('calc-clear-history')?.addEventListener('click', () => {
    historyManager.clear();
    updateHistory();
  });

  // Handle direct display editing
  display.addEventListener('input', (e) => {
    currentInput = (e.target as HTMLDivElement).innerText;
  });

  display.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      calculate();
    }
  });

  // Global Keyboard Support
  const onKeyDown = (e: KeyboardEvent) => {
    if (document.activeElement === display) return; // Don't duplicate if display focused

    if (/[0-9]/.test(e.key)) handleInput(e.key);
    if (['+', '-', '*', '/'].includes(e.key)) handleInput(e.key);
    if (e.key === '.') handleInput('.');
    if (e.key === '(' || e.key === ')') handleInput(e.key);
    if (e.key === 'Backspace') handleBackspace();
    if (e.key === 'Enter' || e.key === '=') {
      e.preventDefault();
      calculate();
    }
    if (e.key === 'Escape') {
      currentInput = '0';
      lastOp.innerText = '';
      updateDisplay();
    }
  };

  document.addEventListener('keydown', onKeyDown);

  // Return cleanup function to remove global listener
  return () => {
    document.removeEventListener('keydown', onKeyDown);
  };
}
