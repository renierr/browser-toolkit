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
    console.warn('PDFViewerApplicationOptions not found in PDF viewer window. Can not set any options');
  }
};
