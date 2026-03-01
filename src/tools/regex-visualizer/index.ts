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

  const transform = (node: any): any => {
    if (!node) return Railroad.Comment('empty');

    switch (node.type) {
      case 'disjunction':
        return Railroad.Choice(0, ...node.body.map(transform));
      case 'alternative':
        return Railroad.Sequence(...node.body.map(transform));
      case 'group':
        return Railroad.Group(transform(node.body[0]), node.name || '');
      case 'quantifier': {
        const inner = transform(node.body[0]);
        if (node.min === 0 && node.max === 1) return Railroad.Optional(inner);
        if (node.min === 0 && node.max === undefined) return Railroad.ZeroOrMore(inner);
        if (node.min === 1 && node.max === undefined) return Railroad.OneOrMore(inner);
        return Railroad.OneOrMore(inner, Railroad.Comment(`${node.min}..${node.max ?? '∞'}`));
      }
      case 'value':
        return Railroad.Terminal(node.value);
      case 'characterClass':
        return Railroad.NonTerminal(
          (node.negative ? '^' : '') +
            node.body
              .map((b: any) => {
                if (b.type === 'characterClassRange') {
                  return `${b.min.value}-${b.max.value}`;
                }
                return b.value;
              })
              .join('')
        );
      case 'anchor':
        return Railroad.Comment(node.kind === 'start' ? 'Start' : 'End');
      case 'dot':
        return Railroad.NonTerminal('any char');
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
