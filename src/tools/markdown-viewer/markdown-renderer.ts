import MarkdownIt from 'markdown-it';
import anchorPlugin from 'markdown-it-anchor';
import { bare as emoji } from 'markdown-it-emoji';
import footnote from 'markdown-it-footnote';
import taskLists from 'markdown-it-task-lists';
import container from 'markdown-it-container';

interface Token {
  nesting: number;
  info: string;
}

export interface MarkdownRenderer {
  render(content: string): string;
}

export function createMarkdownRenderer(): MarkdownRenderer {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    breaks: true,
  });

  md.use(anchorPlugin, {
    permalink: anchorPlugin.permalink.headerLink(),
    slugify: slugify,
  });
  md.use(emoji);
  md.use(footnote);
  md.use(taskLists, { enabled: true, label: true, labelAfter: true });
  md.use(container, 'success', {
    render(tokens: Token[], idx: number) {
      return renderContainer(tokens, idx, 'alert-success');
    },
  });
  md.use(container, 'info', {
    render(tokens: Token[], idx: number) {
      return renderContainer(tokens, idx, 'alert-info');
    },
  });
  md.use(container, 'warning', {
    render(tokens: Token[], idx: number) {
      return renderContainer(tokens, idx, 'alert-warning');
    },
  });
  md.use(container, 'error', {
    render(tokens: Token[], idx: number) {
      return renderContainer(tokens, idx, 'alert-error');
    },
  });
  md.use(container, 'tip', {
    render(tokens: Token[], idx: number) {
      return renderContainer(tokens, idx, 'alert-secondary');
    },
  });
  md.use(container, 'note', {
    render(tokens: Token[], idx: number) {
      return renderContainer(tokens, idx, 'alert-primary');
    },
  });

  return {
    render(content: string): string {
      let html = md.render(content);
      html = highlightCode(html);
      return html;
    },
  };
}

function renderContainer(tokens: Token[], idx: number, alertClass: string): string {
  const m = tokens[idx];
  if (m.nesting === 1) {
    const title = m.info.trim() || alertClass.split('-')[1];
    return `<div class="alert ${alertClass} shadow-lg my-3">${title ? `<span class="font-semibold uppercase text-xs">${escapeHtml(title)}</span>` : ''}`;
  }
  return '</div>\n';
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function highlightCode(html: string): string {
  const codeBlockRe = /<pre><code class="language-(\w+)">([\s\S]*?)<\/code><\/pre>/g;
  return html.replace(codeBlockRe, (_match, lang, code) => {
    const decoded = decodeHtmlEntities(code);
    const highlighted = highlight(decoded.trim(), lang);
    return `<pre class="not-prose"><code class="language-${lang}">${highlighted}</code></pre>`;
  });
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

function highlight(code: string, lang: string): string {
  if (keywords[lang]) {
    return applyHighlight(code, lang);
  }
  return escapeHtml(code);
}

const keywords: Record<string, string[]> = {
  js: [
    'const',
    'let',
    'var',
    'function',
    'return',
    'if',
    'else',
    'for',
    'while',
    'class',
    'import',
    'export',
    'default',
    'async',
    'await',
    'try',
    'catch',
    'throw',
    'new',
    'this',
    'true',
    'false',
    'null',
    'undefined',
  ],
  ts: [
    'const',
    'let',
    'var',
    'function',
    'return',
    'if',
    'else',
    'for',
    'while',
    'class',
    'import',
    'export',
    'default',
    'async',
    'await',
    'try',
    'catch',
    'throw',
    'new',
    'this',
    'true',
    'false',
    'null',
    'undefined',
    'interface',
    'type',
    'extends',
    'implements',
    'public',
    'private',
    'protected',
    'readonly',
  ],
  javascript: [
    'const',
    'let',
    'var',
    'function',
    'return',
    'if',
    'else',
    'for',
    'while',
    'class',
    'import',
    'export',
    'default',
    'async',
    'await',
    'try',
    'catch',
    'throw',
    'new',
    'this',
    'true',
    'false',
    'null',
    'undefined',
  ],
  typescript: [
    'const',
    'let',
    'var',
    'function',
    'return',
    'if',
    'else',
    'for',
    'while',
    'class',
    'import',
    'export',
    'default',
    'async',
    'await',
    'try',
    'catch',
    'throw',
    'new',
    'this',
    'true',
    'false',
    'null',
    'undefined',
    'interface',
    'type',
    'extends',
    'implements',
    'public',
    'private',
    'protected',
    'readonly',
  ],
  html: ['DOCTYPE', 'html', 'head', 'body', 'div', 'span', 'script', 'style'],
  css: ['import', 'export', 'function', 'var', 'const', 'let', 'if', 'else', 'for', 'while'],
  json: ['true', 'false', 'null'],
  python: [
    'def',
    'class',
    'if',
    'elif',
    'else',
    'for',
    'while',
    'import',
    'from',
    'return',
    'try',
    'except',
    'finally',
    'with',
    'as',
    'lambda',
    'yield',
    'True',
    'False',
    'None',
    'and',
    'or',
    'not',
    'in',
    'is',
  ],
  bash: [
    'if',
    'then',
    'else',
    'fi',
    'for',
    'do',
    'done',
    'while',
    'case',
    'esac',
    'function',
    'return',
    'export',
    'echo',
    'cd',
    'ls',
    'mkdir',
    'rm',
    'cp',
    'mv',
    'cat',
    'grep',
    'sed',
    'awk',
  ],
  sh: [
    'if',
    'then',
    'else',
    'fi',
    'for',
    'do',
    'done',
    'while',
    'case',
    'esac',
    'function',
    'return',
    'export',
    'echo',
    'cd',
    'ls',
    'mkdir',
    'rm',
    'cp',
    'mv',
    'cat',
    'grep',
    'sed',
    'awk',
  ],
  shell: [
    'if',
    'then',
    'else',
    'fi',
    'for',
    'do',
    'done',
    'while',
    'case',
    'esac',
    'function',
    'return',
    'export',
    'echo',
    'cd',
    'ls',
    'mkdir',
    'rm',
    'cp',
    'mv',
    'cat',
    'grep',
    'sed',
    'awk',
  ],
  sql: [
    'SELECT',
    'FROM',
    'WHERE',
    'INSERT',
    'UPDATE',
    'DELETE',
    'CREATE',
    'TABLE',
    'DROP',
    'ALTER',
    'INDEX',
    'JOIN',
    'LEFT',
    'RIGHT',
    'INNER',
    'OUTER',
    'ON',
    'AND',
    'OR',
    'NOT',
    'NULL',
    'PRIMARY',
    'KEY',
    'FOREIGN',
    'REFERENCES',
    'VALUES',
    'ORDER',
    'BY',
    'GROUP',
    'HAVING',
    'LIMIT',
    'OFFSET',
    'AS',
    'DISTINCT',
    'COUNT',
    'SUM',
    'AVG',
    'MAX',
    'MIN',
  ],
  rust: [
    'fn',
    'let',
    'mut',
    'const',
    'static',
    'struct',
    'enum',
    'impl',
    'trait',
    'type',
    'pub',
    'mod',
    'use',
    'crate',
    'self',
    'super',
    'if',
    'else',
    'match',
    'loop',
    'while',
    'for',
    'in',
    'return',
    'break',
    'continue',
    'move',
    'async',
    'await',
    'unsafe',
    'extern',
    'true',
    'false',
  ],
  go: [
    'package',
    'import',
    'func',
    'var',
    'const',
    'type',
    'struct',
    'interface',
    'map',
    'chan',
    'if',
    'else',
    'switch',
    'case',
    'default',
    'for',
    'range',
    'return',
    'break',
    'continue',
    'go',
    'defer',
    'select',
    'true',
    'false',
    'nil',
  ],
  java: [
    'public',
    'private',
    'protected',
    'class',
    'interface',
    'extends',
    'implements',
    'static',
    'final',
    'void',
    'int',
    'long',
    'double',
    'float',
    'boolean',
    'char',
    'byte',
    'short',
    'String',
    'if',
    'else',
    'for',
    'while',
    'do',
    'switch',
    'case',
    'default',
    'break',
    'continue',
    'return',
    'new',
    'this',
    'super',
    'try',
    'catch',
    'finally',
    'throw',
    'throws',
    'import',
    'package',
    'true',
    'false',
    'null',
  ],
  c: [
    'int',
    'char',
    'float',
    'double',
    'void',
    'long',
    'short',
    'unsigned',
    'signed',
    'const',
    'static',
    'extern',
    'register',
    'volatile',
    'if',
    'else',
    'for',
    'while',
    'do',
    'switch',
    'case',
    'default',
    'break',
    'continue',
    'return',
    'struct',
    'union',
    'enum',
    'typedef',
    'sizeof',
    'define',
    'include',
    'ifdef',
    'ifndef',
    'endif',
    'true',
    'false',
    'NULL',
  ],
  cpp: [
    'int',
    'char',
    'float',
    'double',
    'void',
    'long',
    'short',
    'unsigned',
    'signed',
    'const',
    'static',
    'class',
    'struct',
    'union',
    'enum',
    'public',
    'private',
    'protected',
    'virtual',
    'override',
    'template',
    'typename',
    'namespace',
    'using',
    'new',
    'delete',
    'try',
    'catch',
    'finally',
    'throw',
    'if',
    'else',
    'for',
    'while',
    'do',
    'switch',
    'case',
    'default',
    'break',
    'continue',
    'return',
    'true',
    'false',
    'nullptr',
    'include',
    'define',
    'ifdef',
    'ifndef',
    'endif',
  ],
  csharp: [
    'namespace',
    'using',
    'public',
    'private',
    'protected',
    'internal',
    'static',
    'readonly',
    'class',
    'struct',
    'interface',
    'enum',
    'void',
    'int',
    'long',
    'double',
    'float',
    'decimal',
    'bool',
    'char',
    'string',
    'var',
    'if',
    'else',
    'for',
    'foreach',
    'while',
    'do',
    'switch',
    'case',
    'default',
    'break',
    'continue',
    'return',
    'try',
    'catch',
    'finally',
    'throw',
    'new',
    'this',
    'base',
    'true',
    'false',
    'null',
  ],
  php: [
    'php',
    'echo',
    'print',
    'function',
    'class',
    'interface',
    'trait',
    'extends',
    'implements',
    'public',
    'private',
    'protected',
    'static',
    'final',
    'abstract',
    'const',
    'var',
    'if',
    'else',
    'elsif',
    'for',
    'foreach',
    'while',
    'do',
    'switch',
    'case',
    'default',
    'break',
    'continue',
    'return',
    'try',
    'catch',
    'finally',
    'throw',
    'new',
    'use',
    'namespace',
    'require',
    'include',
    'require_once',
    'include_once',
    'true',
    'false',
    'null',
    'array',
  ],
  ruby: [
    'def',
    'end',
    'class',
    'module',
    'if',
    'elsif',
    'else',
    'unless',
    'case',
    'when',
    'for',
    'while',
    'until',
    'do',
    'begin',
    'rescue',
    'ensure',
    'raise',
    'return',
    'break',
    'next',
    'redo',
    'retry',
    'yield',
    'self',
    'super',
    'nil',
    'true',
    'false',
    'and',
    'or',
    'not',
    'require',
    'require_relative',
    'include',
    'extend',
    'attr_accessor',
    'attr_reader',
    'attr_writer',
  ],
  yaml: ['true', 'false', 'null', 'yes', 'no'],
  xml: ['DOCTYPE', 'xml'],
  md: [],
  markdown: [],
};

function applyHighlight(code: string, lang: string): string {
  const kws = keywords[lang] || [];
  const escaped = escapeHtml(code);

  const stringRe = /(&quot;[^&]*?&quot;|&#039;[^&]*?&#039;|`[^`]*?`)/g;
  const parts = escaped.split(stringRe);

  return parts
    .map((part) => {
      if (stringRe.test(part)) {
        stringRe.lastIndex = 0;
        return `<span class="hl-string">${part}</span>`;
      }

      let highlighted = part;

      for (const kw of kws) {
        const kwRe = new RegExp(`\\b(${escapeRegex(kw)})\\b`, 'g');
        highlighted = highlighted.replace(kwRe, '<span class="hl-keyword">$1</span>');
      }

      highlighted = highlighted.replace(/\b(\d+\.?\d*)\b/g, '<span class="hl-number">$1</span>');

      highlighted = highlighted.replace(
        /(\/\/.*$|\/\*[\s\S]*?\*\/|#.*$)/gm,
        '<span class="hl-comment">$1</span>'
      );

      highlighted = highlighted.replace(/(\w+)(?==)/g, '<span class="hl-attr">$1</span>');

      return highlighted;
    })
    .join('');
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
