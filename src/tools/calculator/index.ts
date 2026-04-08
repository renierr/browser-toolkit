import { CalculatorLogic } from './logic';
import { HistoryManager } from './history';
import { SharedCalculator } from './core';

// noinspection JSUnusedGlobalSymbols
export default function init() {
  const display = document.getElementById('calc-display') as HTMLDivElement;
  const lastOp = document.getElementById('calc-last-op') as HTMLDivElement;
  const sciButtons = document.getElementById('calc-scientific-buttons') as HTMLDivElement;
  const historyPanel = document.getElementById('calc-history-panel') as HTMLDivElement;
  const historyList = document.getElementById('calc-history-list') as HTMLDivElement;
  const scrollLeftIndicator = document.getElementById('calc-scroll-left') as HTMLDivElement;
  const scrollRightIndicator = document.getElementById('calc-scroll-right') as HTMLDivElement;

  const historyManager = new HistoryManager();
  const calculator = new SharedCalculator({
    formatResult: CalculatorLogic.formatDisplay,
  });
  let isScientific = false;

  const checkScroll = () => {
    const { scrollLeft, scrollWidth, clientWidth } = display;
    // Use a small threshold to avoid flicker
    const canScrollLeft = scrollLeft > 2;
    const canScrollRight = scrollLeft < scrollWidth - clientWidth - 2;

    scrollLeftIndicator.classList.toggle('opacity-100', canScrollLeft);
    scrollLeftIndicator.classList.toggle('opacity-0', !canScrollLeft);
    scrollLeftIndicator.classList.toggle('pointer-events-auto', canScrollLeft);
    scrollLeftIndicator.classList.toggle('pointer-events-none', !canScrollLeft);

    scrollRightIndicator.classList.toggle('opacity-100', canScrollRight);
    scrollRightIndicator.classList.toggle('opacity-0', !canScrollRight);
    scrollRightIndicator.classList.toggle('pointer-events-auto', canScrollRight);
    scrollRightIndicator.classList.toggle('pointer-events-none', !canScrollRight);
  };

  const updateDisplay = (animate = false) => {
    display.innerText = calculator.getInput();
    if (animate) {
      display.classList.add('calc-result-flash');
      setTimeout(() => display.classList.remove('calc-result-flash'), 300);
    }
    // Scroll to end
    display.scrollLeft = display.scrollWidth;
    // Check scroll after UI update
    setTimeout(checkScroll, 0);
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
          calculator.setInput(item.result.toString());
          lastOp.innerText = item.expression;
          updateDisplay();
          // Hide popover when item selected
          if (historyPanel.hidePopover) historyPanel.hidePopover();
        }
      });
    });
  };

  const calculate = () => {
    if (calculator.getInput() === '0' && lastOp.innerText === '') return;

    const calculation = calculator.evaluate();
    if (calculation.error) {
      lastOp.innerText = 'Error';
    } else {
      lastOp.innerText = `${calculation.expression} =`;
      historyManager.addItem(calculation.expression, calculator.getInput());
      updateHistory();
    }
    updateDisplay(true);
  };

  const handleInput = (val: string) => {
    if (calculator.getInput() === 'Error') {
      calculator.clear();
      lastOp.innerText = '';
    }

    calculator.appendInput(val);
    updateDisplay();
  };

  const handleBackspace = () => {
    calculator.backspace();
    updateDisplay();
  };

  const handleBracket = () => {
    calculator.toggleBracket();
    updateDisplay();
  };

  const handleNegate = () => {
    const inputValue = calculator.getInput();
    if (inputValue === '0') return;

    if (inputValue.startsWith('-')) {
      calculator.setInput(inputValue.slice(1));
    } else {
      calculator.setInput(`-${inputValue}`);
    }
    updateDisplay();
  };

  // Event Listeners
  document.querySelectorAll('[data-val], [data-op]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = btn.getAttribute('data-val') || btn.getAttribute('data-op');
      if (val) handleInput(val);
    });
  });

  document.getElementById('calc-bracket')?.addEventListener('click', handleBracket);

  document.getElementById('calc-negate')?.addEventListener('click', handleNegate);

  document.getElementById('calc-clear')?.addEventListener('click', () => {
    calculator.clear();
    lastOp.innerText = '';
    updateDisplay();
  });

  document.getElementById('calc-backspace')?.addEventListener('click', handleBackspace);

  document.getElementById('calc-equals')?.addEventListener('click', calculate);

  document.getElementById('calc-copy')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(calculator.getInput());
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  });

  scrollLeftIndicator.addEventListener('click', () => {
    display.scrollBy({ left: -100, behavior: 'smooth' });
  });

  scrollRightIndicator.addEventListener('click', () => {
    display.scrollBy({ left: 100, behavior: 'smooth' });
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
    calculator.setInput((e.target as HTMLDivElement).innerText);
    checkScroll();
  });

  display.addEventListener('scroll', checkScroll);
  window.addEventListener('resize', checkScroll);

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
    if (['+', '-', '*', '/', '^'].includes(e.key)) handleInput(e.key);
    if (e.key === '.') handleInput('.');
    if (e.key === '(' || e.key === ')') handleBracket();
    if (e.key === 'Backspace') handleBackspace();
    if (e.key === 'Enter' || e.key === '=') {
      e.preventDefault();
      calculate();
    }
    if (e.key === 'Escape') {
      calculator.clear();
      lastOp.innerText = '';
      updateDisplay();
    }
  };

  document.addEventListener('keydown', onKeyDown);

  // Initialize stuff
  updateHistory();
  checkScroll();
  display.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Return cleanup function to remove global listener
  return () => {
    document.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('resize', checkScroll);
  };
}
