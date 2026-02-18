import { format as sqlFormat } from 'sql-formatter';
import * as prettier from 'prettier/standalone';
import * as prettierPluginBabel from 'prettier/plugins/babel';
import * as prettierPluginEstree from 'prettier/plugins/estree';
import * as prettierPluginHtml from 'prettier/plugins/html';
import * as prettierPluginCss from 'prettier/plugins/postcss';
import * as prettierPluginYaml from 'prettier/plugins/yaml';
import * as prettierPluginGraphql from 'prettier/plugins/graphql';
import * as prettierPluginMarkdown from 'prettier/plugins/markdown';

export type SupportedFormat =
  | 'auto'
  | 'json'
  | 'xml'
  | 'html'
  | 'css'
  | 'sql'
  | 'javascript'
  | 'typescript'
  | 'java'
  | 'yaml'
  | 'markdown'
  | 'graphql'
  | 'text';

/**
 * Detect format from input string
 */
export function detectFormat(input: string): SupportedFormat {
  const trimmed = input.trim();
  if (!trimmed) return 'text';

  // JSON detection
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch (e) {
      // Not valid JSON, continue checking
    }
  }

  // XML/HTML detection
  if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
    if (
      trimmed.toLowerCase().includes('<!doctype html') ||
      trimmed.toLowerCase().includes('<html')
    ) {
      return 'html';
    }
    return 'xml';
  }

  // SQL detection (basic keywords)
  if (/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|WITH)\s/i.test(trimmed)) {
    return 'sql';
  }

  // CSS detection
  if (
    trimmed.includes('{') &&
    trimmed.includes('}') &&
    trimmed.includes(':') &&
    !trimmed.includes('function')
  ) {
    return 'css';
  }

  // GraphQL detection
  if (
    trimmed.startsWith('query') ||
    trimmed.startsWith('mutation') ||
    trimmed.startsWith('type ') ||
    trimmed.startsWith('{')
  ) {
    // Simple check for GraphQL structure
    if (trimmed.includes('{') && !trimmed.includes(':') && !trimmed.includes('=')) {
      return 'graphql';
    }
  }

  // YAML detection (basic)
  if (trimmed.includes(': ') && !trimmed.includes('{') && !trimmed.includes('}')) {
    return 'yaml';
  }

  // Default to JavaScript/TypeScript as it's most common for code snippets
  return 'javascript';
}

/**
 * Format JSON string with indentation
 */
function formatJson(input: string, indent = 2): string {
  try {
    const parsed = JSON.parse(input);
    return JSON.stringify(parsed, null, indent);
  } catch (e) {
    // If JSON is invalid, return as is or throw
    throw new Error('Invalid JSON');
  }
}

/**
 * Minify JSON by removing whitespace
 */
function minifyJson(input: string): string {
  try {
    const parsed = JSON.parse(input);
    return JSON.stringify(parsed);
  } catch (e) {
    return input;
  }
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

    if (
      node.match(/^<\w([^>]*[^\/])?>.*$/) &&
      !node.match(/^<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)/i)
    ) {
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
async function formatHtml(input: string, indent = 2): Promise<string> {
  try {
    return await prettier.format(input, {
      parser: 'html',
      plugins: [prettierPluginHtml],
      tabWidth: indent,
      printWidth: 120,
    });
  } catch (e) {
    // Fallback to simple regex-based formatter if prettier fails
    return formatHtmlSimple(input, indent);
  }
}

/**
 * Simple HTML formatter (Fallback)
 */
function formatHtmlSimple(input: string, indent = 2): string {
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

    if (
      node.match(/^<\w([^>]*[^\/])?>.*$/) &&
      !node.match(/^<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)/i)
    ) {
      // Opening tag (not self-closing, not void element)
      if (!node.match(/<.*\/>/)) {
        pad += 1;
      }
    }
  }

  return formatted.trim();
}

/**
 * Minify HTML by removing unnecessary whitespace
 */
function minifyHtml(input: string): string {
  return input.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim();
}

/**
 * Format CSS string with indentation
 */
async function formatCss(input: string, indent = 2): Promise<string> {
  try {
    return await prettier.format(input, {
      parser: 'css',
      plugins: [prettierPluginCss],
      tabWidth: indent,
    });
  } catch (e) {
    // Fallback to simple formatter
    return formatCssSimple(input, indent);
  }
}

function formatCssSimple(input: string, indent = 2): string {
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
      formatted =
        formatted.trimEnd() + '\n' + PADDING.repeat(depth) + '}\n' + PADDING.repeat(depth);
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
 * Format JavaScript/TypeScript using Prettier
 */
async function formatJsLike(
  input: string,
  indent = 2,
  parser: 'babel' | 'typescript' = 'babel'
): Promise<string> {
  try {
    return await prettier.format(input, {
      parser: parser,
      plugins: [prettierPluginBabel, prettierPluginEstree],
      tabWidth: indent,
      semi: true,
      singleQuote: true,
      printWidth: 100,
    });
  } catch (e) {
    // Fallback to simple formatter
    return formatJsLikeSimple(input, indent);
  }
}

/**
 * Basic JavaScript/TypeScript formatter (Fallback)
 * Uses simple indentation rules - not a full parser
 */
function formatJsLikeSimple(input: string, indent = 2): string {
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
    .replace(/\[\s*]/g, '[]')
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
      if (
        minified.length > 0 &&
        /[a-zA-Z0-9_$]$/.test(minified) &&
        /^[a-zA-Z0-9_$]/.test(result[i + 1] || '')
      ) {
        minified += ' ';
      }
    } else {
      minified += char;
    }
  }

  return minified.trim();
}

/**
 * Format YAML string
 */
async function formatYaml(input: string, indent = 2): Promise<string> {
  try {
    return await prettier.format(input, {
      parser: 'yaml',
      plugins: [prettierPluginYaml],
      tabWidth: indent,
    });
  } catch (e) {
    return input; // Fallback: return original
  }
}

/**
 * Format GraphQL string
 */
async function formatGraphql(input: string, indent = 2): Promise<string> {
  try {
    return await prettier.format(input, {
      parser: 'graphql',
      plugins: [prettierPluginGraphql],
      tabWidth: indent,
    });
  } catch (e) {
    return input; // Fallback: return original
  }
}

/**
 * Format Markdown string
 */
async function formatMarkdown(input: string, indent = 2): Promise<string> {
  try {
    return await prettier.format(input, {
      parser: 'markdown',
      plugins: [prettierPluginMarkdown],
      tabWidth: indent,
    });
  } catch (e) {
    return input; // Fallback: return original
  }
}

/**
 * Format code based on the selected format
 */
export async function formatCode(
  input: string,
  format: SupportedFormat,
  indent = 2
): Promise<string> {
  const trimmed = input.trim();
  if (!trimmed) return '';

  let targetFormat = format;
  if (targetFormat === 'auto') {
    targetFormat = detectFormat(trimmed);
  }

  switch (targetFormat) {
    case 'json':
      return formatJson(trimmed, indent);
    case 'xml':
      return formatXml(trimmed, indent);
    case 'html':
      return await formatHtml(trimmed, indent);
    case 'css':
      return await formatCss(trimmed, indent);
    case 'sql':
      return formatSql(trimmed);
    case 'javascript':
      return await formatJsLike(trimmed, indent, 'babel');
    case 'typescript':
      return await formatJsLike(trimmed, indent, 'typescript');
    case 'java':
      return formatJsLikeSimple(trimmed, indent);
    case 'yaml':
      return await formatYaml(trimmed, indent);
    case 'graphql':
      return await formatGraphql(trimmed, indent);
    case 'markdown':
      return await formatMarkdown(trimmed, indent);
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

  let targetFormat = format;
  if (targetFormat === 'auto') {
    targetFormat = detectFormat(trimmed);
  }

  switch (targetFormat) {
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
    case 'yaml':
    case 'markdown':
    case 'graphql':
      return trimmed; // No minification for these formats
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
    case 'yaml':
      return 'yaml';
    case 'markdown':
      return 'markdown';
    case 'graphql':
      return 'graphql';
    default:
      return 'text';
  }
}
