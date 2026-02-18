import { format as sqlFormat } from 'sql-formatter';
import htmlFormat from 'html-format';

export type SupportedFormat = 'json' | 'xml' | 'html' | 'css' | 'sql' | 'javascript' | 'typescript' | 'java';

/**
 * Format JSON string with indentation
 */
function formatJson(input: string, indent = 2): string {
  const parsed = JSON.parse(input);
  return JSON.stringify(parsed, null, indent);
}

/**
 * Minify JSON by removing whitespace
 */
function minifyJson(input: string): string {
  const parsed = JSON.parse(input);
  return JSON.stringify(parsed);
}

/**
 * Format XML string with indentation
 */
function formatXml(input: string, indent = 2): string {
  const PADDING = ' '.repeat(indent);
  let formatted = '';
  let pad = 0;

  // Remove existing formatting
  const lines = input.replace(/>\s*</g, '><').split(/(<[^>]+>)/);

  for (const node of lines) {
    if (!node.trim()) continue;

    if (node.match(/^<\/\w/)) {
      // Closing tag
      pad -= 1;
    }

    formatted += PADDING.repeat(Math.max(0, pad)) + node.trim() + '\n';

    if (node.match(/^<\w([^>]*[^\/])?>.*$/) && !node.match(/^<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)/i)) {
      // Opening tag (not self-closing, not void element)
      if (!node.match(/<.*\/>/)) {
        pad += 1;
      }
    }
  }

  return formatted.trim();
}

/**
 * Minify XML by removing unnecessary whitespace
 */
function minifyXml(input: string): string {
  return input
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ')
    .replace(/>\s+/g, '>')
    .replace(/\s+</g, '<')
    .trim();
}

/**
 * Format HTML string with indentation
 */
function formatHtml(input: string, indent = 2): string {
  return htmlFormat(input, ' '.repeat(indent));
}

/**
 * Minify HTML by removing unnecessary whitespace
 */
function minifyHtml(input: string): string {
  return input
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Format CSS string with indentation
 */
function formatCss(input: string, indent = 2): string {
  const PADDING = ' '.repeat(indent);
  let formatted = '';
  let depth = 0;
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    const nextChar = input[i + 1];

    // Handle strings
    if ((char === '"' || char === "'") && input[i - 1] !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
      formatted += char;
      continue;
    }

    if (inString) {
      formatted += char;
      continue;
    }

    if (char === '{') {
      formatted += ' {\n' + PADDING.repeat(depth + 1);
      depth++;
    } else if (char === '}') {
      depth--;
      formatted = formatted.trimEnd() + '\n' + PADDING.repeat(depth) + '}\n' + PADDING.repeat(depth);
    } else if (char === ';') {
      formatted += ';\n' + PADDING.repeat(depth);
    } else if (char === ':' && nextChar !== ':') {
      formatted += ': ';
      // Skip whitespace after colon
      while (input[i + 1] === ' ' || input[i + 1] === '\t') i++;
    } else if (char === '\n' || char === '\r') {
      // Skip
    } else if (char === ' ' || char === '\t') {
      // Collapse whitespace
      if (formatted.length > 0 && !/[\s{;:]$/.test(formatted)) {
        formatted += ' ';
      }
    } else {
      formatted += char;
    }
  }

  // Clean up extra whitespace
  return formatted
    .replace(/\n\s*\n/g, '\n')
    .replace(/{\s+}/g, '{}')
    .trim();
}

/**
 * Minify CSS by removing unnecessary whitespace and comments
 */
function minifyCss(input: string): string {
  return input
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove comments
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};:,>+~])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
}

/**
 * Format SQL string
 */
function formatSql(input: string): string {
  return sqlFormat(input, {
    language: 'sql',
    tabWidth: 2,
    keywordCase: 'upper',
    linesBetweenQueries: 2,
  });
}

/**
 * Minify SQL by removing unnecessary whitespace
 */
function minifySql(input: string): string {
  return input
    .replace(/--.*$/gm, '') // Remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Basic JavaScript/TypeScript formatter
 * Uses simple indentation rules - not a full parser
 */
function formatJsLike(input: string, indent = 2): string {
  const PADDING = ' '.repeat(indent);
  let formatted = '';
  let depth = 0;
  let inString = false;
  let stringChar = '';
  let inTemplate = false;
  let templateDepth = 0;
  let inComment = false;
  let inLineComment = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    const nextChar = input[i + 1];
    const prevChar = input[i - 1];

    // Handle line comments
    if (!inString && !inComment && char === '/' && nextChar === '/') {
      formatted += '//';
      inLineComment = true;
      i++;
      continue;
    }

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
        formatted += '\n' + PADDING.repeat(depth);
      } else {
        formatted += char;
      }
      continue;
    }

    // Handle block comments
    if (!inString && !inComment && char === '/' && nextChar === '*') {
      formatted += '/*';
      inComment = true;
      i++;
      continue;
    }

    if (inComment) {
      formatted += char;
      if (char === '*' && nextChar === '/') {
        formatted += '/';
        inComment = false;
        i++;
      }
      continue;
    }

    // Handle template literals
    if (char === '`' && prevChar !== '\\') {
      inTemplate = !inTemplate;
      formatted += char;
      continue;
    }

    if (inTemplate) {
      if (char === '$' && nextChar === '{') {
        templateDepth++;
      } else if (char === '}' && templateDepth > 0) {
        templateDepth--;
      }
      formatted += char;
      continue;
    }

    // Handle strings
    if ((char === '"' || char === "'") && prevChar !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
      formatted += char;
      continue;
    }

    if (inString) {
      formatted += char;
      continue;
    }

    // Handle braces and brackets
    if (char === '{' || char === '[' || char === '(') {
      formatted += char + '\n' + PADDING.repeat(depth + 1);
      depth++;
    } else if (char === '}' || char === ']' || char === ')') {
      depth--;
      formatted = formatted.trimEnd() + '\n' + PADDING.repeat(depth) + char;
    } else if (char === ';') {
      formatted += ';\n' + PADDING.repeat(depth);
    } else if (char === ',') {
      formatted += ',\n' + PADDING.repeat(depth);
    } else if (char === '\n' || char === '\r') {
      // Skip original newlines
    } else if (char === ' ' || char === '\t') {
      // Collapse whitespace
      if (formatted.length > 0 && !/[\s{(\[;,:]$/.test(formatted)) {
        formatted += ' ';
      }
    } else {
      formatted += char;
    }
  }

  // Clean up extra whitespace
  return formatted
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .replace(/\(\s*\)/g, '()')
    .replace(/\[\s*\]/g, '[]')
    .replace(/{\s*}/g, '{}')
    .trim();
}

/**
 * Minify JavaScript/TypeScript/Java by removing comments and whitespace
 */
function minifyJsLike(input: string): string {
  // Remove single-line comments (but not URLs)
  let result = input.replace(/(?<!:)\/\/.*$/gm, '');
  // Remove multi-line comments
  result = result.replace(/\/\*[\s\S]*?\*\//g, '');
  // Collapse whitespace, but preserve string contents
  let minified = '';
  let inString = false;
  let stringChar = '';
  let inTemplate = false;

  for (let i = 0; i < result.length; i++) {
    const char = result[i];
    const prevChar = result[i - 1];

    if (char === '`' && prevChar !== '\\') {
      inTemplate = !inTemplate;
      minified += char;
      continue;
    }

    if (inTemplate) {
      minified += char;
      continue;
    }

    if ((char === '"' || char === "'") && prevChar !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
      minified += char;
      continue;
    }

    if (inString) {
      minified += char;
      continue;
    }

    if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
      if (minified.length > 0 && /[a-zA-Z0-9_$]$/.test(minified) && /^[a-zA-Z0-9_$]/.test(result[i + 1] || '')) {
        minified += ' ';
      }
    } else {
      minified += char;
    }
  }

  return minified.trim();
}

/**
 * Format code based on the selected format
 */
export function formatCode(input: string, format: SupportedFormat, indent = 2): string {
  const trimmed = input.trim();
  if (!trimmed) return '';

  switch (format) {
    case 'json':
      return formatJson(trimmed, indent);
    case 'xml':
      return formatXml(trimmed, indent);
    case 'html':
      return formatHtml(trimmed, indent);
    case 'css':
      return formatCss(trimmed, indent);
    case 'sql':
      return formatSql(trimmed);
    case 'javascript':
    case 'typescript':
    case 'java':
      return formatJsLike(trimmed, indent);
    default:
      return trimmed;
  }
}

/**
 * Minify code based on the selected format
 */
export function minifyCode(input: string, format: SupportedFormat): string {
  const trimmed = input.trim();
  if (!trimmed) return '';

  switch (format) {
    case 'json':
      return minifyJson(trimmed);
    case 'xml':
      return minifyXml(trimmed);
    case 'html':
      return minifyHtml(trimmed);
    case 'css':
      return minifyCss(trimmed);
    case 'sql':
      return minifySql(trimmed);
    case 'javascript':
    case 'typescript':
    case 'java':
      return minifyJsLike(trimmed);
    default:
      return trimmed;
  }
}

/**
 * Map format to Shiki language identifier
 */
export function getShikiLanguage(format: SupportedFormat): string {
  switch (format) {
    case 'json':
      return 'json';
    case 'xml':
      return 'xml';
    case 'html':
      return 'html';
    case 'css':
      return 'css';
    case 'sql':
      return 'sql';
    case 'javascript':
      return 'javascript';
    case 'typescript':
      return 'typescript';
    case 'java':
      return 'java';
    default:
      return 'text';
  }
}

