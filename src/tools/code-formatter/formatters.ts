// noinspection RegExpRedundantEscape

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
 * Detect format from filename extension
 */
export function detectFormatFromExtension(filename: string): SupportedFormat | null {
  const parts = filename.split('.');
  if (parts.length === 1) {
    if (filename.toLowerCase() === 'dockerfile') return 'dockerfile';
    return null;
  }

  const ext = parts.pop()?.toLowerCase();
  if (!ext) return null;

  switch (ext) {
    case 'json':
      return 'json';
    case 'json5':
      return 'json5';
    case 'xml':
    case 'svg':
      return 'xml';
    case 'html':
    case 'htm':
      return 'html';
    case 'vue':
      return 'vue';
    case 'ts':
    case 'tsx':
    case 'mts':
    case 'cts':
      return 'typescript';
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'javascript';
    case 'css':
      return 'css';
    case 'scss':
    case 'sass':
      return 'scss';
    case 'less':
      return 'less';
    case 'sql':
      return 'sql';
    case 'java':
      return 'java';
    case 'yaml':
    case 'yml':
      return 'yaml';
    case 'md':
    case 'markdown':
      return 'markdown';
    case 'mdx':
      return 'mdx';
    case 'graphql':
    case 'gql':
      return 'graphql';
    case 'c':
    case 'h':
      return 'c';
    case 'cpp':
    case 'hpp':
    case 'cc':
    case 'cxx':
      return 'cpp';
    case 'cs':
      return 'csharp';
    case 'go':
      return 'go';
    case 'rs':
      return 'rust';
    case 'py':
    case 'pyw':
      return 'python';
    case 'rb':
      return 'ruby';
    case 'php':
      return 'php';
    case 'swift':
      return 'swift';
    case 'kt':
    case 'kts':
      return 'kotlin';
    case 'sh':
    case 'bash':
    case 'zsh':
      return 'bash';
    case 'ps1':
    case 'psm1':
    case 'psd1':
      return 'powershell';
    case 'toml':
      return 'toml';
    case 'ini':
    case 'cfg':
    case 'conf':
    case 'properties':
      return 'ini';
    case 'txt':
      return 'text';
    default:
      return null;
  }
}

/**
 * Detect format from input string using pattern matching and scoring
 */
export function detectFormat(input: string): SupportedFormat {
  const trimmed = input.trim();
  if (!trimmed) return 'text';

  const lines = trimmed.split('\n');
  const firstLine = lines[0].trim();
  const lineCount = lines.length;

  // ===== Shebang detection (must be first) =====
  if (firstLine.startsWith('#!')) {
    if (/python\d?/.test(firstLine)) return 'python';
    if (/\b(node|bun|deno|ts-node)\b/.test(firstLine)) return 'javascript';
    if (/\bruby\b/.test(firstLine)) return 'ruby';
    if (/\bphp\b/.test(firstLine)) return 'php';
    if (/\b(ba|z|k|c|fi|tc)?sh\b/.test(firstLine)) return 'bash';
    if (/\b(pwsh|powershell)\b/i.test(firstLine)) return 'powershell';
    return 'bash';
  }

  // ===== Strong indicators (unique to specific formats) =====

  // PHP opening tag
  if (/^<\?(php)?(\s|$)/i.test(trimmed)) return 'php';

  // Dockerfile - must have FROM and at least one instruction
  if (
    /^FROM\s+\S+/im.test(trimmed) &&
    /^(RUN|COPY|ADD|CMD|ENTRYPOINT|WORKDIR|ENV|EXPOSE|ARG|LABEL|VOLUME|USER|HEALTHCHECK|ONBUILD|STOPSIGNAL|SHELL)\s/im.test(
      trimmed
    )
  ) {
    return 'dockerfile';
  }

  // JSON - strict structure check
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // Could be JSON5 or JS object
      const hasJsonFeatures = /^\s*["']?\w+["']?\s*:/m.test(trimmed);
      const hasComments = /\/\/|\/\*/.test(trimmed);
      const hasTrailingComma = /,\s*[}\]]/.test(trimmed);
      if (hasJsonFeatures && (hasComments || hasTrailingComma)) {
        return 'json5';
      }
    }
  }

  // XML declaration
  if (trimmed.startsWith('<?xml')) return 'xml';

  // Vue SFC - needs template/script/style combination
  if (
    /<template[\s>]/i.test(trimmed) &&
    (/<script[\s>]/i.test(trimmed) || /<style[\s>]/i.test(trimmed))
  ) {
    return 'vue';
  }

  // HTML doctype
  if (/^<!doctype\s+html/i.test(trimmed)) return 'html';

  // Angular directives
  if (
    /\*ng(If|For|ForOf|Switch|Class|Style|TemplateOutlet)\b/i.test(trimmed) ||
    /\[(ng(Class|Style|Model)|formControl|formGroup)\]/i.test(trimmed) ||
    /\(click\)|\(ngSubmit\)|\(change\)/i.test(trimmed)
  ) {
    return 'angular';
  }

  // HTML detection
  if (trimmed.startsWith('<') && /<\/\w+>\s*$/.test(trimmed)) {
    if (
      /<(html|head|body|div|span|p|a|img|script|link|style|meta|nav|section|article|header|footer|main|aside|form|input|button|table|ul|ol|li|h[1-6]|canvas|svg)[\s>\/]/i.test(
        trimmed
      )
    ) {
      return 'html';
    }
    // XML fallback for other tag-based content
    if (/<\w+[^>]*>/.test(trimmed)) {
      return 'xml';
    }
  }

  // SQL - strong keywords at line start
  if (
    /^\s*(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+(TABLE|DATABASE|INDEX|VIEW|PROCEDURE|FUNCTION)|ALTER\s+TABLE|DROP\s+(TABLE|DATABASE)|WITH\s+\w+\s+AS|TRUNCATE|GRANT|REVOKE|BEGIN|COMMIT|ROLLBACK)\b/im.test(
      trimmed
    )
  ) {
    return 'sql';
  }

  // GraphQL
  if (
    /^\s*(query|mutation|subscription|fragment)\s+\w+/im.test(trimmed) ||
    /^\s*type\s+\w+\s*(\{|implements)/im.test(trimmed) ||
    /^\s*(schema|interface|enum|input|scalar|union|directive)\s+/im.test(trimmed)
  ) {
    return 'graphql';
  }

  // YAML front matter
  if (/^---\s*$/m.test(trimmed) && lineCount > 1) {
    const afterFrontMatter = trimmed.replace(/^---[\s\S]*?^---/m, '').trim();
    if (!afterFrontMatter || /^#{1,6}\s/.test(afterFrontMatter)) {
      return 'markdown';
    }
    return 'yaml';
  }

  // TOML - sections with dots or double brackets
  if (
    /^\s*\[[\w.-]+\]\s*$/m.test(trimmed) &&
    /^\s*\w+\s*=\s*(["']|true|false|\d+|\[)/m.test(trimmed)
  ) {
    if (/^\s*\[\[[\w.-]+\]\]/m.test(trimmed)) return 'toml';
    // Check for TOML-style values
    if (/^\s*\w+\s*=\s*\[/m.test(trimmed) || /"""|'''/.test(trimmed)) return 'toml';
    return 'ini';
  }

  // Python (calculated early to resolve conflicts with Markdown)
  const pythonScore = [
    /^\s*def\s+\w+\s*\([^)]*\)\s*(->[\s\w\[\],|]+)?\s*:/m.test(trimmed),
    /^\s*class\s+\w+(\([^)]*\))?\s*:/m.test(trimmed),
    /^\s*(from\s+[\w.]+\s+)?import\s+[\w.,\s]+$/m.test(trimmed) && !/[{};]/.test(trimmed),
    /^\s*(if|elif|else|for|while|try|except|finally|with|match|case)\b[^{]*:/m.test(trimmed),
    /__\w+__/.test(trimmed), // Dunder
    /\bself\.\w+/.test(trimmed),
    /^\s*@\w+(\.\w+)*(\([^)]*\))?\s*$/m.test(trimmed), // Decorators
    /\b(print|len|range|str|int|float|list|dict|set|tuple|True|False|None)\b/.test(trimmed) &&
      !/[;{}]/.test(trimmed),
    /\bdef\s+__init__/.test(trimmed),
    /:\s*$/.test(firstLine) && /^\s{4}\S/m.test(trimmed), // Indentation-based
  ].filter(Boolean).length;

  // Markdown - multiple indicators
  const mdScore = [
    /^#{1,6}\s+\S/m.test(trimmed), // Headers
    /^\s*[-*+]\s+\S/m.test(trimmed), // Lists
    /\[.+?\]\([^)]+\)/.test(trimmed), // Links
    /^```(\w+)?$/m.test(trimmed), // Code blocks
    /^\s*>\s+\S/m.test(trimmed), // Blockquotes
    /\*\*[^*]+\*\*|__[^_]+__/.test(trimmed), // Bold
    /\*[^*]+\*|_[^_]+_/.test(trimmed), // Italic
    /^\|.+\|$/m.test(trimmed), // Tables
    /^[-*_]{3,}\s*$/m.test(trimmed), // Horizontal rules
  ].filter(Boolean).length;

  if (mdScore >= 2) {
    // Check for MDX (JSX components in markdown)
    if (/<[A-Z]\w*[\s/>]/.test(trimmed) || /^import\s+.+\s+from\s+['"]/.test(trimmed)) {
      return 'mdx';
    }

    // Check for Python conflict
    // Python comments (#) look like Markdown headers
    // Python dunders (__init__) look like Markdown bold
    // If it looks like Python and doesn't have explicit Markdown code blocks, prefer Python
    if (pythonScore >= 2 && !/^```/m.test(trimmed)) {
      return 'python';
    }

    return 'markdown';
  }

  // ===== Programming Languages =====

  // PowerShell - cmdlets and PS-specific syntax
  const psScore = [
    /\b(Get|Set|New|Remove|Add|Clear|Copy|Move|Rename|Start|Stop|Restart|Test|Update|Write|Read|Out|Invoke|Enable|Disable|Register|Unregister|Import|Export|Convert|Format|Select|Where|Sort|Group|Measure)-\w+\b/.test(
      trimmed
    ),
    /\$\w+\s*=/.test(trimmed) && !/\$\{/.test(trimmed), // PS vars but not bash
    /\bparam\s*\(/i.test(trimmed),
    /\[CmdletBinding\(\)\]|\[Parameter\(/i.test(trimmed),
    /@\{|\$PSVersionTable|\$env:/.test(trimmed),
    /\|\s*%\s*\{|\|\s*\?\s*\{/.test(trimmed), // Pipeline shorthand
    /\b(function|filter)\s+\w+-\w+/i.test(trimmed),
  ].filter(Boolean).length;

  if (psScore >= 2) return 'powershell';

  // Bash/Shell
  const bashScore = [
    /^\s*(if|then|elif|else|fi|for|in|do|done|while|until|case|esac)\b/m.test(trimmed),
    /\$\{[\w:#%\/+-]+\}/.test(trimmed), // Parameter expansion
    /^\s*\w+\s*\(\)\s*\{/m.test(trimmed), // Shell function
    /\b(echo|printf|read|export|source|alias|unset|declare|local|readonly)\b/.test(trimmed),
    /\|\s*(grep|sed|awk|sort|uniq|head|tail|cut|tr|wc|xargs|tee)\b/.test(trimmed),
    /\[\[\s+|\]\]|&&\s*\||;\s*then/.test(trimmed),
    />\s*\/dev\/null|2>&1|<<EOF|<<-/.test(trimmed),
  ].filter(Boolean).length;

  if (bashScore >= 2) return 'bash';

  // Python (score calculated earlier)
  if (pythonScore >= 2) return 'python';

  // Ruby
  const rubyScore = [
    /^\s*(def|class|module)\s+\w+/m.test(trimmed) && /^\s*end\s*$/m.test(trimmed),
    /\bdo\s*\|[\w,\s]+\|/.test(trimmed),
    /\.(each|map|select|reject|find|reduce|collect|detect|inject)\s*(\{|\bdo\b)/.test(trimmed),
    /^\s*require(_relative)?\s+['"]/.test(trimmed),
    /:\w+\s*=>|^\s*:\w+,$|\.to_[sifah]\b/.test(trimmed),
    /\b(attr_accessor|attr_reader|attr_writer|puts|gets|nil)\b/.test(trimmed),
    /\bRails\.|ActiveRecord|ApplicationController/.test(trimmed),
  ].filter(Boolean).length;

  if (rubyScore >= 2) return 'ruby';

  // PHP (without opening tag)
  const phpScore = [
    /\$\w+\s*(=|->)/.test(trimmed) && /;\s*$/m.test(trimmed),
    /\bfunction\s+\w+\s*\([^)]*\)\s*(:\s*\??\w+)?\s*\{/.test(trimmed) && /\$/.test(trimmed),
    /->[\w]+\(/.test(trimmed) && /\$/.test(trimmed),
    /\b(echo|print_r|var_dump|isset|empty|array|foreach|namespace|use)\b/.test(trimmed),
    /\bnew\s+\w+\(/.test(trimmed) && /\$/.test(trimmed),
    /\b(public|private|protected)\s+(static\s+)?function/.test(trimmed),
  ].filter(Boolean).length;

  if (phpScore >= 2) return 'php';

  // Go
  const goScore = [
    /^\s*package\s+\w+\s*$/m.test(trimmed),
    /^\s*func\s+(\(\w+\s+\*?\w+\)\s*)?\w+\s*\([^)]*\)\s*(\([^)]*\)|[\w*]+)?\s*\{/m.test(trimmed),
    /^\s*import\s+[("]/m.test(trimmed),
    /\b(fmt|log|http|os|io|context|errors|strings|strconv|sync|time)\.\w+/.test(trimmed),
    /:=/.test(trimmed),
    /\bgo\s+func\b|\bdefer\s+/.test(trimmed),
    /\bmake\s*\(\s*(map|chan|\[\])/.test(trimmed),
    /\binterface\s*\{\s*\}|\bstruct\s*\{/.test(trimmed),
  ].filter(Boolean).length;

  if (goScore >= 2) return 'go';

  // Rust
  const rustScore = [
    /^\s*(pub\s+)?fn\s+\w+/m.test(trimmed),
    /^\s*(pub\s+)?(struct|enum|impl|trait|mod|type)\s+\w+/m.test(trimmed),
    /\b(let\s+mut|&mut|&str|Vec<|Option<|Result<|Box<|Rc<|Arc<|Some\(|None|Ok\(|Err\()\b/.test(
      trimmed
    ),
    /#\[(derive|allow|cfg|test|inline|must_use)\b/.test(trimmed),
    /\bmatch\s+\w+\s*\{/.test(trimmed),
    /\.unwrap\(\)|\.expect\(|\.iter\(\)|\.collect\(\)/.test(trimmed),
    /\buse\s+(std|crate|super|self)::/.test(trimmed),
    /::\s*<|impl\s+\w+\s+for\s+\w+/.test(trimmed),
  ].filter(Boolean).length;

  if (rustScore >= 2) return 'rust';

  // Swift
  const swiftScore = [
    /^\s*(func|class|struct|enum|protocol|extension|actor)\s+\w+/m.test(trimmed),
    /\b(var|let)\s+\w+\s*:\s*\w+(\s*[?!])?/.test(trimmed),
    /\bguard\s+let\s+|\bif\s+let\s+/.test(trimmed),
    /^\s*import\s+(Foundation|UIKit|SwiftUI|Combine|AppKit|CoreData)\b/m.test(trimmed),
    /@(IBOutlet|IBAction|Published|State|Binding|ObservedObject|Environment)\b/.test(trimmed),
    /\b(override|mutating|throws|async|await)\b/.test(trimmed) && /\bfunc\b/.test(trimmed),
    /\?\.|!\./.test(trimmed), // Optional chaining
  ].filter(Boolean).length;

  if (swiftScore >= 2) return 'swift';

  // Kotlin
  const kotlinScore = [
    /^\s*(fun|class|object|interface|sealed\s+class|data\s+class|enum\s+class)\s+\w+/m.test(
      trimmed
    ),
    /\b(val|var)\s+\w+\s*:\s*\w+/.test(trimmed),
    /^\s*package\s+[\w.]+\s*$/m.test(trimmed) && /\bfun\b/.test(trimmed),
    /\b(suspend|override|lateinit|companion\s+object)\b/.test(trimmed),
    /\.(let|apply|also|run|with)\s*\{/.test(trimmed),
    /\bwhen\s*\([^)]*\)\s*\{/.test(trimmed),
    /\b(listOf|mapOf|setOf|arrayOf|mutableListOf)\s*\(/.test(trimmed),
  ].filter(Boolean).length;

  if (kotlinScore >= 2) return 'kotlin';

  // C#
  const csharpScore = [
    /^\s*using\s+[\w.]+;\s*$/m.test(trimmed),
    /^\s*namespace\s+[\w.]+\s*[{;]/m.test(trimmed),
    /\b(public|private|protected|internal)\s+(static\s+)?(partial\s+)?(class|struct|interface|enum|record)\s+\w+/.test(
      trimmed
    ),
    /\b(get|set)\s*[{;=>]/.test(trimmed),
    /\basync\s+Task\b|\bawait\s+\w+/.test(trimmed),
    /\bvar\s+\w+\s*=\s*new\s+\w+/.test(trimmed),
    /\b(IEnumerable|IList|Dictionary|List|Task|Action|Func)</.test(trimmed),
    /\bLINQ\b|\.Select\(|\.Where\(|\.OrderBy\(/.test(trimmed),
  ].filter(Boolean).length;

  if (csharpScore >= 2) return 'csharp';

  // C++ (check before C)
  const cppScore = [
    /^\s*#include\s*<[\w./]+>/m.test(trimmed),
    /\b(std::|cout|cin|endl|cerr|vector<|string::|map<|set<|unique_ptr<|shared_ptr<)\b/.test(
      trimmed
    ),
    /^\s*using\s+namespace\s+\w+;/m.test(trimmed),
    /\b(template\s*<|nullptr|constexpr|noexcept|override|virtual|explicit|mutable)\b/.test(trimmed),
    /^\s*class\s+\w+\s*(:\s*(public|private|protected)\s+\w+)?\s*\{/m.test(trimmed),
    /\b(new|delete)\s+\w+/.test(trimmed) && !/\$/.test(trimmed),
    /::\w+|&\w+|const\s+\w+&/.test(trimmed),
  ].filter(Boolean).length;

  if (cppScore >= 2) return 'cpp';

  // C
  const cScore = [
    /^\s*#include\s*<[\w./]+>/m.test(trimmed) &&
      !/\b(std::|class|template|cout|cin)\b/.test(trimmed),
    /^\s*(int|void|char|float|double|long|short|unsigned)\s+\w+\s*\([^)]*\)\s*\{/m.test(trimmed),
    /\b(printf|scanf|fprintf|fscanf|sprintf|sscanf|malloc|calloc|realloc|free|sizeof|NULL)\b/.test(
      trimmed
    ),
    /^\s*(typedef|struct|union|enum)\s+\w*\s*\{/m.test(trimmed),
    /\bFILE\s*\*|\bvoid\s*\*/.test(trimmed),
    /^\s*#define\s+\w+/m.test(trimmed),
  ].filter(Boolean).length;

  if (cScore >= 2) return 'c';

  // Java
  const javaScore = [
    /^\s*package\s+[\w.]+;\s*$/m.test(trimmed),
    /^\s*import\s+[\w.*]+;\s*$/m.test(trimmed),
    /\b(public|private|protected)\s+(static\s+)?(final\s+)?(class|interface|enum|abstract\s+class)\s+\w+/.test(
      trimmed
    ),
    /\bSystem\.(out|err|in)\.\w+/.test(trimmed),
    /@(Override|Deprecated|SuppressWarnings|FunctionalInterface|Autowired|Component|Service|Repository)\b/.test(
      trimmed
    ),
    /\b(extends|implements)\s+\w+/.test(trimmed),
    /\bpublic\s+static\s+void\s+main\s*\(/.test(trimmed),
  ].filter(Boolean).length;

  if (javaScore >= 2) return 'java';

  // TypeScript
  const tsScore = [
    /\b(interface|type)\s+\w+\s*[{=<]/.test(trimmed),
    /:\s*(string|number|boolean|void|any|never|unknown|null|undefined|object)(\[\])?\b/.test(
      trimmed
    ),
    /\bas\s+(const|string|number|boolean|any|\w+)/.test(trimmed),
    /\b(readonly|keyof|typeof|infer)\b/.test(trimmed),
    /<\w+(\s*,\s*\w+)*>/.test(trimmed) && /:\s*\w+/.test(trimmed),
    /\benum\s+\w+\s*\{/.test(trimmed),
    /!\s*\.|\?\s*\./.test(trimmed), // Non-null assertion or optional chain with type context
  ].filter(Boolean).length;

  if (tsScore >= 2) return 'typescript';

  // SCSS
  if (
    /\$[\w-]+\s*:/.test(trimmed) ||
    /@(mixin|include|extend|use|forward)\b/.test(trimmed) ||
    /@(if|else\s+if|else|for|each|while)\b/.test(trimmed)
  ) {
    return 'scss';
  }

  // LESS
  if (
    /@[\w-]+\s*:/.test(trimmed) &&
    !/^@(media|import|keyframes|font-face|supports|charset|namespace)\b/m.test(trimmed)
  ) {
    return 'less';
  }

  // CSS
  if (
    /^\s*[\w.#\[\]:*,>\+~-]+\s*\{[^}]*\}/m.test(trimmed) ||
    /@(media|keyframes|font-face|import|supports|layer)\b/.test(trimmed)
  ) {
    return 'css';
  }

  // YAML (basic)
  if (/^\s*[\w-]+:\s*(\S|$)/m.test(trimmed) && !/[{};]/.test(trimmed) && lineCount > 1) {
    return 'yaml';
  }

  // Properties (Java/INI style)
  // Key=Value or Key:Value, no sections, comments with # or !
  if (/^[\w.-]+\s*[=:]\s*.+$/m.test(trimmed) && !/^\s*\[.+\]/.test(trimmed)) {
    const propScore = [
      /^[\w.-]+\s*[=:]\s*.+$/m.test(trimmed),
      /^\s*[#!]/.test(trimmed), // Comments
      !/[{};]/.test(trimmed), // No braces/semicolons
    ].filter(Boolean).length;

    if (propScore >= 2) return 'ini';
  }

  // JavaScript (most permissive, checked last among code)
  const jsScore = [
    /\b(const|let|var)\s+\w+\s*=/.test(trimmed),
    /\bfunction\s+\w*\s*\(/.test(trimmed),
    /=>\s*[\{(\[]/.test(trimmed),
    /\b(async|await|class|export|import)\b/.test(trimmed),
    /\bconsole\.\w+\(/.test(trimmed),
    /\b(document|window|module|require)\b/.test(trimmed),
  ].filter(Boolean).length;

  if (jsScore >= 1) return 'javascript';

  // Default
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
 * Generic C-style language formatter (works for C, C++, C#, Java, Go, Rust, Swift, Kotlin, PHP)
 * Handles brace-based indentation, basic spacing, and cleanup
 */
function formatCStyleGeneric(input: string, indent = 2): string {
  const PADDING = ' '.repeat(indent);
  const lines = input.split('\n');
  const result: string[] = [];
  let depth = 0;

  for (let line of lines) {
    let trimmedLine = line.trim();
    if (!trimmedLine) {
      result.push('');
      continue;
    }

    // Track multi-line comments (simplified - just skip comment-only lines)
    if (
      trimmedLine.startsWith('/*') ||
      trimmedLine.startsWith('*') ||
      trimmedLine.startsWith('//')
    ) {
      result.push(PADDING.repeat(depth) + trimmedLine);
      continue;
    }

    // Handle preprocessor directives (C/C++)
    if (trimmedLine.startsWith('#')) {
      result.push(trimmedLine);
      continue;
    }

    // Calculate depth adjustment for this line
    let lineDepthAdjust = 0;
    let nextDepthAdjust = 0;

    // Count braces/brackets for indentation (excluding strings and comments)
    let tempInString = false;
    let tempStringChar = '';
    let tempInComment = false;

    for (let i = 0; i < trimmedLine.length; i++) {
      const char = trimmedLine[i];
      const nextChar = trimmedLine[i + 1];
      const prevChar = trimmedLine[i - 1];

      // Skip comments
      if (!tempInString && char === '/' && nextChar === '/') break;
      if (!tempInString && char === '/' && nextChar === '*') {
        tempInComment = true;
        continue;
      }
      if (tempInComment && char === '*' && nextChar === '/') {
        tempInComment = false;
        i++;
        continue;
      }
      if (tempInComment) continue;

      // Track strings
      if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
        if (!tempInString) {
          tempInString = true;
          tempStringChar = char;
        } else if (char === tempStringChar) {
          tempInString = false;
        }
        continue;
      }
      if (tempInString) continue;

      // Count braces
      if (char === '{' || char === '[' || char === '(') {
        nextDepthAdjust++;
      } else if (char === '}' || char === ']' || char === ')') {
        if (i === 0 || trimmedLine.slice(0, i).trim() === '') {
          lineDepthAdjust--;
        } else {
          nextDepthAdjust--;
        }
      }
    }

    // Apply current line indentation
    const currentDepth = Math.max(0, depth + lineDepthAdjust);
    result.push(PADDING.repeat(currentDepth) + trimmedLine);

    // Update depth for next line
    depth = Math.max(0, depth + lineDepthAdjust + nextDepthAdjust);
  }

  return result.join('\n');
}

/**
 * Format Python code with proper indentation
 */
function formatPython(input: string, indent = 4): string {
  const PADDING = ' '.repeat(indent);
  const lines = input.split('\n');
  const result: string[] = [];
  let depth = 0;
  let inMultiLineString = false;
  let multiLineStringChar = '';

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    let trimmedLine = line.trim();

    // Handle empty lines
    if (!trimmedLine) {
      result.push('');
      continue;
    }

    // Track multi-line strings
    const tripleQuotes = ['"""', "'''"];
    for (const quote of tripleQuotes) {
      const count = (trimmedLine.match(new RegExp(quote.replace(/'/g, "\\'"), 'g')) || []).length;
      if (count % 2 === 1) {
        if (!inMultiLineString) {
          inMultiLineString = true;
          multiLineStringChar = quote;
        } else if (quote === multiLineStringChar) {
          inMultiLineString = false;
        }
      }
    }

    // If inside multi-line string, preserve original indentation relative to start
    if (inMultiLineString && i > 0) {
      result.push(line);
      continue;
    }

    // Check if this line decreases indentation
    const decreaseKeywords = ['elif', 'else', 'except', 'finally', 'case'];
    const startsWithDecrease = decreaseKeywords.some(
      (kw) => trimmedLine.startsWith(kw + ':') || trimmedLine.startsWith(kw + ' ')
    );

    if (startsWithDecrease && depth > 0) {
      depth--;
    }

    // Also handle closing brackets/parens that decrease depth
    if (trimmedLine.startsWith(')') || trimmedLine.startsWith(']') || trimmedLine.startsWith('}')) {
      depth = Math.max(0, depth - 1);
    }

    // Apply indentation
    result.push(PADDING.repeat(depth) + trimmedLine);

    // Check if this line increases indentation for next line
    const endsWithColon = /:\s*(#.*)?$/.test(trimmedLine);
    const opensBlock = [
      'def ',
      'class ',
      'if ',
      'elif ',
      'else:',
      'for ',
      'while ',
      'try:',
      'except',
      'finally:',
      'with ',
      'async def ',
      'async for ',
      'async with ',
      'match ',
      'case ',
    ];

    if (endsWithColon || opensBlock.some((kw) => trimmedLine.startsWith(kw))) {
      if (endsWithColon) {
        depth++;
      }
    }

    // Handle continuation with open brackets
    const openBrackets = (trimmedLine.match(/[\(\[\{]/g) || []).length;
    const closeBrackets = (trimmedLine.match(/[\)\]\}]/g) || []).length;
    if (openBrackets > closeBrackets) {
      depth += openBrackets - closeBrackets;
    } else if (
      closeBrackets > openBrackets &&
      !trimmedLine.startsWith(')') &&
      !trimmedLine.startsWith(']')
    ) {
      depth = Math.max(0, depth - (closeBrackets - openBrackets));
    }
  }

  return result.join('\n');
}

/**
 * Format Ruby code with proper indentation
 */
function formatRuby(input: string, indent = 2): string {
  const PADDING = ' '.repeat(indent);
  const lines = input.split('\n');
  const result: string[] = [];
  let depth = 0;

  const increaseKeywords = /^\s*(def|class|module|if|unless|case|while|until|for|begin|do|\{)\b/;
  const decreaseKeywords = /^\s*(end|elsif|else|when|rescue|ensure|\})\b/;
  const neutralKeywords = /^\s*(elsif|else|when|rescue|ensure)\b/;

  for (let line of lines) {
    let trimmedLine = line.trim();

    if (!trimmedLine) {
      result.push('');
      continue;
    }

    // Check if line starts with decrease keyword
    if (decreaseKeywords.test(trimmedLine)) {
      if (!neutralKeywords.test(trimmedLine)) {
        depth = Math.max(0, depth - 1);
      } else {
        // elsif, else, when, rescue, ensure - temporarily decrease for this line
        result.push(PADDING.repeat(Math.max(0, depth - 1)) + trimmedLine);
        continue;
      }
    }

    result.push(PADDING.repeat(depth) + trimmedLine);

    // Check if line increases depth
    if (increaseKeywords.test(trimmedLine)) {
      // Don't increase for single-line blocks
      if (!trimmedLine.includes(' end') && !trimmedLine.endsWith('}')) {
        depth++;
      }
    }
  }

  return result.join('\n');
}

/**
 * Format Bash/Shell script with proper indentation
 */
function formatBash(input: string, indent = 2): string {
  const PADDING = ' '.repeat(indent);
  const lines = input.split('\n');
  const result: string[] = [];
  let depth = 0;
  let inHeredoc = false;
  let heredocEnd = '';

  for (let line of lines) {
    let trimmedLine = line.trim();

    // Handle heredoc
    if (inHeredoc) {
      result.push(line); // Preserve original formatting in heredoc
      if (trimmedLine === heredocEnd) {
        inHeredoc = false;
      }
      continue;
    }

    // Check for heredoc start
    const heredocMatch = trimmedLine.match(/<<-?\s*['"]?(\w+)['"]?/);
    if (heredocMatch) {
      inHeredoc = true;
      heredocEnd = heredocMatch[1];
    }

    if (!trimmedLine) {
      result.push('');
      continue;
    }

    // Keywords that decrease indentation
    const decreasePatterns = /^(fi|done|esac|elif|else|\}|\]\]|then)\b/;
    // Keywords that increase indentation for next line
    const increasePatterns =
      /\b(then|do|else|in|\{)\s*$|^(if|while|until|for|case|select)\b.*\bthen\s*$|\bdo\s*$/;
    // Keywords that are neutral (decrease then increase)
    const neutralPatterns = /^(elif|else)\b/;

    if (decreasePatterns.test(trimmedLine) && !neutralPatterns.test(trimmedLine)) {
      depth = Math.max(0, depth - 1);
    }

    result.push(PADDING.repeat(depth) + trimmedLine);

    if (increasePatterns.test(trimmedLine)) {
      depth++;
    }

    // Handle case patterns (word) which increase depth
    if (
      /^\w+\)/.test(trimmedLine) ||
      /^["'].*["']\)/.test(trimmedLine) ||
      /^\*\)/.test(trimmedLine)
    ) {
      depth++;
    }

    // ;; decreases depth
    if (/;;\s*$/.test(trimmedLine)) {
      depth = Math.max(0, depth - 1);
    }
  }

  return result.join('\n');
}

/**
 * Format PowerShell script with proper indentation
 */
function formatPowerShell(input: string, indent = 4): string {
  const PADDING = ' '.repeat(indent);
  const lines = input.split('\n');
  const result: string[] = [];
  let depth = 0;
  let inHereString = false;

  for (let line of lines) {
    let trimmedLine = line.trim();

    // Handle here-strings
    if (inHereString) {
      result.push(line);
      if (trimmedLine === '"@' || trimmedLine === "'@") {
        inHereString = false;
      }
      continue;
    }

    if (trimmedLine.includes('@"') || trimmedLine.includes("@'")) {
      inHereString = true;
    }

    if (!trimmedLine) {
      result.push('');
      continue;
    }

    // Count braces for indentation
    const openBraces = (trimmedLine.match(/\{/g) || []).length;
    const closeBraces = (trimmedLine.match(/\}/g) || []).length;

    // If line starts with closing brace, decrease first
    if (trimmedLine.startsWith('}')) {
      depth = Math.max(0, depth - 1);
    }

    result.push(PADDING.repeat(depth) + trimmedLine);

    // Adjust depth for next line
    depth = Math.max(0, depth + openBraces - closeBraces);

    // If we already decreased for starting }, don't double-count
    if (trimmedLine.startsWith('}') && closeBraces > openBraces) {
      depth = Math.max(0, depth + 1); // Compensate
    }
  }

  return result.join('\n');
}

/**
 * Format TOML with proper indentation and spacing
 */
function formatToml(input: string, _indent = 2): string {
  const lines = input.split('\n');
  const result: string[] = [];

  for (let line of lines) {
    let trimmedLine = line.trim();

    if (!trimmedLine) {
      if (result.length > 0 && result[result.length - 1] !== '') {
        result.push('');
      }
      continue;
    }

    // Section headers
    if (trimmedLine.startsWith('[')) {
      if (result.length > 0 && result[result.length - 1] !== '') {
        result.push('');
      }
      result.push(trimmedLine);
      continue;
    }

    // Key-value pairs - normalize spacing around =
    if (trimmedLine.includes('=')) {
      const eqIndex = trimmedLine.indexOf('=');
      const key = trimmedLine.slice(0, eqIndex).trim();
      const value = trimmedLine.slice(eqIndex + 1).trim();
      result.push(`${key} = ${value}`);
    } else {
      result.push(trimmedLine);
    }
  }

  return result.join('\n');
}

/**
 * Format INI with proper spacing
 */
function formatIni(input: string, _indent = 0): string {
  const lines = input.split('\n');
  const result: string[] = [];

  for (let line of lines) {
    let trimmedLine = line.trim();

    if (!trimmedLine) {
      if (result.length > 0 && result[result.length - 1] !== '') {
        result.push('');
      }
      continue;
    }

    // Comments
    if (trimmedLine.startsWith(';') || trimmedLine.startsWith('#')) {
      result.push(trimmedLine);
      continue;
    }

    // Section headers
    if (trimmedLine.startsWith('[') && trimmedLine.endsWith(']')) {
      if (result.length > 0 && result[result.length - 1] !== '') {
        result.push('');
      }
      result.push(trimmedLine);
      continue;
    }

    // Key-value pairs
    if (trimmedLine.includes('=')) {
      const eqIndex = trimmedLine.indexOf('=');
      const key = trimmedLine.slice(0, eqIndex).trim();
      const value = trimmedLine.slice(eqIndex + 1).trim();
      result.push(`${key}=${value}`);
    } else {
      result.push(trimmedLine);
    }
  }

  return result.join('\n');
}

/**
 * Format Dockerfile with proper structure
 */
function formatDockerfile(input: string, indent = 4): string {
  const PADDING = ' '.repeat(indent);
  const lines = input.split('\n');
  const result: string[] = [];
  let inContinuation = false;

  for (let line of lines) {
    let trimmedLine = line.trim();

    if (!trimmedLine) {
      result.push('');
      inContinuation = false;
      continue;
    }

    // Dockerfile instructions
    const instructions = [
      'FROM',
      'RUN',
      'CMD',
      'LABEL',
      'MAINTAINER',
      'EXPOSE',
      'ENV',
      'ADD',
      'COPY',
      'ENTRYPOINT',
      'VOLUME',
      'USER',
      'WORKDIR',
      'ARG',
      'ONBUILD',
      'STOPSIGNAL',
      'HEALTHCHECK',
      'SHELL',
    ];

    const startsWithInstruction = instructions.some(
      (inst) =>
        trimmedLine.toUpperCase().startsWith(inst + ' ') || trimmedLine.toUpperCase() === inst
    );

    if (startsWithInstruction && !inContinuation) {
      // Add blank line before certain instructions for readability
      const needsSpaceBefore = ['FROM', 'RUN', 'COPY', 'ADD', 'CMD', 'ENTRYPOINT'];
      if (
        result.length > 0 &&
        needsSpaceBefore.some((inst) => trimmedLine.toUpperCase().startsWith(inst))
      ) {
        if (
          result[result.length - 1] !== '' &&
          !result[result.length - 1].toUpperCase().startsWith('FROM')
        ) {
          // result.push(''); // Optional: add blank lines between major sections
        }
      }
      result.push(trimmedLine);
    } else if (inContinuation) {
      result.push(PADDING + trimmedLine);
    } else {
      result.push(trimmedLine);
    }

    // Check for line continuation
    inContinuation = trimmedLine.endsWith('\\');
  }

  return result.join('\n');
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
    // C-style languages (brace-based)
    case 'c':
    case 'cpp':
    case 'csharp':
    case 'go':
    case 'rust':
    case 'swift':
    case 'kotlin':
    case 'php':
      return formatCStyleGeneric(trimmed, indent);
    // Indentation-based languages
    case 'python':
      return formatPython(trimmed, indent === 2 ? 4 : indent); // Python typically uses 4 spaces
    case 'ruby':
      return formatRuby(trimmed, indent);
    // Shell languages
    case 'bash':
      return formatBash(trimmed, indent);
    case 'powershell':
      return formatPowerShell(trimmed, indent === 2 ? 4 : indent);
    // Config formats
    case 'dockerfile':
      return formatDockerfile(trimmed, indent === 2 ? 4 : indent);
    case 'toml':
      return formatToml(trimmed, indent);
    case 'ini':
      return formatIni(trimmed, indent);
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
