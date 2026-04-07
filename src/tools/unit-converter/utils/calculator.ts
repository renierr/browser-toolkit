import { evaluateExpression } from './converter';
import type { CalculatorResult } from '../types';

export interface CalculatorDOM {
  calcCurrent: HTMLElement | null;
  calcLastOp: HTMLElement | null;
  input: HTMLInputElement | null;
}

export interface CalculatorHandlers {
  handleCalcInput: (val: string) => void;
  handleCalcBackspace: () => void;
  handleCalcBracket: () => void;
  handleCalcEquals: () => CalculatorResult;
  handleCalcCopy: () => void;
  handleCalcSend: () => void;
  handleCalcClear: () => void;
  updateCalcDisplay: () => void;
  getCalcInput: () => string;
}

export function createCalculator(dom: CalculatorDOM): {
  handlers: CalculatorHandlers;
  getCalcInput: () => string;
} {
  let calcInput = '0';

  function updateCalcDisplay(): void {
    if (dom.calcCurrent) dom.calcCurrent.textContent = calcInput;
  }

  function handleCalcInput(val: string): void {
    if (calcInput === 'Error') {
      calcInput = '0';
      if (dom.calcLastOp) dom.calcLastOp.textContent = '';
    }

    const isOperator = (s: string): boolean => /[+\-*/^]/.test(s);

    if (calcInput === '0') {
      if (/[0-9.]/.test(val)) {
        calcInput = val;
        updateCalcDisplay();
        return;
      }
      if (/\w+\($/.test(val) || /^PI$/.test(val) || /^E$/.test(val) || val === '(') {
        calcInput = val;
        updateCalcDisplay();
        return;
      }
      calcInput = '0' + val;
      updateCalcDisplay();
      return;
    }

    const lastChar = calcInput[calcInput.length - 1];
    if (isOperator(lastChar) && isOperator(val)) {
      calcInput = calcInput.slice(0, -1) + val;
      updateCalcDisplay();
      return;
    }

    calcInput += val;
    updateCalcDisplay();
  }

  function handleCalcBackspace(): void {
    if (calcInput.length > 1) {
      calcInput = calcInput.slice(0, -1);
    } else {
      calcInput = '0';
    }
    updateCalcDisplay();
  }

  function handleCalcBracket(): void {
    if (calcInput === '0') {
      calcInput = '(';
      updateCalcDisplay();
      return;
    }

    const lastChar = calcInput[calcInput.length - 1];
    if (lastChar === '(' || lastChar === ')') {
      calcInput += '(';
    } else {
      const openCount = (calcInput.match(/\(/g) || []).length;
      const closeCount = (calcInput.match(/\)/g) || []).length;
      calcInput += openCount > closeCount ? ')' : '(';
    }
    updateCalcDisplay();
  }

  function handleCalcEquals(): CalculatorResult {
    if (calcInput === '0' && dom.calcLastOp?.textContent === '') {
      return { expression: '', result: 0 };
    }

    let balancedInput = calcInput;
    const opens = (balancedInput.match(/\(/g) || []).length;
    const closes = (balancedInput.match(/\)/g) || []).length;
    if (opens > closes) {
      balancedInput = balancedInput + ')'.repeat(opens - closes);
    }

    const sanitizedInput = balancedInput.replace(/[+\-*/^]$/, '');
    const calculation = evaluateExpression(sanitizedInput);

    if (calculation.error) {
      if (dom.calcLastOp) dom.calcLastOp.textContent = 'Error';
      calcInput = calculation.result.toString();
    } else {
      if (dom.calcLastOp) dom.calcLastOp.textContent = `${calculation.expression} =`;
      calcInput = calculation.result.toString();
    }
    updateCalcDisplay();

    return calculation;
  }

  function handleCalcCopy(): void {
    if (navigator.clipboard && calcInput) {
      navigator.clipboard.writeText(calcInput).catch((err) => {
        console.error('[UnitConverter] Failed to copy:', err);
      });
    }
  }

  function handleCalcSend(): void {
    if (dom.input && calcInput && calcInput !== '0' && calcInput !== 'Error') {
      dom.input.value = calcInput;
    }
  }

  function handleCalcClear(): void {
    calcInput = '0';
    if (dom.calcLastOp) dom.calcLastOp.textContent = '';
    updateCalcDisplay();
  }

  function getCalcInput(): string {
    return calcInput;
  }

  return {
    handlers: {
      handleCalcInput,
      handleCalcBackspace,
      handleCalcBracket,
      handleCalcEquals,
      handleCalcCopy,
      handleCalcSend,
      handleCalcClear,
      updateCalcDisplay,
      getCalcInput,
    },
    getCalcInput,
  };
}
