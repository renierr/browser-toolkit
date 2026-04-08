import { SharedCalculator } from '../../calculator/core';
import type { CalculationResult } from '../../calculator/logic';

export interface CalculatorDOM {
  calcCurrent: HTMLElement | null;
  calcLastOp: HTMLElement | null;
  input: HTMLInputElement | null;
}

export interface CalculatorHandlers {
  handleCalcInput: (val: string) => void;
  handleCalcBackspace: () => void;
  handleCalcBracket: () => void;
  handleCalcEquals: () => CalculationResult;
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
  const calculator = new SharedCalculator();

  function updateCalcDisplay(): void {
    if (dom.calcCurrent) dom.calcCurrent.textContent = calculator.getInput();
  }

  function handleCalcInput(val: string): void {
    if (calculator.getInput() === 'Error') {
      calculator.clear();
      if (dom.calcLastOp) dom.calcLastOp.textContent = '';
    }

    calculator.appendInput(val);
    updateCalcDisplay();
  }

  function handleCalcBackspace(): void {
    calculator.backspace();
    updateCalcDisplay();
  }

  function handleCalcBracket(): void {
    calculator.toggleBracket();
    updateCalcDisplay();
  }

  function handleCalcEquals(): CalculationResult {
    if (calculator.getInput() === '0' && dom.calcLastOp?.textContent === '') {
      return { expression: '', result: 0 };
    }

    const calculation = calculator.evaluate();

    if (calculation.error) {
      if (dom.calcLastOp) dom.calcLastOp.textContent = 'Error';
    } else {
      if (dom.calcLastOp) dom.calcLastOp.textContent = `${calculation.expression} =`;
    }
    updateCalcDisplay();

    return calculation;
  }

  function handleCalcCopy(): void {
    const calcInput = calculator.getInput();
    if (navigator.clipboard && calcInput) {
      navigator.clipboard.writeText(calcInput).catch((err) => {
        console.error('[UnitConverter] Failed to copy:', err);
      });
    }
  }

  function handleCalcSend(): void {
    const calcInput = calculator.getInput();
    if (dom.input && calcInput && calcInput !== '0' && calcInput !== 'Error') {
      dom.input.value = calcInput;
    }
  }

  function handleCalcClear(): void {
    calculator.clear();
    if (dom.calcLastOp) dom.calcLastOp.textContent = '';
    updateCalcDisplay();
  }

  function getCalcInput(): string {
    return calculator.getInput();
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
