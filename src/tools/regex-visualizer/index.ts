import { showMessage } from '../../js/ui.ts';
import { downloadFile } from '../../js/file-utils.ts';
import { CanvasExporter } from '../../js/canvas-utils.ts';

// Lazy-loaded RegExper and an `eve` shim if needed
let RegExper: any = null;
const ensureRegExper = async () => {
  if (RegExper) return RegExper;

  // Provide a minimal event bus `eve` shim to satisfy libraries that expect a global `eve` (Raphael/regexper)
  if (typeof (window as any).eve === 'undefined') {
    const events: Record<string, Function[]> = {};
    const eveFn: any = function(name: string, ...args: any[]) {
      const handlers = events[name];
      if (handlers) handlers.forEach(h => { try { h.apply(null, args); } catch (e) { /* swallow handler errors */ } });
    };
    eveFn.on = (name: string, fn: Function) => { (events[name] ||= []).push(fn); };
    eveFn.un = (name: string, fn?: Function) => {
      if (!fn) { delete events[name]; return; }
      events[name] = (events[name] || []).filter(f => f !== fn);
    };
    eveFn.once = (name: string, fn: Function) => {
      const wrapper = (...args: any[]) => { fn(...args); eveFn.un(name, wrapper); };
      eveFn.on(name, wrapper);
    };
    (window as any).eve = eveFn;
  }

  // dynamic import so evaluation happens after we've set up the shim
  const mod = await import('regexper');
  RegExper = (mod && (mod as any).default) || mod;
  return RegExper;
};

// Helper: scope any <style> rules inside the generated SVG to this SVG only by
// giving the svg a unique id and prefixing selectors. This prevents regexper's
// styles (which may include rules like `svg { ... }`) from affecting other
// SVGs or the page.
const scopeSvgStyles = (svg: SVGElement | null) => {
  if (!svg) return;
  try {
    const id = svg.id || `regexper-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`;
    svg.id = id;

    const styles = svg.querySelectorAll('style');
    styles.forEach(style => {
      const css = style.textContent || '';
      // Very small parser: transform top-level rules by prefixing selectors with `#id `
      // Leave @-rules (like @keyframes, @font-face) untouched.
      const transformed = css.replace(/([^{}@]+)\{([^}]*)}/g, (m, selectors, body) => {
        const sel = String(selectors || '').trim();
        if (!sel || sel.startsWith('@')) return m; // skip @rules
        try {
          const newSel = sel.split(',').map((s: string) => `#${id} ${s.trim()}`).join(', ');
          return `${newSel} {${body}}`;
        } catch (e) {
          return m;
        }
      });
      // Replace only if changed to avoid extra work
      if (transformed !== css) style.textContent = transformed;
    });
  } catch (err) {
    // Don't block rendering on scoping errors - fall back to unscoped SVG
    console.warn('Failed to scope SVG styles', err);
  }
};

// noinspection JSUnusedGlobalSymbols
export default function init() {
  const regexInput = document.getElementById('regex-input') as HTMLInputElement;
  const regexFlags = document.getElementById('regex-flags') as HTMLInputElement;
  const btnVisualize = document.getElementById('btn-visualize') as HTMLButtonElement;
  const btnCopySvg = document.getElementById('btn-copy-svg') as HTMLButtonElement;
  const btnDownloadPng = document.getElementById('btn-download-png') as HTMLButtonElement;
  const btnDownloadSvg = document.getElementById('btn-download-svg') as HTMLButtonElement;
  const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;
  const errorMessage = document.getElementById('error-message') as HTMLDivElement;
  const errorText = document.getElementById('error-text') as HTMLSpanElement;
  const resultSection = document.getElementById('result-section') as HTMLDivElement;
  const diagramContainer = document.getElementById('diagram-container') as HTMLDivElement;

  // helper to enable/disable copy/download buttons
  const setActionButtonsEnabled = (enabled: boolean) => {
    try {
      btnCopySvg.disabled = !enabled;
      btnDownloadPng.disabled = !enabled;
      btnDownloadSvg.disabled = !enabled;
      if (enabled) {
        btnCopySvg.classList.remove('opacity-50', 'pointer-events-none');
        btnDownloadPng.classList.remove('opacity-50', 'pointer-events-none');
        btnDownloadSvg.classList.remove('opacity-50', 'pointer-events-none');
      } else {
        btnCopySvg.classList.add('opacity-50', 'pointer-events-none');
        btnDownloadPng.classList.add('opacity-50', 'pointer-events-none');
        btnDownloadSvg.classList.add('opacity-50', 'pointer-events-none');
      }
    } catch (e) {
      // ignore if elements aren't present
    }
  };

  // Set initial state: no SVG yet
  setActionButtonsEnabled(false);

  const normalizeInput = (rawInput: string, flagsBox: string) => {
    const raw = rawInput.trim();
    const inline = raw.match(/^\s*\/(.*)\/([a-z]*)\s*$/i);
    if (inline) {
      return { pattern: inline[1].trim(), flags: inline[2] || (flagsBox || '').trim() };
    }
    return { pattern: rawInput, flags: (flagsBox || '').trim() };
  };

  const visualize = async () => {
    try {
      const RE = await ensureRegExper();

      // clear previous result
      diagramContainer.innerHTML = '';
      resultSection.classList.remove('hidden');

      // disable action buttons until we have a valid SVG
      setActionButtonsEnabled(false);

      const normalized = normalizeInput(regexInput.value.trim(), regexFlags.value);
      const pattern = normalized.pattern;
      const flags = normalized.flags;
      const inputForRE = pattern && flags ? `/${pattern}/${flags}` : pattern;

      // regexper exposes either a render method or is callable. Try both
      if (!RE) {
        console.error('RegExper module not available');
        errorMessage.classList.remove('hidden');
        errorText.innerText = 'RegExper module not available';
        resultSection.classList.add('hidden');
        setActionButtonsEnabled(false);
        return;
      }
      try {
        if (typeof RE.render === 'function') {
          RE.render(inputForRE, diagramContainer);
        } else if (typeof RE === 'function') {
          RE(inputForRE, diagramContainer);
        } else {
          console.error('RegExper API not recognized');
          errorMessage.classList.remove('hidden');
          errorText.innerText = 'RegExper API not recognized';
          resultSection.classList.add('hidden');
          setActionButtonsEnabled(false);
          return;
        }

        // Scope any styles that regexper put into the SVG so they don't leak out.
        const svg = diagramContainer.querySelector('svg') as SVGElement | null;
        scopeSvgStyles(svg);

        // enable action buttons if an svg was produced
        if (svg) {
          setActionButtonsEnabled(true);
        } else {
          // Some renderers insert SVG asynchronously; watch for added nodes as a fallback
          const mo = new MutationObserver((mutations, obs) => {
            const s = diagramContainer.querySelector('svg') as SVGElement | null;
            if (s) {
              try { scopeSvgStyles(s); } catch (e) { /* ignore */ }
              setActionButtonsEnabled(true);
              obs.disconnect();
            }
          });
          mo.observe(diagramContainer, { childList: true, subtree: true });
        }

      } catch (renderErr) {
        // If regexper throws, surface an error
        console.error('regexper.render error', renderErr);
        errorMessage.classList.remove('hidden');
        errorText.innerText = (renderErr && (renderErr as any).message) || String(renderErr);
        resultSection.classList.add('hidden');
        setActionButtonsEnabled(false);
        return;
      }
    } catch (e) {
      console.error('Failed loading regexper:', e);
      errorMessage.classList.remove('hidden');
      errorText.innerText = 'Failed to load RegExper library';
      resultSection.classList.add('hidden');
      setActionButtonsEnabled(false);
    }
  };

  const onVisualizeClick = () => visualize();
  const onKeyPress = async (e: KeyboardEvent) => {
    if (e.key === 'Enter') await visualize();
  };

  const onClearClick = () => {
    regexInput.value = '';
    regexFlags.value = 'g';
    errorMessage.classList.add('hidden');
    resultSection.classList.add('hidden');
    diagramContainer.innerHTML = '';
    setActionButtonsEnabled(false);
  };

  const onCopySvgClick = async () => {
    // Prefer the original RegExper output as authoritative
    const svg = (diagramContainer.querySelector('svg') as SVGElement);
    if (!svg) return showMessage('No SVG to copy', { type: 'warning' });
    const svgData = new XMLSerializer().serializeToString(svg);
    try {
      await navigator.clipboard.writeText(svgData);
      showMessage('SVG copied to clipboard!', { type: 'info' });
    } catch (err) {
      console.warn('Clipboard write failed, falling back to download', err);
      showMessage('Copy to clipboard failed', { type: 'alert' });
    }
  };

  const onDownloadSvgClick = async () => {
    const svg = (diagramContainer.querySelector('svg') as SVGElement);
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    await downloadFile(blob, 'regex-diagram.svg');
  };

  const onDownloadPngClick = () => {
    const svg = (diagramContainer.querySelector('svg') as SVGElement);
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width * 2;
      canvas.height = img.height * 2;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(2, 2);
        ctx.drawImage(img, 0, 0);
        await CanvasExporter.download(canvas, 'regex-diagram.png');
      }
    };
    img.onerror = (err) => {
      console.error('SVG to PNG conversion failed', err);
      showMessage('Failed to convert SVG to PNG', { type: 'alert' });
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  btnVisualize.addEventListener('click', onVisualizeClick);
  regexInput.addEventListener('keypress', onKeyPress);
  btnClear.addEventListener('click', onClearClick);
  btnCopySvg.addEventListener('click', onCopySvgClick);
  btnDownloadSvg.addEventListener('click', onDownloadSvgClick);
  btnDownloadPng.addEventListener('click', onDownloadPngClick);

  return () => {
    btnVisualize.removeEventListener('click', onVisualizeClick);
    regexInput.removeEventListener('keypress', onKeyPress);
    btnClear.removeEventListener('click', onClearClick);
    btnCopySvg.removeEventListener('click', onCopySvgClick);
    btnDownloadSvg.removeEventListener('click', onDownloadSvgClick);
    btnDownloadPng.removeEventListener('click', onDownloadPngClick);
  };
}
