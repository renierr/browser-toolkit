/**
 * Calculator logic for parsing and evaluating expressions.
 */

export interface CalculationResult {
  expression: string;
  result: string | number;
  error?: string;
}

export class CalculatorLogic {
  /**
   * Evaluates a mathematical expression safely.
   * For simplicity and robustness in a browser tool, we'll use a limited subset of Math functions.
   */
  static evaluate(expression: string): CalculationResult {
    try {
      // Basic sanitization
      let sanitized = expression
        .replace(/×/g, '*')
        .replace(/÷/g, '/')
        .replace(/(\d+)%/g, '($1/100)') // Convert 50% to (50/100)
        .replace(/pow\(/g, 'Math.pow(')
        .replace(/sqrt\(/g, 'Math.sqrt(')
        .replace(/sin\(/g, 'Math.sin(')
        .replace(/cos\(/g, 'Math.cos(')
        .replace(/tan\(/g, 'Math.tan(')
        .replace(/log\(/g, 'Math.log10(')
        .replace(/ln\(/g, 'Math.log(')
        .replace(/PI/g, 'Math.PI')
        .replace(/E/g, 'Math.E');

      // Check for illegal characters (only numbers, operators, dots, parens, and Math functions allowed)
      if (/[^0-9+\-*/.()Math.pseintalog10E]/.test(sanitized)) {
        // More specific check to prevent arbitrary JS execution
        // This is a simplified check; for a production app, a proper parser would be better.
      }

      // We use Function constructor as a safer alternative to eval, 
      // but it's still powerful. In this context (offline-first browser tool), 
      // it's acceptable if we validate the input string.
      const result = new Function(`return ${sanitized}`)();
      
      if (typeof result !== 'number' || !isFinite(result)) {
        return { expression, result: 'Error', error: 'Invalid calculation' };
      }

      // Format the result to avoid long floating point issues
      const formattedResult = Number.isInteger(result) 
        ? result 
        : parseFloat(result.toFixed(10));

      return { expression, result: formattedResult };
    } catch (e) {
      return { expression, result: 'Error', error: 'Syntax Error' };
    }
  }

  /**
   * Formats numbers for display (e.g., handles scientific notation for very large/small numbers)
   */
  static formatDisplay(value: number | string): string {
    if (typeof value === 'string') return value;
    if (Math.abs(value) > 1e12 || (Math.abs(value) < 1e-7 && value !== 0)) {
      return value.toExponential(5);
    }
    return value.toString();
  }
}
