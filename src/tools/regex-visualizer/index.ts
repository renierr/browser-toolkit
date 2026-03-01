import { parse } from 'regjsparser';
import * as Railroad from 'railroad-diagrams';
import { showMessage } from '../../js/ui.ts';

// noinspection JSUnusedGlobalSymbols
export default function init() {
  const regexInput = document.getElementById('regex-input') as HTMLInputElement;
  const regexFlags = document.getElementById('regex-flags') as HTMLInputElement;
  const btnVisualize = document.getElementById('btn-visualize') as HTMLButtonElement;
  const btnCopySvg = document.getElementById('btn-copy-svg') as HTMLButtonElement;
  const btnDownloadPng = document.getElementById('btn-download-png') as HTMLButtonElement;
  const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;
  const errorMessage = document.getElementById('error-message') as HTMLDivElement;
  const errorText = document.getElementById('error-text') as HTMLSpanElement;
  const resultSection = document.getElementById('result-section') as HTMLDivElement;
  const diagramContainer = document.getElementById('diagram-container') as HTMLDivElement;

  const escapeHtml = (unsafe: string) => {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const transform = (node: any): any => {
    if (!node) return Railroad.Comment('empty');

    switch (node.type) {
      case 'disjunction':
      case 'alternative': {
        const children = node.body ? node.body.map(transform) : [];
        if (children.length === 0) return Railroad.Comment('empty');
        if (node.type === 'disjunction') {
          return children.length === 1 ? children[0] : Railroad.Choice(0, ...children);
        } else {
          return children.length === 1 ? children[0] : Railroad.Sequence(...children);
        }
      }

      case 'group': {
        const inner = node.body && node.body.length > 0
          ? Railroad.Sequence(...node.body.map(transform))
          : Railroad.Comment('empty');

        if (node.behavior === 'ignore') {
          return Railroad.Group(inner, 'Non-capturing Group');
        } else if (node.behavior === 'lookahead') {
          return Railroad.Group(inner, 'Positive Lookahead');
        } else if (node.behavior === 'negativeLookahead') {
          return Railroad.Group(inner, 'Negative Lookahead');
        } else if (node.behavior === 'lookbehind') {
          return Railroad.Group(inner, 'Positive Lookbehind');
        } else if (node.behavior === 'negativeLookbehind') {
          return Railroad.Group(inner, 'Negative Lookbehind');
        } else if (node.behavior === 'normal') {
          return Railroad.Group(inner, node.name ? `Group "${node.name}"` : 'Group');
        }
        return Railroad.Group(inner, 'Group');
      }

      case 'quantifier': {
        const inner = transform(node.body[0]);
        if (node.min === 0 && node.max === 1) return Railroad.Optional(inner);
        if (node.min === 0 && node.max === undefined) return Railroad.ZeroOrMore(inner);
        if (node.min === 1 && node.max === undefined) return Railroad.OneOrMore(inner);
        if (node.min === node.max) {
          return Railroad.OneOrMore(inner, Railroad.Comment(`${node.min} times`));
        }
        return Railroad.OneOrMore(inner, Railroad.Comment(`${node.min}..${node.max ?? '∞'}`));
      }

      case 'value':
        return Railroad.Terminal(escapeHtml(String.fromCharCode(node.codePoint)));

      case 'characterClass': {
        if (!node.body || node.body.length === 0) return Railroad.NonTerminal(node.negative ? 'any char except none' : 'empty class');

        const labels: string[] = [];
        for (const b of node.body) {
          if (b.type === 'characterClassRange') {
            labels.push(`${escapeHtml(String.fromCharCode(b.min.codePoint))}-${escapeHtml(String.fromCharCode(b.max.codePoint))}`);
          } else if (b.type === 'value') {
            labels.push(escapeHtml(String.fromCharCode(b.codePoint)));
          } else if (b.type === 'characterClassEscape') {
            labels.push(`\\${b.value}`);
          }
        }

        let label = labels.join('');
        if (label.length > 20) label = label.substring(0, 17) + '...';
        return Railroad.NonTerminal((node.negative ? 'NOT [' : '[') + label + ']');
      }

      case 'characterClassEscape':
        if (node.value === 'd') return Railroad.NonTerminal('digit');
        if (node.value === 'D') return Railroad.NonTerminal('non-digit');
        if (node.value === 'w') return Railroad.NonTerminal('word-char');
        if (node.value === 'W') return Railroad.NonTerminal('non-word-char');
        if (node.value === 's') return Railroad.NonTerminal('space');
        if (node.value === 'S') return Railroad.NonTerminal('non-space');
        return Railroad.NonTerminal(`\\${node.value}`);

      case 'anchor':
        if (node.kind === 'start') return Railroad.Comment('Start of line');
        if (node.kind === 'end') return Railroad.Comment('End of line');
        if (node.kind === 'boundary') return Railroad.Comment('Word boundary');
        if (node.kind === 'not-boundary') return Railroad.Comment('Non-word boundary');
        return Railroad.Comment(node.kind);

      case 'dot':
        return Railroad.NonTerminal('any char');

      case 'reference':
        return Railroad.NonTerminal(`Backref: ${node.name || node.matchIndex}`);

      case 'unicodePropertyEscape':
        return Railroad.NonTerminal(`\\p{${node.value}}`);

      default:
        return Railroad.Comment(node.type);
    }
  };

  const visualize = () => {
    const regexStr = regexInput.value.trim();
    if (!regexStr) return;

    try {
      errorMessage.classList.add('hidden');
      resultSection.classList.remove('hidden');
      diagramContainer.innerHTML = '';

      const ast = parse(regexStr, regexFlags.value);
      const diagram = Railroad.Diagram(transform(ast));
      const svg = diagram.toSVG();
      diagramContainer.appendChild(svg);

      svg.setAttribute('width', '100%');
      svg.setAttribute('height', 'auto');
      svg.style.maxWidth = '100%';
    } catch (error: any) {
      console.error('Regex visualization failed:', error);
      errorMessage.classList.remove('hidden');
      errorText.innerText = error.message || 'Invalid Regular Expression';
      resultSection.classList.add('hidden');
    }
  };

  const onVisualizeClick = () => visualize();
  const onKeyPress = (e: KeyboardEvent) => {
    if (e.key === 'Enter') visualize();
  };

  const onClearClick = () => {
    regexInput.value = '';
    regexFlags.value = 'g';
    errorMessage.classList.add('hidden');
    resultSection.classList.add('hidden');
    diagramContainer.innerHTML = '';
  };

  const onCopySvgClick = () => {
    const svg = diagramContainer.querySelector('svg');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    navigator.clipboard.writeText(svgData).then(() => {
      showMessage('SVG copied to clipboard!', { type: 'info' });
    });
  };

  const onDownloadPngClick = () => {
    const svg = diagramContainer.querySelector('svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width * 2;
      canvas.height = img.height * 2;
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(2, 2);
        ctx.drawImage(img, 0, 0);
        const pngUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = 'regex-diagram.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  btnVisualize.addEventListener('click', onVisualizeClick);
  regexInput.addEventListener('keypress', onKeyPress);
  btnClear.addEventListener('click', onClearClick);
  btnCopySvg.addEventListener('click', onCopySvgClick);
  btnDownloadPng.addEventListener('click', onDownloadPngClick);

  return () => {
    btnVisualize.removeEventListener('click', onVisualizeClick);
    regexInput.removeEventListener('keypress', onKeyPress);
    btnClear.removeEventListener('click', onClearClick);
    btnCopySvg.removeEventListener('click', onCopySvgClick);
    btnDownloadPng.removeEventListener('click', onDownloadPngClick);
  };
}
