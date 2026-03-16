import { CalculatorLogic } from './logic';
import { HistoryManager } from './history';

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
  let currentInput = '0';
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
    display.innerText = currentInput;
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

    let balancedInput = currentInput;
    const opens = (balancedInput.match(/\(/g) || []).length;
    const closes = (balancedInput.match(/\)/g) || []).length;
    if (opens > closes) {
      balancedInput = balancedInput + ')'.repeat(opens - closes);
    }

    // Check for trailing operators
    const sanitizedInput = balancedInput.replace(/[+\-*/^]$/, '');

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
    const isOperator = (s: string) => /[+\-*/^]/.test(s);

    if (currentInput === '0') {
      // If starting from zero and input is a digit or '.', replace the 0
      if (/[0-9.]/.test(val)) {
        currentInput = val;
        updateDisplay();
        return;
      }
      // If the value looks like a function (ends with '(') or is a constant, replace the 0
      if (/\w+\($/.test(val) || /^PI$/.test(val) || /^E$/.test(val) || val === '(') {
        currentInput = val;
        updateDisplay();
        return;
      }
      // Otherwise, keep the 0 and append operator or other token
      currentInput = '0' + val;
      updateDisplay();
      return;
    }

    // If both last char and new val are operators, replace the last operator
    const lastChar = currentInput[currentInput.length - 1];
    if (isOperator(lastChar) && isOperator(val)) {
      currentInput = currentInput.slice(0, -1) + val;
      updateDisplay();
      return;
    }

    // Default: append the value
    currentInput += val;
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
    currentInput = (e.target as HTMLDivElement).innerText;
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

  // Initial check
  checkScroll();
  display.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Return cleanup function to remove global listener
  return () => {
    document.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('resize', checkScroll);
  };
}
