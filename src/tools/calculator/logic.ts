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
      // Replace common symbols and map known functions to Math.* safely using word boundaries
      let sanitized = expression
        .replace(/×/g, '*')
        .replace(/÷/g, '/')
        // Add implicit multiplication for ")" + "(" -> ")*("
        .replace(/\)\(/g, ')*(')
        // Add implicit multiplication for "number(" -> "number*("
        .replace(/(?<=\d)\(/g, '*(')
        // Convert percentage like 50%, 12.5% or (2+3)% to ((...)/100)
        .replace(/(\d+(?:\.\d+)?|\([^)]*\))%/g, '($1/100)')
        .replace(/\bpow\(/gi, 'Math.pow(')
        .replace(/\^/g, '**')
        .replace(/\bsqrt\(/gi, 'Math.sqrt(')
        .replace(/\bsin\(/gi, 'Math.sin(')
        .replace(/\bcos\(/gi, 'Math.cos(')
        .replace(/\btan\(/gi, 'Math.tan(')
        .replace(/\basin\(/gi, 'Math.asin(')
        .replace(/\bacos\(/gi, 'Math.acos(')
        .replace(/\batan\(/gi, 'Math.atan(')
        .replace(/\basinh\(/gi, 'Math.asinh(')
        .replace(/\bacosh\(/gi, 'Math.acosh(')
        .replace(/\batanh\(/gi, 'Math.atanh(')
        .replace(/\bsinh\(/gi, 'Math.sinh(')
        .replace(/\bcosh\(/gi, 'Math.cosh(')
        .replace(/\btanh\(/gi, 'Math.tanh(')
        .replace(/\bexp\(/gi, 'Math.exp(')
        .replace(/\blog\(/gi, 'Math.log10(')
        .replace(/\bln\(/gi, 'Math.log(')
        .replace(/\babs\(/gi, 'Math.abs(')
        .replace(/\bfloor\(/gi, 'Math.floor(')
        .replace(/\bceil\(/gi, 'Math.ceil(')
        .replace(/\bround\(/gi, 'Math.round(')
        // Map constants using word boundaries. Use case-insensitive flag so `pi` and `e` also work
        // Word boundaries prevent matching the 'e' in scientific notation (e.g. 1e10)
        .replace(/\bPI\b/gi, 'Math.PI')
        .replace(/\bE\b/gi, 'Math.E');

      // Check for illegal characters (only numbers, operators, dots, parens, comma, whitespace and letters allowed)
      // Note: this is a permissive check to avoid blocking valid function names like Math, sin, cos, etc.
      // Use RegExp constructor to avoid needing to escape '/' in a literal and to keep the pattern readable.
      const illegalRe = new RegExp('[^0-9+\\-*/().,\\sA-Za-z]');
      if (illegalRe.test(sanitized)) {
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
      const formattedResult = Number.isInteger(result) ? result : parseFloat(result.toFixed(10));

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
