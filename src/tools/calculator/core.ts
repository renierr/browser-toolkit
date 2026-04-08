import { CalculatorLogic, type CalculationResult } from './logic';

type SharedCalculatorOptions = {
  formatResult?: (value: number | string) => string;
};

export class SharedCalculator {
  private currentInput = '0';
  private readonly formatResult: (value: number | string) => string;

  constructor(options?: SharedCalculatorOptions) {
    this.formatResult = options?.formatResult ?? ((value) => value.toString());
  }

  getInput(): string {
    return this.currentInput;
  }

  setInput(value: string): void {
    this.currentInput = value || '0';
  }

  clear(): void {
    this.currentInput = '0';
  }

  appendInput(value: string): void {
    const isOperator = (token: string): boolean => /[+\-*/^]/.test(token);

    if (this.currentInput === '0') {
      if (/[0-9.]/.test(value)) {
        this.currentInput = value;
        return;
      }

      if (/\w+\($/.test(value) || /^PI$/i.test(value) || /^E$/i.test(value) || value === '(') {
        this.currentInput = value;
        return;
      }

      this.currentInput = `0${value}`;
      return;
    }

    const lastChar = this.currentInput[this.currentInput.length - 1];
    if (isOperator(lastChar) && isOperator(value)) {
      this.currentInput = this.currentInput.slice(0, -1) + value;
      return;
    }

    this.currentInput += value;
  }

  backspace(): void {
    if (this.currentInput.length > 1) {
      this.currentInput = this.currentInput.slice(0, -1);
      return;
    }

    this.currentInput = '0';
  }

  toggleBracket(): void {
    if (this.currentInput === '0') {
      this.currentInput = '(';
      return;
    }

    const lastChar = this.currentInput[this.currentInput.length - 1];
    if (lastChar === '(' || lastChar === ')') {
      this.currentInput += '(';
      return;
    }

    const openCount = (this.currentInput.match(/\(/g) || []).length;
    const closeCount = (this.currentInput.match(/\)/g) || []).length;
    this.currentInput += openCount > closeCount ? ')' : '(';
  }

  evaluate(): CalculationResult {
    const balancedInput = this.balanceParens(this.currentInput);
    const sanitizedInput = balancedInput.replace(/[+\-*/^]$/, '');
    const calculation = CalculatorLogic.evaluate(sanitizedInput);

    if (calculation.error) {
      this.currentInput = calculation.result.toString();
      return calculation;
    }

    this.currentInput = this.formatResult(calculation.result);
    return calculation;
  }

  private balanceParens(input: string): string {
    const opens = (input.match(/\(/g) || []).length;
    const closes = (input.match(/\)/g) || []).length;
    if (opens <= closes) {
      return input;
    }

    return input + ')'.repeat(opens - closes);
  }
}
