import { showMessage } from '../../../js/ui.ts';

type Op =
  | '+'
  | '-'
  | '*'
  | '/'
  | 'pow'
  | 'mod'
  | 'min'
  | 'max'
  | 'percentOf'
  | 'sqrtA'
  | 'sqrtB'
  | 'absA'
  | 'absB'
  | 'round'
  | 'floor'
  | 'ceil';

type HistoryEntry = {
  ts: number;
  label: string;
  value: number;
};

export default function init() {
  const resultEl = document.getElementById('result') as HTMLElement | null;
  const historyEl = document.getElementById('history') as HTMLUListElement | null;

  const aEl = document.getElementById('a') as HTMLInputElement | null;
  const bEl = document.getElementById('b') as HTMLInputElement | null;

  const copyBtn = document.getElementById('copyResult') as HTMLButtonElement | null;

  if (!resultEl || !aEl || !bEl) return;

  const nf = new Intl.NumberFormat(undefined, { maximumFractionDigits: 10 });
  const history: HistoryEntry[] = [];

  const parseNumber = (el: HTMLInputElement) => {
    const raw = (el.value ?? '').trim();
    if (raw === '') return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : NaN;
  };

  const format = (n: number) => {
    if (!Number.isFinite(n)) return 'Error';
    if (Object.is(n, -0)) return '0';
    return nf.format(n);
  };

  const setResult = (n: number, label?: string) => {
    resultEl.textContent = format(n);
    if (label && Number.isFinite(n)) {
      history.unshift({ ts: Date.now(), label, value: n });
      history.splice(30);
      renderHistory();
    }
  };

  const renderHistory = () => {
    if (!historyEl) return;

    historyEl.innerHTML = '';
    for (const item of history) {
      const li = document.createElement('li');
      li.className =
        'flex items-center justify-between gap-3 p-3 rounded-lg border border-input bg-input';

      const left = document.createElement('div');
      left.className = 'text-input';
      left.textContent = item.label;

      const right = document.createElement('button');
      right.type = 'button';
      right.className =
        'font-mono text-heading px-2 py-1 rounded-md border border-input hover:opacity-90 transition';
      right.textContent = format(item.value);
      right.title = 'Use result as A';
      right.setAttribute('aria-label', 'Use result as A');

      right.addEventListener('click', () => {
        aEl.value = String(item.value);
        showMessage('Result copied into A.', { timeoutMs: 2000 });
      });

      li.append(left, right);
      historyEl.appendChild(li);
    }
  };

  const compute = (op: Op) => {
    const a = parseNumber(aEl);
    const b = parseNumber(bEl);

    if (Number.isNaN(a) || Number.isNaN(b)) {
      showMessage('Please enter valid numbers.', { timeoutMs: 2000 });
      setResult(NaN);
      return;
    }

    let res: number = NaN;
    let label = '';

    // ... existing code ...
    switch (op) {
      case '+':
        res = a + b;
        label = `${a} + ${b}`;
        break;
      case '-':
        res = a - b;
        label = `${a} − ${b}`;
        break;
      case '*':
        res = a * b;
        label = `${a} × ${b}`;
        break;
      case '/':
        if (b === 0) {
          showMessage('Division by 0 is not allowed.', { timeoutMs: 2000 });
          setResult(NaN);
          return;
        }
        res = a / b;
        label = `${a} ÷ ${b}`;
        break;

      case 'pow':
        res = Math.pow(a, b);
        label = `${a} ^ ${b}`;
        break;
      case 'mod':
        if (b === 0) {
          showMessage('Modulo by 0 is not allowed.', { timeoutMs: 2000 });
          setResult(NaN);
          return;
        }
        res = a % b;
        label = `${a} mod ${b}`;
        break;

      case 'min':
        res = Math.min(a, b);
        label = `min(${a}, ${b})`;
        break;
      case 'max':
        res = Math.max(a, b);
        label = `max(${a}, ${b})`;
        break;

      case 'percentOf':
        res = (a / 100) * b;
        label = `${a}% of ${b}`;
        break;

      case 'sqrtA':
        if (a < 0) {
          showMessage('Cannot take √ of a negative number (A).', { timeoutMs: 2000 });
          setResult(NaN);
          return;
        }
        res = Math.sqrt(a);
        label = `√(${a})`;
        break;
      case 'sqrtB':
        if (b < 0) {
          showMessage('Cannot take √ of a negative number (B).', { timeoutMs: 2000 });
          setResult(NaN);
          return;
        }
        res = Math.sqrt(b);
        label = `√(${b})`;
        break;

      case 'absA':
        res = Math.abs(a);
        label = `|${a}|`;
        break;
      case 'absB':
        res = Math.abs(b);
        label = `|${b}|`;
        break;

      case 'round':
        res = Math.round(a);
        label = `round(${a})`;
        break;
      case 'floor':
        res = Math.floor(a);
        label = `floor(${a})`;
        break;
      case 'ceil':
        res = Math.ceil(a);
        label = `ceil(${a})`;
        break;
    }
    setResult(res, label);
  };

  const clearAll = () => {
    aEl.value = '';
    bEl.value = '';
    setResult(0);
  };

  const swap = () => {
    const tmp = aEl.value;
    aEl.value = bEl.value;
    bEl.value = tmp;
    showMessage('A and B swapped.', { timeoutMs: 2000 });
  };

  const negate = (which: 'A' | 'B') => {
    const el = which === 'A' ? aEl : bEl;
    const n = parseNumber(el);
    if (!Number.isFinite(n)) {
      showMessage(`Please enter a valid number in ${which}.`, { timeoutMs: 2000 });
      return;
    }
    el.value = String(-n);
    showMessage(`${which} negated.`);
  };

  const clearHistory = () => {
    history.length = 0;
    renderHistory();
    showMessage('History cleared.', { timeoutMs: 2000 });
  };

  const copyResult = async () => {
    const text = resultEl.textContent ?? '';
    try {
      await navigator.clipboard.writeText(text);
      showMessage('Result copied to clipboard.', { timeoutMs: 2000 });
    } catch {
      showMessage('Copy failed (clipboard not available).', { timeoutMs: 2000 });
    }
  };

  const onDocClick = (e: MouseEvent) => {
    const t = e.target as HTMLElement | null;
    if (!t) return;

    const op = t.getAttribute('data-op') as Op | null;
    if (op) {
      compute(op);
      return;
    }

    const action = t.getAttribute('data-action');
    if (!action) return;

    // ... existing code ...
    if (action === 'swap') swap();
    else if (action === 'clear') clearAll();
    else if (action === 'negateA') negate('A');
    else if (action === 'negateB') negate('B');
    else if (action === 'clearHistory') clearHistory();
  };

  const onDocKeyDown = (e: KeyboardEvent) => {
    // Keyboard shortcuts:
    // Enter => "+"
    // Shift+Enter => "*"
    // Ctrl/Cmd+L => clear
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      if (e.shiftKey) compute('*');
      else compute('+');
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      clearAll();
    }
  };

  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onDocKeyDown);
  copyBtn?.addEventListener('click', copyResult);

  // Initial render
  setResult(0);
  renderHistory();

  // Cleanup to prevent duplicate listeners when navigating away/back
  return () => {
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('keydown', onDocKeyDown);
    copyBtn?.removeEventListener('click', copyResult);
  };
}
