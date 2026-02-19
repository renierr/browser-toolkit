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
  | 'json5'
  | 'xml'
  | 'html'
  | 'vue'
  | 'angular'
  | 'css'
  | 'scss'
  | 'less'
  | 'sql'
  | 'javascript'
  | 'typescript'
  | 'java'
  | 'yaml'
  | 'markdown'
  | 'mdx'
  | 'graphql'
  // Highlight-only formats (no Prettier support)
  | 'c'
  | 'cpp'
  | 'csharp'
  | 'go'
  | 'rust'
  | 'python'
  | 'ruby'
  | 'php'
  | 'swift'
  | 'kotlin'
  | 'bash'
  | 'powershell'
  | 'dockerfile'
  | 'toml'
  | 'ini'
  | 'text';

/**
 * Detect format from input string
 */
export function detectFormat(input: string): SupportedFormat {
  const trimmed = input.trim();
  if (!trimmed) return 'text';

  const firstLine = trimmed.split('\n')[0].trim();
  const lowerTrimmed = trimmed.toLowerCase();

  // ===== Shebang detection (must be first) =====
  if (firstLine.startsWith('#!')) {
    if (firstLine.includes('python')) return 'python';
    if (firstLine.includes('node') || firstLine.includes('bun') || firstLine.includes('deno')) return 'javascript';
    if (firstLine.includes('ruby')) return 'ruby';
    if (firstLine.includes('php')) return 'php';
    if (firstLine.includes('bash') || firstLine.includes('sh') || firstLine.includes('zsh')) return 'bash';
    if (firstLine.includes('pwsh') || firstLine.includes('powershell')) return 'powershell';
    if (firstLine.includes('perl')) return 'text'; // Not supported, fallback
    return 'bash'; // Default shebang to bash
  }

  // ===== Dockerfile detection =====
  if (/^FROM\s+\S+/im.test(trimmed) && /^(RUN|COPY|CMD|ENTRYPOINT|WORKDIR|ENV|EXPOSE|ARG|LABEL)\s/im.test(trimmed)) {
    return 'dockerfile';
  }

  // ===== JSON/JSON5 detection =====
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // Check if it looks like JSON5 (has comments or trailing commas or unquoted keys)
      if (
        trimmed.includes('//') ||
        trimmed.includes('/*') ||
        /,\s*[}\]]/.test(trimmed) ||
        /^\s*\w+\s*:/m.test(trimmed)
      ) {
        return 'json5';
      }
    }
  }

  // ===== Vue SFC detection =====
  if (/<template[\s>]/i.test(trimmed) && (/<script[\s>]/i.test(trimmed) || /<style[\s>]/i.test(trimmed))) {
    return 'vue';
  }

  // ===== Angular template detection =====
  if (/<[^>]+\*ng(If|For|Switch)|<[^>]+\[(ngClass|ngStyle|ngModel)\]|\{\{[^}]+\}\}/i.test(trimmed)) {
    return 'angular';
  }

  // ===== XML/HTML detection =====
  if (trimmed.startsWith('<') && (trimmed.endsWith('>') || /<\/\w+>\s*$/.test(trimmed))) {
    if (
      lowerTrimmed.includes('<!doctype html') ||
      lowerTrimmed.includes('<html') ||
      /<(head|body|div|span|p|a|img|script|link|meta|nav|section|article|header|footer)[\s>]/i.test(trimmed)
    ) {
      return 'html';
    }
    if (trimmed.startsWith('<?xml') || /<\w+[^>]*xmlns/i.test(trimmed)) {
      return 'xml';
    }
    // Could be HTML or XML - check for common HTML patterns
    if (/<(br|hr|input|button|form|table|ul|ol|li|h[1-6])[\s>\/]/i.test(trimmed)) {
      return 'html';
    }
    return 'xml';
  }

  // ===== Markdown detection =====
  if (
    /^#{1,6}\s+\S/m.test(trimmed) || // Headers
    /^\s*[-*+]\s+\S/m.test(trimmed) && /^\s*[-*+]\s+\S/m.test(trimmed.split('\n').slice(1).join('\n')) || // Lists
    /\[.+\]\(.+\)/.test(trimmed) || // Links
    /^```\w*/m.test(trimmed) || // Code blocks
    /^\s*>\s+\S/m.test(trimmed) || // Blockquotes
    /\*\*.+\*\*|__.+__/.test(trimmed) // Bold
  ) {
    // Check for MDX (JSX in markdown)
    if (/<[A-Z]\w*[\s>\/]/.test(trimmed) || /^import\s+.+from\s+['"]/.test(trimmed)) {
      return 'mdx';
    }
    return 'markdown';
  }

  // ===== SQL detection =====
  if (/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|WITH|TRUNCATE|GRANT|REVOKE)\s/im.test(trimmed)) {
    return 'sql';
  }

  // ===== GraphQL detection =====
  if (
    /^(query|mutation|subscription|fragment|type|interface|enum|input|scalar|directive|extend|schema)\s/im.test(trimmed) ||
    (/^\s*\{\s*\w+/m.test(trimmed) && !trimmed.includes(':') && !trimmed.includes('=') && /\w+\s*\{/.test(trimmed))
  ) {
    return 'graphql';
  }

  // ===== TOML detection =====
  if (/^\s*\[\[?\w+(\.\w+)*\]?\]/m.test(trimmed) && /^\s*\w+\s*=\s*/m.test(trimmed)) {
    return 'toml';
  }

  // ===== INI detection =====
  if (/^\s*\[\w+\]\s*$/m.test(trimmed) && /^\s*\w+\s*=\s*\S/m.test(trimmed) && !trimmed.includes('[[')) {
    return 'ini';
  }

  // ===== YAML detection =====
  if (
    /^---\s*$/m.test(trimmed) || // YAML front matter
    (/^\s*\w[\w\s-]*:\s*(\S|$)/m.test(trimmed) && !trimmed.includes('{') && !trimmed.includes(';'))
  ) {
    return 'yaml';
  }

  // ===== PowerShell detection =====
  if (
    /^\s*\$\w+\s*=/m.test(trimmed) && /[-\w]+\s+-\w+/m.test(trimmed) || // Variables + cmdlet params
    /\b(Get-|Set-|New-|Remove-|Invoke-|Write-Host|Write-Output|ForEach-Object|Where-Object)\b/.test(trimmed) ||
    /^\s*function\s+\w+-\w+/im.test(trimmed) || // Function with verb-noun
    /\bparam\s*\(/i.test(trimmed) ||
    /\|\s*(Select-Object|Where-Object|ForEach-Object|Sort-Object|Group-Object)\b/.test(trimmed)
  ) {
    return 'powershell';
  }

  // ===== Bash/Shell detection =====
  if (
    /^\s*(if|then|elif|else|fi|for|do|done|while|case|esac|function)\b/m.test(trimmed) &&
    !/[{};]\s*$/m.test(firstLine) || // Exclude C-style
    /^\s*\w+\s*\(\)\s*\{/m.test(trimmed) || // Shell function
    /\$\{?\w+\}?/.test(trimmed) && /\b(echo|export|source|chmod|mkdir|rm|cp|mv|cat|grep|sed|awk|curl|wget)\b/.test(trimmed) ||
    /^\s*export\s+\w+=/m.test(trimmed) ||
    /\|\s*(grep|sed|awk|sort|uniq|head|tail|cut|xargs)\b/.test(trimmed)
  ) {
    return 'bash';
  }

  // ===== Python detection =====
  if (
    /^\s*def\s+\w+\s*\([^)]*\)\s*(->\s*\w+)?\s*:/m.test(trimmed) || // Function def
    /^\s*class\s+\w+(\([^)]*\))?\s*:/m.test(trimmed) || // Class def
    /^\s*(import|from)\s+\w+/m.test(trimmed) && !/\bimport\s*\{/.test(trimmed) || // Import (not JS)
    /^\s*(if|elif|else|for|while|try|except|finally|with|async|await)\s+.+:/m.test(trimmed) ||
    /\bprint\s*\(/.test(trimmed) && !/console\./.test(trimmed) ||
    /__\w+__/.test(trimmed) // Dunder methods
  ) {
    return 'python';
  }

  // ===== Ruby detection =====
  if (
    /^\s*def\s+\w+/m.test(trimmed) && /^\s*end\s*$/m.test(trimmed) ||
    /^\s*class\s+\w+(\s*<\s*\w+)?/m.test(trimmed) && /^\s*end\s*$/m.test(trimmed) ||
    /^\s*module\s+\w+/m.test(trimmed) ||
    /\bdo\s*\|[^|]+\|/.test(trimmed) ||
    /\.(each|map|select|reject|find|reduce|collect)\s*(\{|\bdo\b)/.test(trimmed) ||
    /^\s*require\s+['"]/.test(trimmed) ||
    /:(\w+|"[^"]+"|'[^']+')(\s*=>|:)/.test(trimmed) // Symbol syntax
  ) {
    return 'ruby';
  }

  // ===== PHP detection =====
  if (
    /^<\?php/i.test(trimmed) ||
    /\$\w+\s*=/.test(trimmed) && /;\s*$/.test(firstLine) && /->/.test(trimmed) ||
    /\bfunction\s+\w+\s*\([^)]*\)\s*(:\s*\??\w+)?\s*\{/.test(trimmed) && /\$\w+/.test(trimmed) ||
    /\b(echo|print_r|var_dump|isset|empty|array|foreach|public|private|protected)\b/.test(trimmed) && /\$\w+/.test(trimmed)
  ) {
    return 'php';
  }

  // ===== Go detection =====
  if (
    /^\s*package\s+\w+/m.test(trimmed) ||
    /^\s*func\s+(\(\w+\s+\*?\w+\)\s*)?\w+\s*\([^)]*\)\s*(\([^)]*\)|\w+)?\s*\{/m.test(trimmed) ||
    /^\s*import\s+\(/.test(trimmed) ||
    /\b(fmt|log|http|os|io|strings|strconv)\.\w+/.test(trimmed) ||
    /:=/.test(trimmed) && /\bfunc\b/.test(trimmed)
  ) {
    return 'go';
  }

  // ===== Rust detection =====
  if (
    /^\s*fn\s+\w+\s*(<[^>]+>)?\s*\([^)]*\)\s*(->.*?)?\s*\{/m.test(trimmed) ||
    /^\s*(pub\s+)?(struct|enum|impl|trait|mod|use|const|static|type)\s+/m.test(trimmed) ||
    /\b(let\s+mut|&mut|&str|Vec<|Option<|Result<|Box<|Rc<|Arc<|impl\s+\w+\s+for)\b/.test(trimmed) ||
    /!\s*\[|\bmacro_rules!/.test(trimmed) ||
    /#\[(derive|allow|cfg|test)\b/.test(trimmed)
  ) {
    return 'rust';
  }

  // ===== Swift detection =====
  if (
    /^\s*(func|class|struct|enum|protocol|extension)\s+\w+/m.test(trimmed) && /\{/.test(trimmed) &&
    (/\b(var|let)\s+\w+\s*:/.test(trimmed) || /\bguard\b|\bif\s+let\b/.test(trimmed)) ||
    /^\s*import\s+(Foundation|UIKit|SwiftUI|Combine)\b/m.test(trimmed) ||
    /\b(override|mutating|@\w+)\b/.test(trimmed) && /\bfunc\b/.test(trimmed)
  ) {
    return 'swift';
  }

  // ===== Kotlin detection =====
  if (
    /^\s*(fun|class|object|interface|sealed|data\s+class)\s+\w+/m.test(trimmed) ||
    /^\s*package\s+[\w.]+/m.test(trimmed) && /\b(fun|val|var)\b/.test(trimmed) ||
    /\b(val|var)\s+\w+\s*:\s*\w+/.test(trimmed) ||
    /\b(suspend|coroutineScope|launch|async|await)\b/.test(trimmed) ||
    /\.\blet\s*\{|\.\bapply\s*\{|\.\balso\s*\{/.test(trimmed)
  ) {
    return 'kotlin';
  }

  // ===== C# detection =====
  if (
    /^\s*using\s+[\w.]+;/m.test(trimmed) ||
    /^\s*namespace\s+[\w.]+/m.test(trimmed) ||
    /\b(public|private|protected|internal)\s+(static\s+)?(class|struct|interface|enum|void|async)\b/.test(trimmed) ||
    /\b(get|set)\s*[{;]/.test(trimmed) && /\bpublic\b/.test(trimmed) ||
    /\bvar\s+\w+\s*=\s*new\b/.test(trimmed) && /;\s*$/m.test(trimmed) ||
    /\b(IEnumerable|IList|Task|async\s+Task)\b/.test(trimmed)
  ) {
    return 'csharp';
  }

  // ===== C++ detection =====
  if (
    /^\s*#include\s*<[\w.\/]+>/m.test(trimmed) ||
    /\b(std::|cout|cin|endl|vector<|string::)\b/.test(trimmed) ||
    /^\s*(class|struct)\s+\w+\s*(:\s*(public|private|protected))?\s*\{/m.test(trimmed) && !/^\s*@/m.test(trimmed) ||
    /\b(template\s*<|nullptr|constexpr|override|virtual\s+\w+|const\s+\w+&)\b/.test(trimmed) ||
    /^\s*using\s+namespace\s+std;/m.test(trimmed)
  ) {
    return 'cpp';
  }

  // ===== C detection =====
  if (
    /^\s*#include\s*<[\w.\/]+>/m.test(trimmed) && !/\b(std::|class|template|cout)\b/.test(trimmed) ||
    /^\s*(int|void|char|float|double|long)\s+\w+\s*\([^)]*\)\s*\{/m.test(trimmed) ||
    /\b(printf|scanf|malloc|free|sizeof|NULL)\b/.test(trimmed) ||
    /^\s*(typedef|struct|enum)\s+\w+\s*\{/m.test(trimmed) && !/\bclass\b/.test(trimmed)
  ) {
    return 'c';
  }

  // ===== Java detection =====
  if (
    /^\s*package\s+[\w.]+;/m.test(trimmed) ||
    /^\s*import\s+[\w.]+(\.\*)?;/m.test(trimmed) ||
    /\b(public|private|protected)\s+(static\s+)?(class|interface|enum|void)\b/.test(trimmed) ||
    /\bSystem\.(out|err|in)\b/.test(trimmed) ||
    /\b(extends|implements)\s+\w+/.test(trimmed) && /\bclass\b/.test(trimmed) ||
    /@(Override|Deprecated|SuppressWarnings|FunctionalInterface)\b/.test(trimmed)
  ) {
    return 'java';
  }

  // ===== TypeScript detection =====
  if (
    /\b(interface|type|enum)\s+\w+\s*[{=<]/.test(trimmed) ||
    /:\s*(string|number|boolean|void|any|never|unknown|null|undefined)\b/.test(trimmed) ||
    /<[A-Z]\w*>/.test(trimmed) && /\bfunction\b|\bconst\b/.test(trimmed) ||
    /\bas\s+(string|number|boolean|any|\w+)/.test(trimmed) ||
    /\b(readonly|keyof|typeof|infer|extends)\b/.test(trimmed) && /:\s*\w+/.test(trimmed)
  ) {
    return 'typescript';
  }

  // ===== SCSS detection =====
  if (
    /\$[\w-]+\s*:/.test(trimmed) || // Variables
    /@(mixin|include|extend|import|use|forward)\b/.test(trimmed) ||
    /&[.:[\w-]/.test(trimmed) && /\{/.test(trimmed) || // Nesting with &
    /@(if|else|for|each|while)\b/.test(trimmed)
  ) {
    return 'scss';
  }

  // ===== LESS detection =====
  if (
    /@[\w-]+\s*:/.test(trimmed) && !/^@(media|import|keyframes|font-face|supports|charset)\b/m.test(trimmed) ||
    /\.([\w-]+)\s*\(/.test(trimmed) && /\{/.test(trimmed) || // Mixins
    /@\{[\w-]+\}/.test(trimmed) // Interpolation
  ) {
    return 'less';
  }

  // ===== CSS detection =====
  if (
    /^\s*[\w.#\[\]:*,>\+~-]+\s*\{[^}]*\}/m.test(trimmed) ||
    /@(media|keyframes|font-face|import|supports)\b/.test(trimmed) ||
    /\b(display|margin|padding|color|background|font-size|width|height|position)\s*:/i.test(trimmed)
  ) {
    return 'css';
  }

  // ===== JavaScript detection (default for code-like content) =====
  if (
    /\b(const|let|var|function|class|import|export|async|await|return)\b/.test(trimmed) ||
    /=>\s*[\{(]/.test(trimmed) || // Arrow functions
    /\bconsole\.(log|warn|error)\b/.test(trimmed) ||
    /\b(document|window|require)\b/.test(trimmed) ||
    /\bnew\s+\w+\s*\(/.test(trimmed)
  ) {
    return 'javascript';
  }

  // ===== Default =====
  return 'text';
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
 * Format JSON5 string with indentation (supports comments and trailing commas)
 */
async function formatJson5(input: string, indent = 2): Promise<string> {
  try {
    return await prettier.format(input, {
      parser: 'json5',
      plugins: [prettierPluginBabel, prettierPluginEstree],
      tabWidth: indent,
    });
  } catch (e) {
    throw new Error('Invalid JSON5');
  }
}

/**
 * Minify JSON5 by removing whitespace and comments
 */
function minifyJson5(input: string): string {
  // Remove comments
  let result = input
    .replace(/\/\/.*$/gm, '') // single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, ''); // multi-line comments

  // Remove whitespace while preserving strings
  let minified = '';
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < result.length; i++) {
    const char = result[i];
    const prevChar = result[i - 1];

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
      continue;
    }

    // Remove trailing commas before } or ]
    if (char === ',' && /^[\s]*[}\]]/.test(result.slice(i + 1))) {
      continue;
    }

    minified += char;
  }

  return minified.trim();
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

/**
 * Format SCSS string with indentation
 */
async function formatScss(input: string, indent = 2): Promise<string> {
  try {
    return await prettier.format(input, {
      parser: 'scss',
      plugins: [prettierPluginCss],
      tabWidth: indent,
    });
  } catch (e) {
    // Fallback to simple formatter
    return formatCssSimple(input, indent);
  }
}

/**
 * Format LESS string with indentation
 */
async function formatLess(input: string, indent = 2): Promise<string> {
  try {
    return await prettier.format(input, {
      parser: 'less',
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
 * Format MDX string (Markdown with JSX)
 */
async function formatMdx(input: string, indent = 2): Promise<string> {
  try {
    return await prettier.format(input, {
      parser: 'mdx',
      plugins: [prettierPluginMarkdown, prettierPluginBabel, prettierPluginEstree],
      tabWidth: indent,
    });
  } catch (e) {
    return input; // Fallback: return original
  }
}

/**
 * Format Vue single-file component
 */
async function formatVue(input: string, indent = 2): Promise<string> {
  try {
    return await prettier.format(input, {
      parser: 'vue',
      plugins: [prettierPluginHtml, prettierPluginBabel, prettierPluginEstree, prettierPluginCss],
      tabWidth: indent,
    });
  } catch (e) {
    return input; // Fallback: return original
  }
}

/**
 * Format Angular template
 */
async function formatAngular(input: string, indent = 2): Promise<string> {
  try {
    return await prettier.format(input, {
      parser: 'angular',
      plugins: [prettierPluginHtml],
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
    case 'json5':
      return await formatJson5(trimmed, indent);
    case 'xml':
      return formatXml(trimmed, indent);
    case 'html':
      return await formatHtml(trimmed, indent);
    case 'vue':
      return await formatVue(trimmed, indent);
    case 'angular':
      return await formatAngular(trimmed, indent);
    case 'css':
      return await formatCss(trimmed, indent);
    case 'scss':
      return await formatScss(trimmed, indent);
    case 'less':
      return await formatLess(trimmed, indent);
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
    case 'mdx':
      return await formatMdx(trimmed, indent);
    // Highlight-only formats (no formatting support)
    case 'c':
    case 'cpp':
    case 'csharp':
    case 'go':
    case 'rust':
    case 'python':
    case 'ruby':
    case 'php':
    case 'swift':
    case 'kotlin':
    case 'bash':
    case 'powershell':
    case 'dockerfile':
    case 'toml':
    case 'ini':
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
    case 'json5':
      return minifyJson5(trimmed);
    case 'xml':
      return minifyXml(trimmed);
    case 'html':
    case 'vue':
    case 'angular':
      return minifyHtml(trimmed);
    case 'css':
    case 'scss':
    case 'less':
      return minifyCss(trimmed);
    case 'sql':
      return minifySql(trimmed);
    case 'javascript':
    case 'typescript':
    case 'java':
      return minifyJsLike(trimmed);
    case 'yaml':
    case 'markdown':
    case 'mdx':
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
    case 'json5':
      return 'json';
    case 'xml':
      return 'xml';
    case 'html':
    case 'angular':
      return 'html';
    case 'vue':
      return 'vue';
    case 'css':
      return 'css';
    case 'scss':
      return 'scss';
    case 'less':
      return 'less';
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
    case 'mdx':
      return 'markdown';
    case 'graphql':
      return 'graphql';
    // Highlight-only formats
    case 'c':
      return 'c';
    case 'cpp':
      return 'cpp';
    case 'csharp':
      return 'csharp';
    case 'go':
      return 'go';
    case 'rust':
      return 'rust';
    case 'python':
      return 'python';
    case 'ruby':
      return 'ruby';
    case 'php':
      return 'php';
    case 'swift':
      return 'swift';
    case 'kotlin':
      return 'kotlin';
    case 'bash':
      return 'bash';
    case 'powershell':
      return 'powershell';
    case 'dockerfile':
      return 'dockerfile';
    case 'toml':
      return 'toml';
    case 'ini':
      return 'ini';
    default:
      return 'text';
  }
}
