export function openPdfInViewerFrame(iframe: HTMLIFrameElement, pdfUrl: string) {
  const start = Date.now();
  const timeoutMs = 10000;

  const tryOpen = async () => {
    try {
      const win = iframe.contentWindow as any;
      if (!win) return;

      const app = win?.PDFViewerApplication;
      if (app) {
        if (app.initializedPromise && typeof app.initializedPromise.then === 'function') {
          await app.initializedPromise;
        }
        if (typeof app.open === 'function') {
          try {
            app.open({ url: pdfUrl });
            return;
          } catch (err) {
            console.error('PDFViewerApplication.open failed', err);
            return;
          }
        }
      }
    } catch (err) {
      // likely cross-origin or not yet available
      console.error('Cannot access iframe PDFViewerApplication', err);
      return;
    }

    if (Date.now() - start < timeoutMs) {
      setTimeout(tryOpen, 50);
    } else {
      console.error('Timed out waiting for PDFViewerApplication in iframe');
    }
  };

  // attempt immediately (covers case where iframe already loaded)
  tryOpen();

  // also try on future load events
  iframe.addEventListener('load', () => {
    tryOpen();
  });
}

export const setPdfViewerOptions = (viewerWindow: Window, options: {}) => {
  const win = viewerWindow as any;
  if (win?.PDFViewerApplicationOptions) {
    win?.PDFViewerApplicationOptions.setAll(options);
  } else {
    console.warn(
      'PDFViewerApplicationOptions not found in PDF viewer window. Can not set any options'
    );
  }
};

type PdfViewerHandler = (viewerWindow: Window, evt?: Event) => void;
const pdfViewerHandlers = new Set<PdfViewerHandler>();

export function onPdfViewerLoaded(fn: PdfViewerHandler): () => void {
  pdfViewerHandlers.add(fn);
  return () => {
    pdfViewerHandlers.delete(fn);
  };
}

export function offPdfViewerLoaded(fn: PdfViewerHandler): boolean {
  return pdfViewerHandlers.delete(fn);
}

export function setupGlobalWebViewerDelegate() {
  const marker = '__webviewer_delegate_installed' as any;
  if ((window as any)[marker]) return;
  (window as any)[marker] = true;

  document.addEventListener('webviewerloaded', (evt: any) => {
    const viewerWin = evt?.detail?.source ?? null;
    if (!viewerWin) return;

    for (const h of Array.from(pdfViewerHandlers)) {
      try {
        h(viewerWin, evt);
      } catch (err) {
        console.error('webviewer handler failed', err);
      }
    }
  });
}
export const injectMaximizeToViewerFrame = (iframe: HTMLIFrameElement) => {
  const contentWindow = iframe.contentWindow;
  if (!contentWindow) return;

  const doc = contentWindow.document;
  const separatorHTML = `<div id="editorModeSeparator" class="verticalToolbarSeparator"></div>`;
  const rightToolbar = doc.getElementById('toolbarViewerRight');
  if (!rightToolbar) return;

  const style = doc.createElement('style');
  style.textContent = `#pdfViewerMaximizeBtn::before { display: none !important; }`;
  (doc.head || doc.documentElement).appendChild(style);

  rightToolbar.insertAdjacentHTML('beforeend', separatorHTML);
  const btn = doc.createElement('button');
  btn.id = 'pdfViewerMaximizeBtn';
  btn.className = 'toolbarButton pdf-inline-maximize-btn';
  btn.type = 'button';
  btn.title = 'Toggle maximize';
  btn.textContent = '⤢';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    iframe.classList.toggle('pdf-maximized');

    const isMax = iframe.classList.contains('pdf-maximized');
    if (btn) btn.textContent = isMax ? '⤡' : '⤢';

    if (isMax) {
      document.body.classList.add('no-scroll');
    } else {
      document.body.classList.remove('no-scroll');
    }

    try {
      contentWindow.parent.postMessage({ type: 'pdf-toggle-maximize' }, window.location.origin);
    } catch {
      contentWindow.parent.postMessage({ type: 'pdf-toggle-maximize' }, '*');
    }
  });
  rightToolbar.appendChild(btn);
};
